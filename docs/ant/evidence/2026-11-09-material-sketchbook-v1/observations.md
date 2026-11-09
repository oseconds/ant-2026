# Material Sketchbook v1 — bounded observations

Date: 2026-11-09 (Asia/Seoul). This is a numeric observation record for the fixed protocol in [PROTOCOL.md](PROTOCOL.md), not a selection of a preferred material. The isolated models have no production or audio connection.

## Capture and reproducibility

The capture script is [`scripts/material-sketchbook-v1-observe.js`](../../../../scripts/material-sketchbook-v1-observe.js). Full snapshots are stored once per case in [`data/`](data/); `data/manifest.json` carries checkpoint digests and compact metrics, not duplicate state arrays. The manifest records the Node version and SHA-256 of four source files: the input, both models and the unchanged v0 pure helpers. All 12 cases (60 saved checkpoints) were independently rerun in the same Node runtime; each complete serialized snapshot hash matched exactly. Run `node scripts/material-sketchbook-v1-observe.js` to recheck saved hashes; `--record` is required to overwrite the generated capture.

The capture asserted finite values, 12×12 / 144-node geometry, 264-edge geometry for S, monotone bonds, S energy-accounting residual below `1e-9`, T energy nonincrease within `1e-12` per saved interval, `q ∈ [0,1]`, rates in `[0.2,1]`, and dose of 80 node-seconds at and after tick 2400 for each active input (zero for `none`). T no-input local and mean-matched arrays were exactly equal at every checkpoint for both seeds. The fatigue-stop continuation's displacement and bond arrays exactly matched default through tick 2400.

## S — subtractive material

Every row gives activity-sample `meanBond / exact removed edges / components` at 40 s and 300 s. The no-activity control's mean bond is included as a paired reference. At time zero both samples start identical; the no-activity sample later changes from autonomous fatigue and relaxation.

| Seed / input | Activity at 40 s | Activity at 300 s | Control mean bond at 40 s → 300 s |
| --- | ---: | ---: | ---: |
| 20261005 wander | 0.7902 / 11 / 2 | 0.6759 / 20 / 2 | 0.9784 → 0.8456 |
| 20261005 stationary | 0.9495 / 8 / 3 | 0.8273 / 8 / 3 | 0.9784 → 0.8456 |
| 20261006 wander | 0.8097 / 15 / 7 | 0.6999 / 20 / 8 | 0.9794 → 0.8539 |
| 20261006 stationary | 0.9511 / 8 / 3 | 0.8387 / 8 / 3 | 0.9794 → 0.8539 |

At tick 2400, the seed-20261005 wander continuation exactly shared the default physical state: 11 removed edges, 2 components, mean bond 0.79016. With fatigue disabled from that tick, these counts and mean bond remained fixed through 300 s. Default fatigue continued weakening existing nonzero bonds after activity stopped: it reached 20 removed edges and mean bond 0.67593 by 300 s. Component count stayed 2 in both continuations. This isolates post-input weakening in this seed and pattern; it does not establish that fatigue always fragments the lattice.

The seed and pattern matter materially in this small sample. Both stationary runs had eight removed edges by 20 s and none thereafter; the wandering runs split at different times and reached different component counts. At 300 s, activity-input samples had lower mean bond than their paired no-activity controls in all four comparisons, while the control also weakened from internal fatigue. No common score or aesthetic ranking is implied.

## T — local-time coupled phase field

At each checkpoint the paired samples have the same global mean age to floating-point precision. Local-clock age is spatially distributed; the mean-matched control age is uniform. The table gives phase-field L2 difference and local age spread at 40 s and 300 s.

| Seed / input | Phase L2 at 40 s → 300 s | Local age spread at 40 s → 300 s (s) | Within-pair outcome at 300 s |
| --- | ---: | ---: | --- |
| 20261005 wander | 0.9673 → 7.95e-21 | 27.17 → 53.82 | Fields nearly converged; energies 2.15e-41 / 5.31e-42 |
| 20261005 stationary | 0.3711 → 1.24e-22 | 31.38 → 62.77 | Fields nearly converged; energies 8.41e-44 / 6.93e-44 |
| 20261006 wander | 1.188 → 2.082 | 26.37 → 53.40 | Persistent field difference; energies 0.1261 / 0.1570 |
| 20261006 stationary | 0.4977 → 0.7831 | 31.38 → 62.77 | Persistent field difference; energies 0.1449 / 0.1553 |

The divergent seed-20261006 fields did not converge by 300 s, while seed 20261005 fields approached the low-phase basin in both input patterns. This is a seed-dependent outcome under the declared initial phase field and law. Local timing can shift organization relative to the mean-matched clock, but this capture does not establish which outcome is more desirable or robust.

Without input, local and mean-matched phase, rate, and age remain exactly equal at every saved checkpoint for both seeds. The `D=0` ablation (seed 20261005 wander) retained spatially different clock ages, but its phase L2 was 0.5934 at 20 s and 1.0838 at 40 s, versus 0.2028 and 0.9673 at `D=0.05`; by 120 s the distances were 0.003676 and 0.0000446. With `D=0`, corresponding points in the paired fields later approach the same local reaction basin, which may differ from node to node because there is no spatial coupling. The `D=0.05` fields instead approach their coupled homogeneous low-phase basin. Coupling therefore changes this trajectory, but these two seeds do not support a general claim about whether coupling increases or reduces local-clock divergence.

## Limits

These are deterministic observations of two invented discrete laws on two seeds, two input patterns and the predeclared checkpoints. They do not validate physical materials, ant behavior, production suitability, perception, sound, or general behavior across seeds. Explicit Euler checks cover only these fixed parameters and saved intervals; they are not a convergence proof. The T phase L2 is a within-model paired distance, not a universal similarity or quality score. Fixed positions and unit masses remain fixed; the T organization state is not mass. No browser rendering, audio, new patterns, parameter sweeps, seed search or v0 harness was used here.
