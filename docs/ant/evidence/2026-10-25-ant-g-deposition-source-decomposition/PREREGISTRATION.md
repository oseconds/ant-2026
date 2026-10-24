# Candidate G deposition-source decomposition preregistration

## Frozen question and boundary

For the current-production deposition multiplier, determine whether Candidate G's scale-normalized requested-dose excess over C aligns with the baseline term, the adherence-reinforcement term, or both. This is read-only source accounting on the existing C/F/G natural-run protocol. It does not test a new law, establish independent causal mediation, or recommend a gain change.

The analytic/representation unit remains the temporary research contract from the G fixed-cue pass. Production `src/` and `docs/ant/README.md` remain unchanged. No movement, deposition, recruitment, material, sensor, field, cap, decay, Plate, or audio law will be changed.

## Baseline and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Parent evidence tip: `6c44253f7f1d6bb99653afe791bf257577a94e78` on `codex/ant-316-gaussian-dose-unit-movement-shadow-20261024`.
- C/F/G source configuration, seeds and previous natural summaries are read from the committed movement-shadow evidence package.
- Prior movement `SUMMARY.json` SHA-256: `e624166267e275dd03044f88cfa480e96d7744b0c32844492a1a822ea03c8e8d`.
- Prior movement `SHA256SUMS.json` SHA-256: `adc2095bdbebb45d18732c2d16b3b465a2ed7b14f9965d4e954e1aeec349b2d4`.
- The prior raw archive contains one-second positions/sensor snapshots and event-stream hashes, but no actual per-tick travelled distance or paired E/A inputs at each deposition chunk. Exact decomposition therefore requires an observer-only rerun.

## Source law pinned before outcomes

The checked production `AntController` defines:

```text
baselineMultiplier = 0.5 × (0.75 + 0.25 × E)
reinforcementMultiplier = reinforcementGain × A²
depositionMultiplier = baselineMultiplier + reinforcementMultiplier
amountPerUnitDistance = 4.5
```

Here `E` is the returned `localTrail.strength` sampled once for that tick. `updateIntention()` updates `agent.trailAdherence` from that local trail before the movement multiplier is formed; `A` is that updated value. Actual travelled distance is the post-collision, in-domain displacement passed by `AntController.tick()` to `GasterDeposition.advance()`. The controller passes `4.5 × depositionMultiplier` as the per-distance amount. In default `dab` mode, `GasterDeposition` may accumulate that chunk's dose and emit a dab later; source components will be charged to the movement chunk that accrued them, never to the later dab's current-tick E/A.

Current default state is pinned as `reinforcementGain=5`, `DEPOSITION_BASELINE=0.5`, `DEPOSITION_ADHERENCE_EXPONENT=2`, `amountPerUnitDistance=4.5`, `depositionMode='dab'`. The implementation source and configuration hashes are recorded in the result provenance.

For each positive-travel chunk `d`:

```text
baselineDose      = d × 4.5 × 0.5 × (0.75 + 0.25 × E)
reinforcementDose = d × 4.5 × 5 × A²
totalDose         = baselineDose + reinforcementDose
```

Candidate G's writer applies `S = 3969/361 = 10.994459833795014` to emitted dab amounts. The source ledger also reports `G_scaled = S × sourceDose` and `G_normalized = G_scaled/S` on the same G trajectory. This normalized view is accounting, not a counterfactual simulation.

The `GasterDeposition` dab accumulator is included in the closure receipt: accrued chunk dose must equal requested dose passed to the field plus any pending dab amount still held at the 600-second boundary, after applying the arm's representation scale. Accepted dose and boundary rejection remain separate field-writer outputs.

## Frozen runs and observables

Run C (96×96 production), F (316×316 Gaussian unscaled) and G (the same 316×316 Gaussian with fixed factor `S`) for seeds `20261005`, `20261006`, `20261007`, 600 simulated seconds at 60 Hz, using the exact prior natural initialization, recruitment and current defaults. Same seed guarantees matched initial conditions only; post-divergence trajectory and RNG equality are not required.

Per movement chunk, observe the values above before forwarding the unchanged `GasterDeposition.advance()` call. Aggregate into one-second rows and the existing 30/60/120/300/600-second checkpoints. Retain per-seed and pooled:

- baseline, reinforcement and total requested dose;
- reinforcement share;
- each dose component per actual travelled distance;
- G scaled and G scale-normalized forms;
- chunk count, actual travel and accounting closure;
- E, A and A² distributions; existing far raw/Hill readouts;
- population, activation and the existing cumulative coverage/top-10% occupancy measures.

The existing 40 equal bins over `[0,1]` are reused for E, A and A² distributions. For the descriptive “high A” concentration summary, high adherence is fixed at `A≥0.75` (the upper ten bins of that existing histogram). This is a descriptive cut, not an acceptance threshold or a fitted parameter.

The baseline/reinforcement excess identity is fixed as:

```text
G_normalized.total − C.total
= (G_normalized.baseline − C.baseline)
 + (G_normalized.reinforcement − C.reinforcement)
```

Report signed component amounts and signed shares of the total excess by seed, pooled, and at the registered checkpoints. Preserve the one-second component time series to show when the observed differences appear. No significance tests, causal percentages, or post-hoc threshold will be introduced.

## Manipulation validation and stop rules

- Verify source constants against pinned production source and confirm the C/F/G configs match the parent movement shadow.
- Use passive wrappers only: each original method is called once; the observer reads already-computed E/A and actual `advance()` arguments, performs no new field read, and consumes no RNG.
- Before the full rerun, run a 120-tick observer-on/off parity comparison for each arm; require matching state fingerprints and RNG counts each tick.
- Reproduce the prior movement-shadow initial fingerprints and registered major checkpoint values exactly for all nine runs. If they do not match, diagnose before interpreting dose attribution.
- Verify chunk-level `baselineDose + reinforcementDose` against the exact effective rate passed to `GasterDeposition.advance()`, and verify end-of-run accrued-dose closure against emitted requested writer dose plus pending dab carry. Record exact residuals and the JavaScript floating-point accounting bound.
- Generate the scientific decomposition twice and require deterministic summary and one-second accounting artifacts.

If source law, run config, initial state, observer parity, checkpoint parity, or accounting closure fails, classify the decomposition as `INCONCLUSIVE`; do not repair it by changing the production source, arms, scale, cap, or behavior.

## Decision rules

Use only:

- `REINFORCEMENT-DOMINATED EXCESS`
- `BASELINE-DOMINATED EXCESS`
- `MIXED SOURCE AMPLIFICATION`
- `NO MATERIAL EXCESS AFTER ACCOUNTING`
- `INCONCLUSIVE`

Show amounts and per-seed/time distributions before the classification. “Dominated” is a descriptive source-accounting comparison, not a causal claim about occupancy. Temporal alignment with occupancy, adherence or far response does not establish independent mediation. No gain, exponent, scale, representation, movement law or candidate will be changed or tested in this pass.
