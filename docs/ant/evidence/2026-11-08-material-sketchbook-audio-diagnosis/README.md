# ANT Sketchbook audio diagnosis — 2026-11-08

Open `output/comparison.html` in a browser. It is a self-contained Korean report with embedded images and PCM. No server or dependencies are needed to read/listen. `output/waveform-overview.png` and `output/spectrogram-overview.png` are standalone sheets.

## Scope and observations

Source: `oseconds/ant-2026@58da743d94c18e10f3241f98da28a0d23af26211`. A minimal read-only source snapshot is under `source/`; it is not a full repository checkout. The original material and audio equations were not changed. Original CSS import handling was replaced only in the native-module browser harness.

Seed 20261005; world checkpoints 0,10,30,40,60,120,300 seconds. Four samples A/B-AB/B-BA/C, 28 stereo frozen-state probes, 24 kHz, 1.2 seconds, original 100× virtual clock, fixed impulse and pickups. Each checkpoint is a separate new impulse experiment, not continuous world audio.

1. A's maximum undamped natural frequency over the recorded states is 12.511 Hz. Non-silent A output has 99.9975–99.9999996% of Hann-windowed spectral energy below 20 Hz. The current response cannot support normal audible-timbre assessment.
2. B-AB/B-BA have approximately 87.61–87.93% below 20 Hz; the dominant FFT bin is 5.833 Hz. Their highest modes are about 40.8 Hz. Nonzero final samples cause a hard transition to zero at playback termination. At +36 dB the final-sample magnitude is approximately −43 to −45 dBFS for representative B states; a click is possible, not a demonstrated subjective cause.
3. C has modes extending to about 342 Hz, but approximately 86.72–87.30% of observed output spectral energy is below 20 Hz. The dominant bin is 11.667 Hz. Excitation/readout modal weighting remains a separate causal question; it was not isolated here.
4. No nonfinite samples or +36/+54 dB clipping occurred in these 28 cases. Increased gain does not change frequency. This does not rule out every artifact in a user's device or configuration.
5. A 96 kHz finer-integration reference at 30/120/300 seconds gives relative L2 differences of approximately 0.07–0.34% against the 24 kHz output at aligned virtual times. This is a limited numerical refinement check, not a formal convergence proof.
6. Chromium verifies eight original response cases and BufferSource→Gain (+36 dB) transfers with maximum absolute error below 3.73e-9. Seven cases are byte-identical between Node and Chromium under an FNV comparison. C30 differs by at most 6.47e-27 absolute and 1.36e-24 relative L2, so cross-engine byte identity is explicitly not claimed. See `output/browser-validation.json`.

Spectral-energy fractions use a Hann window, pooled stereo, one-sided bins with doubled interior bin energy, and include DC with no mean subtraction. These are signal-energy coordinates, not calibrated physical energy or perceptual loudness. Windowing suppresses boundary discontinuities; inspect final samples and compare the separately labeled fade diagnostic rather than inferring absence of clicks from the interior spectrogram.

The report's 10 ms raised-cosine fade applies only to a playback copy of both clip ends. It is a diagnostic, not a production fix. No user preference or listening-quality verdict was fabricated.

## Evidence and reproduction

Run `python verify.py` to verify the committed manifest, PCM/WAV equality and recorded browser/report checks. The manifest excludes itself; regeneration scripts intentionally rewrite generated files, so reruns should be made in a copy before accepting replacement evidence.


- `output/analysis.json`, `metrics.csv`: numerical findings, original probe statistics, paired differences and refinement.
- `output/*-raw.wav`: original stereo Float32 PCM.
- `output/*-monitor36.wav`: the same signal with common +36 dB gain, without clipping or normalization.
- `output/*-state.json`, `*-graph.json`: full captured state / observed mechanics.
- `output/renders.json`: source authority, seed, checkpoint and SHA256 receipts.
- `output/source-sha256.json`: downloaded source hashes.
- `output/tests-*.txt`: 15 original focused tests passed, no failures.
- `output/report-validation.json`: 28 cards, time/model filtering, actual Web Audio playback and zero-endpoint fade checks.

Requirements for regeneration: Node with ES modules; Python with NumPy/SciPy/Matplotlib; Playwright and Chromium for browser checks.

```sh
node render.mjs
python analyze.py
node browser-check.cjs
python make-report.py
node check-report.cjs
```

The browser harness fulfills local files via Playwright routes; it does not contact the named virtual origins. This environment required expanded process permissions for Chromium because the default sandbox denied sockets. File URL navigation was blocked by browser policy, so report verification also uses route fulfillment.

## Next bounded investigation

Hold graph, impulse and pickup fixed; compare common virtual-clock choices and measure resulting frequency range and decay duration. Do not equate increasing playback gain with moving into the audible band. Then separately test modal excitation/readout weighting and clip-tail handling. No source-parameter correction or upstream write was made in this diagnosis.
