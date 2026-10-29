# Material compaction shielding screen — 2026-10-30

Tested one material-dependent SurfaceField dose candidate independently from the 20% locomotion screen. Production authority was `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; the branch starts at research parent `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a`.

Control and treatment used current-G/H0, seed `20261005`, audio Off, 60 Hz and 600 s. Control matched the frozen production raw run and all 30/60/120/300/600 s field checkpoints. Both arms had identical ant snapshots, all 99,469 contact events and locations, RNG checkpoints, 36 Plate births, and layer maps. Tick-entry layer-map references were replaced only after contact writes when new Plates entered stratigraphy.

Treatment applied `0.025 * (1 - 0.70 * (1 - exp(-L / 4)))` per valid contact. At nonzero L, 67,071 contacts had mean dose factor `0.4977`; aggregate nominal dose input fell 33.9%. At 600 s, SurfaceField mass fell 26.5%, and the 20 anchors in the 580–600 s window (first at 579.933 s) had mean D median down 27.1%. E/F and layer maps stayed exact at all 40 sampled anchors. The D winner stayed entry-near; the outside-entry secondary weakened relative to it. Plate births and paths were unchanged. At 600 s, Nodules were 32 versus 12, but control had reached its 32-Nodule cap and treatment was still birthing near 598.1 s; this supports delayed formation in this seed/window, not permanent suppression. World activity and movement sanity remained intact.

The dose law attenuates contacts at any nonzero layer count, including exposed top-surface contacts. The response self-check compares the same pre-contact state only; later responses can differ as C changes. Audio was Off.

**Decision: MIXED.** C/D feedback is strong and one downstream material outcome changes, but qualified opportunity does not move outward in the sampled windows. This is one seed, not a general rate claim. No production adoption or max-D/X change. No code/evidence from the locomotion screen was used.

See [report](../evidence/2026-10-30-material-compaction-shielding-screen/REPORT.md), [validation](../evidence/2026-10-30-material-compaction-shielding-screen/VALIDATION.md), [independent review](../evidence/2026-10-30-material-compaction-shielding-screen/independent-review.md), and [receipt](../evidence/2026-10-30-material-compaction-shielding-screen/MANIPULATION-RECEIPT.json).
