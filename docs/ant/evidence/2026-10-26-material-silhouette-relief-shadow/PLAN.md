# Material silhouette / edge-depth shadow — preregistered plan

**Question:** Without adding texture inside material, can fill, silhouette, or a directional edge cue make retained material read as a surface state distinct from pheromone? This is a renderer-only diagnostic; it selects no final aesthetic or production setting.

## Baseline and scope

- Fresh fetch: `origin/main` = `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `01bbef5f5e7a82aaa4774ca866d14312332e9323`; its parent is `bee3a6908b36e23c826e1fde00d461b426c75992`.
- Branch: `codex/ant-material-silhouette-relief-shadow-20261026`.
- Source guide: `docs/ant/README.md`; prior H1 evidence: `docs/ant/evidence/2026-10-26-material-identity-decomposition/`.
- Seed `20261005`, current-G defaults, H1 isotropic diagnostic accepted heading, 60 Hz, canvas 640×640, DPR 1, no audio/DSP.
- One H1 world stream; A–E render the same detached snapshots. First Plate expected at tick 4501 / 75.016666667 s; endpoint tick 6301 / 105.016666667 s.
- No controller/world law, pheromone, ant, draw order, audio/physics, material topology or birth timing change. No texture, hatching, stipple, grain, color, external shadow, or temporal effect.
- Production remains the default. All added renderer modes are opt-in research controls.

## Registered conditions

| View | Renderer mapping | Comparison |
| --- | --- | --- |
| 1 | Existing `presence-96`: 96-grid RGB 100, alpha 96, interpolated material | Existing soft strong reference; checkpoint parity with parent |
| 2 | Existing `presence-96-sharp`: same source pixels/mask/RGB/alpha, scoped nearest material draw | Existing sharp strong reference; same source bitmap as View 1 |
| 3 | Native pixel-center nearest support, RGB 100, fixed alpha 20 | Low-fill flat control |
| 4 | View 3 plus 2-native-pixel interior boundary band, fixed RGB 80 / alpha 64 | Uniform edge-band comparison with View 3 |
| 5 | View 4 support, fill, band, and alpha; only band RGB varies directionally | Directional edge-cue comparison with View 4 |

The viewer labels these only `View 1`–`View 5`. The mapping above stays in this evidence record.

## Pre-result source audit and fixed implementation rulings

1. The current renderer draws retained material before pheromone. The pheromone path sets smoothing to high after material rendering. Existing sharp View 2 scopes `imageSmoothingEnabled=false` to its material draw and restores both smoothing attributes. The new Views 3–5 must likewise scope/restore filtering and must not modify the pheromone image or its draw.
2. The canonical View 2 binary support uses `floor((x + 0.5) * gridWidth / 640)` and the equivalent y mapping. Views 3–5 will derive that same support directly from `topLayerByCell`; no geometry reconstruction, edge expansion, or principal-path ribbon is used.
3. Choose C/low fill alpha **20** before rendering. The prior weak-material evidence measured mean stored alpha `19.329394` at its endpoint. This is a fixed diagnostic reference, not an alpha search. On white, RGB 100 / alpha 20 changes grayscale by `155 × 20 / 255 = 12.16` levels, giving about 242.84.
4. Choose a **2-pixel Euclidean interior band** before rendering: a supported native pixel is in the band when any pixel center within radius 2 is unsupported or outside the canvas. The band remains a subset of the canonical support. RGB 80 / alpha 64 is fixed for View 4. Over View 3's white-composited fill, an RGB-80 / alpha-64 overlay yields approximately 202.0, about 40.8 levels darker than adjacent View 3 fill. The strong line may read as an outline/map/road; record that risk.
5. View 5 changes only band RGB, keeping alpha 64 and exact band support. Estimate outward normals from the canonical binary mask using a 3×3 Sobel gradient; use fixed top-left world-space light `(-1/√2, -1/√2)`. Before rounding, shade is `80 + 24 × (normal·light − mean(normal·light over the current band))`; no height/depth field is read. This pre-registered centering keeps average boundary source tone near View 4 without result-dependent tuning. Record actual source-tone and white-composite mean-darkness mismatch at every milestone. No clipping should occur; if it does, record it.
6. Under white background, nominal band source tones 56 and 104 at alpha 64 would produce about 196.0 and 208.1 over the View 3 fill, against View 4's about 202.0. Thus the brighter edge remains visible against white in the composite calculation; this establishes neither perceptual visibility nor a physical relief.
7. The 96-grid nearest support is visibly stair-stepped at 640 px (about 6–7 output pixels per source cell). Preserve that geometry to test the actual support. Treat the stair-step as an interpretation limit if it dominates the band or normals; do not smooth or replace it. A Sobel field is temporary renderer data only and cannot mutate simulation state.
8. Plate birth remains abrupt. There is no texture randomness, simulation RNG use, direction-dependent behavior, draw-order change, pheromone clearing, or out-of-support edge/shadow pixel.

Any design amendment must be entered here before candidate capture/viewing. Alpha 20, 2 px band, RGB 80 / alpha 64, light direction, and shade coefficient 24 are frozen; no intermediate or stronger variants will be added.

## Pre-capture execution ledger

- Initial runner attempt stopped at tick 0 after all five renderers had drawn the initial snapshot, before the first packet reached the encoder. A browser callback referenced `fullAfter` outside its declaration scope. No PNG or encoded frame was persisted and no simulation tick advanced. The exact script and empty output directories are preserved in `attempt-01/`. The artist did not view output. One repeat is allowed solely after repairing the runner's fingerprint variable scope; matrix and renderer choices remain frozen.
- Attempt 02 reproduced the registered world through tick 4500 and stopped because Node's `assert` global was referenced inside the browser isolate. Partial videos (750 frames per view) and exact runner are preserved in `attempt-02/`; no milestone still was submitted and the artist did not view output. Browser-side assertions were replaced by local throwing checks; no simulation or presentation rule changed.
- Attempt 03 reached tick 4500 and stopped on a false-positive audit that inspected View 3's intentionally absent edge image. Partial videos and exact runner are preserved in `attempt-03/`; no milestone still was submitted and the artist did not view output. The check now applies edge-array assertions only to Views 4/5, which have an edge image. No condition or alpha changed.
- Attempt 04 reached tick 6301 and wrote all five complete videos and 20 PNGs, then endpoint RGB decoding exceeded Node's default 1 MiB `execFileSync` buffer. The complete media remains at package root; the exact executed runner and failure are in `attempt-04/`. Its in-memory state/RNG trace was not persisted. A deterministic metadata-only replay is registered to match all 20 saved still bytes, verify the prior H1 trace, probe all videos, and compare endpoints with a 4 MiB buffer. It will leave media bytes unchanged and will not encode video. No candidate or simulation parameter changed.
- Attempt 05 completed the H1 metadata replay, all 20 still-byte comparisons and all five ffmpeg endpoint RGB comparisons; existing media hashes remained intact. Review smoke timed out while the page waited for metadata from all five hidden cached videos. Its partial `capture.json` and runner are preserved in `attempt-05/`. The page now loads only the selected two views and will be smoke-checked again; no visual condition or simulation input changed.
- Review-page amendment: the Vite custom harness returned 404 for the nested evidence HTML path, and browser smoke was unnecessarily waiting on hidden video metadata. The static review page now opens directly from the evidence folder, shows only the native checkpoint stills first, and loads the selected two videos only on Play. Its fixed first-Plate video offset is 75.1 s, matching the registered H1 capture. Direct file-page smoke passed; no view names or experimental conditions changed.
- Final recovery replay completed the durable metadata without encoding or overwriting the attempt-04 media. It matched all 20 still PNG bytes, all 1,052 parent H1 sampled state/RNG records, milestone state/RNG records, final RNG/events, and the saved video hashes. The original acquisition's in-memory trace remains unavailable; `capture.json` labels this as metadata replay and links the existing media to attempt 04. FFmpeg endpoint decoding matched all five endpoint PNGs. Browser smoke covered the neutral first screen/stills and response gate, not browser video decoding/playback.

## Validation and review gates

- View 1 and View 2 mapping/checkpoint behavior stays byte-identical to the previous H1 capture; their source material bitmap/RGB/alpha remain identical.
- Views 2/3 share exact support and unsmoothed native display; alpha/fill is their only material bitmap difference.
- Views 3/4 share the faint fill and support; View 4 adds only its two-pixel boundary overlay.
- Views 4/5 have identical fill, edge alpha, band support and thickness. View 5 differs only in deterministic boundary RGB. Record D/E boundary coverage and mean-darkness mismatch.
- Every renderer receives the same H1 snapshot. Compare snapshot, RNG and event records before/after sequential draws; rerender each milestone and require deterministic PNG/material bytes.
- Views 3–5 create zero material alpha outside canonical support. No temporary normal/distance data enters the snapshot or simulation RNG.
- Preserve native 640×640 videos and four exact milestone PNGs per view; verify decoded media endpoint parity and neutral synchronized viewer behavior.
- Run focused renderer/helper tests, full `npm test`, and `npm run build`. Technical validity does not establish artistic success.
- Collect an initial free description only. Do not name the design hypothesis or show interpretation questions until the artist has recorded that first response. No winner, tuning, production adoption, H0 transfer, or mature-world inference.

## Stop and interpretation boundary

Stop after the fixed A–E renderer shadow, same-state H1 capture, technical checks, review assets, evidence/daily record, and commit/push. B≈C, C<D, D<E, map/road-like reading, or no distinction are all valid results. Do not generalize a result to all texture or boundary families, infer literal height/depth, or continue into tuning/style production within this pass.
