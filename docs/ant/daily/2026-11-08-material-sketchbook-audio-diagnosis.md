# Material Sketchbook — audio frequency diagnosis (2026-11-08)

The artist reported noise-like or unconvincing sound at the default seed. A read-only diagnosis of sketchbook branch `58da743d94c18e10f3241f98da28a0d23af26211` regenerated A / B-AB / B-BA / C at seven world times (0, 10, 30, 40, 60, 120, 300 s), with 28 original frozen-state probes.

- A's highest undamped natural frequency among observed states is 12.511 Hz; essentially all observed spectral energy is below 20 Hz. B/C output also concentrates approximately 87% below 20 Hz. Increasing monitor gain does not move these frequencies into the ordinary audible range.
- Default +36 dB monitor gain caused no clipping in these cases. B has a nonzero terminal sample, so abruptly ending its 1.2 s buffer can cause a click. This remains a candidate explanation, not a reproduced subjective verdict.
- The comparison distinguishes world checkpoint time from the playback time of a new frozen-state impulse. It does not represent continuous formation sound.
- Original focused tests passed (15/15). Eight Chromium cases checked PCM-to-gain playback; one cross-engine C30 byte difference is retained and quantified rather than called exact parity. The HTML report's playback/filter/fade controls were also exercised.

[Evidence and reproduction](../evidence/2026-11-08-material-sketchbook-audio-diagnosis/README.md) · [Interactive comparison sheet](../evidence/2026-11-08-material-sketchbook-audio-diagnosis/output/comparison.html) · [Waveform sheet](../evidence/2026-11-08-material-sketchbook-audio-diagnosis/output/waveform-overview.png)

This commit preserves the diagnostic artifacts and source snapshot. It makes no production or sketchbook model/audio changes and does not fix the frequency-range issue. Common clock/frequency placement, modal readout and clip-tail handling remain separate proposed follow-ups.
