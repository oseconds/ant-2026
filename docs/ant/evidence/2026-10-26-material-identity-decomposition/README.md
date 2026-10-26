# Material identity decomposition — 2026-10-26

## Decision and provenance

**Native comparison assets were technically usable; artist review was received after capture.** The five-condition matrix is preserved. C/D are closely matched in mean ink/alpha but not identical after clipping. C/E also differ in realized contrast, so this is not a pure texture-frequency experiment. No artistic ranking or production adoption is made. The later response is preserved verbatim in [ARTIST-REVIEW.md](ARTIST-REVIEW.md).

- Fresh main: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `bee3a6908b36e23c826e1fde00d461b426c75992`.
- Branch: `codex/ant-material-identity-decomposition-20261026`.
- [Registered plan and pre-result amendments](PLAN.md), [source audit](SOURCE-AUDIT.md), [chronology](../../daily/2026-10-26-material-identity-decomposition.md).
- Production defaults and causal laws are preserved. H1 and every candidate remain opt-in branch research. Canonical ANT README, controller/agents/fields/formation/stratigraphy, worklet and audio source were not changed in this pass. No PR or merge.

The artist's supplied H1/M1 response is preserved verbatim in the [previous package](../2026-10-26-heading-material-visibility-shadow/ARTIST-REVIEW.md). It supports **visibility shortage alone does not explain the current reading**, not “visibility is solved.” Visibility, distinction as a different state, and retained-history meaning remain separate.

## Registered conditions

| ID / neutral viewer | Readout | Primary comparison |
| --- | --- | --- |
| A / View 1 | Existing H1/M1: 96-grid RGB 100, alpha 96, current interpolation | Positive visibility baseline |
| B / View 2 | Same source pixels and mask; material-only nearest resampling | A/B filtering treatment |
| C / View 3 | Fine world-fixed rectangular marks; per-Plate shuffled axis assignments | B/C flat versus fixed fine structure |
| D / View 4 | Same fine primitives; nearest exposed-Plate graph-segment axes | C/D local geometry registration |
| E / View 5 | Shuffled family at 3× feature scale | C/E scale plus measured residual contrast/clipping differences |

Fine marks are 4×1 pixels on a 4-pixel reference grid; coarse marks are 12×3 on a 12-pixel grid. RGB is 100 and source alpha is `round(64 + 128*coverage)`, using a fixed 4×4 sample union. The nominal duty cycle is 25%; actual clipping/overlap changes it. No per-output gain/contrast normalization or aesthetic tuning was performed. C/D preserve the exact nominal full-footprint angle multiset; C's spatial assignment is locally shuffled. E uses balanced quantile sampling of that axis distribution, then a local shuffle.

Axes come from explicit `edges` and centerline node-index lookup, not the centerline array's raster order. They are not ant travel or scratch directions. Only the locally exposed Plate index owns a pixel; buried Plate patterns are not added. Immutable original footprints fix each Plate's anchors, preventing a new unrelated birth from reshuffling existing visible texture.

## Execution and recovery record

1. **Attempt 01 rejected:** p5's Friendly Error System emitted five setup errors because the harness omitted the script element used by the validated earlier runner. The page-error gate rejected it. Partial WebMs, 20 PNGs, the log and exact source are preserved in [attempt-01](attempt-01/FAILURE.md). No artistic viewing or ranking selected the repair.
2. **Attempt 02 completed native media:** restored script context, added an early setup-error assertion, and repeated the identical seed/matrix/endpoint once. All native media were finalized and prior-H1/state/RNG/A-PNG and media assertions ran before manifest aggregation threw a browser/Node variable-scope error. Its exact source/log are in [attempt-02](attempt-02/POSTPROCESS-FAILURE.md).
3. **No third AV capture:** a 52.739-second deterministic metadata replay redrew the same H1 states without video encoding or persisted new images. All 20 computed milestone PNGs matched the retained attempt-02 PNG bytes exactly. Every existing media SHA remained unchanged. It rechecked prior H1 and renderer invariants and wrote the durable metadata.

**Consequently, `capture.json`, `manipulation.json` and `frame-map-H1.csv` are recovery-run records. They are not the lost original in-memory acquisition trace.** Their start/end source-hash guard (including the field named `acquisitionSourcesUnchanged`) applies to the metadata run that emitted them. The original acquisition's start/end trace is not available. Frozen executed runner sources, the recovery source snapshots, checkpoint byte equality and independently decoded media provide the stated linkage; equality of all acquisition intermediate pixels to the replay was not re-measured.

## World and media conditions

- H1 `isotropic-diagnostic`, seed `20261005`, current-G defaults, adopted locomotion resistance On, 60 Hz deterministic steps, no audio bridge or DSP.
- One H1 state stream per run; this remains radial/hub-biased and is not an unbiased or production world.
- First natural Plate: tick 4501 / model 75.016666667 s. Endpoint: tick 6301 / model 105.016666667 s, exactly first Plate +30 model seconds. Two Plate births, zero Nodules; final 4,353 group foot-contact events, zero controller errors.
- Five videos, each 640×640, DPR/pixel ratio 1, 1,052 frames at 10 fps, 105.2 s, lossless VP9 Profile 1 `gbrp`, full-range identity RGB, no audio.
- This is offline same-state visual capture, not foreground realtime AV/clock evidence. First-post-birth video sample is at video 75.1 s; exact birth PNG is at model 75.016667 s. The exact endpoint tick is appended after the regular 10 fps samples. The frame map retains separate model/video times; no runtime or artistic lag is inferred.

## Manipulation validity

### A/B and support

A/B original 96-grid RGB/alpha arrays are identical. B differs only in scoped material image filtering; pheromone remains smooth/high above it. Independent Canvas2D nearest output matches the canonical pixel-center map exactly: **0 alpha mismatches** at each milestone. No principal-path boundary reconstruction is used.

At +30 s, B/C/D/E each occupy **43,055 native pixels**, with **0 off-support pixels**. A has 59,414 nonzero resampled pixels, of which 16,359 are outside the nearest support. This is its interpolation halo, not extra physical material. A/B differ in alpha at 47,066 resampled pixels. Thus source support is identical while final nonzero coverage is intentionally not identical. B may show a block grid; the test is the coarse raster's filtering treatment, not “edge sharpness alone” independent of grid appearance.

### C/D/E residual differences

Endpoint material-only statistics, over the common occupied native support:

| Condition | Nominal marks | Mean source alpha | Alpha standard deviation | Union ink fraction |
| --- | ---: | ---: | ---: | ---: |
| C | 4,080 | 94.20416 | 33.50105 | 23.5970% |
| D | 4,080 | 94.20118 | 33.62817 | 23.5947% |
| E | 446 | 92.28605 | 47.78825 | 22.0985% |

- **C/D:** exact nominal primitive dimensions/count/angle histograms. Mean alpha differs by 0.00297 and union ink fraction by 0.00232 percentage points. Clipped, per-mark axis contribution differs by total variation 0.05222 after coalescing numerical graph-axis bins. This is a close tone match, not a perfect registration-only intervention.
- **C/E:** mean alpha differs by 1.91810, ink fraction by 1.49852 percentage points, and coarse texture has greater realized alpha contrast. Fine one-pixel marks at integer anchors have a greater antialias/perimeter contribution relative to their interior; coarse marks retain fully covered interior pixels. Shared palette and nominal duty do not make displayed contrast equal. A later perceptual difference cannot isolate frequency scale from this contrast difference.
- Full-canvas final mean darkness at +30 s is A 16.98377, B 16.94791, C 16.87927, D 16.87686, E 16.77446 on a 0–255 scale. These include the identical current ants/pheromone; they are not perceptual brightness measures.

The raw 12-bin angle counters can split an underlying 45°/135° grid axis across adjacent bins because of floating-point `atan2` near bin boundaries. [Derived axis audit](ORIENTATION-BIN-AUDIT.json) coalesces them without altering source measurements or pixels. D derives at most four graph axes, not a smooth intrinsic direction field.

`visibleCenterAngleHistogram` counts mark-center ownership. `clippedContributionAngleWeights` counts each mark's surviving subpixel contributions **before union**, so overlaps count separately; it is not a unique final-raster orientation histogram. See [full measurements](manipulation.json) for all milestones and both raw and clipped distributions.

## Preservation and repeatability

The metadata replay matched all **1,052 prior H1 sampled state hashes and RNG records**, all four milestone state/RNG records, final RNG/event totals and the four original H1/M1 A PNG bytes. All five sequential renders preserved the full detached snapshot hash, live world RNG and event counts at every sampled frame. The added full hash includes ordinary Plate mask arrays omitted by the legacy fingerprint.

Repeated rendering at all four milestones preserved all five PNG bytes, material bitmap bytes and cache objects. C/D/E each had **0 changed pixels** among 375,307 pixels with unchanged top exposure when compared against the first-birth bitmap at +15/+30 s. This counter includes empty pixels; it is an invariance check, not a claim that all those pixels contain material.

Milestone `eventCounts` are live controller counts when the snapshot was rendered. In particular, the stored pre-birth snapshot is rendered after the birth tick, so its capture-time event counts are not a pre-tick event census. Its model state and supplied RNG anchor remain the exact previous-tick records.

No simulation RNG or per-frame randomness is used for texture. Content-sensitive cache keys distinguish equal revisions from different worlds, dimensions and modes. Production default behavior remains covered by existing/new tests; A checkpoint parity additionally preserves validated M1. No whole-production-viewer perceptual equivalence claim is made.

## Review assets and validation

- [Neutral synchronized pairwise review](review.html): numbered views only, native 640×640, initial +15 s, all four exact milestone PNGs, synchronized seek/play/pause and a local free-description export. Structured questions are deferred until after the first note.
- [Videos A–E](video/), [all 20 native PNGs](stills/), [frame map](frame-map-H1.csv), [capture/recovery manifest](capture.json), [media checksums](MEDIA-SHA256.txt).
- [Media validation](MEDIA-VALIDATION.json): all five final encoded frames equal their endpoint PNG in decoded RGB bytes in both **ffmpeg and Chrome**; native-size review selectors/stills/playback/pause pass, zero page errors. This samples one decoded frame per video, not every encoded frame or every browser/device.
- Focused helper/renderer tests: 25/25. Full `npm test`: **354/354**. `npm run build`: **pass**. Existing Zod annotation notices and the 1,161.66 kB app-chunk warning remain.
- Source snapshots preserve exact working-file bytes; baseline Git hashes and recovery working hashes are separate. Windows checkout line endings can differ from Git blob bytes. [File receipts](RECEIPTS.json) cover committed package bytes.

Recheck without new simulation or capture:

```powershell
node --test --experimental-test-isolation=none tests/ant-renderer.test.js tests/ant-material-identity.test.js
npm test
npm run build
node scripts/verify-ant-material-identity-media.js
```

The acquisition runner refuses overwrite and is closed for this pass. Its `--recover-existing-media` mode was used once as documented; do not rerun it against the sealed package. [Independent review](INDEPENDENT-REVIEW.md) records acceptance limits.

## Human and artistic status

**Artist response received; no candidate selected.** The artist reported that all non-production views felt strange; C/D read like texture, E was excessive, and no non-production view felt like a different material or depth. B felt less alienating and C was the tentative closest identity reference, with the silhouette treatment unresolved. This is limited to these specific views and does not generally falsify texture families. Technical differences, exact reproducibility and decoded pixels do not establish identity separation. See the verbatim [artist response](ARTIST-REVIEW.md).

First collect free description. Only afterward distinguish visibility, distinction from the trail, another kind of mark/state, and retained-history interpretation; also ask about ant readability, road/network, block-grid, noise, moiré and apparent flicker. A C/E difference is already confounded with realized contrast. A C/D difference remains conditional on clipping and the discrete graph-axis mapping. This early two-Plate H1 window does not establish mature accumulation, H0 transfer, history recognition or production suitability. Do not add a style or tune a parameter after seeing the response within this pass.
