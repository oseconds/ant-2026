# Validation

## Authority and frozen inputs

- Production authority recorded and freshly checked: origin/main 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785.
- Research parent: 9b5ef8d6247fc3c9d6237d9d0c9082d8c3546a49.
- Branch: codex/ant-material-feedback-ad-composition-20261030.
- The N/A/D frozen arms passed their source, input, common initial-state, and parent-parity receipts; their pins are copied to data/ad/PROVENANCE.json without altering their evidence.
- AD initial-state SHA-256 matches the frozen N/A/D state: f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd.
- The saved source hashes cover the production consumers, material and field sources, canonical ANT README, and research helpers. The source hash set and authority receipts are in data/ad/PROVENANCE.json.

## Run and consumer checks

- Exactly one new AD world was executed: seed 20261005, arm G, 60 Hz, 600 s, 36,000 ticks, Audio Off.
- AD position snapshots and per-second FOOT_CONTACT buckets match frozen N through 84 s, including the first Plate event at 84.01666666666823 s.
- All 40 late opportunity ticks match the frozen N/A/D anchor ticks.
- Both formulas passed the embedded self-test: L=0 identity, monotonic bounds, expected asymptotes, and four-way context naming.
- Observer RNG calls: 0. Production behavior change: false. Native swept collision guard preserved.
- The same-flow classification remains native. A passes the same requested heading into the native and conditioned turn operation. D's same-state candidate final-target shadow has zero mismatches across all 645,687 observations.
- Run invariants: 0 finite violations, 0 speed-cap violations, 0 turn-cap violations, 0 overlap violations, 0 population-ceiling violations.
- The corrected first joint-event location uses the tick-entry D sample at the same tick and ant. CORRECTIONS.json records the original and corrected auxiliary hashes and states that the simulation was not rerun.

## Motion and analysis checks

- Consecutive same-ant one-second displacement audit used saved raw positions. Exact zero counts: N 0/9,956; A 0/9,785; D 0/10,017; AD 0/9,986. The minimum observed AD interval is 1.5780811046956541e-10 world units. No threshold was used to define a stall.
- Measurement analysis was run in analysis-only mode twice; the complete ANALYSIS.json value was identical on both runs. The final output SHA-256 is recorded in SHA256SUMS.txt.
- Script syntax check passed with node --check scripts/ant-material-feedback-ad-composition.js.
- Embedded research self-test passed with node scripts/ant-material-feedback-ad-composition.js --self-test.
- Existing A and D probe self-tests passed:
  - node scripts/ant-material-turning-probe.js --self-test
  - node scripts/ant-material-flow-velocity-probes.js --self-test
- git diff --check passed.

## Scope integrity

- Production src/, static/, canonical docs/ant/README.md, and pre-existing evidence were not changed.
- Scoped .gitattributes rules preserve LF text and binary compressed packets so byte hashes remain stable across Windows checkouts; the rule file is included in SHA256SUMS.txt.
- No additional seed, simulation, candidate law, coefficient, world feedback, audio path, allocation rule, UPDATE, BODY, or production behavior was added.
- No atlas was generated; displayed report measurements come directly from ANALYSIS.json, and spatial/tick-level data remain in the package for further inspection.

## Limits

The motion audit uses the saved one-second positions; it cannot rule out sub-second pauses. One seed cannot establish cross-seed robustness. Late map and material differences are endogenous world outcomes and are not independent replications. A and D are supported as separate direct consumer responsibilities in this measured combination; biological validity, synergy, artistic desirability, and production suitability remain untested.
