# Candidate I: exogenous G-budget replay control

**Decision: A-FEEDBACK NOT REQUIRED** for the tested cumulative occupancy-concentration pattern under this frozen G schedule. I remained similarly concentrated to H at 600 s, without a consistent cumulative broadening across seeds. This does not show that aggregate adherence feedback has no effect.

## Question and provenance

This pass asked whether the current colony's adherence state must set the aggregate reinforcement budget to retain the concentration observed under G/H. It used a research-only causal control. It did not change production behavior.

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` (re-fetched before the I run).
- Parent H evidence tip: `d7326467016478670afc10d0407c9d641cc6b1c2`.
- Research branch: `codex/ant-g-aggregate-adherence-budget-control-20261025`.
- Preregistration and harness commit: `797be5a`.
- Frozen G budget commit, created before I outcomes: `4aedc42`.
- Parent G movement shadow: `336e8dc6e680ff5de3c256e50596581797ce0907`.
- Parent H result: `5c415b34184d88ffbbbb042450288e254a495508`, with documentation correction at `d7326467016478670afc10d0407c9d641cc6b1c2`.
- Reused H archive manifest SHA-256: `7b50c2c5cabd395e61d1acfeb7b7f901bda10ec2eee624d3fa149d8b71292f70`.

The source law was rechecked against current production: baseline `0.5 × (0.75 + 0.25E)`, reinforcement `5 × A²`, and `amountPerUnitDistance = 4.5`. G and I use the same 316×316 Gaussian field, `R=0.0045`, `σ=0.00225`, dose scale `3969/361`, and bilinear reader.

## Intervention

G's intact-G per-tick reinforcement request was frozen before I ran. Each seed has exactly 36,000 binary64 little-endian values in `data/frozen-g-budgets/`. The values are unscaled accrued requests before the G dose factor.

For I, each tick distributes that frozen request uniformly over the actual travel in I:

```text
D_I(t) = Σ_i d_i
U_I(t) = B_G_ref(t) / (4.5 × D_I(t))   when B_G_ref(t)>0 and D_I(t)>0
reinforcementMultiplier_i = U_I(t)
```

The baseline remains ant-local and E-dependent. Current I adherence is still measured and can affect ordinary movement behavior, but it does not set I's reinforcement budget. If a positive frozen budget had no I travel, the run would stop; no such tick occurred. I's G-derived quantity schedule is external forcing, not a proposed production law.

## Frozen budget and replay validation

Each series contains 36,000 values and 288,000 bytes. Second generation reproduced all package files byte-for-byte.

| Seed | Frozen G budget file | SHA-256 | Cumulative unscaled reinforcement at 600 s |
| --- | --- | --- | ---: |
| 20261005 | `seed20261005-G-reinforcement-budget.f64le` | `acdef13c7581cfb98896e5ed542cc1af53ab58e2ee1fe789a2eb018d2e736352` | 6,782.880842 |
| 20261006 | `seed20261006-G-reinforcement-budget.f64le` | `bde279eeef6fc4dce0ff21d70c787a92d49b96182e5aa3c01c095f7a836aacfc` | 7,246.977672 |
| 20261007 | `seed20261007-G-reinforcement-budget.f64le` | `bee232e64963b7a2cbe8abc24148c576cdb87e9d6d17cfb638932d04420e7553` | 6,859.952363 |

The fresh G freeze replay matched each parent result summary, initial fingerprint, raw timeline, and all five checkpoint maps exactly. Its 36,000 per-tick budgets per seed matched the already validated H-pass G ledger exactly. I began from the matching initial fingerprint for each seed.

Across all 108,000 I ticks, requested reinforcement matched the frozen value within the derived binary64 roundoff bound. Maximum absolute residual was `5.55e-17`; the largest per-tick bound was `2.21e-14`. No tick had positive reference budget with zero travel. I's source accounting closed. Observer on/off state parity passed for 120 ticks per seed with zero added RNG calls. All three I runs were repeated; normalized results, raw timelines, checkpoint maps, and source ledgers were byte-identical.

The G schedule totals and checkpoint budgets are in `data/frozen-g-budgets/BUDGETS.json`; exact series and receipt hashes are in its `SHA256SUMS.json`. Per-tick I reference/request/residual values are retained in each I source ledger.

## Dose and field results

Dose values below are source requests in the legacy node-sum units, before multiplication by the G area scale. They are not field-accepted mass.

| Seed | Arm | Baseline | Reinforcement | Total | Reinforcement / travel |
| --- | --- | ---: | ---: | ---: | ---: |
| 20261005 | G | 1,274.721 | 6,782.881 | 8,057.602 | 11.247 |
| 20261005 | H | 1,330.858 | 7,472.964 | 8,803.822 | 11.999 |
| 20261005 | I | 1,273.708 | 6,782.881 | 8,056.589 | 11.279 |
| 20261006 | G | 1,303.786 | 7,246.978 | 8,550.763 | 11.808 |
| 20261006 | H | 1,284.598 | 7,143.973 | 8,428.570 | 11.819 |
| 20261006 | I | 1,290.707 | 7,246.978 | 8,537.684 | 11.978 |
| 20261007 | G | 1,292.902 | 6,859.952 | 8,152.854 | 11.226 |
| 20261007 | H | 1,322.915 | 7,308.933 | 8,631.848 | 11.785 |
| 20261007 | I | 1,311.962 | 6,859.952 | 8,171.915 | 11.128 |

I reinforcement totals equal the frozen G totals at each 600 s endpoint. H's totals differ because H computes its shared budget from its own current state and divergent trajectory. Complete G/H/I source and movement values at 30/60/120/300/600 s are serialized in `data/i-results/SUMMARY.json`.

| Seed | Arm | Field requested, scaled | Field accepted, scaled | Boundary rejected, scaled | Pending dab, unscaled | Max node ever | Cap hits / saturation loss |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 20261005 | G | 88,583.709 | 88,563.901 | 19.808 | 0.480 | 2.344 | 0 / 0 |
| 20261005 | H | 96,785.006 | 96,754.634 | 30.372 | 0.752 | 3.158 | 0 / 0 |
| 20261005 | I | 88,570.970 | 88,508.874 | 62.096 | 0.625 | 3.510 | 0 / 0 |
| 20261006 | G | 93,999.840 | 93,998.435 | 1.404 | 1.017 | 2.049 | 0 / 0 |
| 20261006 | H | 92,659.921 | 92,622.745 | 37.175 | 0.697 | 3.194 | 0 / 0 |
| 20261006 | I | 93,854.437 | 93,837.946 | 16.490 | 1.163 | 3.405 | 0 / 0 |
| 20261007 | G | 89,626.533 | 89,617.147 | 9.386 | 0.882 | 2.194 | 0 / 0 |
| 20261007 | H | 94,892.889 | 94,852.414 | 40.475 | 0.875 | 3.109 | 0 / 0 |
| 20261007 | I | 89,836.990 | 89,817.406 | 19.585 | 0.800 | 3.183 | 0 / 0 |

No arm reached cap `8`; saturation loss was zero. I boundary rejection and pending carry are reported separately from accepted field dose. The per-checkpoint writer counters and captured I pending-dab state are also in `SUMMARY.json`.

## Occupancy and movement

Occupancy uses the corrected 64×64, 60 Hz observer. Coverage is the fraction of cells ever occupied in that histogram; top-10% share is the share of all recorded ant-position samples in the `ceil(4096 × .1) = 410` most-visited cells. Recent metrics use the prior 30 s; at 30 s they use the initial 30 s. These are gridded concentration proxies, not measures of contiguous colony structure.

| Seed | Arm | 600 s cumulative coverage | 600 s cumulative top-10% share | Recent coverage | Recent normalized entropy |
| --- | --- | ---: | ---: | ---: | ---: |
| 20261005 | G | .8196 | .4180 | .3467 | .8124 |
| 20261005 | H | .7837 | .4215 | .3682 | .8241 |
| 20261005 | I | .8416 | .4136 | .3628 | .8247 |
| 20261006 | G | .7490 | .4161 | .3674 | .8290 |
| 20261006 | H | .8240 | .4220 | .3643 | .8219 |
| 20261006 | I | .7944 | .4284 | .3909 | .8277 |
| 20261007 | G | .8257 | .4185 | .3687 | .8260 |
| 20261007 | H | .8164 | .4182 | .3574 | .8237 |
| 20261007 | I | .8079 | .4233 | .3616 | .8248 |

Across seeds, I did not consistently reduce cumulative concentration versus H: cumulative top-10% share fell in one seed and rose in two; cumulative coverage rose in one and fell in two. Recent coverage was higher in two seeds and lower in one; recent entropy was slightly higher in all three. These are mixed metric directions, while final cumulative top-10% shares remain close (`.4136–.4284`). The complete checkpoint series is in `SUMMARY.json`.

| Seed | Arm | Total travel | Travel / active-ant-s | Final population | Blocked frames | Recruited / retired | Invariant violations |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | G | 603.098 | .055505 | 19 | 9,468 | 774 / 756 | 0 |
| 20261005 | H | 622.810 | .054721 | 19 | 9,586 | 825 / 807 | 0 |
| 20261005 | I | 601.378 | .055158 | 23 | 11,365 | 784 / 762 | 0 |
| 20261006 | G | 613.718 | .054991 | 22 | 9,070 | 814 / 793 | 0 |
| 20261006 | H | 604.426 | .053914 | 19 | 12,949 | 790 / 772 | 0 |
| 20261006 | I | 605.033 | .055048 | 21 | 9,632 | 816 / 796 | 0 |
| 20261007 | G | 611.080 | .055186 | 21 | 10,214 | 789 / 769 | 0 |
| 20261007 | H | 620.206 | .055068 | 21 | 9,956 | 822 / 802 | 0 |
| 20261007 | I | 616.462 | .055248 | 22 | 10,355 | 797 / 776 | 0 |

I remained moving in all seeds. It did not collapse population or locomotion. No finite, speed-cap, turn-cap, overlap, or population-ceiling violations occurred. Blocked-frame differences changed direction by seed.

## Response and allocation

Whole-run local response means and high-adherence allocation are descriptive. The preregistered high-A convention is `A ≥ 0.75` from the existing 40 bins.

| Seed | Arm | E | A | A² | Far Hill | Travel share at A≥.75 | Reinforcement share at A≥.75 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | G | .7716 | .6515 | .4824 | .6549 | 43.05% | 65.35% |
| 20261005 | H | .8134 | .6826 | .5148 | .6986 | 46.88% | 48.21% |
| 20261005 | I | .7852 | .6721 | .5030 | .6667 | 45.56% | 46.23% |
| 20261006 | G | .7919 | .6719 | .5052 | .6714 | 46.39% | 68.13% |
| 20261006 | H | .7947 | .6773 | .5094 | .6771 | 46.34% | 48.08% |
| 20261006 | I | .8101 | .6815 | .5149 | .6903 | 47.04% | 47.80% |
| 20261007 | G | .7808 | .6572 | .4861 | .6648 | 42.75% | 64.72% |
| 20261007 | H | .8073 | .6758 | .5055 | .6981 | 45.74% | 47.32% |
| 20261007 | I | .8017 | .6726 | .5018 | .6849 | 44.57% | 45.15% |

I's high-A reinforcement share stayed near its travel share, consistent with uniform-by-travel allocation. G's per-ant `A²` law assigned a larger reinforcement share to high-A travel. I's current A distribution still influences ordinary sensing/movement, but not its frozen total reinforcement budget.

| Seed | I `U(t)` p50 | p90 | p99 | max | H max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 2.498 | 3.414 | 4.460 | 6.110 | 3.733 |
| 20261006 | 2.658 | 3.628 | 4.626 | 7.246 | 3.660 |
| 20261007 | 2.458 | 3.318 | 4.300 | 7.093 | 3.819 |

`U_I` was not clipped. Its higher maxima reflect the frozen budget divided over I's actual tick travel. No cap or saturation pathology appeared. This remains part of the control's behavior and a limit when interpreting the spatial outcome.

## Downstream world observations

These are descriptive consequences, not primary causal endpoints.

| Seed | Arm | FOOT_CONTACT groups / feet | Plate births / first birth (s) | Final Plate count | SurfaceField sum | Activation |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | G | 33,643 / 99,469 | 36 / 84.02 | 36 | 2,604.666 | .8347 |
| 20261005 | H | 34,737 / 102,704 | 38 / 70.02 | 38 | 2,647.227 | .8466 |
| 20261005 | I | 33,518 / 99,112 | 43 / 91.02 | 43 | 2,631.093 | .8431 |
| 20261006 | G | 34,237 / 101,243 | 38 / 96.02 | 38 | 2,617.885 | .7883 |
| 20261006 | H | 33,691 / 99,659 | 41 / 81.02 | 41 | 2,601.270 | .8730 |
| 20261006 | I | 33,757 / 99,892 | 36 / 84.02 | 36 | 2,585.231 | .8586 |
| 20261007 | G | 34,039 / 100,717 | 37 / 92.02 | 37 | 2,621.084 | .8344 |
| 20261007 | H | 34,586 / 102,326 | 42 / 87.02 | 42 | 2,654.904 | .8561 |
| 20261007 | I | 34,349 / 101,696 | 33 / 111.02 | 33 | 2,617.608 | .8284 |

The event and material differences follow divergent natural trajectories. They do not establish an independent Plate-birth or material effect of aggregate adherence feedback.

## Decision and claim boundary

**A-FEEDBACK NOT REQUIRED** for the tested cumulative concentration phenotype under the frozen same-seed G budget schedule: removing I's current-state A→aggregate-budget dependence did not consistently broaden cumulative occupancy. H and I differed by seed and metric, but I retained a similar cumulative top-10% share in all three runs. No gross movement collapse explains this result.

This does not prove aggregate A feedback has no effect. It does not show that total pheromone amount alone causes concentration, establish a suitable production law, or make exogenous reinforcement biologically appropriate. Baseline secretion still depends on current E; current A still affects normal behavior; I's per-distance multiplier depends on actual travel; and the external schedule came from each seed's intact-G trajectory. No dose matching, gain tuning, production adoption, or follow-up candidate was performed.

An independent read-only review found no manipulation, sequencing, or accounting blocker. It confirmed that I never reads its current A to form `B_ref`, and that per-tick equality applies to accrued source requests before field acceptance. The reviewer also noted that these occupancy summaries are spatial concentration proxies, not contiguous-colony measures, and that three seeds without a registered equivalence margin cannot establish equivalence or exclude smaller effects. `U_I` reached `6.11–7.25`, above G's per-ant multiplier ceiling of `5`; this is a property of the tested frozen-budget-per-travel allocation and was not clipped.

## Reproduction and files

- Frozen input: `data/frozen-g-budgets/` (`BUDGETS.json`, exact `.f64le` series, `VALIDATION.json`, `DETERMINISM.json`, `SHA256SUMS.json`).
- I results: `data/i-results/SUMMARY.json`, `VALIDATION.json`, `SHA256SUMS.json`, plus per-seed raw timeline, five checkpoint maps, and full compressed source ledger.
- The per-seed I source ledgers contain the 36,000 frozen/reference/request/residual tick records, 40-bin E/A/A² summaries, corrected 60 Hz occupancy time series, field writer checkpoints, and pending dab carry.
- Preregistration: `PREREGISTRATION.md`.

Reproduction commands from the repository root:

```powershell
node --test --experimental-test-isolation=none tests/ant-g-adherence-coupling-control.test.js
node scripts/ant-g-adherence-coupling-control.js --selfcheck
node scripts/ant-g-adherence-coupling-control.js --freeze-g-reference --output <fresh-output-directory>
node scripts/ant-g-adherence-coupling-control.js --run-i --frozen docs/ant/evidence/2026-10-25-ant-g-aggregate-adherence-budget-control/data/frozen-g-budgets --output <fresh-output-directory>
```

Production `src/` and canonical `docs/ant/README.md` are unchanged. The current production hashes, H archive manifests, frozen budget SHA values, and I result hashes are in the JSON receipts. Focused research tests passed. Full suite/build were not run because production/runtime source was not modified.
