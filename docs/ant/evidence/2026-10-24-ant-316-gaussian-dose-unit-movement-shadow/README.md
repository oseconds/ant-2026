# Candidate G — natural movement shadow

## Decision

**MIXED / HOLD.** In this three-seed, 600-second shadow, Candidate G stayed active, had travel per active-ant-second close to the current production reference, and produced no field-cap or state-invariant failure. However, all three seeds showed lower cumulative occupancy coverage and higher top-10% occupancy concentration than C, alongside a larger high-response tail. Recent occupancy remained broad and varied by seed, so aggregate collapse was not detected; individual-ant trapping was not measured. These consistent concentration and response changes leave the next decision open. This is not production adoption.

The analytic/unit work remains a temporary research contract. No biological or chemical-unit claim follows from this run.

## Provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch: `codex/ant-316-gaussian-dose-unit-movement-shadow-20261024`, created at G evidence tip `336e8dc6e680ff5de3c256e50596581797ce0907`; `origin/main` is an ancestor.
- Preregistration: commit `8ca0fe890d54b1f4c49b1f9f83203609451cf455`; the factor, seeds, measurements, observer checks and stop rules were frozen before these movement outcomes.
- Fixed-cue G package: `docs/ant/evidence/2026-10-24-cic-316-gaussian-dose-unit-qualification/`; its manifest and validation hashes are frozen in `PREREGISTRATION.md`.
- Founder evidence supplied the LCG seed convention and observation formats only. Its historical outcomes were not reused. This run uses current `AntController` defaults, including `materialLocomotionResistance: true`.
- Production source and canonical `docs/ant/README.md` hashes are recorded in [`data/PROVENANCE.json`](data/PROVENANCE.json). Production `src/` and the canonical README were not changed.

## Frozen arms and method

All arms use the same current `AntController`, natural initialization, 60 Hz fixed ticks, recruitment, movement, gait/contact, SurfaceField, Plate birth, and stratigraphy laws. Each run starts with an empty field; there is no warm-up trail, route injection, forced birth, or extra ant placement. Audio is Off and Base remains disabled.

- **C:** 96×96 current production field, unscaled deposit amount, production Gaussian writer and bilinear reader.
- **F:** 316×316 Gaussian field, unscaled legacy node-sum dose.
- **G:** same 316×316 field and reader as F; each deposit amount passed to the writer is multiplied by `3969/361 = 10.994459833795014`.

Each seed runs C, F and G for 36,000 fixed ticks (600 simulated seconds), in that order. The C 30-second route mask is frozen and reused for that seed's F/G comparisons. Same-seed pairing applies to initial state only; behavior-driven movement and RNG call paths diverge afterward.

The instrumentation subclasses `PheromoneField`, calls the inherited writer and decay once, and observes controller returns without resampling the field. Full-run writer arithmetic mismatches were zero. A separate 120-tick observed/unobserved state-hash check passed in each arm, with equal RNG calls and state every tick. The run itself confirms equal arm defaults and identical initial fingerprints within each seed.

## Movement and recruitment

Distances and speeds use normalized world coordinates. `travel / active ant-second` divides total post-collision in-domain travel by integrated active-agent time. Population and activation columns list the 30 / 60 / 120 / 300 / 600 second checkpoints.

| Seed | Arm | Population | Activation | Travel | Travel / active ant-s | Mean / max speed | Blocked / newly blocked frames | Retired / recruited |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | C | 10 / 14 / 20 / 21 / 21 | .141 / .369 / .650 / .757 / .752 | 630.83 | .05584 | .05588 / .11932 | 16,536 / 2,221 | 734 / 754 |
| 20261005 | F | 8 / 8 / 8 / 7 / 8 | .009 / .020 / .027 / .026 / .030 | 272.96 | .05852 | .05854 / .11940 | 2,272 / 372 | 162 / 169 |
| 20261005 | G | 10 / 13 / 17 / 21 / 19 | .148 / .284 / .524 / .827 / .835 | 603.10 | .05551 | .05555 / .11926 | 9,468 / 1,590 | 756 / 774 |
| 20261006 | C | 10 / 14 / 19 / 20 / 21 | .134 / .347 / .590 / .739 / .767 | 619.49 | .05555 | .05559 / .11938 | 17,030 / 2,421 | 668 / 688 |
| 20261006 | F | 8 / 8 / 8 / 8 / 8 | .008 / .014 / .022 / .023 / .020 | 274.77 | .05888 | .05890 / .11942 | 2,372 / 340 | 157 / 164 |
| 20261006 | G | 10 / 13 / 21 / 21 / 22 | .154 / .445 / .756 / .807 / .788 | 613.72 | .05499 | .05503 / .11897 | 9,070 / 1,793 | 793 / 814 |
| 20261007 | C | 10 / 12 / 18 / 19 / 19 | .131 / .330 / .629 / .737 / .775 | 617.07 | .05500 | .05504 / .11943 | 16,632 / 2,132 | 717 / 735 |
| 20261007 | F | 8 / 8 / 8 / 8 / 8 | .011 / .021 / .029 / .033 / .027 | 282.02 | .06064 | .06067 / .11918 | 1,953 / 334 | 178 / 185 |
| 20261007 | G | 10 / 12 / 19 / 21 / 21 | .150 / .295 / .577 / .767 / .834 | 611.08 | .05519 | .05523 / .11932 | 10,214 / 1,708 | 769 / 789 |

Across the three seeds, G's mean speed and travel rate remain near C. G's blocked-frame share was 1.35–1.54% of active-agent frames, between C (2.44–2.54%) and F (0.70–0.85%). All arms reached the existing `4.5 rad/s` observed turn maximum, with zero turn-cap violations. Speed-cap, collision-separation, finite-state, population-ceiling and timeline violations were all zero. The smallest measured surface gap was `−3.66e−8`, within the existing `1e−6` collision tolerance. These aggregate results do not establish whether any individual ant was trapped.

The per-tick 40-bin speed, heading and angular-velocity histograms are in `data/SUMMARY.json`; one-second position snapshots are in each `*-raw.json.gz` file.

## Pheromone dose, field and response

| Arm | Point writes | Requested / accepted dose | Boundary-rejected dose | Max node / cap 8 | Cap touches / saturated updates / loss | Decay calls / simulated seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| C | 312,269 | 16,207.514 / 16,203.757 | 3.757 | 1.0385 / 8 | 0 / 0 / 0 | 108,000 / 1,800 |
| F | 138,535 | 1,400.187 / 1,398.972 | 1.215 | .01404 / 8 | 0 / 0 / 0 | 108,000 / 1,800 |
| G | 305,779 | 272,210.082 / 272,179.484 | 30.598 | 2.3444 / 8 | 0 / 0 / 0 | 108,000 / 1,800 |

No run approached the cap: G's highest node was `2.3444`, leaving `5.6556` units of headroom. No clamp loss occurred. Each run made 36,000 inherited 15-second-half-life decay calls; elapsed decay time was `599.999999999783` seconds per run. Boundary rejection is counted where the writer's return value exposes it.

Native node sums and native-grid quantiles are not directly comparable across 96 and 316 grids. The fixed-grid piecewise-bilinear integral is comparable under this temporary unit convention:

| Seed | Final integral C / F / G | Final native-grid q99 C / F / G | Final native-grid q999 C / F / G |
| --- | --- | --- | --- |
| 20261005 | .024661 / .000166 / .036546 | .2311 / .00253 / .4119 | .4173 / .00423 / .6712 |
| 20261006 | .024102 / .000163 / .034883 | .2349 / .00236 / .4010 | .3754 / .00350 / .7967 |
| 20261007 | .024473 / .000175 / .037414 | .2251 / .00250 / .4016 | .3696 / .00379 / .6963 |

G's summed requested writer dose is 16.80× C across the three runs. Dividing that total by the fixed scale gives `24,758.841`, still 1.53× C's `16,207.514`. This is not a second parameter change: current production computes secretion from travel and its existing adherence-based reinforcement, so G changes adherence and hence later unscaled secretion. This natural feedback is part of the F↔G effect. The divided-dose figure is accounting, not a matched-path counterfactual.

The unchanged nonlinear response is used more strongly under G:

| Seed | Arm | Local strength mean (share in fixed `.975–1` histogram bin) | Coherence mean | Adherence mean | Confidence mean | Far raw mean / max | Far Hill mean (share in `.975–1` bin) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | C | .7110 (48.7%) | .4961 | .4875 | .4824 | .06153 / .7036 | .5117 (17.8%) |
| 20261005 | F | .000259 (0%) | .5936 | .000402 | .000124 | .000571 / .0088 | .000040 (0%) |
| 20261005 | G | .7716 (63.4%) | .6209 | .6515 | .4814 | .13335 / 1.8095 | .6549 (43.4%) |
| 20261006 | C | .6868 (46.5%) | .5008 | .4760 | .4824 | .05922 / .6454 | .4868 (16.9%) |
| 20261006 | F | .000229 (0%) | .5980 | .000368 | .000121 | .000562 / .0071 | .000039 (0%) |
| 20261006 | G | .7919 (64.9%) | .6343 | .6719 | .4978 | .13524 / 1.4227 | .6714 (44.6%) |
| 20261007 | C | .7158 (48.4%) | .5050 | .4982 | .5020 | .06297 / .7102 | .5095 (17.9%) |
| 20261007 | F | .000297 (0%) | .5970 | .000466 | .000127 | .000575 / .0072 | .000040 (0%) |
| 20261007 | G | .7808 (63.3%) | .6208 | .6572 | .4871 | .12968 / 1.7554 | .6648 (43.5%) |

The `.975–1` values are the already-frozen top bins in the 40-bin histograms, not acceptance thresholds. Local steering, coherence, adherence, confidence, raw far response and Hill response histograms are retained in `data/SUMMARY.json`. The G upper-tail increase is real and should be part of any later review. It did not coincide here with cap contact, a fall in active population, loss of movement, or a blocked-frame rate above C.

## Occupancy, contacts and material history

The occupancy measures use the same fixed 64×64 ant-center grid. “Recent” uses the latest 30 seconds. Early-mask shares use the per-seed C mask frozen at 30 seconds and reused for all arms.

| Seed | Arm | Cumulative coverage / entropy / top-10% share | Recent coverage / entropy | Early-mask chemical mass / foot share | Persistent 30s chemical cells / regions |
| --- | --- | --- | --- | --- | ---: |
| 20261005 | C | .909 / .924 / .384 | .192 / .734 | .031 / .022 | 593 / 4 |
| 20261005 | F | .895 / .932 / .371 | .211 / .749 | .025 / .023 | 0 / 0 |
| 20261005 | G | .820 / .907 / .418 | .187 / .732 | .041 / .026 | 1,029 / 4 |
| 20261006 | C | .942 / .930 / .373 | .225 / .755 | .019 / .016 | 683 / 3 |
| 20261006 | F | .906 / .934 / .371 | .196 / .748 | .014 / .015 | 0 / 0 |
| 20261006 | G | .749 / .905 / .416 | .181 / .723 | .017 / .018 | 1,015 / 2 |
| 20261007 | C | .897 / .921 / .384 | .158 / .675 | .015 / .009 | 656 / 2 |
| 20261007 | F | .913 / .932 / .377 | .208 / .745 | .009 / .008 | 0 / 0 |
| 20261007 | G | .826 / .906 / .419 | .231 / .751 | .010 / .009 | 1,054 / 3 |

G has lower cumulative coverage and a higher cumulative top-10% occupancy share than C in all three seeds. That is consistent evidence of greater path reuse/concentration. The absolute occupied range remains broad (74.9–82.6% of the 4,096 cells); recent coverage is 18.1–23.1%, recent entropy varies by seed, and the early C-mask foot share stays 0.9–2.6%. The strongest counterexample is seed `20261006` (G: .749 cumulative coverage, .723 recent entropy versus C: .942, .755). Seed `20261007` moves the other way on recent measures (G: .231 / .751 versus C: .158 / .675). These aggregate measurements neither establish nor rule out individual-ant trapping.

| Seed | Arm | FOOT_CONTACT groups / individual feet | Plate births / first birth | Birth interval range | SurfaceField value sum | Exposed cells / buried layer-cells / max local layers |
| --- | --- | ---: | --- | --- | ---: | ---: |
| 20261005 | C | 35,184 / 104,222 | 29 / 103.02 s | 10–115 s | 2,801.94 | 6,525 / 35,911 / 25 |
| 20261005 | F | 15,214 / 45,310 | 0 / — | — | 1,482.17 | 0 / 0 / 0 |
| 20261005 | G | 33,643 / 99,469 | 36 / 84.02 s | 10–42 s | 2,604.67 | 5,711 / 60,378 / 35 |
| 20261006 | C | 34,535 / 102,250 | 33 / 220.02 s | 10–30 s | 2,794.83 | 6,031 / 44,673 / 32 |
| 20261006 | F | 15,320 / 45,608 | 0 / — | — | 1,501.42 | 0 / 0 / 0 |
| 20261006 | G | 34,237 / 101,243 | 38 / 96.02 s | 10–28 s | 2,617.89 | 6,112 / 70,927 / 35 |
| 20261007 | C | 34,440 / 101,772 | 38 / 145.02 s | 10–33 s | 2,735.03 | 6,033 / 52,006 / 35 |
| 20261007 | F | 15,646 / 46,586 | 0 / — | — | 1,523.72 | 0 / 0 / 0 |
| 20261007 | G | 34,039 / 100,717 | 37 / 92.02 s | 10–36 s | 2,621.08 | 5,783 / 64,286 / 35 |

Across seeds, G produced 111 Plates versus C's 100 and F's zero; G's first birth preceded C's for every matched seed. G foot totals were slightly below C in each seed, while buried layer-cell counts were higher. These are downstream consequences of the changed chemical/movement history; the birth, contact, SurfaceField and stratigraphy rules were not modified. Material accepted-foot counts matched individual foot counts and rejected-foot counts were zero. Sphere births were 32 per C/G run and zero in F.

## RNG, invariants and reproduction

Initial fingerprints match across C/F/G within each seed:

| Seed | Shared initial fingerprint |
| --- | --- |
| 20261005 | `f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd` |
| 20261006 | `535de53424a7fdb6182d3ed6ecc78972a44bf54836a5d7cabe665d0437784ac4` |
| 20261007 | `7443298f0591a3355f73485061e0a6dabbcdd98cac80ef8797f046adcf37f627` |

Final RNG calls were C/F/G: `382305 / 193557 / 349136` (seed 05), `380712 / 193691 / 359032` (seed 06), and `375882 / 193617 / 355554` (seed 07). These are descriptive after-divergence values, not parity requirements.

Every run had zero finite-state, finite-field, finite-SurfaceField, speed-cap, turn-cap, collision, population-ceiling, birth-count, contact-count, monotonic-time, and writer-arithmetic invariant failures. Event/timeline files retain one-second position and contact-count rows, full Plate birth records, event-stream hashes, checkpoint maps, RNG receipts and all distributions. Each run's `SUMMARY.json` and raw gzip data are deterministic.

Reproduce from the repository root:

```powershell
node scripts/ant-316-gaussian-dose-unit-movement-shadow.js --selfcheck
node --test tests/ant-316-gaussian-dose-unit-movement-shadow.test.js
node scripts/ant-316-gaussian-dose-unit-movement-shadow.js --seconds=600 --seeds=20261005,20261006,20261007 --arms=C,F,G --output=docs/ant/evidence/2026-10-24-ant-316-gaussian-dose-unit-movement-shadow/data
```

`data/SHA256SUMS.json` covers 56 scientific/provenance artifacts. [`DETERMINISM-RECEIPT.json`](DETERMINISM-RECEIPT.json) records the first and second generation manifest and summary hashes; a second complete generation in an ignored temporary directory matched both byte-for-byte. Runtime wall-clock receipts are kept separate from scientific hashes.

## Claim boundary and next step

**Supported in this shadow:** G's fixed area-scaled dose did not cause cap contact, non-finite state, speed/turn/collision invariant failure, population collapse, or aggregate movement cessation across these three current-main seeds. Its measured travel rate remained near C and recent occupancy remained broad.

**Reason for hold:** G moved local strength and the unchanged far Hill response toward their upper range, increased cumulative occupancy concentration in all three seeds, produced earlier/more Plates than C, and accumulated more buried material. The current 15-second decay and adherence-based secretion feedback remain active. These effects need interpretation before deciding whether to advance the unit contract.

**Not established:** physical chemical mass, behavior on other seeds or durations, individual-ant trapping, realtime/browser performance, or production suitability. This was direct fixed-tick simulation with Audio Off, not a realtime soak. The next smallest step is a review of the temporary unit contract and its endogenous adherence/reinforcement loop, including whether the consistent concentration shift is acceptable, before any production-candidate proposal. Do not infer natural movement improvement or production adoption from this pass.
