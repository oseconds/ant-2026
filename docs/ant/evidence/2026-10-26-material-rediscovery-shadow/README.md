# Material rediscovery shadow — 2026-10-26

## Decision

- **Candidate manipulation: valid.** B changes only material alpha. C uses B's base mapping and lightens a sparse, deterministic subset of existing material cells.
- **Production preservation: pass.** Candidate A is the renderer's default production presentation and retains the production material mapping. The controller, stratigraphy and Plate-birth behavior were not edited.
- **Comparison assets: usable.** One production run feeds all three renderers; each saved video is 640×640 VP9 at 10 fps with the same 1,142 frames.
- **Artistic hypothesis: inconclusive / awaiting artist review.** Pixel and alpha measurements establish technical differences only; they do not establish place rediscovery or perceptual success.

## Registered candidates

The values were fixed in [PLAN.md](./PLAN.md) before candidate output was viewed. All three keep the material RGB at `(100,100,100)` and use the existing `topLayerByCell` mask and local `layerCountByCell` source.

| Candidate | Material presentation |
| --- | --- |
| A — Production | Existing `min(21, 9 + layerCount × 1.25)` alpha; no texture. |
| B — Surface | `min(30, 18 + layerCount)` alpha; no texture. |
| C — Surface + texture | B's base alpha, with alpha lightened by 8 at fixed world-grid cells selected by the registered integer hash; no cell is darkened. |

The renderer defaults to A. Ant appearance, pheromone field and mapping, movement, heading, spawning, material formation, and audio code were not changed.

## Capture and parity

- Branch starts at fresh `origin/main` commit `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Seed `20261005`, production controller defaults, 640×640 renderer, one controller run, and the first natural Plate event at model time `84.0166667 s`.
- Capture ends exactly 30 model seconds later at `114.0166667 s` (tick 6,841). The run recorded 2 Plate births, 0 nodule births, 4,061 foot-contact events and no controller errors.
- The same detached snapshot was rendered A→B→C for each saved frame. All three render calls left its state fingerprint unchanged. The [frame map](./frame-map.csv) records the tick, model time and source-state SHA-256 for each frame.
- Final RNG state/calls: `1842689773` / `46432`. The capture records 1,142 distinct frame-state hashes and matching 1,142-frame videos.
- Audio bridge and audio output were both off. No AudioBridge, AudioEngine, worklet or DSP capture was instantiated. ANT simulation has no audio input path; the optional bridge receives emitted events.

See [capture.json](./capture.json) for the full capture metadata, source hashes, video probes and tool versions.

## Technical measurements

At the endpoint, all three renderers had 677 occupied material cells. Mean material-image alpha was `10.66` for A, `19.33` for B and `18.79` for C. C marked 46 of those 677 material cells with its fixed texture.

The native 640×640 canvas pixel comparison found 35,689 changed pixels between A and B, all within the one-cell material support band. B and C differed at 5,983 pixels: 5,771 within one cell of selected source cells and 212 beyond one cell, with all 5,983 within a two-cell band. The extra pixel support is consistent with p5 image resampling; it is not a change to the simulation or pheromone layer. These are technical bounds, not a human visibility threshold.

The videos use lossless VP9 encoding and contain no audio. `capture.json` includes per-candidate dimensions, frame count, frame rate and file size. `MEDIA-SHA256.txt` records checksums for the review assets.

## Review assets

- [Synchronized A/B/C review page](./review.html), with shared play/seek and native-size stills at initial state, immediately before and after the first Plate, first Plate +15 s, and the +30 s endpoint.
- [Candidate A — production](./video/candidate-a.webm)
- [Candidate B — surface](./video/candidate-b.webm)
- [Candidate C — surface + texture](./video/candidate-c.webm)
- Native-size PNG stills are in [`stills/`](./stills/).

Please judge these questions from the assets, not from the measurements: can a viewer find a retained place after missing its birth; does B read as a distinct retained state rather than a stronger trail; does C add information beyond B; is the texture read as surface or noise; is ant tracking preserved; and does the upper-canvas/road impression increase? This early window is not a mature-terrain test.

## Validation

- Focused renderer, controller and material-stratigraphy tests: **43/43 pass**.
- Full `npm test`: **340/340 pass**.
- `npm run build`: **pass**. Vite reported existing Zod annotation notices and the existing 1,161.66 kB app-chunk size warning.
- Capture runner: `node scripts/ant-material-rediscovery-shadow.js`.

The runner checks the preregistered starting commit/branch, refuses to overwrite prior capture output, checks same-state rendering, verifies video dimensions/frame counts, and bounds the candidate pixel differences. The artist later reported not readily seeing differences among A/B/C; this qualitative response is preserved in the [separate feedback record](./ARTIST-REVIEW.md). No candidate is adopted into production by this pass.
