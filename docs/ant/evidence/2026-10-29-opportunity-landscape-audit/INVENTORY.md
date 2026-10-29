# Evidence inventory and provenance boundaries

Production authority was freshly fetched `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`. Research parent is `b0ecad708bff8421cd01c384e4a3dad34203a3f2`. No new simulation or replay was performed for this audit.

## 1. Primary exact synchronized sequence — used

Git object: `0d5096a920e1ebb2086fa1dae782c5d4e871b590:docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz`.

- Gzip 17,766,995 bytes; SHA-256 `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`.
- Decoded JSON 69,227,056 bytes; SHA-256 `fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339`.
- Schema `ant-omitted-history-packet-v1`; current-G/H0, seed 20261005, original 60 Hz, Audio Off; original recorded main `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- 120 actual analysis snapshots, tick 1 through 7141, model 16.666667 ms through 119016.666667 ms. The final 120 s world checkpoint is not another saved qualification map. No time interpolation.
- Full 96-grid A projection, B memory/B mask, raw SurfaceField C, full diagnostic sampled D, qualified E, thinned F, source/boundary representations G/H, selected I/path/ribbon, and actual material union maps. D is a full diagnostic readout; production `buildSupportedMask` only populates its support array where chemical qualification passes.
- 4368 timestamped contact groups, 12954 individual feet; all 12954 are in the domain and valid for this extraction. These are feet, not ants/visits. No full 60 Hz kinematic trajectory is present.
- Two complete actual Plate birth descriptors, at 84016.66666666823 ms and 106016.66666667463 ms, actual masks 356/544 cells. Actual material can be reconstructed at these snapshots without inventing strata or using C0.

Compatibility: original `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`→fresh main source/static Git diff is empty. The 11 recorded production source-file byte hashes match the current checkout in this environment. TrailPlateBirth LF SHA is `cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67`; SurfaceField SHA is `182b70f589bec7de427a97a4f14f3823b2bd474f6c49c90c59b17c306990c096`. The former raw CRLF hash differs from its LF receipt; this is not a behavior-version mismatch.

Inherited capture validation: 7201 tick-chain comparisons, unchanged observer state, 120 analyses selector parity, exact endpoint pheromone/surface and first birth. Contact prefix counts and observer-internal 120 s hash are checked; the original 600 s digest is not falsely claimed to be a 120 s digest. This audit adds frozen-input checks, not a new live-world parity experiment.

## 2. Original current-G longer corpus — limited context used

Path on verified main: `docs/ant/evidence/2026-10-25-g-production-candidate-review/data/`.

- Seeds 20261005/006/007, G arm, saved checkpoints 30/60/120/300/600 s: 15 snapshots used. Each stores 96-grid surface and pheromone projection plus 64-grid body-center occupancy, a persistent-chemical mask and early-route context.
- The G production-adoption [validation](../2026-10-25-g-production-adoption/VALIDATION.md) and [natural conformance](../2026-10-25-g-production-candidate-review/NATURAL-CONFORMANCE.json) verify the three saved G traces and checkpoints against production. These are not pre-G natural outcomes.
- All compressed snapshot hashes are checked against stored `data/SHA256SUMS.json`; each exact path/hash is retained in `data/frozen-input.json.gz` and the final manifest.
- Derive D only by pure current `SurfaceField.sampleSupport` from saved C, no relaxation/deposition/field evolution. This provides **unconditioned mechanical context**, not E/F or a qualified opportunity count.
- No stored B-memory/E/F sequence at those late states. Projected pheromone, persistent 30 s chemical membership, early-route mask and occupancy are not substitutes for B/E/F or material. Occupancy was inventoried but not used as a foot-contact channel.

Original seed 20261005-G raw 600 s packet gzip SHA is `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`. It has 600 per-second agent snapshots/contact-count buckets and 36 actual birth receipts with mask hashes. It has no contact coordinates or actual mask arrays. The 600 s checkpoint gzip SHA is `cb0bf577c000138a9f8a25ec3f4d5b6c7e686c34da5726ceaafd0eff38a9c7dc`. Exact 600 s qualified opportunity dynamics remain unavailable from this corpus.

## 3. Actual 36-Plate mask reference — used, masks only

`docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz`, gzip SHA `a62ad65b772db8d040ed9bebf636e8af32d2d185ea65fead4a431262964df0e5`.

This is an existing 600 s current-G/H0 seed 20261005 read-only replay artifact. All 36 descriptor IDs, times and byte-mask hashes were independently matched against the original raw 600 s receipt list; 36/36 exact. Its first two masks also match the primary 120 s packet exactly. Only those verified actual masks are imported to reference pre-existing Plate layers at seed 005's five longer checkpoints. Seeds 006/007 have no material-mask reference in this audit.

The earlier audit disclosed a PheromoneField source-version caveat for its replayed event-time field samples. Those replay field/context samples are **not** imported here. Hash-matching actual masks do not turn the artifact into a complete 600 s B/E/F/D packet. Detailed depth/top-layer/Nodule/retained-load observations are not needed for this audit.

## 4. C0 replay packet — inventory/counterexample only

Pinned `6e9ab09b6c3ddf286b23b61fc58081e50f76ece0:docs/ant/evidence/2026-10-28-closure-slice-crystallization-support/data/read-only-replay-capture.json.gz`, gzip SHA `f08e1b6a0272a974e71932201ed166bc04a4af6410e7ee269297a9d07d64918a`.

It stores 599 production analyses as summaries, 600 per-second position snapshots, contact counts, five surface/projected-pheromone checkpoints and 36 C0 shadow masks/descriptor clones. It does not provide full per-analysis B/E/F/D or raw foot coordinates. **Its `frames[].descriptor.mask` is C0**, not the actual Plate mask. P1 has 901 cells and byte hash `b00a677b…`, while the separately stored actual mask hash is `3a5a0f5a…` for 356 cells.

An initial inventory interpretation confused those roles. Direct byte hashes, occupied-cell counts and `descriptorFor(payload,mask)` source corrected it before material conclusions. The separate stratigraphy artifact above supplied verified actual masks later. Neither C0 masks nor hashes alone were treated as actual material pixels. Previous evidence was not rewritten.

## 5. Slices and excluded substitutions

The authored law/upstream sensitivity/EMERGENCE/peak–saddle analyses reuse ten P1/P2 anchors, not a longer history. UPDATE/event-evolved scope contain 42 early event anchors; these remain slices of the same primary packet. They supply definitions/parity controls, not extra independent runs.

Pre-G local accretion, interior-endpoint and natural-Nodule 600 s evidence are historical counterexamples only. None supplies current-G opportunity counts or temporal identities here. No excluded archive scan was required.

## 6. New compact extract

Final gzip SHA `e823394144b164b25de03beef3b1497442533463c120b6109338a3659a41643e`. Each frame retains exact E/F/S coordinates, B/C/D values on S, exact-cell/recent-neighborhood foot summaries, last recorded local contact age, pre-material layer counts and full-field maximum references. Raw peaks/groups/correspondences are in `data/measurements.json.gz`.

The initial extract SHA `c8265281…` preceded discovery of the separate 36-mask reference. `data/input-evolution.json` proves the final extract differs only by that secondary actual-material addition: removing it reproduces the original gzip hash. Primary 120 frames SHA remains `154ec4a4f3efb2be4c929c30f9e1493094340db56f235a918d425032e8eb256a`. No primary field/contact values or method were changed to affect outcomes.
