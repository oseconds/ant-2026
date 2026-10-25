# Candidate G production-candidate review

**Decision: G PRODUCTION CANDIDATE HOLD.** This branch is a production-shaped review candidate only. It is not adopted, merged, or represented as the current canonical ANT baseline.

## Authority and provenance

- Fresh `origin/main` and branch point: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research decision input: `c45e1845bd86a5a6f1082b5c67ef6f521cd860c1`.
- Qualified G fixed-cue and movement evidence: `336e8dc6e680ff5de3c256e50596581797ce0907`.
- Preregistered review: [`PREREGISTRATION.md`](PREREGISTRATION.md), committed before the natural conformance outcome.
- Source and input hashes: [`data/PROVENANCE.json`](data/PROVENANCE.json), [`FIXED-CUE-PARITY.json`](FIXED-CUE-PARITY.json), and [`NATURAL-CONFORMANCE.json`](NATURAL-CONFORMANCE.json).
- The production `src/` changes are limited to `PheromoneField`, controller analysis field names, and the ANT diagnostics label. `docs/ant/README.md` is unchanged.

## Implementation fact

The default `PheromoneField` is now 316×316 Float32, with the saved G Gaussian (`R=0.0045`, `σ=0.00225`), 15 s half-life, cap 8, bilinear read, and internal source coefficient factor `3969/361 = 10.994459833795014`. `depositPoint()` and `depositSegment()` accept and return authored source-dose requests; the return is not the amount that survived cap or Float32 storage. Segment clipping, Gaussian support, write order, cap loss, and decay remain as before.

`nodeSum` is the native coefficient sum. `reconstructedIntegral` is the bilinear reconstructed-field integral: each nodal value receives the correct trapezoidal edge weight and quarter corner weight, divided by `(width−1)(height−1)`. Legacy `totalMass` and `analysis.pheromoneMass` remain native node-sum aliases for compatibility. The UI labels the comparable diagnostic “pheromone reference integral.” This is the declared legacy reference-area unit; it is not a physical chemical-mass claim. Boundary truncation and cap saturation remain exceptions to the interior reference-integral invariant.

Point and segment writers both apply the conversion inside the field. `GasterDeposition.amountPerUnitDistance` remains `4.5`; no controller-side scale, consumer divide-by-scale, response threshold, movement, material, or audio tuning was added.

## Fixed-cue conformance

The current production writer recreated all 24 frozen G route/phase rasters with exact raster SHA parity. All 99,792 local and 138,600 wide raw reads matched the saved G values exactly; there were zero mismatches. The saved fixed-cue G result remains 10/4,012 local directional sign errors, `0.013540828 rad` all-row steering MAE, `0.017008594 rad` directional steering MAE, 1,415/5,072 wide winner mismatches, and Gate 2 16/16.

The sensor operators and fixed-cue geometry were not changed. Thus the raw parity preserves those saved derived results by deterministic downstream equivalence; this review did not regenerate the full Gate 2 report. The residual G limitations remain: F had 14 fewer wide errors, G increases some zero-cue magnitudes, and phase/mirror residuals exceed F.

## Consumer and diagnostic conformance

See [`CONSUMER-CONFORMANCE.md`](CONSUMER-CONFORMANCE.md). `AntController` keeps local/far half-saturation at `0.018/0.035`; `ColonyActivation` remains at `0.04`; `TrailPlateBirth` keeps its `0.04/0.30` chemical settings and internal 96×96 material-analysis grid while sampling the actual snapshot dimensions. Its raw-array bilinear path matches `field.sample()` at fixed probes. `AntRenderer` uses snapshot dimensions and retains the fixed absolute value-to-alpha mapping. No remaining pheromone consumer was found that requires 96×96 dimensions or divides only one read path by the G scale.

## Natural G conformance

The production-shaped field ran 600 simulated seconds at 60 Hz for seeds `20261005`, `20261006`, and `20261007`, with Audio Off. [`NATURAL-CONFORMANCE.json`](NATURAL-CONFORMANCE.json) records exact matches against the parent G replay for initial fingerprints, movement/trail/event summaries, contact and birth streams, raw positions, field checkpoints, SurfaceField, cumulative occupancy, persistent material masks, and coefficient-dose accounting. No cap hits or saturation occurred.

| Seed | Population at 600 s | Travel | Travel / active-ant-s | Coverage | Top-10% occupancy | Corrected recent coverage / entropy | Plates | Peak node |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 19 | 603.098 | 0.055505 | 0.8196 | 0.4180 | 0.3467 / 0.8124 | 36 | 2.3444 |
| 20261006 | 22 | 613.718 | 0.054991 | 0.7490 | 0.4161 | 0.3674 / 0.8290 | 38 | 2.0490 |
| 20261007 | 21 | 611.080 | 0.055186 | 0.8257 | 0.4185 | 0.3687 / 0.8260 | 37 | 2.1944 |

First Plate births occurred at `84.017`, `96.017`, and `92.017 s`. The 600 s result reproduces the selected G research behavior; it does not establish that the changed G morphology is preferable. The invalid legacy recent-window arrays were excluded and the current corrected 60 Hz observer was used.

Across these runs, mean local strength was `0.772/0.792/0.781`, mean adherence `0.651/0.672/0.657`, and mean far Hill response `0.655/0.671/0.665` in seed order. Requested / field-accepted authored dose was `8057.122/8055.321`, `8549.746/8549.618`, and `8151.972/8151.119`; boundary rejection was `1.802`, `0.128`, and `0.854`. FOOT_CONTACT groups were `33,643/34,237/34,039`, with individual-foot counts `99,469/101,243/100,717`. Saturation loss and cap touches were zero.

## Regression validation

- Focused field/deposition/TrailPlateBirth/activation/renderer tests: 35/35 pass.
- Focused controller diagnostic test: 1/1 pass.
- `npm run build`: pass (Vite emitted its existing chunk-size warning).
- Full `npm test`: **337/338 pass, 1 fail**. `tests/ant-controller.test.js`, “an isolated ant has repeated near-stops after warmup and resumes forward movement,” fails its required `nearStops > 10` assertion for seed `240`; a reproduction measured `nearStops=0`, `moving=3126`. The expectation is a movement behavior contract, not a changed dose/API/diagnostic assertion. It was not weakened. This concrete regression blocks adoption readiness.
- `git diff --check` and `node --check` on research runners: pass.

## Headed browser screen and bounded soak

[`BROWSER-RUNTIME.json`](BROWSER-RUNTIME.json) and [`production-candidate-600s.png`](production-candidate-600s.png) record a headed Chrome `156.0.8078.48` run using the production Vite build, Audio Off, and actual RAF. The model reached 600 simulated seconds after a 600 s real-time RAF warm-up, then ran a 60 s measured screen and 180 s soak. Total measured interval was about `841.7 s` wall and `840.2 s` simulated (`0.9992` sim/wall). Initial field was 316×316; there were zero AudioContexts, page errors, console errors, or failed requests.

During the 60 s screen, RAF interval p50/p95/p99 was `17.9/18.1/18.1 ms`, max `319.1 ms`, with `377.2 ms` accumulated update-clamp loss. During the 180 s soak, the interval max was `126.1 ms` with `26.1 ms` clamp loss. Callback p95 was `2.1/2.2 ms` for screen/soak; p99 `10.9/12 ms`; maximum `67.2/131.8 ms`. Update, snapshot, and decay p95 were `1.8`, `0.5`, and `0.2 ms`. Field stayed finite, sampled max node stayed below `2.0` (end `1.577`, cap `8`), and Plates rose from 41 at screen start to 59 at soak end. Heap samples ranged from `48.1 MB` initially to a `142.7 MB` peak and `101.3 MB` at the last one-second sample; this short run does not certify long-duration stability.

The earlier research G screen reported `35.9 ms` maximum RAF interval and `0.63 ms` clamp loss over 60 s. It used a different Vite server, viewport, warm-up path, and instrumentation; the present larger gaps cannot be assigned to G from this comparison. They remain an operational risk to check in a matched runtime review.

## Reproduction

The natural capture is regenerated with `node scripts/ant-g-production-candidate-natural.js --seconds=600 --seeds=20261005,20261006,20261007 --arms=G --output=docs/ant/evidence/2026-10-25-g-production-candidate-review/data`; then run `node scripts/verify-ant-g-production-candidate-natural.js` from this repository with the pinned parent commit available locally. The fixed-cue runner consumes the pinned write streams, station queries, G frozen rows, and manifest; the output receipt stores every raster SHA and read count. The headed browser runner can be repeated with `node scripts/ant-g-production-candidate-browser.js` after `npm run build`, on a host with headed Chrome and Playwright. `npm test` and `npm run build` cover repository validation.

## Decision and boundary

The API, source-dose conversion, diagnostics, consumer dimensions, fixed raster/raw query behavior, and three-seed natural replay are coherent with qualified G. However, the full suite has one behavior-test failure, and the headed screen includes occasional large frame gaps whose cause is unresolved. Therefore this is **G PRODUCTION CANDIDATE HOLD**, not READY, REJECT, or adoption. No independent review was requested because the preregistered review rule calls for it when all primary gates support readiness, which did not occur.

The smallest next step is to decide whether the isolated-ant near-stop loss is an intended consequence of G or a production-candidate blocker, then resolve it in a separately bounded review without weakening that contract. Do not tune pheromone or movement in this pass. Audio, exhibition-duration reliability, production adoption, and merge were not tested or performed.
