# Material Rediscovery Shadow — preregistered plan

## Question and hypothesis

With the production ants and pheromone display unchanged, can a restrained, stable material surface make retained places easier to find after the birth moment has passed? Candidate C tests whether sparse world-fixed texture adds information beyond Candidate B's base surface contrast.

This is an early-window rendering comparison. It does not test mature terrain or settle the artistic hypothesis. The expected decision is `inconclusive / awaiting artist review` unless a technical validity gate fails.

## Baseline and scope

- Fresh source: `origin/main` at `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research branch: `codex/ant-material-rediscovery-shadow-20261026`.
- Production implementation: `src/lib/renderers/AntRenderer.js`; its default presentation is Candidate A and must retain current output behavior.
- Material source: `MaterialStratigraphy.getSnapshot()` with `topLayerByCell` as the existing-material mask and `layerCountByCell` as local column count.
- Current-G viewing context: native AV observation commit `c18f62ab1ac096e4e713335283d51a56ae1b11c8`; first listener response did not identify retained material or place persistence. This is one short observation, not an audience result.
- Seed: `20261005`; production defaults; first natural Plate event detected from the live controller; stop exactly 30 model seconds after that event.
- Renderer output: 640×640, pixel ratio 1. Audio bridge absent. The controller emits contact events to an optional bridge; the bridge is not a simulation input. No DSP/audio capture is part of this visual pass.
- One controller run supplies every A/B/C frame. The same detached snapshot is rendered by all variants; no candidate gets its own simulation or RNG.
- Video samples use the same 10 Hz model-time frame schedule (six 60 Hz ticks per sample), with a per-frame model-time manifest. Exact pre-birth, post-birth, retained-material and endpoint stills use their event/tick snapshots.

Only material presentation may differ. Ant shape/color/size/gait, pheromone values and display mapping, background, movement, heading, spawning, material formation/semantics, audio, and debug overlays remain unchanged.

## Fixed candidates (selected before rendering)

All candidates use the same existing mask and row-major material grid. RGB remains `(100,100,100)`.

| Candidate | Material alpha | Texture |
| --- | --- | --- |
| A — Production | Existing `min(21, 9 + layerCount * 1.25)` | None |
| B — Surface | `min(30, 18 + layerCount)` | None |
| C — Surface + texture | Same base mapping as B | At 1/16 of material cells, lighten alpha by 8; never darken the base |

C's fixed cell selector uses only integer world-grid coordinates `(x,y)`:

```js
let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0;
h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
h = (h ^ (h >>> 16)) >>> 0;
textured = (h & 15) === 0;
```

The hash has no RNG, seed, age, Plate identity, depth, hardness, or physical-grain input. A new Plate cannot move existing cells' texture. Texture appears only where the existing material mask is present. Its sparse marks are lighter than B, so C cannot become the darker candidate by construction. B/C rendered alpha and material-region luminance will be measured; measurements are technical evidence, not human thresholds.

## Capture assets

Each candidate gets a separate native 640×640 WebM and five native-size stills: initial state, exact first-Plate pre-state, exact first-Plate post-state, first-Plate +15 s, and exact stop state. The review page keeps A/B/C synchronized and lists neutral labels. Contact-sheet presentation does not replace the individual videos or stills.

## Technical gates

1. A's default material mapping and rendering call order remain production behavior.
2. Every candidate receives the same state fingerprint at each shared sample; rendering leaves snapshot/controller/RNG fingerprints unchanged.
3. No candidate invokes controller ticks, event methods, RNG, or audio/DSP.
4. B/C vary only the material image; C texture is coordinate-stable, mask-bounded, and does not re-randomize existing cells after later births.
5. All videos and stills are actual 640×640 renderer outputs with the shared frame map.
6. Run focused renderer tests, ANT production regression tests, full `npm test`, and `npm run build`.

Pixel differences, alpha averages, and luminance deltas document implementation output only. They do not answer the human-review questions.

## Artist review remains open

Review whether an earlier place becomes worth revisiting; whether material reads as a retained surface rather than a darker trail; whether ant tracking remains intact; whether C adds useful place information over B; whether the texture reads as material or image noise; whether the upper-goal/road impression changes; and whether material is discoverable after its birth moment.

No artistic pass/fail is assigned before that review. No tuning, contour, relief, color, pheromone, heading, audio, or mature-world follow-up is authorized inside this pass.
