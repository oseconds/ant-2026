# Isolated-ant near-stop fixture validity

## Decision

**TEST CONTRACT OVER-SPECIFIED — NEAR-STOP BLOCKER CLEARED.** The seed-240 failure does not establish a G braking regression. Its only G hesitation began during the excluded warm-up and reached a real near-stop; none of the eight post-warm-up inspection opportunities scheduled another episode. The ant then retired at 22.3667 s. The old test kept sampling its detached object for the rest of the hour, so stale velocity made the “moving” assertion pass. The stochastic post-warm-up assertion and unguarded lifecycle observation did not isolate the authored hesitation contract.

The test now directly protects the inspection schedule, hesitation duration, 0.05 desired-speed multiplier, braking below the existing near-stop threshold, and resumed movement. The same deterministic probes pass with both 96×96 C and production-shaped 316×316 G fields. No production source or movement parameter changed.

## Authority and provenance

- `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- G candidate parent: `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`.
- User-supplied candidate branch spelling `codex/ant-g-production-candidate-review-20261025` was not a remote ref. `git ls-remote` confirmed the actual pushed branch `codex/ant-pheromone-g-production-candidate-review-20261025` at the same required tip.
- The G review report and validation receipt are in [`2026-10-25-g-production-candidate-review`](../2026-10-25-g-production-candidate-review/README.md). Its full-suite failure was seed 240 with 0 counted near-stops and 3,126 counted moving samples.
- Founder-effect context was read from [`2026-10-07-founder-effect-refinement`](../2026-10-07-founder-effect-refinement/README.md). It documents the unchanged 1.2–3.6 s inspection interval, 0.23 event probability, and 0.7–1.5 s hesitation; its hesitation/braking mechanism was not changed in that refinement.
- Frozen diagnostic rules were committed before this run in [`PREREGISTRATION.md`](PREREGISTRATION.md).

## Implementation facts

`AntController.updateIntention()` decrements the inspection clock, schedules its next interval as `1.2 + 2.4 × random`, then starts hesitation when the next draw is below `0.23`; duration remains `0.7 + 0.8 × random`. `tick()` applies the existing `HESITATION_SPEED_RATIO = 0.05` before `accelerateToward()`.

`tick()` builds `survivors` from agents that remain in bounds. After an exit, the controller replaces `this.agents` with that survivor list. The old test captured `const ant = controller.agents[0]` once, never checked membership again, and continued reading that object for all 3,600 ticks. Its velocity therefore froze after removal.

## Exact fixture reproduction

The runner repeated the old test setup without changing the stream: one initialized ant, recruitment disabled, position set to `(0.5, 0.5)`, same seeded LCG, 60 Hz, 3,600 ticks, and the original warm-up predicate `tick <= 300`. C uses the same controller with a 96×96 `PheromoneField`; G uses the default 316×316 candidate field. For each seed, the C/G initial agent fingerprints matched and both consumed 16 initialization draws. The RNG counter wraps the existing LCG output and returns the exact same value. The local-strength observation wraps the controller's existing single `senseLocalTrail()` call and records its returned object.

| Field / seed | First retirement (s) | Hesitation starts after 5 s | Active near-stop samples after 5 s | Old-test moving | Moving samples after removal | Frozen ticks after exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| C / 9 | active at 60 s | 4 | 261 | 2,554 | 0 | 0 |
| C / 52 | 39.867 | 4 | 261 | 2,731 | 1,209 | 1,208 |
| C / 240 | 14.200 | 2 | 160 | 3,057 | 2,749 | 2,748 |
| G / 9 | 56.033 | 3 | 210 | 2,586 | 239 | 238 |
| G / 52 | 38.183 | 4 | 278 | 2,738 | 1,310 | 1,309 |
| G / 240 | 22.367 | **0** | **0** | **3,126** | **2,259** | **2,258** |

“Moving samples after removal” includes the exit tick's post-tick sample, when the controller has already removed the ant; “frozen ticks” excludes that exit tick and counts only later ticks where no controller update touched the object. For G/240, the ant's exit-tick speed was `0.089869` against preferred speed `0.100867`; the old moving threshold was `0.060520`. All 2,259 post-removal samples therefore continued to satisfy the moving predicate at the frozen exit velocity. Only 867 of the old 3,126 moving samples came from ticks where the ant remained active.

### Scheduler path versus stale sampling

G/240 had one hesitation start at tick 102 (`1.7167 s`, before warm-up ended at 5 s), with scheduled duration `0.8468 s`. While that episode was active the ant's minimum speed was `0.003013`, below its `0.015130` near-stop threshold. This directly shows the natural G hesitation episode braked correctly, but it was excluded by the old measurement window.

There were eight G/240 inspection opportunities after warm-up. Their existing hesitation-probability draws were `0.756589`, `0.480963`, `0.444936`, `0.429546`, `0.558649`, `0.593642`, `0.851335`, and `0.412478`; all exceed `0.23`. By contrast, C/240 had three post-warm-up opportunities with draws `0.043720`, `0.205141`, and `0.983228`, producing two hesitation episodes and 160 near-stop samples. The scheduler law is unchanged; field-dependent decisions consume the shared RNG along different paths, so later inspection draws are not paired outcomes.

The diagnosis has two distinct parts:

- **Near-stop failure:** the seeded G trajectory produced no hesitation during the post-warm-up window. This is a stochastic-path outcome, not evidence that G removed the scheduler or braking behavior.
- **Moving-count validity:** after retirement, stale object velocity inflated the old test's moving count. This does not explain the zero near-stop count, but it invalidates the test's claim that the same ant resumed movement while active.

G seeds 9 and 52 still show natural post-warm-up hesitation and active near-stop samples (210 and 278 respectively). The fixed scheduler and braking probes also pass under G.

## Controlled scheduler and braking probes

Both 96 and 316 fields passed:

- Scripted scheduler draws `[0.5, 0, 0.5, 0.25]` produced a `2.4 s` inspection interval and `0.9 s` hesitation with exactly four existing RNG calls.
- With an existing `0.9 s` hesitation state, desired speed was `0.0375 × preferredSpeed` (`0.75 × 0.05` at the frozen speed phase). Minimum actual speed was `0.004052`, below the `0.014625` near-stop threshold. The episode cleared at tick 53 and resumed speed reached `0.080344`, above the `0.0585` moving threshold.
- `accelerateToward()` remained enabled. The ant stayed active at the center of the domain throughout each 120-tick braking probe.

## Test correction

The invalid 60 s stochastic count test was replaced by two deterministic contract tests in [`tests/ant-controller.test.js`](../../../../tests/ant-controller.test.js): one verifies the authored inspection/hesitation schedule; the other verifies the authored low-speed target, near-stop, and resumption. Each probes both C and G field dimensions. The replacement makes no assertion about how many Bernoulli events a particular seed must receive after an arbitrary warm-up.

## Evidence and reproduction

- [`diagnostic-summary.json`](diagnostic-summary.json): per-arm lifecycle counts, retirement states, controlled probes, observer parity, and artifact hash.
- [`lifecycle-timeline.json.gz`](lifecycle-timeline.json.gz): all 3,600 per-tick rows for all six field/seed arms, including activity, positions, movement, behavior clocks, local strength, adherence/confidence, RNG draw values/counts, and event predicates.
- [`VALIDATION.md`](VALIDATION.md): source hashes, deterministic receipts, test/build status, and source-diff boundary.

Regenerate the raw evidence from the G candidate source tree with:

```powershell
node scripts/ant-near-stop-fixture-diagnostic.js
```

The runner completed twice with byte-identical gzip timeline SHA-256 `7d5c762b0797ea8826b91ca733854face69d109d8a6808e8a8b5548a04766275` and summary SHA-256 `0726dfd503c6c2dad550295f6fa86df6849d55540d003e100b8064d568b2f0a4`.

## Claim boundary

This result clears the isolated-ant near-stop test as a G blocker because the test did not ensure the ant stayed active and required a particular stochastic event count after warm-up. It confirms the current scheduler and braking contract in controlled G probes and natural passing G seeds. It does not establish that every G natural trajectory hesitates at a fixed rate, nor does it clear the separately documented browser long-frame-gap risk or complete the broader G adoption decision.
