# Plate material contribution at ERB scale — 2026-10-14

## Question

With Plate geometry, contact position, event schedule, pickup, and the frozen 3 ms / 75 ms / ×50 response recipe held fixed, does natural material variation remain as a broad ERB-time or spectral-tail response?

## Work

- Reused only existing, fixed-gain native/material-median and low/high PCM from the 2026-10-13 sonic-individuality package; no simulation or audio render was run.
- Verified the paths, byte sizes, and SHA-256 values of 78 source PCM files before measurement: 36 native/median pairs plus three existing p50 low/high controls.
- Reused the 2026-10-14 ERB-binned STFT mapping and self-check. Fixed-gain levels stayed separate from unit-sum shape diagnostics.
- The observed median and low/high controls are material bundles: natural stiffness and damping covary. No isolated stiffness/damping attribution was made.

## Result

Native-versus-median full ERB-time, integrated, and ≥500 ms late-tail shape cosines were near 1 across all 36 pairs; fixed-gain RMS and peak deltas were small. The three observed low/high controls showed a small repeated direction in a few lowest FFT-bin cells, but integrated/late profiles remained nearly coincident and position-pattern consistency was not stable enough to establish a broad material signature.

**Decision: NEGATIVE for broad ERB-scale natural-material identity/spectral-tail response under this frozen recipe.** This does not imply no physical material effect; it is consistent with the prior fine modal/phase observations, which this pass did not remeasure. No human listening, audibility, preference, or production-quality claim was made. Production remains unchanged.

## Evidence

[Evidence package](../evidence/2026-10-14-plate-erb-material-contribution/README.md) · [machine-readable analysis](../evidence/2026-10-14-plate-erb-material-contribution/analysis.json)
