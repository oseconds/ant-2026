# Material feedback: exposed surface vs accumulated depth

## Question and decision

Test whether the previously registered A angular-turn and D same-flow headway responsibilities need tick-entry accumulated layer count `L`, or whether current exposed-material presence `S` is sufficient for their direct effects. This is a conditioning-source falsification, not a new feedback discovery or production-adoption pass.

Final label: `SURFACE SUFFICIENT`, `DEPTH-SENSITIVE`, `MIXED`, or `INCONCLUSIVE`. No numeric success cutoff will be introduced. The primary decision will use exact paired same-state consumer responses and observed natural depth leverage; late world divergence is descriptive.

## Authority and frozen references

- Production authority: `origin/main = 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-material-feedback-ad-composition-20261030@10b1cbd877f4130924be83daa37fe8c40e9b230c`.
- New branch: `codex/ant-material-feedback-surface-vs-depth-20261030`.
- Reuse current-G/H0 N and AD-L evidence for seed `20261005`, 60 Hz, 600 model seconds, Audio Off, production slowdown Off, residence Off. Validate package hashes, common initial-state SHA, frozen pins, and pre-material N parity before interpreting.
- Run one new natural treatment only: AD-S. No AD-L replay is planned. Existing AD-L contains A and D final-target response summaries by exact `L`; AD-S will additionally calculate both `L` and `S` counterfactual outputs on each identical observed consumer state, providing the missing same-flow denominator and a paired comparison without a second treatment trajectory.

## Registered laws

The existing AD-L reference is unchanged:

```text
qA(L) = 1 - .50 * (1 - exp(-L/4))
turn cap = 4.5 rad/s * qA(L)

hD(L) = 1 + .50 * (1 - exp(-L/4))
same-flow headway = .4 s * hD(L)
```

The sole new treatment changes the conditioning source, not coefficients:

```text
S = 0 when tick-entry topLayerByCell at the ant's nearest 96x96 cell is -1
S = 1 otherwise
qA_surface(S) = S == 0 ? 1 : qA(1)
hD_surface(S) = S == 0 ? 1 : hD(1)
```

`S` is derived from the existing `topLayerByCell`; no latent state or new material property is added. The 96x96 nearest-cell mapping uses the same rounding convention as the existing AD observer. L bins are fixed before the run: `0`, `1`, `2-4`, and `>=5`; exact-L counts are also preserved.

## Primary direct measurements

On each AD-S tick, snapshot `L` and `S` before any movement/contact/material update. Apply S to the actual A and D consumers. At every same call, calculate native, L-conditioned, and S-conditioned outputs from the same pre-consumer agent/pair state.

- A: turn-call and material-exposed counts; requested heading; native/L/S prospective headings and angular rates; native/L/S cap binding; changed-call counts; angular suppression and L-vs-S differences, stratified by exact L and registered bins.
- D: all sense/final-target calls; finite native same-flow opportunities; L/S headway expansion; native/L/S candidate following caps and final target binding; changed-target counts and target reductions; same-flow speed, personal-spacing floor, neighbor count, and native/candidate headway context, stratified by exact L and registered bins.
- L=0 must match native exactly. At L=1, L and S candidates must match exactly for both A and D at every applicable consumer call. Any mismatch fails the measurement run.
- Natural leverage is reported as actual A turn calls and D finite same-flow opportunities/changed targets across L=1, L>1, and the fixed bins. No deeper world or coefficient increase will be engineered to rescue low leverage.

## Secondary world readout

Reuse the current-G runner for one 600 s AD-S world. Preserve movement/travel, active-ant time, blocked/cap/overlap/population invariants, FOOT_CONTACT, pheromone, SurfaceField, E/F and material checkpoint summaries, recruitment/retirement, Plate timing and immutable birth-mask receipts. Evaluate the existing read-only max-D diagnostic at the 40 parent late anchors, if parity-compatible. Compare with N and AD-L descriptively; do not rank worlds by map distance or treat endogenous trajectory differences as independent trials.

## Validation and stop

Before interpreting: exact production source hashes and frozen input hashes; common initial state; AD-S position/contact parity with frozen N through 84 s and first Plate timing; exact S/L mapping; L=0 identity; L=1 A/D exact conformance; S actual output matches its paired shadow; native same-flow classification unchanged; no observer RNG use; unchanged swept guard; finite/cap/overlap/population invariants; deterministic measurement rerun; measurement/atlas consistency; SHA-256 manifest; `git diff --check`.

Stop after one AD-S treatment and its analysis. No residence, production slowdown, coefficient/amplitude sweep, extra seed, new latent material state, morphology optimization, production change, audio, UPDATE, allocation, or BODY. Do not claim a literal physical binary surface law or biological perception of layer count.
