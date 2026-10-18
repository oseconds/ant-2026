# Synthetic Plate shape capability listening session

> **Listening order:** complete and export the natural cross-Plate blind session at [`2026-10-13-plate-sonic-individuality/cross-plate-listening.html`](../2026-10-13-plate-sonic-individuality/cross-plate-listening.html) before opening this session. Revealing synthetic shape/audio associations first may bias judgments about natural Plates.

After that session is complete, open the [synthetic shape blind viewer](synthetic-shape-listening.html).

## Question and boundary

Can the current isolated Plate compiler, solver and point-pickup readout produce perceptually distinguishable responses from deliberately different geometries when material, excitation and listening level are controlled?

This is a capability/control experiment. The six masks are engineering fixtures, not proposed natural Plate classes. The session does not test TrailPlateBirth, natural geometry occurrence, shape identity persistence, identification accuracy, preference, formal psychophysics or production acceptance.

**2026-10-18 listening follow-up:** this exploratory one-listener session is now complete; its original [source JSON](../../subjective-listening/2026-10-18-synthetic-plate-shape-capability-subjective-listening.json) remains unchanged. The [temporal-envelope investigation](../2026-10-18-plate-temporal-modulation/README.md) analyzes all six fixed-gain responses before joining the judgments. It also records a separate user-confirmed correction to the synthetic A/A selection; the raw export is retained. Do not infer geometry identification, a selector defect, solver adequacy, statistical significance or production acceptance from this session. Existing measurement findings remain separate from listening evidence.

## Frozen geometry and common controls

The geometry was constructed and recorded before audio generation in [`shape-roster.json`](shape-roster.json); its pre-render freeze is commit `9a786fc2b13967444c899ef9f91a2f2be8b1072f`. All masks are deterministic, 4-neighbor connected, and use full 3×3 source-grid tiles expanded from a 32×32 recipe. There are no custom graph edges.

All six masks contain the same exact 96-grid cells:

- Contact: `[48, 86]`
- Left pickup: `[39, 86]`
- Right pickup: `[57, 86]`

The compiler maps the common pickups to solver cells 909 and 915. Every contact anchor routes to the single Plate layer. Source cell count and solver-node differences are retained as measured residuals; no acceptance threshold was set.

| Fixture | Deterministic 32-grid geometry | Occupied source cells | Solver nodes | 96-grid bounding box | Pickup node indices |
| --- | --- | ---: | ---: | --- | --- |
| compact | Ellipse, center `[16, 18.5]`, radii `[9.5, 10.5]` | 2,826 | 314 | x 21–77, y 24–89 | `[305, 311]` |
| elongated | Horizontal ellipse, center `[16, 22]`, radii `[15, 7]` | 2,925 | 325 | x 3–95, y 45–89 | `[313, 319]` |
| curved | Ribbon around `y = 27 − 0.075(x − 16)²`, x 2–30, half-width 5.5 | 2,844 | 316 | x 6–92, y 21–95 | `[272, 278]` |
| Y-branch | Radius-3 capsules from `[16, 19]` to `[4, 5]`, `[28, 5]`, `[16, 29]` | 2,817 | 313 | x 3–95, y 6–95 | `[289, 295]` |
| loop-like | Annulus centered `[16, 18.5]`, radii 6–11.5 | 2,736 | 304 | x 15–83, y 21–92 | `[284, 290]` |
| concave / irregular broad | Elliptical horseshoe with offset inner cavity and open top notch; exact parameters in roster | 2,799 | 311 | x 3–95, y 27–95 | `[266, 272]` |

Area ranges from 2,736–2,925 cells; compiled node count ranges from 304–325. Per-mask residuals, mask hashes, topology hashes, contact routes, material and exact recipe parameters are in the roster.

All shapes use the same already-observed median material from the 2026-10-13 sonic-individuality controls: stiffness `0.9124881966538272`, density `1.2`, damping `0.35499527866153086`. Its frozen input receipt is recorded in [`render-manifest.json`](render-manifest.json).

Each shape received one isolated response using the current production `compileSurfaceTopology` and `surface-plate.worklet.js`: 48 kHz, 1.5 s, one strike at frame 480 (+10 ms), strength `0.035`, footprint `0.01`, hardness `0.5`, fixed export gain 1, 3 ms pulse, 75 ms recovery, ×50 Plate damping and current point pickups. No Base, Z, Nodule, stratigraphy or natural simulation was involved. The worklet and compiler hashes are in the render manifest; each case records one accepted strike, zero rejected routes, zero clipped steps and finite solver state/PCM.

## Audio and playback

[`listening/`](listening/) contains exactly twelve committed float32 stereo WAVs: six fixed-gain direct measurement exports and six RMS-matched listening-only copies. Fixed WAVs are direct renderer outputs at gain 1. Matched copies use the existing Plate listening convention, pooled stereo RMS target `0.02`; their fixed source files remain unchanged.

Matched playback then applies a common pair-level Web Audio `GainNode` after each matched WAV, using digital target pooled stereo RMS `0.08`. The measured matched-arm RMS values differ only by Float32 WAV rounding. The reusable viewer validates that narrow difference and calculates one gain from the pair's mean matched RMS, preserving a common A/B gain. Gains range from `4.000000000232` to `4.000000000887` (`+12.0411998271` to `+12.0411998285 dB`). Maximum predicted post-gain peak is `0.7179970743`, below full scale.

The final playback stage has no limiter or compressor. Fixed-gain playback stays at unity and is unavailable before Reveal. `0.08` is a digital listening target, not calibrated SPL or equal-loudness evidence. Neither listening gain enters measurement files or any analysis.

## Blind trial roster

The six comparisons follow this fixed geometry-label cycle; the cycle was declared without inspecting rendered audio or measurements:

1. compact vs elongated
2. elongated vs curved
3. curved vs Y-branch
4. Y-branch vs loop-like
5. loop-like vs concave / irregular broad
6. concave / irregular broad vs compact

One hidden A/A catch duplicates the compact matched source byte-for-byte on both sides. It checks exploratory difference-seeking bias and is not a score or pass/fail threshold. Trial order and A/B side mapping are randomized using the reusable viewer's versioned deterministic algorithm and fresh browser-random seed.

Before Reveal, the page exposes anonymous A/B, matched playback only, “different?” yes / unsure / no, confidence 1–5 and a neutral free note. It provides no shape names, geometry metadata, visual masks or semantic audio descriptors. The first judgment remains immutable; later revisions are stored separately. Reveal exposes morphology and the existing mask/topology measurements, plus fixed-gain playback and matched-gain receipts. ERB is not required or added.

## Local playback and checks

GitHub's file preview is not the playback surface. Use the checked-out repository: open `synthetic-shape-listening.html` via `file://` when the browser permits, or run `python -m http.server 8000` from repository root and open this package on loopback HTTP. The page has no external runtime dependency and does not fetch audio from a service.

Run the deterministic geometry, synthetic browser and existing viewer regression checks from repository root:

```powershell
node scripts/ant-synthetic-plate-shape-roster.js --check
node scripts/ant-synthetic-plate-shape-browser-check.js
node scripts/ant-audio-evidence-viewer-browser-check.js
```

Chromium 153 / Playwright 1.63 passed `file://` and repository-root HTTP playback, seven randomized trials, exported JSON receipts, A/B exclusion, restart at zero, AudioContext resume, matched GainNode values, fixed-gain unity, and no external requests or uncaught page errors. The existing natural cross-Plate and Base/Born viewer regression also passed. [`viewer-validation.json`](viewer-validation.json) and [`browser-check.json`](browser-check.json) hold the receipts.
