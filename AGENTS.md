# Player Video Agent Guide

This repository produces source-backed, three-minute vertical profile videos. Keep code, schemas, prompts, rights-cleared reusable assets, and distilled methods in Git. Keep credentials, downloaded references, generated episode media, narration, models, BGM, and renders local.

## Required production order

1. Producer creates `episodes/<episode>/brief.json` and selects a subject adapter from `config/subject-types/`.
2. Research Agent writes `research.md` and atomic claims with authoritative URLs to `claims.csv`.
3. Fact-check Agent marks each claim `verified` or rejects it. Unverified claims block downstream production.
4. Script Agent writes 36–72 spoken Mandarin rows and 600–1000 Chinese characters to `script.csv`; factual rows cite claim IDs.
5. Visual Agent writes `storyboard.json`, `assets.csv`, and `prompts.csv`, then creates only original or explicitly licensed media.
6. Audio Agent generates or imports narration. Timing Agent maps every script row to `body-timings.json`; ASR must never replace `script.csv` text.
7. Run `npm run profile:validate -- <episode> v1`. Do not bypass errors.
8. Run `npm run profile:audio:prepare -- <episode>`, then preview and render with an explicitly supplied rights-cleared BGM.
9. QA Agent checks facts, licenses, captions, black frames, sync, loudness, and stream specifications before updating `final-qa.json`.

## Writing rules

- Open on a concrete tension, not a biography summary.
- Prefer short spoken lines and verifiable detail.
- Let statistics support the subject rather than replace the story.
- Avoid inflated claims, moralizing, mechanical parallelism, and CTA language.
- End with emotional aftertaste.
- Disputed conduct, medical causation, legal issues, and private life require at least two independent reliable sources or must be removed.

## Media and licensing

- AI-generated art must be original and documented in `prompts.csv` and `assets.csv`.
- Do not use unlicensed broadcast frames/audio, press photos, music videos, lyrics, logos, watermarks, or social-media downloads.
- Do not clone a real person's voice without permission.
- BGM stays local under `assets/bgm/` and must be explicitly supplied to the render command.
- Generated images, narration, alignment data, local models, and renders remain ignored local files.

## Quality gates

- Profile: `profile-3m-v1`
- Duration: 160–210 seconds
- Canvas: 720 × 960, 30 fps
- Voice target: approximately -16 LUFS
- Final mix target: approximately -14 LUFS, true peak at or below -1 dBTP
- Every factual script row references verified claim IDs
- Every scene references a `rights_status=cleared` asset

Run `npm run check`, `npm run audit:public`, and `git diff --check` before publication. Full contracts are in `docs/multi-agent-profile-workflow.md` and operator instructions are in `docs/USAGE.zh-CN.md`.
