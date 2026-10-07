# Candidate D shared absolute gain — 2026-10-08

**Question:** What absolute listening/readability level results when Candidate D's unchanged P1, substrate and sum stems receive the same fixed post-gain?

**Setup:** Reused Candidate D `.015`, seed `20261005`, frozen P1 descriptor/input, all 63 accepted P1 strikes and 44 matched parent groups. Compared +18 dB (`×7.943282347242816`) and +20 dB (`×10`) equally across all three stems over the first 10 s after P1 birth. No independent normalization, mastering, production DSP or simulation changes.

**Result:** All six stereo float WAVs and fixed-scale plots were generated. Both gains preserved the source substrate/P1 RMS relationship to within `0.000000002 dB`; clipping and non-finite counts were zero. Browser playback loading/start checks passed for all six tracks. This pass records absolute levels only and adds no acceptance threshold or calibration decision.

Measurements, hashes, event-aligned RMS, plots, WAVs and reproduction command: [Candidate D absolute-level evidence](../evidence/2026-10-08-candidate-d-absolute-level/README.md).

**State:** Stopped after the requested +18/+20 dB comparison. No commit, merge or push.

## Listening follow-up / later integration

After the fixed-gain files were heard at a practical absolute level, Candidate D `.015` was subjectively too dominant. The more important issue was timbral: the substrate read as too metallic and resonant, with a decay that was too long for its intended material role.

Current artistic/material direction:

```text
metallic / resonant substrate
→ duller
→ sand-like / granular / noisy
→ shorter ringing
```

This is a listening/artistic interpretation, not a biological finding or a new numeric acceptance threshold. The B/C/D measurements remain valid as relative-level calibration evidence, but no ratio is adopted as final until the timbre pass is evaluated.

The calibration tooling and evidence were later committed as:

```text
9bd033421c906a876b21f2646624124167b0aa86  Add base substrate calibration tooling
5a407ed4f5789ff9409cc34a98703395608e66a3  Record base substrate calibration evidence
```

and merged to `main` via PR #1 at `bc80411381b3a9fa8d9ffc184a4a893544529d2a`. The optional Base Substrate remains default **Off** after integration.
