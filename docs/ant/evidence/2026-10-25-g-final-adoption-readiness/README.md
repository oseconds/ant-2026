# Candidate G final adoption-readiness review — 2026-10-25

## Decision

**G PRODUCTION CANDIDATE READY FOR ADOPTION DECISION.** This clears the candidate-review gates; it does not adopt or merge G. Production authority remains `origin/main` until the user makes that separate decision.

## Authority and scope

- Fresh production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production-shaped G source: `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`.
- Near-stop fixture correction: `bf804200fa1bc8d036a194f5f2f759b9d6a58fcf`.
- Research decision input: `c45e1845bd86a5a6f1082b5c67ef6f521cd860c1`.
- Reviewed branch: `codex/ant-g-near-stop-fixture-diagnostic-20261025`.

This pass compared source, frozen evidence, and prior validation receipts. It ran no simulation, movement test, or performance experiment. `src/` and canonical `docs/ant/README.md` were not changed by this review.

## Implementation and contract review

The production-candidate diff from fresh main changes the pheromone field representation, adds explicit analysis values, and relabels the diagnostic display. The controller's movement/sensing formulas, `GasterDeposition`, `ColonyActivation`, `TrailPlateBirth`, renderer mapping, recruitment, material laws, and audio are unchanged.

Candidate G remains:

- `PheromoneField` 316×316 with Float32 nodal storage;
- Gaussian deposit support `R=0.0045`, `σ=0.00225`, 15 s half-life, cap 8, and ordinary bilinear reads;
- internal coefficient conversion `S=3969/361=10.994459833795014` for both point and segment writes;
- public point/segment inputs and returns in authored source-dose units. Returns report accepted in-domain requests, not cap-surviving stored increments.

The snapshot distinguishes native `nodeSum` from the edge-weighted bilinear `reconstructedIntegral`. Compatibility names `totalMass` and `analysis.pheromoneMass` remain native node-sum aliases and are labeled as such in source/tests. The ANT UI displays “pheromone reference integral.” This is the declared reference-area signal convention, not calibrated chemical mass. Truncated boundary kernels and cap loss remain exceptions to the interior integral relation.

Consumer checks found no hidden 96×96 pheromone assumption or per-consumer `/S` normalization. `TrailPlateBirth` retains its separate 96×96 material-analysis grid and samples the supplied field dimensions; its raw-array bilinear path matches `field.sample()` at fixed probes. Activation and TrailPlate thresholds remain unchanged. The renderer accepts snapshot dimensions and retains its fixed absolute value-to-alpha mapping. The canonical README still records 96×96 as production; it does not claim G has been adopted.

## Fixed-cue and natural conformance

The production-shaped candidate receipt records exact parity for all 24 frozen G raster hashes, 99,792 local raw reads, and 138,600 wide raw reads. No mismatches occurred. The unchanged downstream sensor path therefore reproduces the saved fixed-cue G result: 10/4,012 local directional sign errors, all-row steering MAE `0.013540828 rad`, directional MAE `0.017008594 rad`, wide mismatch 1,415/5,072, and Gate 2 16/16. The full Gate 2 report was not regenerated in the production-candidate pass; exact raw-input parity plus unchanged sensor code carries the saved result forward.

The three 600 s, 60 Hz natural runs (seeds `20261005`, `20261006`, `20261007`) reproduce the validated research-G trajectories, event/checkpoint summaries, field checkpoints, and dose accounting exactly under the recorded verifier. All recorded checks passed at five checkpoints per seed. Final population was 19/22/21; cumulative coverage `.8196/.7490/.8257`; top-10% share `.4180/.4161/.4185`; corrected recent coverage/entropy `.3467/.8124`, `.3674/.8290`, `.3687/.8260`. No cap hits, saturation, or finite/speed/turn/collision/population invariant failures were recorded.

These establish candidate conformance, not preferred morphology or biological correctness. G retains the fixed-cue caveats already recorded: 14 more wide mismatches than F, larger straight/S zero-cue magnitudes, and greater phase/mirror residuals than F. Natural G also has more cumulative path concentration than C. Those were not silently treated as improvements or re-opened in this review.

## Near-stop blocker

The old seed-240 test did not establish a braking regression. G/240 retired at `22.3667 s`; the old test then counted 2,259 post-removal samples as moving from the detached object's frozen velocity. It had no post-warm-up hesitation: its only hesitation occurred during excluded warm-up and reached a real near-stop. All eight post-warm-up inspection draws were above the unchanged `0.23` event threshold.

The replacement tests directly verify the existing inspection interval and hesitation duration, the `0.05` desired-speed multiplier, actual braking below the near-stop boundary, and resumed movement. Deterministic scheduler and braking/resumption probes pass for both 96×96 and 316×316 fields. The tests assert the tested ant remains active. No production source or movement constant changed. Existing long-run, collision, finite-state, speed, and turn-bound tests remain in the controller suite.

Validation after the correction: controller tests 23/23, full suite 339/339, build pass, diagnostic replay deterministic, observer/RNG parity pass. The original stochastic “more than 10 near-stop events after warm-up for every seed” expectation was removed because it depended on a particular random event count and did not guard lifecycle membership; the authored schedule and braking behavior remain directly tested.

## Runtime risk

The production-shaped browser receipt covers 600 s real-RAF warm-up, a 60 s screen, and a 180 s Audio-Off soak: about 840.2 s simulated over 841.7 s wall. It reports no page/console/network errors or cap hits. It also reports a 319 ms maximum RAF gap and 377 ms clamp loss in the screen, plus a 126 ms maximum gap in the soak.

The earlier research-G screen used a different server, viewport, warm-up, and instrumentation. It is not a matched comparator. Current evidence therefore does **not** attribute the long gaps to G. Classification: **BOUNDED RUNTIME RISK — NOT AN ADOPTION-REVIEW BLOCKER**. Exhibition-duration reliability and Audio-On runtime remain separate deployment requirements; this review did not test them.

## Independent review

A fresh read-only reviewer inspected the candidate source diff, consumer paths, fixed-cue/natural receipts, near-stop correction, and browser limits. The reviewer found no concrete adoption blocker. It confirmed the corrected near-stop artifact hashes and the consumer/raw-read parity. The strongest counterargument is that the 319 ms screen gap is user-visible; however, the prior research screen is not a matched control, no G-specific cause or preregistered blocking threshold is present, and the short soak showed no browser errors or field pathology. The committed browser JSON also lacks per-gap timing/count detail, so it does not support a deeper causal timing claim. See [`INDEPENDENT-REVIEW.md`](INDEPENDENT-REVIEW.md).

## Final boundary

The verified evidence supports presenting G for the user's adoption decision. It does not authorize merge, adoption, production default change, or further field/movement tuning. Production `src/` remains unchanged in this review commit.

See [`VALIDATION.md`](VALIDATION.md) for source hashes, evidence receipts, and scope checks.
