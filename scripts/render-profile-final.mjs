#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { slugifyEpisodeName } from "./lib/episode-slug.mjs";

const ROOT = process.cwd();
const HYPERFRAMES_VERSION = "0.7.33";
const [episodeName, requestedVersion, bgmInput, quality = "high"] = process.argv.slice(2);
if (!episodeName || !bgmInput) {
  console.error("Usage: node scripts/render-profile-final.mjs <episode-name> [script-version] [bgm] [draft|standard|high]");
  console.error("BGM must be an explicitly supplied, rights-cleared local file or a file under assets/bgm/.");
  process.exit(1);
}

function run(command, args, options = {}) {
  const executable = process.platform === "win32" && command === "npx" ? process.env.ComSpec || "cmd.exe" : command;
  const executableArgs = process.platform === "win32" && command === "npx" ? ["/d", "/s", "/c", "npx.cmd", ...args] : args;
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browserEnv = process.platform === "win32" && fs.existsSync(chrome) ? {
    HYPERFRAMES_BROWSER_PATH: chrome,
    PRODUCER_HEADLESS_SHELL_PATH: chrome,
    PRODUCER_BROWSER_GPU_MODE: "software",
    PRODUCER_DISABLE_GPU: "true",
  } : {};
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd || ROOT,
    encoding: options.encoding,
    stdio: options.stdio || "inherit",
    env: { ...process.env, ...browserEnv },
    shell: false,
  });
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
  return result;
}

function findBgm(input) {
  const direct = path.resolve(ROOT, input);
  if (fs.existsSync(direct)) return direct;
  const name = input.toLowerCase().endsWith(".mp3") ? input : `${input}.mp3`;
  const asset = path.join(ROOT, "assets", "bgm", name);
  if (fs.existsSync(asset)) return asset;
  throw new Error(`BGM not found: ${input}`);
}

function probe(filePath, maximumDuration) {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration,size,bit_rate", "-of", "json", filePath], { cwd: ROOT, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`ffprobe failed: ${result.stderr}`);
  const data = JSON.parse(result.stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(data.format?.duration || 0);
  if (!video || video.width !== 720 || video.height !== 960 || video.r_frame_rate !== "30/1") throw new Error(`Invalid video stream: ${video?.width}x${video?.height} ${video?.r_frame_rate}`);
  if (!audio) throw new Error("Final video has no audio stream");
  if (!Number.isFinite(duration) || duration < 160 || duration > maximumDuration + 0.1) throw new Error(`Invalid final duration: ${duration}`);
  return { duration, width: video.width, height: video.height, fps: video.r_frame_rate, videoCodec: video.codec_name, audioCodec: audio.codec_name, sampleRate: audio.sample_rate, channels: audio.channels, size: Number(data.format.size), bitRate: Number(data.format.bit_rate) };
}

const episodeDir = path.join(ROOT, "episodes", episodeName);
const brief = JSON.parse(fs.readFileSync(path.join(episodeDir, "brief.json"), "utf8"));
const version = requestedVersion || brief.story.scriptVersion;
const slug = slugifyEpisodeName(episodeName);
run("node", ["scripts/validate-profile-episode.mjs", episodeName, version]);
run("node", ["scripts/create-profile-preview.mjs", episodeName, version]);

const workDir = path.join(ROOT, "tmp", `profile-preview-${slug}`);
const preview = JSON.parse(fs.readFileSync(path.join(workDir, "preview.json"), "utf8"));
const silentPath = path.join(workDir, "renders", "silent.mp4");
const candidateDir = path.join(workDir, "final");
fs.mkdirSync(candidateDir, { recursive: true });

run("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "lint"], { cwd: workDir });
run("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "validate"], { cwd: workDir });
const inspectAt = [0.8, 5.4, 9.4, ...preview.scenes.map((scene) => Number((scene.start + Math.min(1.2, scene.duration / 3)).toFixed(2))), Math.max(1, preview.duration - 1)].join(",");
run("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "inspect", "--at", inspectAt], { cwd: workDir });
run("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "render", "--fps", "30", "--workers", "1", "--quality", quality, "--output", "renders/silent.mp4"], { cwd: workDir });

const audioDir = path.join(episodeDir, "audio");
const introVoice = path.join(audioDir, "intro-voiceover-story.mp3");
const bodyVoice = path.join(audioDir, "body-voiceover-story.mp3");
const sfx = path.join(ROOT, "assets", "sfx", "gear-scroll.mp3");
for (const required of [silentPath, introVoice, bodyVoice, sfx]) if (!fs.existsSync(required)) throw new Error(`Missing render input: ${required}`);
const bgmPath = findBgm(bgmInput);
const bgmSlug = path.basename(bgmPath, path.extname(bgmPath)).replace(/[^\p{L}\p{N}._-]+/gu, "-");
const finalName = `${slug}-profile-3m-final-${bgmSlug}.mp4`;
const candidatePath = path.join(candidateDir, finalName);
const rendersDir = path.join(episodeDir, "renders");
const finalPath = path.join(rendersDir, finalName);
const introDelay = 250;
const bodyDelay = Math.round(preview.introDuration * 1000);
const sfxDelay = 4180;
const fadeOutStart = Math.max(0, preview.duration - 1.2).toFixed(3);

run("ffmpeg", [
  "-y", "-i", silentPath,
  "-i", introVoice,
  "-i", bodyVoice,
  "-stream_loop", "-1", "-i", bgmPath,
  "-i", sfx,
  "-filter_complex",
  `[1:a]aresample=48000,adelay=${introDelay}|${introDelay},volume=1.0[intro];[2:a]aresample=48000,adelay=${bodyDelay}|${bodyDelay},volume=1.0[body];[3:a]atrim=0:${preview.duration},asetpts=PTS-STARTPTS,aresample=48000,volume=0.09,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.1[bgm];[4:a]aresample=48000,adelay=${sfxDelay}|${sfxDelay},volume=0.42[sfx];[intro][body][bgm][sfx]amix=inputs=4:duration=longest:dropout_transition=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1:LRA=6,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]`,
  "-map", "0:v:0", "-map", "[a]", "-t", String(preview.duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", candidatePath,
]);

const metadata = probe(candidatePath, Number(brief.render.maximumDurationSeconds || 210));
fs.mkdirSync(rendersDir, { recursive: true });
fs.copyFileSync(candidatePath, finalPath);
fs.writeFileSync(path.join(rendersDir, "final.json"), `${JSON.stringify({ episodeName, profile: brief.profile, version, bgm: path.basename(bgmPath), file: finalName, quality, ...metadata }, null, 2)}\n`);
console.log(finalPath);
