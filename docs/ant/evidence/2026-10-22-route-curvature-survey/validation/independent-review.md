# Fresh independent review — 2026-10-22

## Disposition

**Acceptable as a bounded, research-only attribution.** I found no production-source change, no intervention that modifies more than its named controller expression, and no evidence that requires a production change. The data support the claim that delayed previous-angular-velocity feedback is the strongest movement limitation demonstrated among the tested terms. They do not establish it as the only cause of natural route geometry or as a production remedy. Three precision findings raised during review were corrected in the report before review close.

Review baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`, branch `codex/ant-route-curvature-survey-20261022`. I inspected the current ANT guidance, the report and evidence package, the curvature runners and tests, and the actual movement, occupancy, deposition, field, and Plate-selector sources. `docs/ant/archive/**` was not accessed. `git diff -- src` is empty. The controlled artifact's seven recorded source hashes match the current files.

## Findings

### Resolved — front-clear is defined narrowly

The report now says “front-clear” and gives the `frontCrowding <= 0.12` cutoff (`REPORT.md:42,101`). `scripts/ant-route-curvature-readout.js:79-81` uses that cutoff only; side crowding, separation, following, and other occupancy effects can still be present. The report explicitly states that lateral/rear separation is not excluded and that avoidance/following were not separately ablated. The single-agent controlled runs also show turn alternation without occupancy.


### Resolved — separate the at-most-one guard from observed one-agent output

`REPORT.md:65` now says the tick guard checks “at most one” and separately reports that all saved passes completed with one ID. The runner asserts `controller.agents.length <= 1` after each tick (`scripts/ant-route-curvature-probes.js:427`); it starts with exactly one ant and asserts `recruitmentLimit === 1` (`:353-362`). The corrected JSON independently confirms that all 90 capability cases, 36 one-encounter cases, and 90 repeated visits completed their planned ticks, survived, contained one agent ID, and had at most one sample per tick. I also verified the raw JSON and gzip hashes against `controlled/controlled-findings.md`; decompression is byte-identical.


### Resolved — link the natural replay scope and source-hash bridge

`REPORT.md:32` and `natural/README.md:11` now link and summarize the three `validation/replay-20261005/06/07.json` receipts. They show exact endpoint-summary parity and serialized-sample parity across every stored row and field using the current capture source. Finite values compare with `Object.is`; the original JSONL writer's nonfinite `followingSpeedLimit` is represented as JSON `null`. The receipts explicitly do not claim equality of every hidden world variable at every tick.

The manifest's original capture-writer hash (`33dbe4…`) differs from the current lossless codec runner (`3c7ed0…`). The replay receipts bridge that provenance change by reproducing the stored summaries and serialized samples from the current source. I consider the trajectory capture reproducible for its stated scope.

## Adversarial checks and remaining limits

- **Natural movement is measured as travel, not inferred from absolute turn alone.** The report keeps signed and absolute turn separate and uses chord/path, same-sign pairs, and lag correlation. The five-second median chord/path values are about `0.982–0.984`; the low same-sign fraction and negative lag correlation describe alternating turns. They do not mean that every ant or every window is straight.
- **The high-adherence angular alternation is not a threshold-crossing or low-speed artifact.** I independently re-binned adjacent pairs so both samples had adherence `>= 0.75`; reversal fractions remained `99.73–99.85%`. Restricting further to both samples at speed `>= 0.01` left `99.74–99.88%` reversals and about `99.33–99.58%` turn-cap occupancy. Roughly `11–14%` of the high-adherence samples are below that speed threshold, so the check supports the body-angular-velocity claim only; natural path-curvature metrics still include low-speed samples, as the report discloses.
- **The damping shadow is a source-term counterfactual, not a shared future trajectory.** It changes one guarded expression and begins from the same seed; afterward the changed movement naturally alters field input, decisions, recruitment, and random consumption. The report explicitly limits the comparison this way. Replication on two natural seeds supports the bounded effect; the score/blend natural shadows each have one seed, so their relative ranking is provisional.
- **The controller probe does not isolate the local sensor from the wide sensor.** Both production sensors remain active; this supports a combined-controller capability statement, not local-sensor dominance. The report says so.
- **Field and selector evidence remain fixture-specific.** The subcell result uses a fixed route deposited through the real `PheromoneField` API, not a naturally generated gaster path, and does not estimate how often natural routes encounter the failure. The connected selector routes have no branches, and candidate/principal equality follows from the descriptor copy. Neither result estimates natural branch pruning or a natural curvature-retention rate.
- **Repeated field visits are forced.** Resetting the entering ant while retaining and depositing into the field tests bounded deposit/sense feedback; it does not establish spontaneous revisitation or a general straightening operator. “INCONCLUSIVE” is the right status.
- **Initial direction and several occupancy/sensor alternatives remain open.** The fixed recruitment heading is context from prior evidence, not a curvature ablation here. Avoidance/following, local-versus-wide sensor contribution, gaster rear-path curvature, velocity response, persistence noise/clock coupling, branched selector behavior, and natural ridge-retention frequency remain unresolved. The report does not promote the damping shadow to production.

The recorded full-test and build logs were inspected but not rerun for this review. No new experiment or source edit was made.
