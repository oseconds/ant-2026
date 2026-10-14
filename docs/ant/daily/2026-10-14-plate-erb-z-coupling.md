# 2026-10-14 — Plate ERB response under frozen-world Z coupling

## Question

Do the existing frozen-world one-shots show Z coupling in actual stereo pickup ERB-time and spectral-tail structure beyond the previously measured fine phase/transfer changes?

## Work and evidence

- Reused only the existing seed-07 frozen-world PCM for Plates 38, 37, 36, and 35; no simulation, audio render, new contact, or new world condition was made.
- All 16 condition PCM files matched original manifest paths, sizes, and SHA-256 values. `world-isolated == world-none` and `world-z == world-zn` remained byte-exact for all four Plates.
- Applied the prior 48 kHz, 1024-point symmetric-Hann, 256-hop, 30-band ERB representation with the same stereo linear-power pooling. Added separate unit-sum shape comparisons and fixed-gain stereo output/energy measurements.
- Full ERB-time shape distances had a median 0.002326 (range 0.000040–0.005205); integrated and ≥500 ms late-tail medians were 0.000001995 and 0.000006520. Fixed-gain RMS moved −0.0188 to +0.0049 dB; late energy moved −0.0240 to +0.0300 dB.
- Full and late band-difference profiles were partly consistent across these Plates, but integrated/late shapes stayed close to identical. Z distances overlapped prior natural-material differences and were far below the prior cross-position distances in the same ERB coordinates.
- Final summary correlations use the 29 ERB bands with FFT-bin centers; empty band 3 (98.58–140.11 Hz) remains in the 30-band representation as zero but is excluded from cross-Plate correlation and nonzero shared-sign counts. Updated full/late median correlations are +0.946/+0.930 with shared nonzero signs in 16/29 and 17/29 bands; the MIXED decision is unchanged.

## Decision

**MIXED.** A weak, partly repeated ERB-time pattern remains at the actual stereo pickups, but this set does not support a strong independent broad spectral-tail effect. No human listening or audibility assessment was performed. No production source, Z coefficient, pickup, damping, or contact setting changed.

Detailed metrics, two figures, verification receipts, and reproduction commands are in [`plate-erb-z-coupling`](../evidence/2026-10-14-plate-erb-z-coupling/README.md).
