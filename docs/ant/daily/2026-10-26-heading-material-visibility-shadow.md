# Heading × material visibility shadow — 2026-10-26

## Question and baseline

Test whether production fixed-north recruitment heading and bundled routes make retained material harder to distinguish, using a 2×2 diagnostic with production vs isotropic accepted headings and production vs fixed-alpha-96 material. Fresh `origin/main` was `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; the branch started from the prior material-shadow commit `8fc9041dd1fdb9979a23616db175df9a34be978d`.

## Observed intervention and rendering results

- H0 reproduced the previous seed-20261005 current-G capture exactly across 1,142 frame-state hashes, four milestone state hashes, RNG/event totals, first Plate timing and four M0 milestone PNGs.
- H1 uses the existing accepted-heading draw with the survey's isotropic `wrap(−π+2πU)` mapping. Accepted heading sample: 123 draws across 12 angular bins, circular resultant 0.1169; no other spawn law changed.
- Initial H0/H1 state diverges at tick 0; their RNG stream first differs at tick 71. These are matched-seed intervention runs, not same-state worlds.
- H0 first Plate: tick 5,041 / 84.0167 s; endpoint: 114.0167 s; 2 Plate births, 4,061 contacts, 677 occupied material cells.
- H1 first Plate: tick 4,501 / 75.0167 s; endpoint: 105.0167 s; 2 Plate births, 4,353 contacts, 967 occupied material cells.
- M0/M1 share every snapshot within each world. M1 used RGB 100 and alpha 96 only on the occupied material mask. Its endpoint pixel differences stayed within the one-cell material support band.
- The four native videos and 16 milestone stills are indexed in the [evidence report](../evidence/2026-10-26-heading-material-visibility-shadow/README.md). Human interpretation remains pending.

## Validation and boundary

Focused tests passed 45/45, full `npm test` passed 342/342, and `npm run build` passed with existing dependency annotation and bundle-size notices. No heading preference, ontology judgment, alpha tuning or production adoption is recorded. Cross-heading differences are consequences of the heading intervention in these two runs, not a renderer-only effect.
