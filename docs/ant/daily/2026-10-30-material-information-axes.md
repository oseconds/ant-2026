# 2026-10-30 — Material information axes

- **Question:** Does `layerCountByCell` describe nearly all current material information, including at organism feedback read points?
- **Baseline:** pinned production `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; current-G/H0 seed `20261005`, 60 Hz, 600 s. A/D candidates and residence Off; adopted production layer-count slowdown On.
- **Source audit:** depth excludes the foundation thickness and is almost determined by L in this history. Width/thickness, chemical/stiffness/damping, support/density, and SurfaceField cell/support are deterministic source families. Derived density is saturated at 1.2 for observed top Plates. Foot load is cumulative and nondecaying.
- **Replay:** one observer-only replay was needed for full birth descriptors and consumer rows; frozen raw/checkpoint, RNG, counts, late fields/maps, and Plate receipts matched exactly.
- **Measurement:** across 40 late maps, same-L1 within-anchor IQR was positive for age, thickness, top chemistry/support, current compaction/support, and foot load at all 40 anchors. Consumer view contained 423,002 material-exposed ant ticks and D view 32,366 finite same-flow opportunities; L1 represented 11.15% and 13.84% of those views. Same-L distributions remained broad at actual read points.
- **Decision:** **MULTI-AXIS.** L nearly compresses burial depth but not top birth properties, age, current compaction, or contact history. Foot load and SurfaceField remain strongly associated. No feedback axis was assigned and production stayed unchanged.
- **Next question:** at actual native turn calls and fixed L, does the exposed top Plate's stored birth-property family add descriptive information about turn demand/outcome after current SurfaceField context is accounted for?

Full measurements and validation: [`REPORT.md`](../evidence/2026-10-30-material-information-axes/REPORT.md) and [`VALIDATION.md`](../evidence/2026-10-30-material-information-axes/VALIDATION.md).
