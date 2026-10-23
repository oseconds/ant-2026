# Direct outgoing-flow recruitment vs isotropic recruitment

## Design and provenance

Six fresh natural simulations compare production movement with the exact isotropic heading law or the preregistered current-tick outgoing-flow heading law. Each ran for 600 simulated seconds at 60 Hz, with seeds 20261005, 20261006, 20261007. This is a three-seed descriptive comparison; per-seed traces, not a statistical significance claim, are the evidence. The availability gate had already passed before these candidate runs.

Flow is measured from completed postcollision segments from the current tick before the accepted end-of-tick heading. Eligible segments use midpoint annulus `0.018 < r <= 0.085`, speed at least `0.008`, positive radial travel, one segment per distinct ant, and equal-weight unit displacement vectors. `N < 3` or zero resultant falls back to the exact isotropic heading `-π + 2πU`. For valid flow, `theta = wrap(phi + (2U−1) * (π−(π−0.3)R))`. No position remapping or additional random draw is used. Initialization is isotropic in both candidate arms because it has no completed movement; the old production north founder is not included in this pair.

Each run contains a source snapshot; the run driver hash is `a3fb6c614a47896ebb4c7d03fa782ae5e0e73c46dd0a703f3bdcaa1214f8510c`, and the field-helper hash is `fb6d5caeafcbc009b1b373edb681d9e8505454d05924284822c4682fea261364`. The runner checked live source hashes before and after each run. Result-file hashes are in `paired-comparison.json`.

| Seed | Policy | Valid all-tick flow | Accepted post-init spawns with valid flow | Mean R at valid flow spawns | Actual applied half-spread mean, all accepted (radians) | Flow-law spread mean at valid opportunities (radians) | Total RNG calls | Spawned / retired |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | isotropic | 6465/36000 (17.96%) | 157/794 (19.77%) | 0.4486 | 3.1416 | 1.8669 | 353736 | 795 / 778 |
| 20261005 | flow | 5778/36000 (16.05%) | 127/794 (15.99%) | 0.4431 | 2.9404 | 1.8825 | 349953 | 795 / 773 |
| 20261006 | isotropic | 6372/36000 (17.70%) | 142/800 (17.75%) | 0.4637 | 3.1416 | 1.8239 | 347580 | 801 / 782 |
| 20261006 | flow | 5934/36000 (16.48%) | 138/786 (17.56%) | 0.4491 | 2.9178 | 1.8654 | 342598 | 787 / 772 |
| 20261007 | isotropic | 6317/36000 (17.55%) | 151/815 (18.53%) | 0.4627 | 3.1416 | 1.8268 | 349350 | 816 / 801 |
| 20261007 | flow | 5477/36000 (15.21%) | 137/820 (16.71%) | 0.4987 | 2.9051 | 1.7244 | 345620 | 821 / 804 |

For isotropic cases, the all-accepted applied spread is `π`, while the final spread column is a hypothetical flow-law spread computed at measured valid-flow spawn opportunities. For flow cases, the final column is the spread actually applied at valid-flow opportunities; all invalid-flow spawns remain isotropic. The accepted valid-flow count/fraction in the table is the fraction of post-init spawns that received the flow-directed heading in a flow case.

Invalid flow reason counts use each condition's own outcome history. The tick column covers all 36,000 ticks; the spawn column covers post-init accepted-spawn opportunities. The initialization founder has no completed travel and is listed separately.

| Seed | Policy | Invalid tick-flow reasons | Invalid post-init spawn-flow reasons | Initial founder flow reason |
|---:|---|---|---|---|
| 20261005 | isotropic | insufficient-count: 29535 | insufficient-count: 637 | insufficient-count |
| 20261005 | flow | insufficient-count: 30222 | insufficient-count: 667 | insufficient-count |
| 20261006 | isotropic | insufficient-count: 29628 | insufficient-count: 658 | insufficient-count |
| 20261006 | flow | insufficient-count: 30066 | insufficient-count: 648 | insufficient-count |
| 20261007 | isotropic | insufficient-count: 29683 | insufficient-count: 664 | insufficient-count |
| 20261007 | flow | insufficient-count: 30523 | insufficient-count: 683 | insufficient-count |

Applied heading validation reconstructed each accepted heading from its recorded `U` and flow record. Across all six runs, each accepted spawn has exactly one recorded heading uniform; isotropic headings and invalid-flow fallbacks match `-π + 2πU`, and valid-flow headings match the fixed formula. Maximum circular reconstruction error was at most `1e-12 rad`. The first accepted spawn is one isotropic initialization founder in every case. Later random-call totals and event times can diverge after different headings alter the natural simulation; equal initial seeds do not preserve downstream random streams.

## Continuous outcomes

Measurement naming: the legacy `meanSpeed` column is mean **one-second net-displacement rate**, not integrated path length per second. The one-second polarization and angular-momentum diagnostics also use those interval net vectors; they are not instantaneous velocity observations. These definitions matter when comparing conditions that alter turning. The raw schema is retained for provenance.

The primary fixed window is seconds 301–600; seconds 1–300 is reported as a time-order comparison. Values below are paired mean differences (flow minus isotropic), one mean per run and then descriptive across three seeds. The full 600 one-second paired points per seed are retained as `continuousPhasePortraits` in the JSON output; these are continuous trajectories, not state or mode counts. Within-run SD and lag-one autocorrelation are shown separately for centroid radius.

| Metric | Per-seed last-300 s deltas (05 / 06 / 07) | Mean of three seed deltas | Positive-negative-zero seeds |
|---|---:|---:|---:|
| population | 0.2600 / -0.6100 / -0.1533 | -0.1678 | 1-2-0 |
| centroidRadial | 0.0041 / -0.0298 / -0.0029 | -0.0095 | 1-2-0 |
| gyrationRadius | 0.0054 / -0.0127 / -0.0042 | -0.0038 | 1-2-0 |
| meanSpeed | -0.0007 / -0.0011 / 0.0004 | -0.0005 | 1-2-0 |
| velocityPolarization | -0.0242 / 0.0077 / -0.0019 | -0.0061 | 1-2-0 |
| angularMomentumSigned | -0.0155 / -0.0083 / 0.0340 | 0.0034 | 1-2-0 |
| angularEntropy | 0.0072 / 0.0079 / 0.0239 | 0.0130 | 3-0-0 |
| pheromoneMass | 7.8344 / -12.8844 / -4.1364 | -3.0621 | 1-2-0 |
| pheromoneAxisConcentration | 0.0191 / 0.0158 / -0.0071 | 0.0092 | 2-1-0 |

| Seed | Window | Isotropic centroid radius: mean ± SD; lag-1 ρ | Flow centroid radius: mean ± SD; lag-1 ρ | Flow − isotropic mean |
|---:|---|---:|---:|---:|
| 20261005 | first300 | 0.1260 ± 0.0738; ρ₁ 0.9285 | 0.1213 ± 0.0548; ρ₁ 0.8815 | -0.0047 |
| 20261005 | last300 | 0.1348 ± 0.0547; ρ₁ 0.8888 | 0.1388 ± 0.0524; ρ₁ 0.8922 | 0.0041 |
| 20261006 | first300 | 0.1358 ± 0.0491; ρ₁ 0.8586 | 0.1569 ± 0.0716; ρ₁ 0.9112 | 0.0210 |
| 20261006 | last300 | 0.1423 ± 0.0446; ρ₁ 0.8253 | 0.1125 ± 0.0586; ρ₁ 0.9022 | -0.0298 |
| 20261007 | first300 | 0.1391 ± 0.0649; ρ₁ 0.9233 | 0.1524 ± 0.0574; ρ₁ 0.8790 | 0.0133 |
| 20261007 | last300 | 0.1441 ± 0.0502; ρ₁ 0.8373 | 0.1413 ± 0.0459; ρ₁ 0.8443 | -0.0029 |

The paired centroids and continuous descriptors should be read alongside each seed’s time series. These summaries do not call a persistent spatial regime, biological role, or material improvement. Pheromone axis is the runner’s directional resultant from its 16 sampled radial-sector activations; null angles are excluded from its angle-derived metrics, and the valid count is recorded by `count` in each JSON series summary.

## Divergence and limits

| Seed | First event-order difference (index; isotropic vs flow time; headings) | Isotropic RNG calls | Flow RNG calls | Isotropic spawned | Flow spawned |
|---:|---|---:|---:|---:|---:|
| 20261005 | 27 (50.3000 s vs 50.3000 s; U 0.0736 / 0.0736; flow valid true; N=3, R=0.5032, phi=1.0989; headings -2.6794 / -0.3610) | 353736 | 349953 | 795 | 795 |
| 20261006 | 6 (4.0167 s vs 4.0167 s; U 0.9016 / 0.9016; flow valid true; N=3, R=0.3351, phi=0.2690; headings 2.5232 / 2.0273) | 347580 | 342598 | 801 | 787 |
| 20261007 | 3 (1.8333 s vs 1.8333 s; U 0.5549 / 0.5549; flow valid true; N=3, R=0.3559, phi=-1.3397; headings 0.3449 / -1.1059) | 349350 | 345620 | 816 | 821 |

Event-order indices in the table are zero-based within each accepted-spawn record. The flow policy conditions only accepted-spawn heading on a signed local transport estimate. Valid-flow exposure is reported separately at every tick and at accepted spawn times; invalid ticks use isotropic headings. These runs do not isolate the flow estimator from endogenous availability changes after trajectories diverge. No pheromone-conditioned recruitment, movement alternative, combined mechanism, or longer extension is included. Material remains a downstream readout of unchanged production selection/history and should not be interpreted as renewed empty space or as evidence of a biological process.

The run outputs, snapshots, continuous frame traces, spawn event records, source hashes, and exact `U` values remain in the six sibling case folders. This pass makes no production adoption decision.
