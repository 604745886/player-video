#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { slugifyEpisodeName } from "./lib/episode-slug.mjs";

const ROOT = process.cwd();
const [episodeName, requestedVersion] = process.argv.slice(2);
if (!episodeName) {
  console.error("Usage: node scripts/create-profile-preview.mjs <episode-name> [script-version]");
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

function esc(value) {
  return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function js(value) {
  return JSON.stringify(value).replace(/<\//gu, "<\\/");
}

const episodeDir = path.join(ROOT, "episodes", episodeName);
const brief = JSON.parse(fs.readFileSync(path.join(episodeDir, "brief.json"), "utf8"));
const version = requestedVersion || brief.story.scriptVersion;
const introDuration = Number(brief.intro.durationSeconds || 10);
const rows = readCsv(path.join(episodeDir, "script.csv")).filter((row) => row.version === version).sort((a, b) => Number(a.order) - Number(b.order));
const timings = JSON.parse(fs.readFileSync(path.join(episodeDir, "audio", "body-timings.json"), "utf8"));
if (timings.scriptVersion !== version) throw new Error(`Timing version ${timings.scriptVersion} does not match ${version}`);
const timingByOrder = new Map(timings.captions.map((item) => [Number(item.order), item]));
if (timingByOrder.size !== rows.length) throw new Error(`Caption coverage mismatch: ${timingByOrder.size}/${rows.length}`);

const assets = readCsv(path.join(episodeDir, "assets.csv"));
const assetById = new Map(assets.map((asset) => [asset.asset_id, asset]));
const storyboard = JSON.parse(fs.readFileSync(path.join(episodeDir, "storyboard.json"), "utf8"));
const introItems = JSON.parse(fs.readFileSync(path.join(episodeDir, "intro-items.json"), "utf8"));
const workDir = path.join(ROOT, "tmp", `profile-preview-${slugifyEpisodeName(episodeName)}`);
const mediaDir = path.join(workDir, "media");
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(mediaDir, { recursive: true });

for (const asset of assets) {
  if (asset.rights_status !== "cleared") throw new Error(`Asset is not cleared: ${asset.asset_id}`);
  const source = path.resolve(ROOT, asset.local_path);
  if (!fs.existsSync(source)) throw new Error(`Missing asset: ${source}`);
  const destination = path.join(mediaDir, `${asset.asset_id}${path.extname(source).toLowerCase()}`);
  fs.copyFileSync(source, destination);
  asset.mediaFile = path.basename(destination);
}

const scenes = storyboard.scenes.map((scene, index) => {
  const sceneRows = rows.filter((row) => row.chapter === scene.chapter);
  if (!sceneRows.length) throw new Error(`Scene ${scene.id} has no script rows`);
  const firstTiming = timingByOrder.get(Number(sceneRows[0].order));
  const start = introDuration + Number(firstTiming.start);
  const asset = assetById.get(scene.assetId);
  const nextChapter = storyboard.scenes[index + 1]?.chapter;
  const nextRow = nextChapter ? rows.find((row) => row.chapter === nextChapter) : null;
  const end = nextRow ? introDuration + Number(timingByOrder.get(Number(nextRow.order)).start) + 0.45 : introDuration + Number(timings.duration) + 0.8;
  return { ...scene, start: Number(start.toFixed(3)), duration: Number((end - start).toFixed(3)), mediaFile: asset.mediaFile, orders: sceneRows.map((row) => Number(row.order)) };
});
const duration = Number((introDuration + Number(timings.duration) + 0.8).toFixed(3));
if (duration < 160 || duration > Number(brief.render.maximumDurationSeconds || 210)) throw new Error(`Profile duration is outside limits: ${duration}`);

const shardClasses = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
const shardHtml = shardClasses.map((name) => `<div class="intro-shard ${name}"></div>`).join("");
const candidatesHtml = introItems.candidates.map((item, index) => `<div id="candidate-${index}" class="candidate"><strong>${esc(item.title)}</strong><span>${esc(item.meta)}</span></div>`).join("\n");
const sceneHtml = scenes.map((scene, index) => `<section id="scene-${index}" class="scene" data-layout-allow-overlap data-layout-allow-occlusion>
  <div class="scene-media" data-layout-ignore><img src="media/${esc(scene.mediaFile)}" alt="" /></div>
  <div class="scene-wash" data-layout-ignore></div>
  <div class="scene-content">
    <div class="scene-rule"></div>
    <div class="scene-kicker">${esc(scene.kicker)}</div>
    <div class="scene-stat">${esc(scene.stat)}</div>
    <div class="scene-label">${esc(scene.label)}</div>
    <div class="scene-title">${esc(scene.title)}</div>
  </div>
</section>`).join("\n");
const captionHtml = rows.map((row) => `<div id="caption-${Number(row.order)}" class="caption${[...row.text].length > 28 ? " compact" : ""}">${esc(row.text)}</div>`).join("\n");
const heroAsset = assetById.get("hero-title") || assets[0];

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=720, height=960" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    @font-face { font-family: "Microsoft YaHei"; src: local("Microsoft YaHei"); }
    @font-face { font-family: "Bahnschrift"; src: local("Bahnschrift"); }
    html, body { width: 720px; height: 960px; margin: 0; overflow: hidden; background: #0D0B0E; }
    body { color: #F5ECDD; font-family: "Microsoft YaHei", sans-serif; }
    #root { position: relative; width: 720px; height: 960px; overflow: hidden; background: #0D0B0E; }
    .intro { position: absolute; z-index: 80; inset: 0; overflow: hidden; background: #0D0B0E; }
    .intro-hero, .intro-shard, .target-bg { position: absolute; inset: -18px; background: url("media/${esc(heroAsset.mediaFile)}") center/cover no-repeat; }
    .intro-hero { opacity: 0.72; filter: brightness(0.58) saturate(0.8); transform: scale(1.04); }
    .intro-shard { filter: brightness(1.1) saturate(0.9) drop-shadow(0 16px 20px rgba(0,0,0,.7)); }
    .p1 { clip-path: polygon(0 0, 35% 0, 27% 35%, 0 28%); } .p2 { clip-path: polygon(32% 0, 70% 0, 62% 34%, 27% 35%); }
    .p3 { clip-path: polygon(68% 0, 100% 0, 100% 32%, 61% 34%); } .p4 { clip-path: polygon(0 27%, 28% 35%, 34% 67%, 0 72%); }
    .p5 { clip-path: polygon(27% 35%, 62% 34%, 67% 66%, 34% 67%); } .p6 { clip-path: polygon(61% 34%, 100% 31%, 100% 70%, 67% 66%); }
    .p7 { clip-path: polygon(0 71%, 34% 67%, 40% 100%, 0 100%); } .p8 { clip-path: polygon(34% 67%, 67% 66%, 72% 100%, 40% 100%); }
    .p9 { clip-path: polygon(67% 66%, 100% 70%, 100% 100%, 72% 100%); }
    .series-label { position: absolute; z-index: 5; left: 40px; right: 40px; top: 62px; padding: 13px 16px; border-top: 2px solid #F3C966; border-bottom: 2px solid #F3C966; background: rgba(13,11,14,.84); color: #F5ECDD; font-size: 28px; font-weight: 900; letter-spacing: .06em; text-align: center; }
    .intro-promise { position: absolute; z-index: 5; left: 44px; right: 44px; bottom: 128px; color: #F5ECDD; font-size: 52px; line-height: 1.14; font-weight: 900; text-align: center; text-shadow: 0 6px 18px #0D0B0E; }
    .candidate { position: absolute; z-index: 7; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px; padding: 60px; opacity: 0; background: rgba(13,11,14,.74); text-align: center; }
    .candidate strong { font-size: 70px; line-height: 1.05; font-weight: 900; letter-spacing: -.04em; text-shadow: 0 8px 28px #000; }
    .candidate span { padding: 8px 12px; color: #F3C966; background: #0D0B0E; font: 800 22px/1 "Bahnschrift", monospace; letter-spacing: .11em; }
    .intro-black { position: absolute; z-index: 8; inset: 0; background: #000; opacity: 0; }
    .target { position: absolute; z-index: 9; inset: 0; opacity: 0; overflow: hidden; }
    .target-bg { filter: brightness(.68) saturate(.78); }
    .target-wash { position: absolute; inset: 0; background: radial-gradient(circle at 65% 25%, rgba(243,201,102,.2), rgba(13,11,14,.1) 34%, rgba(13,11,14,.92) 85%); }
    .target-copy { position: absolute; left: 44px; right: 44px; bottom: 112px; display: flex; flex-direction: column; gap: 14px; }
    .target-copy .eyebrow { color: #F3C966; font: 800 23px/1 "Bahnschrift", monospace; letter-spacing: .13em; }
    .target-copy h1 { margin: 0; font-size: 88px; line-height: 1; letter-spacing: -.05em; text-shadow: 0 7px 24px #000; }
    .target-copy p { margin: 0; color: #F3C966; font: 800 25px/1.2 "Bahnschrift", monospace; letter-spacing: .1em; }
    .scene { position: absolute; inset: 0; opacity: 0; overflow: hidden; background: #0D0B0E; }
    .scene-media { position: absolute; inset: -30px; transform-origin: 50% 50%; }
    .scene-media img { width: 100%; height: 100%; object-fit: cover; object-position: center; filter: saturate(.8) contrast(1.08); }
    .scene-wash { position: absolute; inset: 0; background: radial-gradient(circle at 70% 28%, rgba(243,201,102,.16), rgba(58,16,28,.08) 38%, rgba(13,11,14,.8) 82%), linear-gradient(180deg, rgba(13,11,14,.12), rgba(13,11,14,.94)); }
    .scene-content { position: relative; z-index: 4; display: flex; flex-direction: column; width: 100%; height: 100%; padding: 70px 42px 235px; gap: 17px; }
    .scene-rule { width: 132px; height: 5px; background: #F3C966; transform-origin: left center; }
    .scene-kicker { align-self: flex-start; max-width: 620px; padding: 7px 11px; color: #FFD978; background: #050405; font: 900 22px/1.2 "Bahnschrift", monospace; letter-spacing: .12em; }
    .scene-stat { margin-top: auto; color: rgba(245,236,221,.78); font: 900 260px/.72 "Bahnschrift", monospace; letter-spacing: -.08em; font-variant-numeric: tabular-nums; text-shadow: 0 8px 30px rgba(13,11,14,.95); }
    .scene-label { align-self: flex-start; padding: 5px 9px; color: #F3C966; background: #0D0B0E; font: 900 25px/1 "Bahnschrift", monospace; letter-spacing: .08em; }
    .scene-title { max-width: 620px; color: #F5ECDD; font-size: 43px; line-height: 1.16; font-weight: 900; letter-spacing: -.03em; text-shadow: 0 6px 22px rgba(13,11,14,.96); }
    .top-rail { position: absolute; z-index: 30; top: 20px; left: 34px; right: 34px; display: flex; justify-content: space-between; padding: 10px 12px; background: #0D0B0E; border-bottom: 2px solid #F3C966; font: 700 16px/1 "Bahnschrift", monospace; letter-spacing: .1em; }
    .top-rail .gold { color: #F3C966; font-weight: 900; }
    .caption { position: absolute; z-index: 40; left: 34px; right: 34px; bottom: 58px; min-height: 138px; display: flex; align-items: center; justify-content: center; max-width: 652px; margin: 0 auto; color: #F5ECDD; font-size: 45px; line-height: 1.22; font-weight: 900; letter-spacing: -.025em; text-align: center; text-shadow: 0 5px 15px #0D0B0E, 0 0 4px #0D0B0E; opacity: 0; visibility: hidden; overflow: visible; }
    .caption.compact { font-size: 40px; }
    .grain { position: absolute; z-index: 60; inset: 0; pointer-events: none; opacity: .11; background: repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,.16) 0 1px, rgba(0,0,0,0) 1px 4px); mix-blend-mode: soft-light; }
    .final-fade { position: absolute; z-index: 100; inset: 0; background: #0D0B0E; opacity: 0; }
  </style>
</head>
<body>
<main id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="720" data-height="960">
  <section class="intro" data-layout-allow-overflow data-layout-allow-overlap>
    <div class="intro-hero"></div><div class="shards">${shardHtml}</div>
    <div class="series-label">${esc(introItems.seriesLabel)}</div>
    <div class="intro-promise">今天介绍的是……</div>
    ${candidatesHtml}
    <div class="intro-black"></div>
    <div class="target" data-layout-allow-overflow><div class="target-bg"></div><div class="target-wash"></div><div class="target-copy"><span class="eyebrow">PROFILE / 001</span><h1>${esc(introItems.target.title)}</h1><p>${esc(introItems.target.subtitle)}</p></div></div>
  </section>
  ${sceneHtml}
  <div class="top-rail"><span>PROFILE / 3 MIN</span><span class="gold">${esc(brief.subject.displayName)}</span></div>
  ${captionHtml}
  <div class="grain" data-layout-ignore></div><div class="final-fade" data-layout-ignore></div>
</main>
<script>
  window.__timelines = window.__timelines || {};
  var SCENES = ${js(scenes)};
  var CAPTIONS = ${js(rows.map((row) => ({ order: Number(row.order), start: introDuration + Number(timingByOrder.get(Number(row.order)).start), end: introDuration + Number(timingByOrder.get(Number(row.order)).end), chapter: row.chapter })))};
  var tl = gsap.timeline({ paused: true });
  tl.from(".series-label", { y: -32, opacity: 0, duration: .5, ease: "power3.out" }, .16);
  tl.from(".intro-promise", { y: 26, opacity: 0, duration: .55, ease: "expo.out" }, .28);
  tl.to(".intro-promise", { y: -12, opacity: 0, duration: .18, ease: "power2.in" }, 1.45);
  [".p1",".p2",".p3",".p4",".p5",".p6",".p7",".p8",".p9"].forEach(function(selector, index) {
    var x = [-130, -30, 120, -145, 0, 145, -120, 20, 130][index];
    var y = [-90, -140, -80, 20, 10, 40, 150, 135, 145][index];
    tl.from(selector, { x: x, y: y, rotation: (index % 2 ? 7 : -8), scale: .86, opacity: 0, duration: .72 - index * .025, ease: index % 3 === 0 ? "expo.out" : index % 3 === 1 ? "power4.out" : "back.out(1.15)" }, .12 + index * .035);
  });
  for (var ci = 0; ci < ${introItems.candidates.length}; ci += 1) {
    var cstart = 1.75 + ci * .38;
    tl.fromTo("#candidate-" + ci, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: .09, ease: "power4.out" }, cstart);
    tl.to("#candidate-" + ci, { opacity: 0, duration: .08, ease: "power3.in" }, cstart + .29);
  }
  tl.to(".intro-black", { opacity: 1, duration: .12, ease: "none" }, 4.18);
  tl.to(".intro-black", { opacity: 0, duration: .16, ease: "sine.out" }, 4.55);
  tl.fromTo(".target", { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: .58, ease: "expo.out" }, 4.58);
  tl.from(".target-copy .eyebrow", { x: -40, opacity: 0, duration: .45, ease: "power3.out" }, 4.82);
  tl.from(".target-copy h1", { y: 42, opacity: 0, letterSpacing: ".02em", duration: .7, ease: "expo.out" }, 4.92);
  tl.from(".target-copy p", { x: 45, opacity: 0, duration: .46, ease: "power4.out" }, 5.2);
  tl.to(".target-bg", { scale: 1.075, duration: 5.2, ease: "sine.inOut" }, 4.58);
  SCENES.forEach(function(scene, index) {
    var selector = "#scene-" + index;
    tl.fromTo(selector, { opacity: 0, filter: index === 5 ? "brightness(2) blur(2px)" : "brightness(1.35) blur(5px)" }, { opacity: 1, filter: "brightness(1) blur(0px)", duration: index === 5 ? .28 : .52, ease: index === 5 ? "power4.out" : "power2.inOut" }, scene.start);
    if (index > 0) tl.set("#scene-" + (index - 1), { opacity: 0 }, scene.start + .54);
    tl.from(selector + " .scene-rule", { scaleX: 0, duration: .34, ease: "expo.out" }, scene.start + .15);
    tl.from(selector + " .scene-kicker", { x: -38, opacity: 0, duration: .5, ease: "power3.out" }, scene.start + .23);
    tl.from(selector + " .scene-stat", { scale: .82, opacity: 0, duration: .64, ease: "back.out(1.3)" }, scene.start + .3);
    tl.from(selector + " .scene-label", { x: 44, opacity: 0, duration: .38, ease: "power4.out" }, scene.start + .44);
    tl.from(selector + " .scene-title", { y: 44, opacity: 0, duration: .7, ease: "expo.out" }, scene.start + .5);
    tl.fromTo(selector + " .scene-media", { scale: 1.02, x: 0, y: 0 }, { scale: 1.1, x: scene.drift[0], y: scene.drift[1], duration: scene.duration, ease: "sine.inOut" }, scene.start);
    scene.orders.forEach(function(order, beatIndex) {
      if (beatIndex > 0 && beatIndex % 3 === 0) {
        var caption = CAPTIONS.find(function(item) { return item.order === order; });
        var sign = beatIndex % 2 === 0 ? 1 : -1;
        tl.to(selector + " .scene-media", { x: scene.drift[0] + sign * 15, y: scene.drift[1] - sign * 8, scale: 1.12, duration: .34, ease: "power3.inOut" }, caption.start);
        tl.fromTo(selector + " .scene-rule", { backgroundColor: "#F5ECDD" }, { backgroundColor: "#F3C966", duration: .5, ease: "sine.out" }, caption.start);
      }
    });
  });
  tl.to(".intro", { opacity: 0, duration: .55, ease: "power2.inOut" }, ${Math.max(0, introDuration - .5)});
  tl.from(".top-rail", { y: -26, opacity: 0, duration: .55, ease: "power3.out" }, ${introDuration + .18});
  CAPTIONS.forEach(function(caption) {
    var selector = "#caption-" + caption.order;
    var visible = Math.max(.45, caption.end - caption.start);
    var enter = Math.min(.28, visible * .25);
    var exitStart = Math.max(caption.start + enter + .1, caption.end - .13);
    tl.set(selector, { visibility: "visible" }, caption.start);
    tl.fromTo(selector, { opacity: 0, y: 20, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: enter, ease: "power4.out" }, caption.start);
    tl.to(selector, { opacity: 0, y: -7, duration: .12, ease: "power2.in" }, exitStart);
    tl.set(selector, { opacity: 0, visibility: "hidden" }, caption.end);
  });
  tl.to(".final-fade", { opacity: 1, duration: .72, ease: "power2.in" }, ${Math.max(0, duration - .75)});
  window.__timelines.main = tl;
</script>
</body></html>`;

fs.writeFileSync(path.join(workDir, "index.html"), html);
fs.writeFileSync(path.join(workDir, "package.json"), `${JSON.stringify({ name: `profile-preview-${slugifyEpisodeName(episodeName)}`, private: true, type: "module" }, null, 2)}\n`);
fs.writeFileSync(path.join(workDir, "preview.json"), `${JSON.stringify({ episodeName, version, duration, introDuration, scenes }, null, 2)}\n`);
console.log(workDir);
