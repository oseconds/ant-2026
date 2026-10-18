# Synthetic Plate geometry capability session — 2026-10-18

## Question

Can the current isolated Plate compiler, solver and point-pickup readout turn deliberately different geometries into perceptually distinguishable responses when material, excitation and listening level are controlled?

This is a capability/control experiment. It does not claim these fixtures occur naturally in ANT or test TrailPlateBirth quality. No human listening result was collected during this pass.

## Baseline and geometry freeze

- Fetched `origin`; starting `origin/main` was `caada3642f05a97a93541a2d1c684cf34bc57f87`.
- Kept production `src/` and `static/` unchanged.
- Chose common exact 96-grid anchors before audio: contact `[48,86]`, left pickup `[39,86]`, right pickup `[57,86]`.
- Constructed six deterministic connected masks from geometry labels and recorded them in `shape-roster.json` before rendering. The pre-render freeze is commit `9a786fc2b13967444c899ef9f91a2f2be8b1072f`.
- Reused the existing observed median material; all masks compile without custom graph edges, Base, Z, Nodules or stratigraphy.
- Source occupancy is 2,736–2,925 cells and compiled node count is 304–325. Residual differences are recorded without a new acceptance threshold.

## Controlled audio and blind session

- Rendered exactly one 1.5 s response per shape at 48 kHz. Each case has one +10 ms strike (frame 480), strength `0.035`, footprint `0.01`, hardness `0.5`, fixed WAV export gain 1, and the unchanged 3 ms / 75 ms / ×50 / point-pickup production baseline.
- Each case had one accepted strike, no rejected route, no clipped solver steps and finite PCM/state. Six fixed-gain measurement WAVs and six RMS `0.02` listening-only WAVs are committed under `evidence/2026-10-18-synthetic-plate-shape-capability/listening/`; total is 6,912,528 bytes.
- Common matched-listening playback gain reaches digital target RMS `0.08` through Web Audio. Pair gains span `4.000000000232–4.000000000887` (`+12.0411998271–+12.0411998285 dB`); maximum predicted peak is `0.7179970743`.
- Blind trial cycle: compact/elongated; elongated/curved; curved/Y-branch; Y-branch/loop-like; loop-like/concave-irregular broad; concave-irregular broad/compact. One hidden A/A catch duplicates the compact matched source bytes.
- The synthetic viewer prominently directs listeners to complete and export the natural cross-Plate session first, to avoid revealed shape/audio associations biasing that judgment.

## Validation and boundary

- Deterministic roster check passed.
- Synthetic Chromium browser check passed `file://` and repository-root loopback HTTP playback; seed/order/mapping reproduced, first judgment remained immutable, later revision stayed separate, export receipts were valid, matched gain and unity fixed-gain paths worked, and there were no external requests or uncaught page errors.
- Existing natural cross-Plate plus Base/Born viewer regression check passed; no audio or viewer artifact from those sessions was changed.
- `git diff origin/main -- src static` is empty.
- **Synthetic geometry capability listening session prepared. No human listening result collected yet.** This does not show geometry identity, selector failure, solver adequacy, formal significance or production acceptance.

Evidence package: [`2026-10-18-synthetic-plate-shape-capability`](../evidence/2026-10-18-synthetic-plate-shape-capability/README.md). Re-run the roster `--check`, synthetic browser check, and existing viewer browser check from repository root.
