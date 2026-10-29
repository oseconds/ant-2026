# Material compaction shielding screen

## Decision

**MIXED.** Material-dependent contact dose caused a large, stable reduction in slow mechanical memory: treatment SurfaceField mass at 600 s was 26.5% lower, and mean full-grid D median across the 20 late sampled anchors was 27.1% lower. C and D changed at every sampled anchor; the qualified E and F maps stayed identical at all 40 anchors. The max-D winner moved by one nearby grid row but remained entry-near; the separated outside-entry D structure became weaker relative to that winner. Plate births and stratigraphy stayed identical, while treatment had 12 Nodules at 600 s versus the control's 32-cap.

The candidate therefore changes mechanical conditions and one downstream material outcome, but this matched run does not support a meaningful outward redistribution of the qualified opportunity landscape. No zero-ant, locomotion, population, contact, RNG, or solver pathology appeared. The control reached the 32-Nodule cap, with its last birth at 485.9 s; treatment was still birthing, with a last birth at 598.117 s. The 12-versus-32 endpoint difference indicates delayed formation in this seed and window, not permanent suppression or an uncapped final count.

## Question and authority

Does partial shielding of new FOOT_CONTACT compaction on already materialized ground weaken repeated-entry conditioning enough to reorganize later D and would-be max-D opportunity, while production retains the current 10% locomotion resistance?

- Production authority: `origin/main` = `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a`.
- Branch: `codex/ant-material-compaction-shielding-screen-20261029`.
- Natural comparison: current-G/H0, seed `20261005`, 600 s, 60 Hz, audio Off.
- Current 10% retained-material locomotion law stayed On in both arms.
- This is independent of the 20% locomotion-strength screen. No candidate code or evidence was transferred from that screen.

## Candidate and causal boundary

For the tick-entry local layer count `L`, treatment uses:

```text
s(L) = 1 - 0.70 * (1 - exp(-L / 4))
effective contact dose = 0.025 * s(L)
```

The dose factors are `L=0: 1.0000`, `1: 0.8452`, `2: 0.7246`, `4: 0.5575`, `8: 0.3947`, and `16: 0.3128`; the limit is 0.30. The `/4` layer scale is an authored convention shared with the existing locomotion law, not a claim that both feedbacks describe the same physical effect.

The runner wraps each controller tick, retains the production tick-entry `layerCountByCell` array reference, then wraps only `SurfaceField.depositContact`. Valid contact filtering, pre-write response calculation, response footprint, `totalFootContacts`, spatial kernel, relaxation, D sampling, TrailPlateBirth, MaterialStratigraphy, audio, and the production locomotion law remain on their native code paths. When material is added, `MaterialStratigraphy` builds and assigns a new layer-count array after the tick's contact loop. Runtime receipts confirm all 36 same-tick Plate birth notifications observed that replacement after contact processing. No later birth can change the array already read by that tick's contacts.

The no-future test uses the layer-map reference and replacement semantics; it does not copy 9,216 layer values on every tick. Direct self-checks prove exact empty-ground identity, and unchanged response and contact count for the same pre-contact state at `L=0` and positive `L`; positive `L` yields a lower write. Later responses may differ because C itself has changed. Full controller snapshots, contact events, Plate records and RNG checkpoints verify that the wrapper has no direct collateral effects.

## Matched A/B and conformance

Both arms begin from the same initial-state fingerprint. The control reproduces the frozen production trajectory exactly: all 600 per-second ant snapshots and contact buckets, all Plate records and event hashes, plus pheromone, SurfaceField, occupancy and persistent-chemical maps at 30/60/120/300/600 s. The control raw packet SHA-256 is `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`.

Across control and treatment, all 99,469 valid contacts match in tick, order, position and tick-entry layer count. Their full FOOT_CONTACT stream hashes, contact count buckets and agent snapshots are identical. All 36 Plate birth records and their stream hash are identical. RNG state and call count match at all five saved checkpoints and at the end. Per-contact `tickEntryRevision` is allowed to differ because Nodule state contributes to stratigraphy revision; it is not the layer-count snapshot used by the shielding law.

## Results

The 600 s control recorded 32,398 contacts at `L=0` and 67,071 at `L>0`. Treatment therefore preserved every contact while reducing the nominal aggregate dose input from `2,486.725` to `1,644.500` (33.9%); mean `s(L)` over materialized contacts was `0.4977`. The first attenuated foot was at 84.033 s with `L=1`, shortly after the first Plate at 84.017 s.

At 600 s, SurfaceField mass was `2,604.666` in control and `1,913.760` in treatment (−26.5%). C median was `0.2936 → 0.2077`; C p90 was `0.5662 → 0.4101`. Across the 20 anchors in the 580–600 s window (first anchor `579.933` s), mean D median was `0.2908 → 0.2119` (−27.1%). At the two spatial map anchors, 5,928/9,216 C cells and 6,265/9,216 D cells differed at 599.25 s. These are large field changes, not just a contact-dose receipt difference.

Qualified geography did not follow those changes. E and F maps were exact in all 40 anchors across the 280–300 s and 580–600 s windows. At 599.25 s both arms had E=2,931 and F=1,813; F had 29 components with largest size 1,746. Layer maps were also exact in all 40, while C and D maps differed in all 40. At the 599.25 s anchor, the would-be max-D index moved from `6289` to `6385`, with D `0.9649 → 0.9496` and entry distance `0.0391 → 0.0298`. Material overlap at those winner cells was 6 layers in control and 1 in treatment; the most recent 20 s had 8 and 9 feet there. The strongest separated outside-entry center changed from index `4950` (distance `0.1955`, D `0.7309`, 19 layers, 75.7% of the winner) to index `5509` (distance `0.1631`, D `0.5270`, 14 layers, 55.5% of the winner). Across these 20 late anchors, mean top2/top1 was `0.7562 → 0.5741`. The outside-entry structure did not approach the winner.

Natural route and Plate formation stayed the same: 99,469 contacts, 33,643 contact groups, 603.098 total travel, 10,865.633 active ant-seconds, 19 active ants at 600 s, 36 Plate births, and identical Plate/layer maps. Finite-state, speed, turn, overlap, and population-ceiling violations were all zero in both arms. Nodule births differed: control reached its 32-Nodule cap, while treatment had 12 at 600 s (6 versus 1 at 300 s). Treatment still had a late Nodule birth near 598.1 s. This is a real downstream timing/count difference by the observation horizon; it does not estimate an uncapped final count or generalize beyond this seed.

## Interpretation and limits

This authored local law clearly weakens new compaction on materialized ground and lowers later C/D. However, the sampled D winner remains near the entry, outside-entry relative D weakens, E/F geography stays fixed, and Plate/layer formation does not reorganize. Nodule formation changes materially. The evidence supports **MIXED**, rather than PROMISING or a field-only NEGATIVE.

The claim is limited to one current-G/H0 seed and two 20 s windows near 300 s and 600 s, with 40 retained qualification anchors. The dose law attenuates every new valid contact at a cell whose layer count is nonzero, including exposed top-surface contacts; it is an authored local condition, not a direct measurement of buried-layer shielding. The run does not estimate between-seed variance, an uncapped Nodule count, or whether viewers would perceive the change. Audio was Off. Max-D is a read-only diagnostic; allocation remains max-D and capture remains X. No acceptance cutoff, selector change, UPDATE, or adoption is proposed.
