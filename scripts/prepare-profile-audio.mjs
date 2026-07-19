#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const [episodeName] = process.argv.slice(2);
if (!episodeName) {
  console.error("Usage: node scripts/prepare-profile-audio.mjs <episode-name>");
  process.exit(1);
}

const audioDir = path.join(ROOT, "episodes", episodeName, "audio");
const pairs = [
  ["intro-voiceover.mp3", "intro-voiceover-story.mp3"],
  ["body-voiceover.mp3", "body-voiceover-story.mp3"],
];

for (const [inputName, outputName] of pairs) {
  const input = path.join(audioDir, inputName);
  const output = path.join(audioDir, outputName);
  if (!fs.existsSync(input)) throw new Error(`Missing source voiceover: ${input}`);
  const result = spawnSync(process.execPath, ["scripts/process-voiceover.mjs", input, output, "story"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) throw new Error(`Voiceover processing failed for ${inputName}`);
}

console.log(`Prepared profile narration: ${audioDir}`);
