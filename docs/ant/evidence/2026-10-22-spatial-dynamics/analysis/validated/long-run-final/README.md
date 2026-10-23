# Long-run production vs dtFeedback

Inputs: the explicit 7,200 s `production-20261005/result.json` and `dtFeedback-20261005/result.json`. One seed per condition; these paired logs are descriptive case histories, not a multi-seed effect estimate. The receipt preserves production field and north recruitment in both cases; only movement differs. Full input/source/tool SHA-256 receipts are in each run's `summary.json`.

Each run includes the full 1 Hz spatial/pheromone series (`temporal.csv`), 10 Hz trajectory rows and fixed 60 s windows (`windows-60s.csv`). `summary.json` includes preregistered early/late windows plus 10–20, 20–30, 30–60 and 60–120 min windows, autocorrelation, every checkpoint's material metrics and checkpoint-to-checkpoint union/top identity changes. Candidate-path curvature and metadata are recorded separately from frozen born-Plate geometry. The comparison figure [`long-run-fixed-view.svg`](long-run-fixed-view.svg) uses the same normalized [0,1]² viewport for both conditions, with model +y drawn upward; paths are thinned to one sample every three seconds for readability.

## Material history

Union coverage is the fraction of 9,216 cells touched by at least one frozen Plate mask. “New cells” and “top changed” compare the named checkpoint with the prior recorded checkpoint. They are interval deltas from immutable snapshot masks and top-layer identity arrays, not the runner's per-second `unionAreaChangeCells` field.

| Checkpoint | Production Plates | Production union | New cells | Top changed | dtFeedback Plates | dtFeedback union | New cells | Top changed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 s | 8 | 40.43% | 3,495 | 3,679 | 3 | 15.60% | 1,438 | 1,438 |
| 600 s | 29 | 70.80% | 2,799 | 6,234 | 10 | 43.54% | 2,575 | 3,428 |
| 1,200 s | 69 | 74.49% | 340 | 6,399 | 35 | 73.88% | 2,796 | 5,686 |
| 1,800 s | 110 | 75.94% | 134 | 6,375 | 61 | 84.47% | 976 | 4,528 |
| 3,600 s | 237 | 77.34% | 129 | 6,758 | 122 | 96.90% | 1,145 | 7,761 |
| 7,200 s | 256 | 77.34% | 0 | 4,887 | 247 | 99.20% | 212 | 8,612 |

The movement candidate had slower material accumulation early in this seed, but it did not avoid late spatial saturation: its Plate union covered 96.90% by 3,600 s and 99.20% by 7,200 s, while production remained at 77.34%. Production reached the 256-Plate ceiling; `maxPlatesReached` is true at the final snapshot. Immutable Plate birth metadata places its last/cap-filling birth at **3,814,783.333 ms (3,814.783 s, about 63 min 35 s)**. At 3,600 s it had 237 Plates; at 7,200 s it had 256. Its union area was already 7,128 cells at 3,600 s, so the remaining 19 births did not add union cells at the final checkpoint. dtFeedback ended with 247 Plates and `maxPlatesReached: false`; its latest immutable birth was at 7,197 s, within three seconds of run end. It remained below full coverage by 74 cells but continued to add union cells after 3,600 s.

The top changed counts show substantial checkpoint-to-checkpoint turnover even when union coverage barely grows. They count cells whose exposed top Plate identity differs between snapshots; they are not independent events or a material trajectory. At 7,200 s both worlds have 32 nodules, so this comparison does not distinguish nodule counts.

## Long-window colony and field state

| Condition | Window | Mean ants | Gyration radius | Nest-near fraction | Polarization | Mean signed momentum | Absolute momentum | Pheromone mass |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Production | 10–20 min | 20.33 | 0.312 | 0.112 | 0.608 | −0.001 | 0.310 | 207.23 |
| Production | 20–30 min | 20.38 | 0.307 | 0.109 | 0.635 | −0.005 | 0.316 | 209.35 |
| Production | 30–60 min | 20.43 | 0.307 | 0.111 | 0.636 | 0.000 | 0.306 | 208.15 |
| Production | 60–120 min | 20.49 | 0.309 | 0.108 | 0.609 | 0.021 | 0.321 | 205.89 |
| dtFeedback | 10–20 min | 20.83 | 0.313 | 0.050 | 0.239 | 0.017 | 0.635 | 270.45 |
| dtFeedback | 20–30 min | 21.09 | 0.301 | 0.046 | 0.217 | −0.010 | 0.655 | 262.71 |
| dtFeedback | 30–60 min | 21.03 | 0.323 | 0.057 | 0.237 | −0.039 | 0.600 | 265.81 |
| dtFeedback | 60–120 min | 20.69 | 0.322 | 0.049 | 0.241 | −0.022 | 0.625 | 249.37 |

These windows show continued population-level and field-state differences in this particular run, with each long window compressing within-window changes. ACFs remain descriptive and nonstationary; they are not tests of a persistent mode. The dtFeedback run's 60 s signed-momentum windows were positive 37.5% and negative 62.5%; this aggregate sign does not establish coordinated ant turns.

## Frozen Plate and candidate geometry

At 7,200 s, mean per-Plate principal curvature was 11.17 / 2.91 rad per normalized unit for production at fixed 0.03 / 0.10 spacing. dtFeedback was 13.36 / 5.33. The singular mutable candidate path at that checkpoint was 0.946 normalized units long for production and 0.993 for dtFeedback; its curvature was 13.91 / 2.26 and 14.41 / 5.69, respectively. Candidate qualification was true and birth-ready false for both. These flags remain separate from immutable birth geometry and should not be read as accepted Plate births.

These are single-seed descriptive results. They identify a saturated append-only material envelope and differing temporal histories in these cases; they do not establish a universal movement effect, preferred morphology, better visual form, or candidate adoption.
