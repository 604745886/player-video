#!/usr/bin/env python3

import argparse
import asyncio
import csv
import json
import re
from pathlib import Path

import edge_tts


ROOT = Path.cwd()


def read_rows(episode_dir: Path, version: str):
    with (episode_dir / "script.csv").open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("version") == version]
    return sorted(rows, key=lambda row: int(row["order"]))


def normalized(value: str) -> str:
    return re.sub(r"[\s，。！？；：、,.!?;:'\"“”‘’—·（）()]+", "", value)


async def synthesize(text: str, output: Path, voice: str, rate: str):
    output.parent.mkdir(parents=True, exist_ok=True)
    boundaries = []
    communicator = edge_tts.Communicate(text, voice, rate=rate, volume="+0%", pitch="+0Hz", boundary="SentenceBoundary")
    with output.open("wb") as audio:
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "SentenceBoundary":
                boundaries.append({
                    "text": chunk["text"],
                    "start": chunk["offset"] / 10_000_000,
                    "end": (chunk["offset"] + chunk["duration"]) / 10_000_000,
                })
    if output.stat().st_size < 1024:
        raise RuntimeError("edge-tts returned an unexpectedly small audio file")
    return boundaries


def map_boundaries(rows, boundaries):
    captions = []
    boundary_index = 0
    for row in rows:
        target = normalized(row["text"])
        consumed = []
        combined = ""
        while boundary_index < len(boundaries):
            boundary = boundaries[boundary_index]
            consumed.append(boundary)
            combined += normalized(boundary["text"])
            boundary_index += 1
            if target in combined or combined in target and len(combined) >= max(2, len(target) - 2):
                break
        if not consumed or not combined:
            raise RuntimeError(f"No timing boundary for script line {row['order']}")
        if target not in combined and combined not in target:
            raise RuntimeError(f"Cannot align script line {row['order']} to edge-tts sentence boundaries: {combined}")
        captions.append({
            "order": int(row["order"]),
            "chapter": row["chapter"],
            "start": round(consumed[0]["start"], 3),
            "end": round(consumed[-1]["end"], 3),
            "text": row["text"],
        })
    if boundary_index != len(boundaries):
        raise RuntimeError(f"Unused sentence boundaries: {len(boundaries) - boundary_index}")
    return captions


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("episode")
    parser.add_argument("version", nargs="?")
    parser.add_argument("--voice", default="zh-CN-YunxiNeural")
    parser.add_argument("--rate")
    parser.add_argument("--sample-lines", type=int, default=0)
    args = parser.parse_args()

    episode_dir = ROOT / "episodes" / args.episode
    brief = json.loads((episode_dir / "brief.json").read_text(encoding="utf-8"))
    rate = args.rate or brief.get("audio", {}).get("rate", "+25%")
    version = args.version or brief["story"]["scriptVersion"]
    all_rows = read_rows(episode_dir, version)
    rows = all_rows[:args.sample_lines] if args.sample_lines else all_rows
    if not rows:
        raise RuntimeError("No script rows found")
    text = "\n".join(row["text"] for row in rows)
    audio_dir = episode_dir / "audio"

    if args.sample_lines:
        output = audio_dir / "samples" / f"{args.voice}-{args.sample_lines}-lines.mp3"
        boundaries = await synthesize(text, output, args.voice, rate)
        print(json.dumps({"mode": "sample", "voice": args.voice, "lines": len(rows), "boundaries": len(boundaries), "output": str(output)}, ensure_ascii=False, indent=2))
        return

    body_output = audio_dir / "body-voiceover.mp3"
    boundaries = await synthesize(text, body_output, args.voice, rate)
    captions = map_boundaries(rows, boundaries)
    duration = round(boundaries[-1]["end"], 3)
    timings = {
        "scriptVersion": version,
        "provider": "edge-tts",
        "voice": args.voice,
        "rate": rate,
        "duration": duration,
        "captions": captions,
    }
    (audio_dir / "body-timings.json").write_text(json.dumps(timings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    intro_output = audio_dir / "intro-voiceover.mp3"
    await synthesize(brief["intro"]["spokenLine"], intro_output, args.voice, rate)
    print(json.dumps({"mode": "full", "voice": args.voice, "lines": len(rows), "boundaries": len(boundaries), "duration": duration, "body": str(body_output), "timings": str(audio_dir / 'body-timings.json'), "intro": str(intro_output)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
