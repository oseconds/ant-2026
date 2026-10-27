# Delayed contact-history reveal shadow

**Status: TECHNICALLY VALID — artist review pending.**

## Question and scope

Both conditions use the same eligible real foot-contact events and exact contact positions. The only registered difference is whether the mark appears at contact time or after a fixed delay. This is not a literal-footprint simulation or a final material-identity test.

## Provenance

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Parent: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; branch: `codex/ant-delayed-contact-history-reveal-20261027`.
- Contact prerequisite: `9233500dad65ff5bbd09d8b604f4ea86b2208932`; prior valid temporal-causality comparison: `1c5ebb250398648d99edf9210f74487a3ddb4661`.
- Previous artist review remains at [review-update commit 1f5a396b5e9765944f28719de7b5aa6b2cf8257b](https://github.com/oseconds/ant-2026/blob/1f5a396b5e9765944f28719de7b5aa6b2cf8257b/docs/ant/evidence/2026-10-27-contact-history-temporal-causality/ARTIST-REVIEW.md). It is referenced here, not copied.
- Seed `20261005`, current-G defaults, H1 diagnostic heading, 60 Hz, 640×640, DPR 1, no audio/DSP.
- AntController SHA-256: `b5a6344ebed52962a1749d612b0140b6a4249817f159758e13f166877078e9f4`; AntRenderer SHA-256: `36f76459cc5323b846e04b8bced95b19a4d382c645303dbb9b49aa1050354566`.

## Delay preflight

Shortest registered delay passing the 75% criterion: **0.5 s** (30 ticks). Preflight denominator: 760 eligible contacts across the full review window. Missing ant positions are non-qualifying; percentiles are nearest-rank over available positions.

| Delay | Eligible | Position available | ≥12 px | ≥12 px / eligible | p25 px | Median px | p75 px |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 s | 760 | 750 | 737 | 96.97% | 18.98 | 25.08 | 30.71 |
| 1 s | 760 | 725 | 716 | 94.21% | 34.87 | 45.32 | 54.79 |
| 2 s | 760 | 675 | 675 | 88.82% | 65.50 | 86.21 | 105.40 |
| 3 s | 760 | 616 | 616 | 81.05% | 95.14 | 123.87 | 155.04 |

The common selected subset contains 746 events with event tick ≤ 6271. See [distance samples](./delay-distance-samples.jsonl), [selected events](./eligible-events.jsonl), and [preflight record](./delay-preflight.json). PLAN records the delay before candidate capture.

## Conditions and validity

- **A — immediate causal:** black 2.5 native-pixel circle, alpha 72/255, source-over, at the real contact coordinate and event time.
- **B — delayed causal:** the same circle at the same selected event, Plate and coordinate, revealed at event tick +30 (nominally 0.5 s at 60 Hz). No position shuffle.
- No cap, no decay, hidden material fill, unchanged production pheromone and ants; after reveal, both use current physical/display ownership.
- Event/Plate/coordinate parity passed for 746/746; each B target timestamp is the contact timestamp +500 ms. The mark becomes renderable at the first 60 Hz model tick at or after that target; sampled clock delay was 500.145061–516.666483 ms. The target-to-tick quantization overshoot was 0.145061–16.666483 ms; see [per-event timing audit](./event-timing-audit.jsonl).
- Events hidden at B reveal by owner mismatch: 3; observed visible later if ownership permitted: 0; origin ants absent at reveal: 10.
- Endpoint position multiset equality passed; visible marks 620/620. Convergence is expected.

## State and review assets

- H1 event digest, tick-6301 full-state hash, RNG and 1053 capture/preflight anchors match; twin state parity passed.
- Renderer RNG/event neutrality and snapshot immutability passed. Production `src/` is unchanged; H1 and marks are in-memory research instrumentation.
- Same snapshot stream: ticks 4501–6301, 901 frames at 30 fps. Native 640×640 lossless videos; six birth / +15 s / +30 s stills.
- Primary simultaneous review: [review.html](./review.html). The order key is stored separately in `REVIEW-KEY.json`; the artist knows the general research context, so this is not fully blind.
- Media hashes: [manifest](./media-manifest.json).

**Artist review:** pending. Initial response is not recorded yet.

## Technical validation

- Focused delay-selection tests: `node --test tests/contact-reveal-delay.test.js` — 3/3 passed.
- Full repository tests: `npm test` — 342/342 passed.
- `npm run build` passed. Rollup printed non-blocking Zod `@__PURE__` annotation notices and a bundle-size warning.
- `git diff --check` and `node --check scripts/ant-delayed-contact-history-reveal.js` passed.
- Production source parity against the fresh main parent: unchanged. H1 heading and contact-mark renderer instrumentation exist only in the research harness.

## Interpretation limits

- This tests one registered delay and glyph in one H1 scene. It cannot establish archaeological history, invisible-agent meaning, material identity, or a final renderer direction.
- Simultaneous playback reduces sequential order bias but does not remove left/right or research-context effects. Continuous video is primary; endpoint convergence is intentional.
- Browser errors: 0; no audio tracks.
