#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const scripts = [
  "scripts/audit-publication.mjs",
  "scripts/init.mjs",
  "scripts/create-profile-elevenlabs-voiceover.mjs",
  "scripts/create-profile-preview.mjs",
  "scripts/prepare-profile-audio.mjs",
  "scripts/process-voiceover.mjs",
  "scripts/render-profile-final.mjs",
  "scripts/validate-profile-episode.mjs",
  "scripts/lib/episode-slug.mjs",
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}

for (const file of ["DESIGN.md", "README.md", "AGENTS.md", "SECURITY.md", ...scripts]) {
  if (!fs.existsSync(path.join(ROOT, file))) throw new Error(`Missing required file: ${file}`);
}
for (const script of scripts) run(process.execPath, ["--check", script]);

for (const episode of ["jr-smith-3m", "matthew-dellavedova-3m"]) {
  run(process.execPath, ["scripts/validate-profile-episode.mjs", episode, "v1", "--allow-missing-media"]);
}

run(process.execPath, ["scripts/audit-publication.mjs"]);
console.log("player-video checks: ok");
