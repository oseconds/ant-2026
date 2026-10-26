# Material identity decomposition — registered implementation plan

> For agentic workers: implement the approved bounded renderer pass, preserve the ledger below, and obtain one fresh final review. The user's 2026-10-26 execution brief is the specification; this file fixes implementation choices before any candidate output is viewed.

**Goal:** distinguish boundary resampling, fixed texture structure/scale, and local geometry registration without adopting a production presentation.

**Architecture:** reuse the validated H1 controller and M1 renderer infrastructure. A single detached H1 snapshot stream feeds five independent renderer instances. A pure helper rasterizes deterministic exposed-Plate texture; the simulation and audio paths receive no new input.

**Tech stack:** existing JavaScript, p5 2.3.4, Playwright/Chrome, PNG and lossless grayscale VP9. No dependency addition.

## Baselines and scope

- Freshly fetched main: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `bee3a6908b36e23c826e1fde00d461b426c75992`.
- Branch: `codex/ant-material-identity-decomposition-20261026`.
- Seed `20261005`, H1 opt-in isotropic accepted heading, otherwise current-G defaults, resistance On, 60 Hz steps, canvas 640×640, pixel ratio and browser DPR 1.
- No audio bridge, worklet, DSP, heading adoption, material adoption, relief, color, pheromone modification, buried-layer readout, or temporal effect.
- Stop at the existing H1 first Plate +30 s endpoint: expected tick 6301 / model 105.0166667 s. Absolute ceiling tick 6301; stop inconclusive if the expected natural milestone fails. No new seed or duration extension.
- Preserve existing untracked work; no new worktree, PR, merge or force push.

## Registered matrix

| ID | Material readout | Primary comparison |
| --- | --- | --- |
| A | Existing `presence-96`: original 96-grid image, RGB 100, occupied alpha 96, original interpolation behavior | Baseline; verify prior native PNG parity |
| B | `presence-96-sharp`: identical source image, scoped material-only smoothing Off | A/B resampling treatment, including its visible coarse grid |
| C | `identity-fine-shuffled`: fixed fine marks, Plate-local deterministic permutation of D's nominal angle assignments | B/C adds texture structure; not a pure frequency-only comparison |
| D | `identity-fine-registered`: same marks with nearest exposed-Plate graph segment axis | C/D local orientation organization, not actual ant travel direction |
| E | `identity-coarse-shuffled`: C-family marks at 3× feature scale | C/E texture scale, conditional on measured tone/coverage mismatch |

All conditions use identical snapshot, ant/pheromone values and presentation, draw order, coarse occupied support and abrupt birth. The old production-low-alpha view is not a sixth condition.

## Pre-result audit and implementation rulings

1. The production pheromone block leaves canvas smoothing enabled/high for the next frame. Do not use global `noSmooth()`. B saves/restores the canvas smoothing attributes around only the material draw. A remains unchanged and must match previous H1/M1 PNGs.
2. B is nearest resampling of the same coarse raster, not a reconstructed vector boundary. Antialias/support differences at the edge are part of this filtering treatment; quantify them rather than claiming identical final nonzero support.
3. `topLayerByCell` is an index into `material.plates`. Clip every texture sample to that locally exposed Plate. Do not sum buried Plate patterns.
4. Fine rectangular marks: length 4, width 1, center spacing 4 reference-canvas pixels; coarse: length 12, width 3, spacing 12. Mark coverage uses fixed 4×4 subpixel samples and union, not additive overdraw. Inside support, RGB is 100 and alpha is `round(64 + 128 * coverage)`; nominal 25% ink yields mean alpha 96. This palette is fixed before capture, not tuned to appearance.
5. Nominal mark centers are fixed world-grid locations within each immutable Plate's original mask. D's axis derives from nearest centerline graph segments modulo pi. C permutes that Plate's complete nominal axis list using a local integer PRNG/hash, never simulation RNG. This prevents unrelated later births from moving existing exposed patterns. C/D nominal full-footprint angle histograms match; burial/clipping can still produce exposed/raster mismatches, which must be reported.
6. E uses the same palette and proportional geometry, with a deterministic balanced sample of the fine angle distribution. Its smaller count and clipped boundaries make exact histogram/coverage equality impractical. No output-dependent normalization is allowed; substantial mismatch limits inference rather than prompting aesthetic retuning.
7. New native texture caches must include topology revision, dimensions and presentation; test repeat and resize behavior. The production default cache/path is preserved.
8. `totalDepthByCellMeters` excludes the foundation Plate, and is not terrain elevation. It is not used in this pass.

## Validation and interpretation gates

- Exact H1 reproduction against all prior sampled state hashes, milestone state/RNG facts and A PNG bytes. Render before/after hashes and RNG/event counts remain identical for every frame.
- Candidate defaults/options, scoped smoothing restoration, unchanged pheromone rendering, cache resize, deterministic helper output, no RNG call, no mutation, no off-support texture, and no buried-direction leakage have focused tests.
- For material-only bitmap and final composite, record alpha/tone distributions, ink coverage, orientation histograms, clipping and support. Keep nominal features distinct from exposed raster statistics.
- Re-render unchanged topology and compare bytes; preserve existing exposed pixels across unrelated births except where actual exposure changes. No time-dependent texture phase.
- Pre/post-birth, +15 s and +30 s native PNGs; synchronized same-frame 10 fps videos, identical frame count/dimensions/duration, no audio. Pairwise review at native size, neutral numbered labels and a free-description prompt.
- Technical mismatches are not aesthetic failures. Do not claim pure causality if clipping/tone differences are material. Human review stays pending; do not rank candidates.
- Run focused tests, full `npm test`, and `npm run build`. Preserve pre-existing warnings.
- Preserve supplied artist feedback verbatim in previous heading/material evidence. Keep canonical ANT README unchanged.

## Tasks and files

- [x] Task 1: pure texture helper and assert-based unit fixtures (`src/lib/renderers/antMaterialIdentity.js`, `tests/ant-material-identity.test.js`).
- [x] Task 2: opt-in renderer options and scoped filtering/cache tests (`AntRenderer.js`, existing renderer tests). Production defaults preserved; validated A PNG parity exact.
- [x] Task 3: bounded same-H1 native capture, documented metadata-only recovery and neutral review surface (`scripts/ant-material-identity-decomposition.js`, review template, this package).
- [x] Task 4 technical validation: media/parity, 354/354 full tests, build and fresh independent review. Evidence/daily receipts prepared for scoped research-only delivery; commit/push and remote SHA are reported by the delivery turn.

## Ledger

- Preflight: renderer/helper interface fixed as `buildMaterialIdentity(material, width, height, mode) -> { pixels, primitives, stats }`. Helpers do not access browser resources or world RNG.
- Preflight: no candidate pixels have been rendered or viewed when this plan is written. Deviations must be added here before acquisition, with reason and cost.
- Audit closure before capture: new caches use a geometry/content signature as well as dimensions/revision/mode, because world reset can reuse revision numbers. `render()` now returns p5's existing redraw promise so the runner can await actual draw completion. This adds no simulation input or default-pixel change.
- Helper draft checks caught an incompatible synthetic descriptor fixture and one-dimensional anchor interpretation before acquisition; actual descriptor-shape, full two-dimensional anchor, branched nearest-edge and canonical pixel-owner fixtures replaced them. No candidate acquisition or artistic output was used to select this correction.
- Acquisition amendment before repeat: attempt 01 completed its bounded loop but failed the page-error gate because its empty harness HTML omitted the prior runner's script element required by p5's Friendly Error System. Preserve all partial files, log and executed runner in `attempt-01/`. Restore that harness element and assert setup errors are empty before world initialization. Permit exactly one identical technical repeat to the original registered endpoint. No texture/alpha/geometry parameter or seed changes; no candidate images were viewed to select the repair.
- Pre-repeat review refinement: distinguish nominal, visible-center and clipped-mark-contribution angle statistics. The latter weights each mark's surviving subpixel samples before union, so overlapping marks count separately; it is not a uniquely assigned final-raster angle distribution. A fixed-hash regression confirms this statistics-only change preserves pixels. Record working-source/runner hashes at acquisition start and end and reject any drift; retain baseline Git hashes separately.
- Recovery amendment before execution: attempt 02 finalized its native media and passed the prior-H1/media assertions, then manifest construction referenced a browser-local variable from Node. Preserve its executed source and failure log. Do not capture or encode AV again. Permit one same-H1 metadata replay to the same tick ceiling, with PNG output only for byte comparison against all existing 20 milestone files. Assert every existing media hash remains unchanged. Label all reconstructed traces/statistics as recovery-run data; do not claim the lost acquisition sidecar was recovered from memory. This diagnostic redraws the same five views for parity but creates no new persisted AV and performs no encoding. No candidate pixels have been viewed artistically.
