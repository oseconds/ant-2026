# Candidate G deposition-source decomposition

Read-only follow-up to the 316 Gaussian dose-unit movement shadow. The prior raw archive did not retain the paired movement-chunk travel, local trail strength `E`, and updated adherence `A` needed to split requested dose, so an observer-only replay repeated the frozen C/F/G protocol for seeds `20261005`, `20261006`, and `20261007` through 600 s.

The current source was verified as `baseline = 0.5 × (0.75 + 0.25E)` plus `reinforcement = 5 × A²`, with `4.5` amount per distance. G's fixed `3969/361` scale was normalized only in the accounting view. The three runs reproduced the parent movement summaries, raw archives, and checkpoint maps exactly; observer-on/off parity showed no state or RNG changes, and dose closure had no saturation loss.

Across the three seeds, normalized G minus C accrued dose was `+8,552.209`: baseline `+6.459` and reinforcement `+8,545.750` (`99.924%` signed share). Reinforcement excess was positive in every seed and already exceeded baseline at 30 s. Baseline delta changed sign by seed. At 600 s, G also had higher adherence and `A²`; its high-adherence range (`A ≥ 0.75`) held `42.75–46.39%` of travel and `64.72–68.13%` of reinforcement dose, compared with C's `11.70–13.25%` and `28.55–30.36%`. The earlier occupancy concentration pattern co-occurred from 120 s onward in each seed, with one early seed exception.

Decision: **REINFORCEMENT-DOMINATED EXCESS**, as source accounting on divergent natural trajectories. This does not show that the production law is wrong or that reinforcement alone caused occupancy concentration. No gain, exponent, representation, or movement law changed. The smallest next research hypothesis is a preregistered test of the G representation-unit interaction with existing adherence feedback; define the unit contract before any candidate and do not fit a gain to this result.

See the [evidence package](../evidence/2026-10-25-ant-g-deposition-source-decomposition/README.md) for complete per-seed, checkpoint, and validation data.
