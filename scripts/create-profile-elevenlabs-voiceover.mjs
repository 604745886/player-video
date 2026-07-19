#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const [episodeName, requestedVersion, ...rawOptions] = process.argv.slice(2);
if (!episodeName) {
  console.error("Usage: node scripts/create-profile-elevenlabs-voiceover.mjs <episode-name> [script-version] [--sample-lines N]");
  process.exit(1);
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/u);
  const headers = parseCsvLine(lines.shift() || "");
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function option(name, fallback = "") {
  const index = rawOptions.indexOf(name);
  return index >= 0 ? rawOptions[index + 1] : fallback;
}

async function synthesize({ text, voiceId, model, speed }) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      seed: 1936,
      voice_settings: { stability: 0.48, similarity_boost: 0.8, style: 0.18, use_speaker_boost: true, speed },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

function timingsFromAlignment(rows, fullText, alignment) {
  const characters = alignment?.characters || [];
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  const alignedText = characters.join("");
  if (!characters.length || starts.length !== characters.length || ends.length !== characters.length) throw new Error("ElevenLabs returned incomplete alignment");
  const captions = [];
  let cursor = 0;
  for (const row of rows) {
    let startIndex = fullText.indexOf(row.text, cursor);
    if (startIndex < 0) throw new Error(`Cannot locate source line ${row.order} in request text`);
    if (alignedText !== fullText) {
      const alignedIndex = alignedText.indexOf(row.text, cursor);
      if (alignedIndex >= 0) startIndex = alignedIndex;
    }
    const endIndex = startIndex + row.text.length - 1;
    captions.push({ order: Number(row.order), chapter: row.chapter, start: Number(starts[startIndex].toFixed(3)), end: Number(ends[endIndex].toFixed(3)), text: row.text });
    cursor = endIndex + 1;
  }
  return { duration: Number(ends.at(-1).toFixed(3)), captions };
}

if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
const episodeDir = path.join(ROOT, "episodes", episodeName);
const brief = JSON.parse(fs.readFileSync(path.join(episodeDir, "brief.json"), "utf8"));
const version = requestedVersion || brief.story?.scriptVersion;
const rowsAll = readCsv(path.join(episodeDir, "script.csv")).filter((row) => row.version === version).sort((a, b) => Number(a.order) - Number(b.order));
const sampleLines = Number(option("--sample-lines", "0"));
const rows = sampleLines > 0 ? rowsAll.slice(0, sampleLines) : rowsAll;
const text = rows.map((row) => row.text).join("\n");
const audioDir = path.join(episodeDir, "audio");
fs.mkdirSync(audioDir, { recursive: true });

const bodyResult = await synthesize({ text, voiceId: brief.audio.voiceId, model: brief.audio.model, speed: Number(brief.audio.speed) });
const bodyAudio = Buffer.from(bodyResult.audio_base64, "base64");
if (sampleLines > 0) {
  const sampleDir = path.join(audioDir, "samples");
  fs.mkdirSync(sampleDir, { recursive: true });
  const samplePath = path.join(sampleDir, `${brief.audio.voiceName.replace(/[^\p{L}\p{N}._-]+/gu, "-")}-${sampleLines}-lines.mp3`);
  fs.writeFileSync(samplePath, bodyAudio);
  console.log(JSON.stringify({ mode: "sample", voice: brief.audio.voiceName, lines: rows.length, output: samplePath, bytes: bodyAudio.length }, null, 2));
  process.exit(0);
}

const rawPath = path.join(audioDir, "body-voiceover.mp3");
fs.writeFileSync(rawPath, bodyAudio);
const timingData = timingsFromAlignment(rows, text, bodyResult.alignment);
fs.writeFileSync(path.join(audioDir, "body-timings.json"), `${JSON.stringify({ scriptVersion: version, provider: "elevenlabs", voice: brief.audio.voiceName, ...timingData }, null, 2)}\n`);

const introText = brief.intro.spokenLine;
const introResult = await synthesize({ text: introText, voiceId: brief.audio.voiceId, model: brief.audio.model, speed: Number(brief.audio.speed) });
fs.writeFileSync(path.join(audioDir, "intro-voiceover.mp3"), Buffer.from(introResult.audio_base64, "base64"));
console.log(JSON.stringify({ mode: "full", voice: brief.audio.voiceName, lines: rows.length, characters: [...text].length, bodyDuration: timingData.duration, body: rawPath, timings: path.join(audioDir, "body-timings.json"), intro: path.join(audioDir, "intro-voiceover.mp3") }, null, 2));
