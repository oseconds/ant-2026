# Blind first-listen workflow for the static audio evidence viewer

## Question

Can the reusable static A/B viewer collect a first judgment before showing condition identity or ERB, while preserving the existing frozen Base/Born audio and scientific result?

## Baseline

- Current research branch: `codex/ant-base-born-causal-decomposition-20261014`
- Natural-event viewer used the existing q25/q50/q75 fixed-gain and RMS-matched WAVs (12 files total)
- Scientific decision remains **MIXED**; no human listening assessment had been recorded

## Change

- Added seeded Fisher–Yates trial ordering and per-trial A/B side assignment to the reusable viewer's opt-in `blindSession` mode
- Added yes/unsure/no, confidence and free-note capture before Reveal; first judgments persist separately from later revisions and post-reveal notes
- Kept RMS-matched and fixed-gain judgments independent; Reveal labels current playback mode and fixed-gain analysis separately
- Added one hidden A/A catch by reusing q50 Base files, with exact byte count and SHA-256 equality on both sides for both playback modes
- Export records viewer/evidence IDs, session ID/seed/algorithm, order, revealed side mapping, source receipts, per-mode judgments, reveal state, notes and timestamped event sequence

## Validation and result

- Rechecked all 12 existing WAV receipts; no audio was rendered or modified
- Headless Chromium passed the blind DOM, seed replay, exclusive playback/restart, reveal, fixed-gain ERB, A/A identity, mode separation, immutable first judgment, reload persistence and current-value export checks
- Static file and loopback HTTP playback passed with no runtime fetch, external request or uncaught page error
- This was a listening-tooling change only. No listening was performed and no scientific measurement or decision changed; the Base/Born result remains **MIXED**

Reproduce the viewer and browser checks from the repository root:

```powershell
python scripts/ant-audio-evidence-viewer.py docs/ant/evidence/2026-10-14-base-born-natural-event-erb/viewer-config.json
node scripts/ant-audio-evidence-viewer-browser-check.js
```

## Limit

Blinding applies to the visible page. The static HTML contains the data needed for Reveal, so this is not cryptographic concealment. The A/A catch is an exploratory difference-seeking-bias control, not a formal psychophysical test and not scientific evidence.
