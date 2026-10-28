# Result — retired pheromone recursive inscription

## [Implementation]

- Fresh `origin/main` and the research branch starting point were `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Branch: `codex/ant-retired-pheromone-recursive-inscription-20261028`.
- Production source was not changed. The runner creates research-only forks of the production controller and changes only the focal target's registered wide-sensor reads for one target tick.
- The selected case was fixed before motor analysis: earliest residual-free changed choice among 284 eligible cases, tie-broken by numeric ant ID. It is `ant-1`, packet case 120 / wide-choice row 62, target tick 555. The frozen decision timestamp is `9.250000000000039 s`; tick-entry was `9.233333333333356 s`.

## [New measurement]

The frozen input had `Fhat` choose option 2 and `Rhat` choose option 1. The active retired-author contribution was confined to the final candidate's sensor sample (`0.02081848503056003` production signal). At one earlier profile sample, author reconstruction had a signed floating residual of `-5.555764834925524e-9`; it was excluded, not clamped or reassigned.

| Comparison | Result |
|---|---:|
| `F` vs `Fhat` numerical sham | all recorded motor deltas 0 |
| `Fhat` vs `Rhat` final position | `0.000059060205462559164` world units |
| `Fhat` vs `Rhat` velocity | `0.0035436123277513137` world units/s |
| Heading | `0.09950546203095278` rad |
| Angular velocity | `5.970327721857103` rad/s |
| Realized displacement | `0.000059060205462559164` world units |
| Collision scale | 1 in both arms; no collision-scale difference |

The same 14 focal RNG draws were consumed in `F`, `Fhat`, and `Rhat`; all arms ended the target tick at RNG state `1177365620`, call count `2269`. The `F` arm reproduced the frozen after-intention state. The observer-on `F` fork and ordinary production twin matched complete audited world state, events, and RNG.

In the target tick, production order computes intention before movement and gait contact, so the changed decision precedes the resulting focal `FOOT_CONTACT` within that tick. Both causal arms emitted three actual contact points. `Fhat` event time was `9245.464973243423 ms`; `Rhat` was `9245.467403386272 ms`. Their contact centroids were `(0.447620169839287, 0.7741752379105657)` and `(0.4482993982612893, 0.7744243289482644)` respectively, a difference of `0.0007234622272914638` world units. This is a small but nonzero production contact-location difference.

The existing `SurfaceField` was identical across all three forks immediately after its ordinary relaxation and before contact writes (same SHA-256). The target contact points were then actually applied: each arm recorded 3 accepted contact points and `totalFootContacts` rose from 609 to 612. The focal event write changed 13 SurfaceField nodes in `Fhat` (`storedDeltaSum=0.12965287826955318`) and 12 in `Rhat` (`storedDeltaSum=0.12627213913947344`). These node counts and sums are measured across the three foot points in each event; they do not attribute individual field nodes to individual feet. `F` and `Fhat` produced the same post-tick SurfaceField hash; `Rhat` produced a different hash. Thus, in this selected replay, the changed motor output reached a different persistent mechanical field write through true contact positions.

No actual stored focal pheromone dab was observed. The bounded continuation stopped after one extra tick: RNG, schedule, and non-focal events remained aligned, but non-focal state diverged at tick offset 1, so later comparisons were censored. All collision scales in that extra tick were 1. The contact and SurfaceField write preceded this censor.

## [Interpretation]

**Supported for the bounded contact branch of this one case:** removing the retired-author contribution changed the selected wide-sensor option, and the difference reached production movement, changed the focal contact locations, and caused different writes to the existing `SurfaceField`. The final result label is `SUPPORTED — bounded motor-to-SurfaceField contact inscription`.

This establishes a local `past organism → pheromone → focal choice → motor output → later-in-tick contact → mechanical substrate write` path in this replay. The registered continuation did **not** reach a stored focal pheromone dab in both arms; it was censored at offset 1. So this does not complete a longer recursive return path. The resulting trace is in `data/results.json`; the older valid pre-surface receipt and pre-review status receipt are preserved at `data/attempts/valid-run-before-surface-receipt.json` and `data/attempts/valid-run-before-review-correction.json`.

It does not establish how often this path occurs, whether the resulting field difference changes a later ant decision, whether it alters `TrailPlateBirth`, a stored pheromone dab, or any later lifecycle, or whether retired authorship behaves like a persistent social relationship. The event-time gap between the two contact events is only about `0.00243 ms`; perceptual or ecological importance was not tested.

## [Modeling hypothesis]

One next research priority: follow this already-diverged `SurfaceField` state to the earliest later production read or qualification in matched forks, with a fixed censoring rule. This would test whether contact inscription has a downstream consequence without adding a new formation law.

## [Artistic interpretation]

No artistic or perceptual judgment was collected in this causal pass.
