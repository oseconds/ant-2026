# ANT Plate sleep blocker diagnosis

## Run and scope

- Natural run: seed `20261005`, `bornSurface`, 3 ms contact pulse, 75 ms recovery, ×50 Plate damping, normal Z/Sphere/nodule coupling, 35% audio volume.
- Sleep settings remained `SLEEP_STEPS=12000` at 6 kHz (2 seconds), `SLEEP_ENERGY=1e-10`, and force threshold `1e-8`.
- Baseline HEAD: `3a41e6be6784de71e290ff3f6475416ceaeeb883`. Diagnostic source used by the run: `23e24ff21a49965c54a61976068fa5f28fe073f4`; worklet SHA-256: `0d5289950a000ee9aa3264b9b6bdffedd13bca2d28a0bab281be03ca6a45efd5`. Instrumentation and harness commits are `9f07f3c`, `295c7ea`, `dc3efe3`, `23e24ff`, and `2fbb3c5`; they are separate from this evidence commit.
- The 10, 20, and 30 Plate entries below are the worklet summaries captured at those milestones. Detailed per-step tracking covered the current oldest, middle, and newest Plate layers; other layers retained the original sleep check. Each row records when that layer began being tracked.
- The worklet snapshot was requested after the 30-layer milestone and caught the next topology update, so its replay topology has 31 layers. The 30-layer milestone summary remains exactly 30 layers.
- The 30-Plate screenshot was reviewed. The oldest processor layer is `trail-plate-1`; the same-time material history records 650 buried cells, 5 exposed cells, burial through 28 layers, and maximum burial depth `0.04697 m`.
- The earlier interrupted, duplicate-force diagnostic run is excluded from this evidence and all conclusions.

## Selected-layer summaries

Reset counts are wake attempts that reset `energyQuiet`, grouped by cause. Blocker percentages are independent and can overlap. `quiet max/mean` is the maximum streak reached by any node and the mean of each node's own maximum streak. Threshold fractions are nodes reaching 25% / 50% / 75% / 100% of `SLEEP_STEPS`.

| Milestone | Role / layer | Nodes | Direct | Intra-Plate | Z | Sphere | Topology |
|---|---|---:|---:|---:|---:|---:|---:|
| 10 | Oldest `trail-plate-1` | 119 | 20,567 | 230,027,507 | 36,864,355 | 91,375 | 1,428 |
| 10 | Middle `trail-plate-5` | 369 | 13,625 | 79,146,106 | 32,879,115 | 0 | 1,107 |
| 10 | Newest `trail-plate-10` | 332 | 1,217 | 2,297,502 | 967,992 | 0 | 0 |
| 20 | Oldest `trail-plate-1` | 119 | 21,036 | 267,279,637 | 55,525,506 | 2,605,931 | 4,165 |
| 20 | Middle `trail-plate-10` | 332 | 6,955 | 29,975,603 | 20,107,306 | 0 | 1,328 |
| 20 | Newest `trail-plate-20` | 411 | 1,848 | 1,478,144 | 812,517 | 0 | 0 |
| 30 | Oldest `trail-plate-1` | 119 | 21,272 | 286,497,492 | 64,993,072 | 5,929,122 | 6,545 |
| 30 | Middle `trail-plate-15` | 342 | 6,976 | 13,744,925 | 8,318,516 | 0 | 1,710 |
| 30 | Newest `trail-plate-30` | 313 | 575 | 671,147 | 330,413 | 0 | 0 |

| Milestone | Role / layer | Energy blocker | Plate-force blocker | Z-force blocker | Sphere-force blocker | Quiet max / mean | Nodes at 25 / 50 / 75 / 100% |
|---|---|---:|---:|---:|---:|---:|---:|
| 10 | Oldest `trail-plate-1` | 99.95% | 99.99% | 36.78% | 0.01% | 1 / 0.34 | 0 / 0 / 0 / 0% |
| 10 | Middle `trail-plate-5` | 99.95% | 99.99% | 77.88% | 0% | 3 / 0.31 | 0 / 0 / 0 / 0% |
| 10 | Newest `trail-plate-10` | 99.26% | 99.89% | 84.91% | 0% | 2 / 0.09 | 0 / 0 / 0 / 0% |
| 20 | Oldest `trail-plate-1` | 99.48% | 99.94% | 43.71% | 0.11% | 4 / 1.10 | 0 / 0 / 0 / 0% |
| 20 | Middle `trail-plate-10` | 99.94% | 99.99% | 90.18% | 0% | 2 / 0.09 | 0 / 0 / 0 / 0% |
| 20 | Newest `trail-plate-20` | 99.23% | 99.89% | 92.11% | 0% | 1 / 0.06 | 0 / 0 / 0 / 0% |
| 30 | Oldest `trail-plate-1` | 99.51% | 99.95% | 46.59% | 0.27% | 4 / 1.10 | 0 / 0 / 0 / 0% |
| 30 | Middle `trail-plate-15` | 99.92% | 99.98% | 93.50% | 0% | 2 / 0.07 | 0 / 0 / 0 / 0% |
| 30 | Newest `trail-plate-30` | 98.01% | 99.73% | 93.79% | 0% | 3 / 0.09 | 0 / 0 / 0 / 0% |

## Oldest mostly-buried Plate at 30

`trail-plate-1` had 119 solver nodes and 94,094,482 active node-step evaluations. It never slept. Its longest quiet streak was 4 steps; its mean per-node maximum was 1.10 steps; no node reached even 25% of the required 12,000 steps. Its current quiet counter was 0.

| Reset cause | Occurrences | Reset nonzero quiet | Already awake | Asleep → awake | Maximum magnitude |
|---|---:|---:|---:|---:|---:|
| Direct FOOT_CONTACT | 21,272 | 0 | 21,264 | 8 | 0.0288569 deltaV |
| Intra-Plate propagation | 286,497,492 | 2,729 | 286,497,370 | 111 | 0.108183 energy |
| Z / adjacent-layer coupling | 64,993,072 | 844 | 64,993,072 | 0 | 1.2730e-5 combined link force |
| Sphere foundation coupling | 5,929,122 | 0 | 5,929,122 | 0 | 4.8796e-6 modal coupling |
| Topology reinstall | 6,545 | 1 | 6,545 | 0 | 0 (no force magnitude) |

| Sleep blocker | Occurrences | Blocked active steps | Reset nonzero quiet | Maximum magnitude |
|---|---:|---:|---:|---:|
| `quietEnergy >= 1e-10` | 93,637,235 | 99.514% | 1 | 0.108523 |
| `abs(localPlateForce) >= 1e-8` | 94,044,021 | 99.946% | 213 | 0.00373488 |
| `abs(localLinkForce) >= 1e-8` | 43,835,511 | 46.587% | 5 | 7.3713e-6 |
| `abs(localSphereForce) >= 1e-8` | 257,290 | 0.273% | 0 | 3.3772e-7 |

**Diagnosis:** local Plate force is the most persistent blocker, with quiet energy also above threshold on 99.5% of active evaluations. Z force blocks another 46.6% of evaluations, while Sphere force is uncommon. The wake-attempt totals are large, but nearly all are on already-awake nodes and almost none reset a nonzero quiet counter. They are mostly repeated calls to `wakeNode` while its counter is already zero. Direct strikes and topology reinstalls are not the limiting cause for this old layer.

## Diagnostic-only ablations

The harness replayed the exact post-30 snapshot and the first 2,500 recorded physics steps (0.417 seconds). No topology message fell in that short interval. A/B/C replayed 1,033 natural strike messages; D skipped them. The `SLEEP_STEPS` threshold was not reached by any condition in this short comparison.

| Condition | Oldest energy blocker | Plate-force blocker | Z-force blocker | Sphere-force blocker | Oldest max quiet | Sleeps |
|---|---:|---:|---:|---:|---:|---:|
| A. Full system | 100% | 99.99% | 88.47% | 4.19% | 0 | 0 |
| B. Sphere coupling off | 100% | 99.99% | 88.48% | 0% | 0 | 0 |
| C. Z adjacency off | 100% | 99.99% | 0% | 4.19% | 0 | 0 |
| D. Direct strikes off after snapshot | 100% | 99.99% | 85.83% | 4.20% | 0 | 0 |

The short ablations agree with the natural counters: removing Sphere or Z coupling did not unblock energy or Plate force, and disabling direct strikes did not change the oldest layer's quiet streak in this window. These are diagnostic harness conditions only; they do not modify production topology or behavior.

## 10-second controlled decay replay

The exact 30-layer snapshot at physics step `1,534,928` was replayed for 60,000 steps (10 s) in each condition. All started with the same dynamic-state hash. No strike or topology messages were applied; the 30-layer captured topology remained fixed in all four cases, and D explicitly had topology frozen. The captured contact-force ring was preserved, but the oldest Plate had no pending direct-contact forces. The diagnostic-only runtime hooks read already-computed recurrence forces and quiet energy; `surface-plate.worklet.js` was not changed.

Signed work uses the solver-space discrete proxy `force × midpoint velocity`, not physical joules. Damping is shown as positive dissipated work. The complete per-second Plate energy proxy, quiet-energy proxy, cumulative and interval work, active-node count, and quiet streak are in `decay-10s-diagnosis.json`.

| Condition | First sleep | Nodes asleep at 10 s | Signed Z work | Signed Sphere work | Damping dissipated | Oldest direct-contact input |
|---|---:|---:|---:|---:|---:|---:|
| A. Full network, no new strikes | 6.0502 s | 119 / 119 | `-2.7885e-7` | `+2.7274e-9` | `1.0009e-4` | 0 |
| B. Z off, no new strikes | 5.9933 s | 119 / 119 | 0 | `+2.7130e-9` | `1.0037e-4` | 0 |
| C. Sphere off, no new strikes | 6.0500 s | 119 / 119 | `-2.7903e-7` | 0 | `1.0008e-4` | 0 |
| D. Z and Sphere off, topology frozen | 5.9932 s | 119 / 119 | 0 | 0 | `1.0036e-4` | 0 |

**Result:** the oldest Plate sleeps in every condition, including D, so its internal decay and sleep path work from this snapshot. Z coupling removes a small net amount of solver-space energy from the oldest Plate; Sphere contributes only a tiny positive amount relative to damping. The 10 s results identify continued natural excitation as necessary to explain why the Plate stayed awake in the seeded run; the captured state itself does not exhibit a numerical floor that prevents sleep.

## Runtime and artifacts

- The short exact-state Node harness check used a 10-layer / 3,080-node OFF preflight snapshot, one OFF warmup, and two paired 2,500-step OFF/ON runs. OFF samples were 14.512 s and 8.791 s; ON samples were 32.903 s and 26.840 s. Final solver-state hashes were identical. The measured all-layer detail branch was approximately 127% slower by the reported two-sample median, so the capture was narrowed to current oldest/middle/newest detail before the natural diagnostic run.
- In separate natural Chrome runs at 9 Plates, OFF windows were 0.43–0.47× audio time per wall second and the selected-layer ON windows were 0.22–0.24×. The selected-layer run later reached a worst window of 0.068× and finished with the page simulation about 295 seconds ahead of AudioContext time. The processor still captured the 30-layer milestone and post-snapshot state, but timing was materially degraded; do not interpret it as real-time audio performance.
- Main run ended at page simulation 553.03 s, 31 page Plates / 32 nodules, with the post-30 snapshot at physics step 1,534,928 and its 12,592-step follow-up ending at 1,547,520.
- `sleep-milestones.json`, `summary.json`, `worklet-state-snapshot.json.gz`, `snapshot-following-2s.json`, `ablation-2500-step.json`, `capture-state.json`, `polls.jsonl`, `windows.jsonl`, and the three milestone screenshots preserve the captured data. `overhead-preflight/` holds the diagnostics-OFF state, stream, run metadata, and OFF/ON result.
