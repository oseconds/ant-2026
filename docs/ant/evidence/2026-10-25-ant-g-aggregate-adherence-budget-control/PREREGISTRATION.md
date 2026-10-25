# Preregistration — exogenous G-budget replay control

## Frozen question

Under the same refined-grid G representation and H's uniform-by-travel reinforcement allocation, does removing dependence of the aggregate reinforcement budget on the current colony's adherence state reduce cumulative occupancy concentration?

This is a research-only causal control. It does not propose a production law or tune a gain.

## Baseline and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- H evidence tip: `d7326467016478670afc10d0407c9d641cc6b1c2`.
- New branch: `codex/ant-g-aggregate-adherence-budget-control-20261025`, created from the H evidence tip.
- G movement-shadow evidence commit: `336e8dc6e680ff5de3c256e50596581797ce0907`.
- G source-decomposition result commit: `a4bed839b2775e774e075324c176213ccbae6dae`.
- G-R0 result commit: `f1b03e8666f3b920524c458855ff59153156c710`.
- H result commit: `5c415b34184d88ffbbbb042450288e254a495508`; wording correction tip `d7326467016478670afc10d0407c9d641cc6b1c2`.

Production source and `docs/ant/README.md` remain unchanged. The G/H/I simulation uses the existing 316×316 Gaussian field, `R=0.0045`, `σ=0.00225`, dose scale `3969/361`, ordinary bilinear reader, and current movement/material laws.

## Arms

- **G:** current per-ant `5 × A_i²` reinforcement.
- **H:** uniform-by-travel allocation of each current H tick's intact-law budget; the validated H archive is the primary comparison reference.
- **I:** uniform-by-travel allocation of the same-seed, frozen per-tick G reinforcement request series `B_G_ref(t)`.

I uses the H equations for travel allocation, but not the H budget source:

```text
D_I(t) = Σ_i d_i
U_I(t) = B_G_ref(t) / (4.5 × D_I(t))  if B_G_ref(t) > 0 and D_I(t) > 0
reinforcementMultiplier_i = U_I(t) for every moving ant
```

If `B_G_ref(t)=0`, `U_I(t)=0`. If `B_G_ref(t)>0` and `D_I(t)=0`, stop with `INCONCLUSIVE — REFERENCE BUDGET NOT ALLOCATABLE`; do not carry, inject, or otherwise alter the frozen budget. The baseline term remains ant-local and unchanged: `0.5 × (0.75 + 0.25 × E_i)`.

The G budget series is frozen before any I outcome run. It contains exactly 36,000 binary64 little-endian values per seed, extracted from the already validated H-pass replay of G. That replay reproduced the parent G result, raw timeline, and checkpoint maps exactly. The freeze step will independently rerun G, recheck those parent parities, compare every extracted per-tick budget with the H-pass G ledger, and record cumulative budgets at each registered checkpoint. The frozen binary files and hashes will be committed before I is run.

The frozen values are the unscaled reinforcement requests before the G area factor. I retains the same field dose scale. Report requested/accrued dose separately from field-accepted, boundary-rejected, and pending dab amounts.

## Runs and measurements

Seeds `20261005`, `20261006`, and `20261007`; 600 simulated seconds at 60 Hz; checkpoints at 30, 60, 120, 300, and 600 seconds; natural recruitment; audio off; no warm-up, route injection, forced birth, or manual placement. Same-seed pairing means identical initialization only.

Primary comparison: **H ↔ I**, using the corrected 64×64, 60 Hz occupancy observer from the validated H pass. Report cumulative coverage, cumulative top-10% occupancy share, recent-30-second coverage, and recent normalized entropy independently by seed/checkpoint. Do not combine them into a score.

Also report movement/population/invariants, E/A/A² and far-Hill summaries, baseline/reinforcement/total source requests, actual scaled writer requests, field-accepted dose, boundary rejection, pending dab carry, max field node/cap/saturation, and `U_I` distribution. C and G are contextual references; the already validated H artifact is used as the H comparison. No post-hoc thresholds are allowed.

## Manipulation validity and stop rules

Before interpretation, verify exact G parent replay and reference-series parity; exact 36,000-entry series and manifest hashes; identical same-seed initial fingerprints; unchanged G representation, scale, baseline, movement and other world config; I budget values read only from the frozen series; uniform `U_I` for movers; per-tick request closure against `B_G_ref(t)` within a derived floating-point bound; observer on/off parity with zero added RNG calls; corrected 60 Hz occupancy; deterministic I replay; and field/source accounting closure.

Any positive reference budget with zero I travel invalidates the manipulation. Do not compensate. Any source/config, observer, initialization, budget, or reproducibility mismatch is `INCONCLUSIVE`.

## Decision and claim boundary

- **GLOBAL A-FEEDBACK CONTRIBUTION SUPPORTED:** I consistently reduces the G/H concentration pattern without gross movement collapse.
- **A-FEEDBACK NOT REQUIRED:** I remains comparably concentrated under the frozen G-like schedule.
- **MIXED:** seed or occupancy measures materially disagree.
- **INCONCLUSIVE:** a validity gate fails.

I tests whether current-state aggregate adherence feedback is required under one frozen intact-G schedule. It does not establish that G's schedule or quantity is optimal, that total pheromone alone causes concentration, or that exogenous reinforcement is an appropriate natural or production mechanism.

Stop after H↔I. No gain, exponent, dose, field, reader, sensor, recruitment, material, or production change is permitted in this pass.
