# Smooth substrate relief shadow

**Status:** technical capture and validation complete; first human free-description review pending. No artistic winner or production renderer was selected.

## Provenance and scope

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `75412739a6ea12e858ec2cf739f0a93279d4ada6` (`codex/ant-material-silhouette-relief-shadow-20261026`).
- Research branch: `codex/ant-material-smooth-substrate-relief-20261027`.
- Seed `20261005`, current-G defaults, H1 `isotropic-diagnostic`, 60 Hz, 640×640, DPR 1; audio and DSP disabled.
- Production defaults and world laws are unchanged. H1 remains an opt-in diagnostic control.
- The canonical `docs/ant/README.md` was not changed.

This package tests renderer-only presentation from the exposed binary material support. Its continuous scalar is named **renderer pseudo-surface field**; it is not terrain height, physical depth, or an interpretation of `totalDepthByCellMeters`.

## Registered views

| View | Registered rendering |
| --- | --- |
| 1 | Existing interpolated RGB 100, alpha 96 reference (`presence-96`) |
| 2 | Shared continuous field; grayscale 100, nominal alpha 32, no directional term |
| 3 | Same field and coverage; fixed down-right directional response, alpha `32 ± 10` |
| 4 | Same field and coverage; same response, alpha `32 ± 24` |

Views 2–4 use the same canonical material support and smooth geometry. There is no texture, grain, hatch, stipple, contour, edge band, color, explicit shadow, material-conditioned pheromone, or pheromone alteration. Material remains below the existing pheromone composite.

### Preregistered field construction

The renderer maps exposed 96×96 occupancy to native pixel-center support, computes a Euclidean signed-distance field clamped to ±24 native pixels, applies a separable normalized Gaussian (`σ=3 px`, radius 9 px), and maps filtered distance from −4 to +4 px through cubic smoothstep coverage. Views 3/4 use the field's central-difference gradient and fixed world light vector `(1/√2, 1/√2)`. Alpha is rounded after coverage weighting; amplitudes are clamped to the registered ±10 / ±24. No global or per-frame normalization is used. The complete registration and rationale are in [PLAN.md](PLAN.md), and source constraints are in [SOURCE-AUDIT.md](SOURCE-AUDIT.md).

No candidate or field parameter was changed after viewing candidate output. The pre-result operational amendments were limited to capture cadence, empty-support validation, endpoint de-duplication, View 1 checkpoint filename alignment, and closing media writers before parity checks; details and failed-attempt receipts are retained under `attempt-01/`–`attempt-03/` and in the plan. No artist review occurred during those attempts.

## World and parity

The first Plate was born at tick 4501 (`75.016666667 s`). Still milestones use tick 4500 immediately before birth, tick 4501 immediately after, tick 5401 (+15 s), and tick 6301 (+30 s). At +15 s and +30 s the world had 2 Plates and 967 occupied material cells. At the endpoint the H1 RNG was state `3450053109`, calls `45352`; events were 4,353 foot contacts, 2 Plate births, 0 nodule births, and 0 errors.

The capture reports that the H1 milestone states, first-Plate timing, final state fingerprint, final RNG/events match the prior H1 evidence. All four View 1 milestone PNGs are byte-identical to their prior checkpoints. Sequential renderer checks preserve snapshot, RNG, and event state; each same-snapshot rerender produced stable bytes for all four views. This is milestone and endpoint parity, not a claim that every video frame was byte-compared to the earlier capture's frame map.

The first Plate changed 691 support cells; another 276 had changed by +15 s, with no further support change by +30 s. Outside the registered 43 px locality radius, Views 2–4 had zero changed pixels across the audited old-material regions: 237,712 pixels post-birth, 269,716 at +15 s, and all 409,600 pixels at +30 s when topology was unchanged. Cache audit: 1,050 unchanged-topology frames, 6 support-changing frames, 0 deterministic rebuilds on unchanged topology. No distant old material changed due to normalization or filtering.

## Manipulation measurements

At +30 s, Views 2–4 shared 43,055 native canonical support pixels, 60,173 nonzero-coverage influence pixels, and 43,346 pixels at coverage ≥0.5. Relative to the canonical support, the half-coverage mask expanded by 1,566 pixels and fell below half coverage by 1,275 pixels; 17,118 nonzero-coverage pixels lay outside canonical support. The observed 10–90% transition width was 4.866 px. These are measured consequences of the registered smooth field, not perceptual thresholds.

The discrete Gaussian gain at the 96-grid cell period was `0.01956` on each axis. Boundary second-difference RMS fell from `0.48477` on raw support to `0.10806` after the registered low-pass, a 77.7% reduction. This supports suppression of the raw grid-frequency boundary artifact at the manipulation level; it does not establish human invisibility of every grid cue.

At +30 s, among pixels with nonzero field coverage:

| View | Alpha mean | Alpha SD | Realized alpha range | Material-only darkness mean | Full composite mean darkness |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 22.947 | 11.395 | 0–32 | 13.948 | 13.419 |
| 3 | 22.938 | 12.057 | 0–42 | 13.943 | 13.431 |
| 4 | 22.941 | 14.861 | 0–55 | 13.945 | 13.430 |

Darkness is on an 8-bit grayscale scale. Full-composite means include the unchanged pheromone and ant rendering over white. The influence-area alpha/darkness measurements agree exactly with their canvas-wide sums because zero-coverage pixels contribute zero; an independent review verified that equality on all nine nonempty view/milestone records. View 3/4 realized maxima stay below their ideal full-coverage 42/56 endpoints because directional response and coverage are locally weighted. Mean darkness remains close to View 2 by construction and measurement; these statistics are manipulation checks, not judgments of material identity.

## Media and neutral review

- Open [review.html](review.html) locally. The first screen shows only “View 1”–“View 4” and the free prompt: “무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.” Additional questions remain hidden until a free response is recorded.
- Four synchronized native 640×640 videos are in `video/view-1.webm` through `view-4.webm`. Each is 351 frames, 10 fps, 35.1 s, lossless `gbrp`, no audio. The bounded clip covers model time 70.016666667–105.016666667 s: frame `n` maps to tick `4201 + 6n` and model time `70.016666667 + n/10` s.
- Sixteen native 640×640 PNGs are in `stills/`, four registered milestones per view. The pre-first-Plate still is at model time 75 s; the first-Plate post still at 75.016666667 s; then +15 s and +30 s.
- `MEDIA-VALIDATION.json` records 640×640 dimensions, 351 decoded frames per video, endpoint RGB equality with the +30 s PNG, neutral initial labels/prompt, deferred questions, lazy muted playback, native stills, and no browser page errors. `MEDIA-SHA256.txt` contains all video and still hashes.
- Full lossless video set is intentionally bounded to the event window; no 0–105 s four-view set was made.

## Tests, build, and limits

Manipulation checks passed: same field/coverage for Views 2–4; no texture or explicit-edge output; influence stays within the registered field bounds; no simulation RNG use; production renderer remains default; H1 stays opt-in; View 1 checkpoint parity; deterministic field/render bytes; state/RNG/event parity; temporal locality; neutral viewer; native still/video endpoint parity. Detailed measurements and receipts are in `capture.json`, `manipulation.json`, `frame-map-H1.csv`, `MEDIA-VALIDATION.json`, and `MEDIA-SHA256.txt`.

- Focused renderer and substrate tests: `node --test tests/ant-material-substrate.test.js tests/ant-renderer.test.js` — 20/20 passed.
- Full suite: `npm test` — 360/360 passed.
- Production build: `npm run build` — passed. Existing Rollup warnings remain for two `node_modules/zod` comments and the 1,161.66 kB app chunk.
- Whitespace check: `git diff --check` — passed. Runner and renderer-helper syntax checks passed with `node --check`.

Technical validity does not answer whether any view reads as a distinct surface, depth, shadow, or merely a changed pheromone-like mark. Human free-description review remains pending. H1 is not evidence for adopting isotropic recruitment, and these early-world results do not establish mature-world behavior or a final aesthetic fit.

The artist's verbatim response and its bounded interpretation are preserved in [ARTIST-REVIEW.md](ARTIST-REVIEW.md).
