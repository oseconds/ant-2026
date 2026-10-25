# ANT low-evidence founder-effect refinement — 2026-10-07

One small production candidate retained. New direction clocks are at most 20% shorter and the new deposition baseline at most 25% lower when existing absolute near evidence is absent. Both continuously approach their previous values as evidence grows. Steering, directional confidence, adherence, noise amplitude/probability, movement, gait, collision, fields, recruitment, Plate qualification and audio remain unchanged.

The source and controlled probes demonstrate a susceptibility to premature reinforcement: zero evidence previously retained the same fresh clocks and baseline dose as a strong uniform field. Three paired natural seeds show lower early chemical mass and lower low-evidence accrued dose, while mature routes remain legible. They do **not** prove a universal founder-effect cause, uniformly more branches, or sustained procession success. Spatial outcomes are mixed. This pass stops here.

## 1. Baseline and hypothesis audit

Starting commit: `ecf09c7894b20a919f0c2c43b17da6b036b14118`. Initial tracked working tree was clean. The unrelated untracked `scripts/ant-target-energy-wake-gate-validation.js` was preserved byte-for-byte and excluded from every commit. Its SHA-256 is recorded in [source-freeze.json](source-freeze.json).

The parent read the current README, AGENTS guidance and Surface/Plate handoffs, inspected status/diff, and copied the current source into ignored `test-results/founder-baseline` before changing production. No reset, checkout or replacement of the working tree occurred. The freeze manifest covers 43 source/worklet files: only `AntController.js` changed; the other 42 remain byte-identical.

The proposed two asymmetries are present in the implementation. Their sufficiency as the explanation for every early route is not established. We changed both together as one bounded candidate; these runs do not separate their individual contributions.

## 2. Exact behavior path and variables

Implementation: [AntController.js](../../../../src/lib/agents/ant/AntController.js), principally `tick`, `updateIntention`, `senseTrail`, `senseLocalTrail`, and `updateTrailAdherence`.

Let `H(c, h) = c³ / (c³ + h³)` for nonnegative concentration.

| Quantity | Exact existing computation | Meaning |
|---|---|---|
| Far candidate signal | At 0.042 ahead of each jittered heading, sample lateral offsets `[-1,-0.5,0,0.5,1] × 0.014`; take `max(raw × (1 − 0.45 × abs(offset)))`; outside-domain samples contribute zero | Discovery footprint |
| Directional confidence `F` | Five heading offsets `[-0.92,-0.47,0,0.47,0.92]`; each far signal passes through `H(c, 0.035)`; `trailConfidence = max(response) − min(response)` | Relative directional contrast, not absolute evidence |
| Near profiles | Depths 0.016 and 0.028, each with left/center/right at lateral `[-1,0,1] × 0.009`; each point averages lateral offsets `[-1,0,1] × 0.003` with weights `0.25/0.5/0.25` | Existing two-depth local observation |
| Absolute evidence `E` | For each depth, `p = max(left, center, right)`; `E = H(sqrt(p1 × p2), 0.018)`; this is the existing `localTrail.strength` | Absolute local concentration corroborated at both depths; independent of contrast |
| Local coherence `C` | Minimum over the two depths of `(peak − floor)/(peak + 1e−9) × (1 − split/(peak + 1e−9))`, with `split = max(0, min(left,right) − center)` | Directional coherence; a flat profile or equally strong separated side bands is ambiguous |
| Adherence `A` | Target `clamp(E × C, 0, 1)`; `A += (target − A) × (1 − exp(−dt/τ))`, with τ=0.25 s when rising and 1.8 s when fading | Short sensory memory of coherent local following |
| Prior persistence `P` | `max(previous far confidence, newly updated A)` before fresh far sensing | Existing jitter/inspection persistence |
| Effective confidence `K` | `max(fresh far confidence, A)` | Existing decision/noise confidence |

`E` is neither global chemical mass nor a whole-environment knowledge estimate. A strong signal only at one near depth can leave E small. A far-only cue can have high F with E=0. This local scope is intentional and recorded as a limitation.

Before the change:

```text
decision = (0.25 + 0.42 × u) × (1 + 0.35 × K)
committed = 0.30 + 0.90 × v
distance dose multiplier = 0.50 + reinforcementGain × A²
```

The controller keeps its chosen intent only while **both** countdowns remain positive and it has not become newly blocked. Thus the scheduled effective hold is `min(decision, committed)`, rather than the full committed timer. With fresh zero confidence/adherence, decision spans 0.25–0.67 s and committed spans 0.30–1.20 s; effective uninterrupted hold cannot exceed 0.67 s. Residual adherence or a far-only directional cue can lengthen decision despite low near E. A newly blocked ant can reschedule sooner.

Exploration and noise remain:

```text
exploration probability = max(0.04, personality.exploration × (1.2 − K))
heading jitter span = 0.12 × (1 − 0.8 × P)
score noise span = 0.42 × (1 − 0.85 × K)
softmax temperature = 0.85 × (1 − 0.4 × K)
inspection jitter scale = 1 − 0.8 × P
```

Inspection scheduling remains `1.2 + 2.4 × random` seconds with the existing 0.23 inspection probability. Its hesitation and braking behavior are unchanged. More frequent direction decisions can consume more random draws over time, but the intervention adds no draw to any one decision.

At E=A=0 the old multiplier was still 0.5, or 2.25 dose units per traveled world unit at configured rate 4.5. Every accidental initial route could therefore create a substantial trace before meaningful local evidence existed. Later ants can read that trace, reinforce it through unchanged `5 × A²`, and accumulate unchanged Surface support and Plate qualification.

For an interior ant with fresh A=F=0, a zero field and a uniformly strong flat field formerly gave identical direction confidence, coherence, adherence, fresh decision clocks, deposition and choices under the same random values. A common far score offset cancels in weighted choice. This equivalence is specific to those behavior paths: ColonyActivation and antenna pose already observe absolute signal, and domain boundaries can break uniform sensor equivalence.

## 3. Smallest production intervention

Only these expressions changed:

```text
durationScale = 0.8 + 0.2 × E
new decision = old decision × durationScale
new committed = old committed × durationScale
new distance dose multiplier = 0.5 × (0.75 + 0.25 × E) + reinforcementGain × A²
```

Production diff: one Controller file, 7 added/3 removed lines, including explanatory comments. Existing local strength is reused; no new sensor, field, agent property, role, caste, enum, state transition, pioneer probability or hard exploration switch exists. The E<0.1 cutoff used below is an **analysis bin only**. Production has no such threshold.

At E=0, both new timers are 80% of the original and baseline dose is 0.375 instead of 0.5. At E=0.5 they are 90% and 0.4375. As E approaches 1, prior clocks and baseline recover smoothly. The gain and quadratic reinforcement are untouched. Residual adherence can still produce high total dose in a local gap; the pass reduces only the new baseline.

This is the current low-evidence behavior meaning of “pioneer.” No retrospective topology-changing social-graph label has been introduced into behavior.

## 4. Controlled probes and mature-following regression

[controlled-probes.json](controlled-probes.json) contains actual clocks, choices, draw counts, field delivery and five fixed mature-corridor trials. The probe uses one ant, no recruitment/audio and fixed field sampling, so self-deposition cannot alter the supplied corridor.

| Uniform raw concentration | E | Decision before → after, seconds | Committed before → after, seconds | Delivered dose / distance before → after |
|---:|---:|---:|---:|---:|
| 0 | 0 | 0.566625 → 0.453300 | 0.900988 → 0.720790 | 2.250000 → 1.687500 |
| 0.018 | 0.5 | 0.566625 → 0.509962 | 0.900988 → 0.810889 | 2.250000 → 1.968750 |
| 0.4 | 0.999908883 | 0.566625 → 0.566614 | 0.900988 → 0.900971 | 2.250000 → 2.249949 |

All six uniform probes retain F=C=A=0, intent heading 0.0333401361 rad, and 14 decision draws. Actual delivered mass agrees with intended dose within Float32 tolerance. Unknown and uniform strong situations now differ in clocks/baseline while neither invents a preferred direction.

In the five-second strong narrow corridor, seeds 19, 61 and 20261005 preserve movement/adherence/contacts/draw counts exactly; dose differs by about 0.001%. Seed 193's maximum lateral excursion changes 0.03736→0.03220 and final adherence 0.98748→0.99509. Seed 20261006 changes excursion 0.03742→0.03264 but still ends off-corridor with final adherence near 0.293. All five paired contact totals match: 16/18/23/20/16 groups. This is a bounded regression probe, not proof of universal following.

The explicit far-only probe has E=0 but raw far signal 0.35 and F=0.9984018954. Decision changes 0.764626→0.611701 s with the same choice and 14 draws. The shorter first discovery commitment is a residual risk; steering/attraction are unchanged and real near evidence restores the original duration.

## 5. Natural matched-seed evidence

Six full runs: BEFORE and AFTER for seeds **20261005, 20261006, 20261007**, at 60 simulation ticks/s for 600 s, with natural default recruitment feedback, unchanged Surface/Plate birth/stratigraphy and Audio Off. Checkpoints are 30/60/120/300/600 s. No warm-up trail, route injection, manual milestone or forced birth is used.

Initial snapshots and all 16 initialization draws match within each pair. Changed direction timing and recruitment subsequently diverge RNG call paths. “Matched seed” means matched initial conditions, not identical random draws throughout the trajectory. The summaries record state/call count and hash every real FOOT_CONTACT.

Data: [before/summary.json](before/summary.json), [after/summary.json](after/summary.json), and the compact [comparison.csv](comparison.csv), with all 30 checkpoint rows. Histograms, quantiles and complete invariant counters stay in the summaries. Each side also contains raw checkpoint grids and three gzip archives of trajectory samples, sampled contacts and immutable material birth records.

Arithmetic means across the three seeds:

| Time | Chemical mass before → after | Change | A mean before → after | E mean before → after | Plate count mean before → after |
|---:|---:|---:|---:|---:|---:|
| 30 s | 41.90 → 27.53 | −34.3% | 0.355 → 0.290 | 0.414 → 0.279 | 0 → 0 |
| 60 s | 98.27 → 72.23 | −26.5% | 0.406 → 0.302 | 0.517 → 0.367 | 0 → 0 |
| 120 s | 190.34 → 153.77 | −19.2% | 0.439 → 0.446 | 0.589 → 0.622 | 1.00 → 0.33 |
| 300 s | 248.87 → 219.94 | −11.6% | 0.578 → 0.495 | 0.829 → 0.817 | 13.00 → 8.67 |
| 600 s | 230.91 → 231.41 | +0.2% | 0.518 → 0.496 | 0.858 → 0.804 | 35.33 → 30.33 |

Early chemical strength falls, while mature mass recovers; this is compatible with less immediate amplification rather than suppression of all mature routes. Three seeds are a descriptive experiment, not a significance claim.

At 600 s, every value is before → after:

| Seed | Active ants | A mean | E mean | Low-E scheduled effective hold mean, s | Low-E accrued dose / actual distance | FOOT_CONTACT groups / individual feet |
|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 20 → 21 | 0.507 → 0.434 | 0.873 → 0.793 | 0.482 → 0.384 | 5.699 → 4.893 | 35,067 / 103,803 → 35,751 / 105,759 |
| 20261006 | 23 → 21 | 0.530 → 0.535 | 0.861 → 0.794 | 0.482 → 0.382 | 6.018 → 4.403 | 34,531 / 102,235 → 35,377 / 104,829 |
| 20261007 | 19 → 21 | 0.517 → 0.519 | 0.841 → 0.824 | 0.483 → 0.382 | 5.908 → 4.695 | 35,138 / 104,044 → 35,448 / 105,001 |

Low-E means E<0.1 at the actual accrued movement chunk. Effective scheduled hold falls about 20.5–20.8%; accrued dose/distance falls about 14.1%, 26.8%, 20.5%. These natural total-dose rates exceed the pure baseline because A can persist after local evidence fades. Deposition baseline and reinforcement should not be conflated.

The population rule is frozen, but its output changes because the chemical environment changes. Ant-count/contact-count differences are outcomes, not recruitment/gait parameter edits. Per-distance dose helps avoid confusing lower population with the intended deposition effect.

At 600 s, A p10/p50/p90 are respectively:

| Seed | Before | After |
|---:|---:|---:|
| 20261005 | 0.087 / 0.478 / 0.836 | 0.149 / 0.433 / 0.723 |
| 20261006 | 0.364 / 0.585 / 0.679 | 0.169 / 0.593 / 0.778 |
| 20261007 | 0.249 / 0.487 / 0.834 | 0.301 / 0.504 / 0.721 |

## 6. Route morphology, retention and branches

All three complete time-series maps were inspected by the parent. Mature 120/600 s trails remain legible as corridors and branching fans; the AFTER runs do not become uniform noise. Seed 20261005 has lower final coverage and lower snapshot adherence; this is retained as counter-evidence. The other two seeds visit more cumulative area. No uniform branch improvement is claimed.

| Seed | Cumulative center coverage at 600 s | Recent 30 s normalized occupancy entropy | Chemical mass share inside the same BEFORE 30 s corridor mask at 600 s | Stable-candidate boundary endpoints | Individually tracked 20 s endpoint cells |
|---:|---:|---:|---:|---:|---:|
| 20261005 | 90.63% → 89.33% | 0.819 → 0.832 | 3.705% → 2.765% | 0 → 0 | 0 → 0 |
| 20261006 | 87.67% → 93.48% | 0.819 → 0.812 | 5.868% → 5.026% | 13 → 14 | 0 → 1 |
| 20261007 | 88.60% → 92.60% | 0.809 → 0.828 | 4.781% → 3.007% | 11 → 9 | 0 → 0 |

The shared early mask fixes the same cell area in each pair: BEFORE 30 s raw pheromone≥0.04, excluding radius 0.12 around entrance (0.5,0.72). Late chemical share falls in all three pairs. It measures reduced retention of that specific early spatial imprint, not individual-founder causality or an alternative AFTER route's quality. The summaries additionally retain each run's own early mask dose/contact shares; those masks have different areas and are less directly comparable.

Route metrics deliberately remain simple:

- Occupancy is ant-center time in a fixed 64×64 grid; recent occupancy uses the last 30 completed one-second buckets, cumulative coverage uses any visited cell. Entropy is `−Σp log(p) / log(number of cells)`; top-10%-cell share is retained in summaries.
- Chemical persistence is ≥0.04 in every 1 Hz sample over the previous 30 s. Eight-neighbor components of at least 20 cells are **persistent area regions**, not branches.
- The unchanged birth candidate's pure `createDescriptor` provides a source-to-distant-boundary route graph. After its existing candidate age reaches 20 s, count degree-1 endpoints within 0.05 of the boundary. Candidate age can survive a branch change, so this is **current endpoints of a stable candidate**, not individually persistent whole branches.
- A separate exact-cell endpoint tracker requires 20 elapsed consecutive seconds at 1 Hz (21 samples). Missing/unqualified endpoints or cell shifts reset age. This **temporal endpoint proxy** undercounts moving branches and does not establish the persistence of an entire corridor. Zero qualifying endpoints does not mean zero trails: the graph only includes birth-eligible source-to-boundary routes.

These proxies provide a reproducible minimal branch measurement, but their limitations prevent a firm “more persistent route branches” success claim. A behavioral/social graph was not added.

Fixed visual scales: raw pheromone **0–0.18 linear**, recent occupancy **0–5 ant-seconds/cell**, using fixed `log1p(value/0.05)`, and cumulative coverage **binary ever-visited**. Clipped-cell counts are printed. No per-image/seed/variant normalization.

| Visual packet | Links |
|---|---|
| All five times, seed 20261005 | [overview](seed20261005-maps-overview.png), [120/600 s detail](seed20261005-120s-600s-maps-detail.png) |
| All five times, seed 20261006 | [overview](seed20261006-maps-overview.png), [120/600 s detail](seed20261006-120s-600s-maps-detail.png) |
| All five times, seed 20261007 | [overview](seed20261007-maps-overview.png), [120/600 s detail](seed20261007-120s-600s-maps-detail.png) |
| Actual unchanged Chrome renderer | [120/600 s comparison](chrome-seed20261005-120s-600s-comparison.png), individual 30/60/120/300/600 s PNGs in this directory |
| Actual mature Chrome RAF movement | [BEFORE silent clip](chrome-before-seed20261005-600s-silent-motion.webm), [AFTER silent clip](chrome-after-seed20261005-600s-silent-motion.webm) |
| Hashes, scales, source and engine checks | [visual-map-metadata.json](visual-map-metadata.json), [BEFORE Chrome metadata](chrome-before-seed20261005-metadata.json), [AFTER Chrome metadata](chrome-after-seed20261005-metadata.json) |

Chrome 154.0.8037.98 ran a fresh paired seed20261005 at 60 Hz through 600 s, then the original controller update/renderer on real RAF for about 15 wall seconds, simulation 600→614.9833 s. The two 720×720 VP8 clips contain 450 video packets and **no audio tracks**. Parent inspected the four checkpoint renderings at 120/600 s and temporal strips extracted from both actual motion clips. Locomotion and coherent local following remain visually recognizable; no global stable procession criterion is declared met.

Chrome and Node source hashes match. Their raw fields match exactly at 30 s; tiny numerical differences appear by 60 s with identical RNG counts/state, then trajectories/scheduling diverge. Chrome's 600 s Plate counts are 35→33, versus Node's 34→32. These are separate engine observations; the Node table must not be read as an exact prediction of the browser trajectory.

## 7. Plate birth effects, with unchanged rules

| Seed | First birth, seconds | Counts at 30 / 60 / 120 / 300 / 600 s, before → after | Repeated same-corridor births by 600 s |
|---:|---:|---|---:|
| 20261005 | 149.02 → 103.02 | 0/0/0/11/34 → 0/0/1/9/32 | 2 → 2 |
| 20261006 | 95.02 → 220.02 | 0/0/1/15/36 → 0/0/0/7/28 | 1 → 2 |
| 20261007 | 81.02 → 145.02 | 0/0/2/13/36 → 0/0/0/10/31 | 5 → 1 |

All chemical threshold **0.30**, support threshold **0.015**, persistence **20 s**, minimum geodesic length **0.30**, same-corridor refractory **90 s**, required new individual foot contacts **30**, and global birth gap **10 s** remain unchanged. SurfaceField 96×96 /1800 s, real-foot deposition, material lifecycle and technical ceilings are unchanged.

First-birth range widens 81–149→103–220 s; one seed births earlier, two later. Final mean count falls 35.33→30.33, with seed range 34–36→28–32. Repeat-corridor counts are mixed, rather than eliminated. Existing qualification still yields substantial natural material from mature routes. No birth-side defect independent of behavior was demonstrated, so a separate Plate-birth tuning pass is **not justified by this packet**. This does not establish that those thresholds are optimal.

## 8. Measurement integrity and unresolved risks

Evidence wrappers call the original methods once and observe already-computed sensing values, without extra sensor sampling or RNG. All 30 regenerated checkpoints matched the initial six runs exactly in chemical mass, population, Plate counts, RNG state/count and complete contact-stream hashes after reporting corrections; see [observer-parity.json](observer-parity.json). This proves the added reporting did not change those trajectories. It does not claim a complete uninstrumented/instrumented trajectory proof beyond those checks.

Low-E dose is **intended accrued dose per actual thorax distance at GasterDeposition.advance**. A delayed dab can mix evidence states, so emitted dabs are not retrospectively assigned the current E. Gaster-emitted dose includes deposits later rejected outside the domain or limited in the field. Accrued=emitted+pending is checked with relative tolerance 1e−8. Actual field mass is measured separately after its existing domain/decay/saturation behavior; exact low-E field-accepted mass is not claimed.

Clock histograms distinguish new decision/committed pairs, their effective minimum, completed intervals between reschedulings, retirement-censored intervals and active unfinished intervals. Completed intervals can end early on blockage and are not an unbiased lifetime estimator. For BEFORE seed05 at600: 22,780 scheduled =21,996 completed +764 retired +20 active; AFTER: 24,849 =24,084 +744 +21. This accounting is asserted at every checkpoint.

Checkpoint E/A summaries use the existing cached pre-move local profile. An ant newly recruited at the last tick has no profile yet and is recorded E=0 with `localProfile:null`. Every-tick dose/histogram measurements use the actual pre-move E. These are local observations, not global mean chemical concentration.

Remaining limits:

- Only three natural seeds and 600 s: no claim of statistical significance, universal morphology improvement or longer-run behavior stability.
- Both clock and baseline changes are coupled; no isolated factorial attribution of their individual effect.
- E requires two near depths; far-only discovery commitments shorten until near evidence appears. A residual-adherence gap can still reinforce strongly.
- Different recruitment outcomes are part of the feedback system, making natural morphology comparison more than a fixed-population contrast.
- Exact-cell persistence undercounts drifting branches; source-to-boundary qualification omits other visible paths. Persistent whole-branch counts remain unresolved.
- Node/Chrome numerical trajectories diverge after early matching despite identical source. Both engine records are preserved rather than merged.
- The 1 Hz positions, a sampled contact per occupied second and hashed full contact stream are useful raw evidence, but do not constitute a complete encounter log. No precise future DynamicSocialGraph can be inferred from this sampling alone.

Project direction remains equal individuals → local movement/encounters → pheromone + SurfaceField → repeated route → frozen material history. A future read-only DynamicSocialGraph, temporal topology/null models and justified spectral analysis remain separate. No centrality, λ2, eigenmode, social memory, social feedback or retrospective pioneer role was implemented.

Audio/runtime investigation remains **paused, known unresolved issue**. Historical [runtime recheck](../2026-10-06-runtime-recheck/README.md) measured audio/wall 0.1881 at20 Plates and 0.1304 at30 Plates. This pass performs no audio fix, sleep/ROM investigation or audio validation. The 3 ms finite contact pulse, 75 ms local mechanical recovery and ×50 damping are preserved by source hash. Lower initial Plate counts are not evidence that the realtime collapse is solved.

## 9. Tests, build and browser validation

- Preserved baseline suite: **237/237**, [tests-baseline.txt](tests-baseline.txt).
- New focused test RED before production: **2 pass/2 expected fail**, [tests-red.txt](tests-red.txt). Failing clocks and dose establish the requested behavior delta. GREEN after production: **4/4**.
- Full final suite: **241/241**, [tests-final.txt](tests-final.txt). Existing mature trail-following, traffic, gait/contact, turnover, field/Surface/material and audio tests remain included. Child independently ran controller/gaster/following/traffic: **36/36**, including all12 following/traffic tests.
- Harness syntax/selfchecks pass: endpoint appearance/20 s/disappearance/reappearance/gap, timer/dose conservation and fixed map scales/grid dimensions. Parent reran checks and controlled probes independently.
- Six natural runs: zero finite, speed-cap, turn-cap, >1e−6 overlap, population-ceiling, malformed-contact or field-finite violations. Maximum turn remains 4.5; only numerical surface gaps on the order of 1e−8 occur.
- `npm run build` passed, [build.txt](build.txt). Existing Rollup zod PURE annotation and >500 kB bundle warnings remain.
- Real Chrome smoke passes for development and production preview: [browser-dev.txt](browser-dev.txt), [browser-production.txt](browser-production.txt). Additional paired natural Chrome runs have zero page/console errors.

Native Node/Chrome child-process spawning initially hit sandbox `EPERM`. Approved elevated execution ran the ordinary repository commands; no dependency was added. Tests were rerun once after an existing test title was clarified to match its evidence-dependent baseline; no production candidate changed.

## 10. Files and reproduction

Production: `src/lib/agents/ant/AntController.js` only. Focused tests: new `tests/ant-low-evidence.test.js` and precise expectation/title updates in `tests/ant-controller.test.js`, `tests/ant-gaster-integration.test.js`. Diagnostic tooling: the three `scripts/ant-founder-*.js` files. Documentation: main README, AGENTS handoff and this evidence directory. No package/dependency change.

The exact source hashes and preserved initial commit are in [source-freeze.json](source-freeze.json). To reproduce BEFORE without replacing current work, create a separate throwaway checkout at the starting commit and copy its `src` into ignored `test-results/founder-baseline/src`; preserve local line endings if comparing raw-file SHA-256. Current source stays in the main checkout. Both probe/visual scripts expect that baseline path. Avoid running the generators into this historical directory if retaining its evidence; choose a fresh output for new natural/visual runs.

```powershell
node scripts/ant-founder-evidence.js --selfcheck
node scripts/ant-founder-visual-evidence.js --selfcheck
node scripts/ant-founder-evidence.js --source=test-results/founder-baseline --output=test-results/founder-reproduction/before --seeds=20261005,20261006,20261007 --seconds=600
node scripts/ant-founder-evidence.js --source=. --output=test-results/founder-reproduction/after --seeds=20261005,20261006,20261007 --seconds=600
node scripts/ant-founder-visual-evidence.js --before=test-results/founder-reproduction/before --after=test-results/founder-reproduction/after --output=test-results/founder-reproduction --maps-only
node scripts/ant-founder-visual-evidence.js --output=test-results/founder-reproduction --browser-only
node scripts/ant-founder-controlled-probes.js --output=test-results/founder-reproduction/controlled-probes.json
npm test
npm run build
npm run test:browser
npm run test:browser -- --production
```

Reruns default to ignored `test-results/` paths, so they do not overwrite these frozen packets. The current founder runners record each pheromone grid's actual dimensions and separate native node sum from reconstructed/reference integral; historical outputs above retain the 96-grid semantics captured at the time. Node was v22.23.2. Installed Playwright and system Chrome are reused.

## 11. Orchestration report

Parent decomposition: audit the existing path before accepting the hypothesis; separate measurement design from production; protect mature-following/physical invariants; obtain natural visual evidence; ask a fresh reviewer to challenge the source and interpretation. Parent owns the only production edit, acceptance decision, final verification, documentation and commits.

All five children used **gpt-6.1-sol / Ultra**, with no full-history fork and no nested agents. User requested Sol Ultra; parent configuration was also Sol/Ultra. Spawn parameters were explicit; this is configuration/tool evidence, not direct introspection of the parent's sampled runtime model.

| Child | Evidence packet / assigned scope | Parent verification |
|---|---|---|
| `behavior_audit` | Source formula audit; later uniform, strong corridor and far-only probes | Read actual source/call path, reran probes, checked confidence/E separation and literal clocks/dose |
| `evidence_design` | Read-only natural observer, histograms, dose, occupancy and minimal persistence proxies | Ran six paired natural trials; inspected conservation, all30 raw map timestamps and rerun parity |
| `regression_audit` | Focused RED tests and existing expectation updates; mature/gait/collision/birth invariants | Independently reproduced RED/GREEN; ran baseline/final full suites and source freeze hashes |
| `visual_evidence` | Fixed-scale maps; actual Chrome unchanged renderer, screenshots and mature motion | Viewed all3 overview maps, four real120/600 s renderer states and both motion temporal strips; checked metadata/video tracks |
| `independent_review` | Fresh source and evidence challenge; no edits | Rechecked claimed no-source-blocker; corrected reporting censoring and persistence limitations before regenerating evidence |

Meaningful steers: **3** — (1) correct the initial adherence-change suggestion and restrict the candidate to existing E/clock/baseline; (2) require accurate accrued-dose conservation, live-route proxy and observer parity; (3) after fresh review, separate retirement/active clock censoring, add individually aged endpoint cells, and fix raw-map checkpoint metadata. There were **13** total follow-up/status messages (11 send-message calls and2 follow-up tasks); most conveyed authorized scope or readiness and were not corrective steers. No steer introduced a second production candidate.

Skills actually applied, **11 unique**: `superpowers:using-superpowers`, `superpowers:systematic-debugging`, `superpowers:dispatching-parallel-agents`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `agent-skills:git-workflow-and-versioning`, `agent-skills:code-review-and-quality`, `playwright`, `agent-skills:browser-testing-with-devtools`, plus active `caveman` and `ponytail:ponytail`. No Chrome DevTools MCP was exposed, so the browser child used the installed Playwright path. Constraint-driven-development was inspected for applicability but not invoked; no extra constraint scaffolding was created.

Chronological workflow:

1. Inspect memory guidance/current status/diff/README and exact source; preserve unrelated script and source hashes.
2. Delegate source audit, evidence design and regression independently; gather formulas and historical audio/birth constraints.
3. Run baseline237 tests and independent RED; choose one continuous20%/25% bounded candidate; edit only Controller and obtain GREEN.
4. Add visual child, run full tests/build/browser; collect three natural paired seeds through600 s and controlled mature/far-only probes.
5. Add fresh review; correct measurement labels, timer censoring and endpoint persistence. Visual map assertions catch all checkpoints mislabeled600 s; fix metadata and regenerate all6 runs.
6. Prove all30 checkpoints retain original behavior/RNG/contact hashes, then regenerate fixed-scale visual packets and inspect real movement.
7. Accept the bounded candidate with mixed spatial outcome; document source invariants, known audio issue, risks and stop condition. Reinspect status/diff, stage only intended files, separate implementation/tooling/generated evidence commits and push after validation.

Redundant/wasted work: initial broad reads truncated and required focused rereads; sandbox spawning attempts failed before elevated native commands; an initial visual page-route attempt produced no screenshots; fixed-map assertions caught timestamp metadata before publishing, requiring regeneration; all six already-completed natural runs were repeated after observer corrections, with exact parity confirmed. A final aggregate PowerShell expression was corrected after a parser error. One documentation patch failed atomically on a full-line context mismatch and was reapplied. None altered production, lost work or caused extra behavior tuning.

Counts: **5 children, 0 nested children, 3 meaningful steers, 13 follow-up/status communications, 11 unique applied Skills, 1 production candidate**. Separate tooling/visual evidence is larger than the production intervention because the user requested full matched-seed and browser evidence.

## 12. Commit and stop record

Implementation/tests: `596555d47a4c27f8c6c5e0076bfeda95af512618` — `Refine low-evidence ANT exploration`.

Diagnostic tooling: `f19681a5f86e620a1c3dd8cedad113806323d45d` — `Add founder-effect evidence harnesses`.

Generated evidence/documentation is kept in the separate `Record founder-effect refinement evidence` commit. Final evidence commit SHA and verified remote push state are reported in the session final response because a commit cannot contain its own SHA. Before committing, status/diff and exact staging were inspected. Before push, remote main matched the starting commit; only these three intended commits extend it.

No automatic next pass. DynamicSocialGraph, Plate-birth tuning and audio/runtime investigation remain outside this completed experiment.
