# Fixed local-X audio atlas

All thirty panels use the existing ANT fixed frontend: separate L/R waveform at ±1; 48 kHz, FFT 1024 symmetric Hann, hop 256, 0–8 kHz, -100…0 dBFS, grayscale, gamma 1. There is no per-image normalization. Each panel is an exact 10 s cut from a continuous 300 s model-time-locked render, at fixed post-bridge gain 0.7. Black silence and small waveforms are valid fixed-scale results. Open an image for its native 1200×1000 pixels.

Primary [absolute linear-power ERB](audio-analysis/visual/erb-absolute-power.svg) uses one shared vertical scale across all streams/windows. Secondary [unit-sum shape ERB](audio-analysis/visual/erb-unit-shape.svg) discards overall power. These are descriptive STFT-band summaries, not listening verdicts. [Arrays and frame support](audio-analysis/analysis.json), [visual receipts](audio-analysis/visual/plot-manifest.json), [interpretation](REPORT.md).

## Seed 20261005

| Model window | CONTROL | REPLACEMENT |
|---|---|---|
| 50–60 s | ![CONTROL 50–60](audio-analysis/visual/seed-20261005-control-50-60s-fixed.png) | ![REPLACEMENT 50–60](audio-analysis/visual/seed-20261005-replacement-50-60s-fixed.png) |
| 110–120 s | ![CONTROL 110–120](audio-analysis/visual/seed-20261005-control-110-120s-fixed.png) | ![REPLACEMENT 110–120](audio-analysis/visual/seed-20261005-replacement-110-120s-fixed.png) |
| 170–180 s | ![CONTROL 170–180](audio-analysis/visual/seed-20261005-control-170-180s-fixed.png) | ![REPLACEMENT 170–180](audio-analysis/visual/seed-20261005-replacement-170-180s-fixed.png) |
| 230–240 s | ![CONTROL 230–240](audio-analysis/visual/seed-20261005-control-230-240s-fixed.png) | ![REPLACEMENT 230–240](audio-analysis/visual/seed-20261005-replacement-230-240s-fixed.png) |
| 290–300 s | ![CONTROL 290–300](audio-analysis/visual/seed-20261005-control-290-300s-fixed.png) | ![REPLACEMENT 290–300](audio-analysis/visual/seed-20261005-replacement-290-300s-fixed.png) |

## Seed 20261006

| Model window | CONTROL | REPLACEMENT |
|---|---|---|
| 50–60 s | ![CONTROL 50–60](audio-analysis/visual/seed-20261006-control-50-60s-fixed.png) | ![REPLACEMENT 50–60](audio-analysis/visual/seed-20261006-replacement-50-60s-fixed.png) |
| 110–120 s | ![CONTROL 110–120](audio-analysis/visual/seed-20261006-control-110-120s-fixed.png) | ![REPLACEMENT 110–120](audio-analysis/visual/seed-20261006-replacement-110-120s-fixed.png) |
| 170–180 s | ![CONTROL 170–180](audio-analysis/visual/seed-20261006-control-170-180s-fixed.png) | ![REPLACEMENT 170–180](audio-analysis/visual/seed-20261006-replacement-170-180s-fixed.png) |
| 230–240 s | ![CONTROL 230–240](audio-analysis/visual/seed-20261006-control-230-240s-fixed.png) | ![REPLACEMENT 230–240](audio-analysis/visual/seed-20261006-replacement-230-240s-fixed.png) |
| 290–300 s | ![CONTROL 290–300](audio-analysis/visual/seed-20261006-control-290-300s-fixed.png) | ![REPLACEMENT 290–300](audio-analysis/visual/seed-20261006-replacement-290-300s-fixed.png) |

## Seed 20261007

| Model window | CONTROL | REPLACEMENT |
|---|---|---|
| 50–60 s | ![CONTROL 50–60](audio-analysis/visual/seed-20261007-control-50-60s-fixed.png) | ![REPLACEMENT 50–60](audio-analysis/visual/seed-20261007-replacement-50-60s-fixed.png) |
| 110–120 s | ![CONTROL 110–120](audio-analysis/visual/seed-20261007-control-110-120s-fixed.png) | ![REPLACEMENT 110–120](audio-analysis/visual/seed-20261007-replacement-110-120s-fixed.png) |
| 170–180 s | ![CONTROL 170–180](audio-analysis/visual/seed-20261007-control-170-180s-fixed.png) | ![REPLACEMENT 170–180](audio-analysis/visual/seed-20261007-replacement-170-180s-fixed.png) |
| 230–240 s | ![CONTROL 230–240](audio-analysis/visual/seed-20261007-control-230-240s-fixed.png) | ![REPLACEMENT 230–240](audio-analysis/visual/seed-20261007-replacement-230-240s-fixed.png) |
| 290–300 s | ![CONTROL 290–300](audio-analysis/visual/seed-20261007-control-290-300s-fixed.png) | ![REPLACEMENT 290–300](audio-analysis/visual/seed-20261007-replacement-290-300s-fixed.png) |
