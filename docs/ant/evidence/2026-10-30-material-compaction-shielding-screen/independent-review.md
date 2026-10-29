# Independent review

A fresh-context review examined the candidate runner, production tick ordering, matched-run receipt, late-window maps, and report. It made no repository edits and ran no additional simulation.

## Review result

The evidence supports a conditional causal claim for this matched seed: reducing the contact dose at nonzero tick-entry layer count lowered later SurfaceField C/D and delayed Nodule formation within the 600 s observation window. Contact timing, location, order and count, ant snapshots, Plate births, layer maps, and recorded RNG checkpoints remained matched. The control raw packet matches the frozen production packet byte-for-byte.

The review confirmed the no-future boundary: contacts use the tick-entry `layerCountByCell` array reference; `TrailPlateBirth` and stratigraphy updates follow the contact loop and replace the layer map. This assumes the existing tick-entry array is not mutated in place during that interval.

The 32-versus-12 Nodule counts are censored by the control's 32-Nodule cap. Treatment was still birthing near 598.1 s. The observation supports delayed formation for this seed and horizon, not permanent suppression or an uncapped final-count comparison.

The max-D winner remained entry-near. The sampled outside-entry separated D structure weakened relative to it; no outward opportunity shift was shown. This agrees with the **MIXED** decision: strong C/D effect and a downstream timing/count consequence, without qualified E/F movement or an outside-entry opportunity gain.

## Limits

- One seed and a 600 s horizon; no between-seed variance or longer-term outcome.
- Audio was Off; audio consequences were not checked.
- The law attenuates every new valid contact at any cell with `L > 0`, including exposed top-surface contacts. “Buried material shielding” is an authored analogy, not a directly isolated buried-layer mechanism.
- The self-check establishes unchanged contact response and count for the same pre-contact state; later response values can differ as C diverges.
- `tickEntryRevision` may differ because Nodule state contributes to stratigraphy revision; it is not the layer-count map read by the candidate.
