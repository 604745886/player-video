#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const PIPELINE_PATH = path.join(DATA_DIR, "player-pipeline.csv");
const EXAMPLE_PATH = path.join(DATA_DIR, "player-pipeline.example.csv");
const STATE_PATH = path.join(ROOT, ".player-video-state.json");
const MODEL_PATH = path.join(ROOT, "assets", "models", "whisper", "ggml-base.bin");
const MIN_MODEL_BYTES = 100 * 1024 * 1024;

function commandArgs(command) {
  if (command === "ffmpeg") return ["-hide_banner", "-h"];
  if (command === "ffprobe") return ["-version"];
  return ["--version"];
}

function commandAvailable(command) {
  const executable = process.platform === "win32" && command === "npx" ? process.env.ComSpec || "cmd.exe" : command;
  const args = process.platform === "win32" && command === "npx"
    ? ["/d", "/s", "/c", "npx.cmd", ...commandArgs(command)]
    : commandArgs(command);
  return spawnSync(executable, args, { stdio: "ignore", shell: false }).status === 0;
}

function hasMandarinVoice() {
  if (process.platform !== "win32") return false;
  const command = "Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; if (($s.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -eq 'zh-CN'}).Count -gt 0) { exit 0 } else { exit 1 }";
  return spawnSync("powershell", ["-NoProfile", "-Command", command], { stdio: "ignore", shell: false }).status === 0;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
let pipeline = "ready";
if (!fs.existsSync(PIPELINE_PATH)) {
  fs.copyFileSync(EXAMPLE_PATH, PIPELINE_PATH);
  pipeline = "created";
}

const previous = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) : {};
const state = {
  schemaVersion: 1,
  initializedAt: previous.initializedAt || new Date().toISOString(),
  lastCheckedAt: new Date().toISOString(),
};
fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);

const modelBytes = fs.existsSync(MODEL_PATH) ? fs.statSync(MODEL_PATH).size : 0;
const checks = {
  node: Number(process.versions.node.split(".")[0]) >= 22,
  ffmpeg: commandAvailable("ffmpeg"),
  ffprobe: commandAvailable("ffprobe"),
  npx: commandAvailable("npx"),
  whisper: commandAvailable("whisper-cli"),
  whisperModel: modelBytes >= MIN_MODEL_BYTES,
  whisperModelBytes: modelBytes,
  windowsMandarinTts: hasMandarinVoice(),
  hyperframes: "npx hyperframes@0.7.33",
  platform: `${process.platform}-${os.arch()}`,
};

console.log(JSON.stringify({ pipeline, checks }, null, 2));
if (!checks.node || !checks.ffmpeg || !checks.ffprobe || !checks.npx) process.exitCode = 1;
