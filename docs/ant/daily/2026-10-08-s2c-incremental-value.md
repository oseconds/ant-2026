# 2026-10-08 — S2c incremental predictive value

## Question and starting evidence

«Do simple temporal social-graph observables add useful predictive information beyond raw movement / population / spatial-density observables already present in the simulation?»

Started on the existing remote `ant-s2c-incremental-value` branch after fetching repository state. Base `ab638266c1b3e606e2eb55ca9b044694de90e858` includes the merged S2b pass. Read repository guidance, ANT hub, S0/S1 archive evidence, S2a synchrony comparator and S2b identity comparator/chronology before implementation. The mandatory caveman skill was available and invoked. Source archives and production observers remain unchanged.

S2a exposed recruitment-origin, density/collision and circular-seam confounds. S2b preserved the spatial movie but its temporal changes were strongly associated with identity remap/repair boundaries. S2c therefore asks whether the existing simple graph summaries add predictive value at all, rather than escalating to another comparator or spectral analysis.

## Method and validation

Reused the three natural 600 s lossless archives only, with no ANT behavior replay/recapture and no null trajectories in training or evaluation. The exact existing k=2 / 1 s `COMPONENT_MERGE` stream supplies a binary target: any merge in (t,t+1 s]. Saved 1 Hz rows at t=1..599 supply 599 eligible samples per seed.

Five baseline predictors describe the current frame: population, instantaneous proximity edge count, instantaneous largest-component ratio, mean neighbors within the existing 0.085 sense radius and mean recorded speed. Three added predictors describe retained graph support: rolling edge count, mean weighted degree and rolling largest-component ratio. Primary predictors use 1 s; the inexpensive 0.25 s view predicts the same single future 1 s target.

Used one deterministic standardized logistic family with fixed slope L2 penalty, training-only scaling and leave-one-seed-out evaluation. Each fold trains on two whole seeds and evaluates on the third. One deterministic training-only social-vector shift supplies a sanity control, preserving baseline/targets and leaving held-out data untouched. No feature or parameter search is performed.

The leakage audit excludes future events, completed lifetimes, retrospective connectors, stability/persistence endpoints and future-finalization fields. Focused fixtures verify target endpoints, causal feature extraction, deterministic folds/control, train-only scaling and hand-calculated metrics. Complete natural observer replay matches committed raw events and saved snapshots; independent extraction/fitting/evaluation reproduces the full report byte-for-byte.

Focused tests pass 5/5; full tests pass 278/278; build and codec self-check pass. Fixed-scale performance, incremental and calibration plots were generated and inspected. Source/Git hashes, models, predictions, validation logs and plot scales are retained in the evidence package. Tooling commit: `90567df7096771940ead2a6a0dc05675f416da65`. Evidence and chronology are committed separately afterward.

## Result

Future-merge prevalence is 181/599, 190/599 and 184/599: about 30–32%, with both classes available in every fold. Low prevalence does not block the comparison. The three seeds remain the research replicates; adjacent rows are dependent.

For primary 1 s predictors, added-minus-baseline ROC AUC is +0.002855, −0.025544 and −0.008080. Average-precision changes are +0.012513, −0.027010 and −0.006801. Brier changes are −0.000134, +0.003897 and +0.000660, where lower is better. All three measures slightly improve seed 05 and worsen seeds 06/07. The 0.25 s view remains inconsistent. Small apparent gains also occur under the training alignment control.

## Limitations and next decision

This is one simple derived target, a compact chosen baseline, one fixed model setting and three natural seeds. Shared folds and adjacent samples do not justify independent-frame confidence intervals. The control is one sanity check, not a null distribution. These results cannot exclude incremental information under all possible movement baselines or models.

**Decision: spectral SKIP at the current research gate.** The selected temporal predictors show no consistent held-out added-value signal. Keep the graph as a derived observation layer; no spectral, role, adaptive-memory, feedback or graph-to-Plate escalation follows. This is a bounded research decision, not a new numeric acceptance threshold or proof against social organization.

A temporal graph can compress movement history without isolating social preference or memory. Inertia, personality, hesitation, pheromone history, occupancy and path dependence remain non-social continuity mechanisms. Biological/social interpretation stays separate from artistic interpretation; no artistic mapping is added.

Stop after separate tooling/evidence commits, push `ant-s2c-incremental-value` and verify remote HEAD. No main merge or PR is requested. Any next research pass needs separate authorization.

## Evidence

[Definitions, leakage audit, prevalence, folds, control, fixed-scale plots, source hashes, reproduction and limitations](../evidence/2026-10-08-s2c-incremental-value/README.md).
