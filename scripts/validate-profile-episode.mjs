#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const [episodeName, requestedVersion, ...options] = process.argv.slice(2);
if (!episodeName) {
  console.error("Usage: node scripts/validate-profile-episode.mjs <episode-name> [script-version] [--allow-missing-media]");
  process.exit(1);
}
const allowMissingMedia = options.includes("--allow-missing-media");

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

const episodeDir = path.join(ROOT, "episodes", episodeName);
const required = ["brief.json", "claims.csv", "script.csv", "storyboard.json", "assets.csv", "intro-items.json"];
for (const name of required) {
  const filePath = path.join(episodeDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
}

const brief = JSON.parse(fs.readFileSync(path.join(episodeDir, "brief.json"), "utf8"));
if (brief.profile !== "profile-3m-v1") throw new Error(`Unsupported profile: ${brief.profile}`);
const profilePath = path.join(ROOT, "config", "profiles", `${brief.profile}.json`);
const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
const version = requestedVersion || brief.story?.scriptVersion;
if (!version) throw new Error("Missing script version");

const claims = readCsv(path.join(episodeDir, "claims.csv"));
const verifiedClaims = new Set(claims.filter((claim) => claim.status === "verified").map((claim) => claim.claim_id));
const rows = readCsv(path.join(episodeDir, "script.csv"))
  .filter((row) => row.version === version)
  .sort((a, b) => Number(a.order) - Number(b.order));

const errors = [];
const warnings = [];
if (rows.length < profile.script.minimumLines || rows.length > profile.script.maximumLines) {
  errors.push(`Script line count ${rows.length} is outside ${profile.script.minimumLines}-${profile.script.maximumLines}`);
}
const chineseChars = rows.reduce((sum, row) => sum + (row.text.match(/[\p{Script=Han}]/gu)?.length || 0), 0);
if (chineseChars < profile.script.minimumChineseChars || chineseChars > profile.script.maximumChineseChars) {
  errors.push(`Chinese character count ${chineseChars} is outside ${profile.script.minimumChineseChars}-${profile.script.maximumChineseChars}`);
}
const orders = new Set();
for (const row of rows) {
  const order = Number(row.order);
  if (!Number.isInteger(order) || order < 1 || orders.has(order)) errors.push(`Invalid or duplicate order: ${row.order}`);
  orders.add(order);
  if (!row.chapter || !row.text) errors.push(`Line ${row.order} is missing chapter or text`);
  if ([...row.text].length > 42) warnings.push(`Line ${row.order} is long (${[...row.text].length} characters)`);
  for (const claimId of row.fact_ids.split(";").map((value) => value.trim()).filter(Boolean)) {
    if (!verifiedClaims.has(claimId)) errors.push(`Line ${row.order} references unverified claim ${claimId}`);
  }
}

const storyboard = JSON.parse(fs.readFileSync(path.join(episodeDir, "storyboard.json"), "utf8"));
const assets = readCsv(path.join(episodeDir, "assets.csv"));
const assetById = new Map(assets.map((asset) => [asset.asset_id, asset]));
for (const scene of storyboard.scenes || []) {
  const asset = assetById.get(scene.assetId);
  if (!asset) errors.push(`Scene ${scene.id} references missing asset ${scene.assetId}`);
  else {
    if (asset.rights_status !== "cleared") errors.push(`Asset ${asset.asset_id} is not rights-cleared`);
    if (!fs.existsSync(path.resolve(ROOT, asset.local_path))) {
      const message = `Asset file is missing: ${asset.local_path}`;
      if (allowMissingMedia) warnings.push(message);
      else errors.push(message);
    }
  }
}
const chapters = new Set(rows.map((row) => row.chapter));
const storyboardChapters = new Set((storyboard.scenes || []).map((scene) => scene.chapter));
for (const chapter of chapters) if (!storyboardChapters.has(chapter)) errors.push(`No storyboard scene for chapter ${chapter}`);

const expectedSeconds = rows.reduce((sum, row) => sum + Number(row.duration_hint || 0), 0) + Number(brief.intro?.durationSeconds || 0);
if (expectedSeconds < profile.duration.minimum || expectedSeconds > profile.duration.maximum) {
  warnings.push(`Expected duration ${expectedSeconds.toFixed(1)}s is outside preferred ${profile.duration.minimum}-${profile.duration.maximum}s`);
}

const result = { episode: episodeName, profile: brief.profile, version, rows: rows.length, chineseChars, verifiedClaims: verifiedClaims.size, expectedSeconds: Number(expectedSeconds.toFixed(1)), errors, warnings };
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
