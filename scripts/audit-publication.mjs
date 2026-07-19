#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const MAX_TRACKED_BYTES = 10 * 1024 * 1024;
const TEXT_SCAN_BYTES = 5 * 1024 * 1024;
const MEDIA_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".mp4", ".mov", ".mkv", ".webm"]);
const ALLOWED_MEDIA = new Set([
  "assets/sfx/gear-scroll.mp3",
  "assets/template-audio/intro-voiceover.mp3",
]);

const secretRules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/u],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/u],
  ["literal-secret-assignment", /\b(?:api[_-]?key|api[_-]?secret|access[_-]?token|client[_-]?secret|password)\b\s*["']?\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/iu],
  ["literal-xfyun-app-id", /\b(?:xfyun[_-]?)?app[_-]?id\b\s*["']?\s*[:=]\s*["'][A-Za-z0-9]{8,32}["']/iu],
  ["signed-url", /[?&](?:X-Amz-Credential|X-Amz-Signature|Signature)=/iu],
];

function gitFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr || "unknown error"}`);
  return result.stdout.split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/"));
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

const findings = [];
for (const file of gitFiles()) {
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  const stat = fs.statSync(absolute);

  if (stat.size > MAX_TRACKED_BYTES) findings.push({ file, rule: "file-over-10MiB" });
  if (/^episodes\/[^/]+\/(?:audio|images|renders)\//u.test(file)) findings.push({ file, rule: "generated-episode-media" });
  if (file.startsWith("assets/bgm/") && path.basename(file) !== ".gitkeep") findings.push({ file, rule: "background-music-must-stay-local" });
  if (MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()) && !ALLOWED_MEDIA.has(file)) findings.push({ file, rule: "unapproved-media-file" });

  if (stat.size > TEXT_SCAN_BYTES) continue;
  const buffer = fs.readFileSync(absolute);
  if (looksBinary(buffer)) continue;
  const content = buffer.toString("utf8");
  for (const [rule, pattern] of secretRules) {
    if (pattern.test(content)) findings.push({ file, rule });
  }
}

const unique = [...new Map(findings.map((finding) => [`${finding.file}:${finding.rule}`, finding])).values()];
if (unique.length) {
  console.error("Public-release audit failed. Values are intentionally redacted:");
  for (const finding of unique) console.error(`- ${finding.file}: ${finding.rule}`);
  process.exit(1);
}

console.log("Public-release audit passed: no tracked/generated media or obvious credential literals detected.");
