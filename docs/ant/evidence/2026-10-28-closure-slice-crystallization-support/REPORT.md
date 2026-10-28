# Report — closure-slice crystallization support

## Verdict

**BOUNDED NEGATIVE — accumulation/selectivity failure.** Stage 1 found that C0 can form finite, event-associated solver supports at P1 and P2. The conditional 600 s shadow then showed broadening supports that repeatedly re-inscribe already occupied regions. C0 is therefore insufficient as a selective WHERE contract.

This does **not** falsify working ontology A. It leaves open whether inherited qualified history may belong to a new physical Plate; it shows that selecting all commit-time event-associated qualified history does not provide enough spatial selectivity on its own. C0 is not adopted into production.

## Contract and evidence boundary

At each actual commit, C0 is the union of whole eight-neighbor connected components in `E_qualified` that intersect `H_boundary_length_eligible` at that same analysis. The exact association behavior comes from the prior event-support implementation. Ownership is reported continuously and descriptively; it is not an inclusion filter. Route/network I and principal paths are measured for relation only, never copied into C0. All compiler inputs use `edges: []`.

Stage 1 uses the frozen current-G/H0 seed `20261005` 0–120 s packet. Stage 2 uses the existing current-G 600 s raw packet and field snapshots plus one read-only replay, because the saved 600 s packet contains no per-commit H/E maps. All 36 natural commits were captured without moving or changing them.

## Stage 1 — P1 / P2 viability

| Commit | C0 cells | Grid share | 8-neighbor C0 component sizes | 4-neighbor components / largest | Actual mask: intersection / C0-only / actual-only | Compiled nodes / components | Pickups |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| P1, 84.016667 s | 901 | 9.78% | `[901]` | 58 / 794 | 258 / 643 / 98 | 187 / `[187]` | valid, same component |
| P2, 106.016667 s | 1,172 | 12.72% | `[1172]` | 52 / 1,060 | 416 / 756 / 128 | 223 / `[223]` | valid, same component |

The complete descending 4-neighbor component-size vectors are preserved in `data/stage1.json`. The raw 96-grid masks contain many small four-neighbor islands, but the actual compiler's 96→32 projection produces one connected solver component for each frozen support, with no isolated solver nodes. This is a property of the real compiler projection, not a geometry repair.

Both actual source and target cells lie in C0. P1 contains all 628 H cells, all 122 I cells and all 69 principal-path cells. P2 contains all 758 H cells, all 181 I cells and all 72 principal-path cells. These are descriptive relations, not added gates. Prior event atlas counts are consistent: P1's closing associated set is 901 cells versus 944 cells associated at any event anchor and 530 cells present at every anchor; P2 is 1,172 versus 1,362 and 823.

P1/P2 C0 intersection is 808 cells, with 93 P1-only and 364 P2-only cells; union is 1,265 and Jaccard overlap is 0.639. The actual production masks intersect at 223 cells with union 677 (Jaccard 0.329). C0 is more repetitive between these two commits, but the frozen bodies are not identical and both remain finite at this stage.

### Ownership overlays

All values below are summaries inside C0. No value was used to remove, rank or classify cells.

| Descriptive field | P1 median | P2 median | Included cells with exact zero |
| --- | ---: | ---: | ---: |
| Carried-in chemical | 0.146 | 0.176 | 58 / 901; 66 / 1,172 |
| Post-anchor chemical effect | 0.415 | 0.416 | 0 / 901; 0 / 1,172 |
| Carried SurfaceField | 0.081 | 0.109 | 14 / 901; 12 / 1,172 |
| Post-anchor SurfaceField difference | 0.031 | 0.025 | 116 / 901; 172 / 1,172 |
| Carried FOOT_CONTACT count | 2 | 2 | 181 / 901; 163 / 1,172 |
| Commit-owned FOOT_CONTACT count | 1 | 0 | 449 / 901; 637 / 1,172 |

The overlay confirms that inherited values and commit-owned contribution coexist in the same body. C0 includes many cells with no commit-owned foot count while also including carried history. No ownership field determines support membership.

### Compiler and append behavior

The real compiler accepted both C0 masks using actual pickups and material coefficients. P1's compiled pickup nodes are 115 and 31; P2's are 176 and 35. Each pair maps to the same four-neighbor solver component. The exact per-commit compiler input objects are preserved under each event's `compiler.inputs` in `data/stage1.json`, including 96×96 grid, C0 mask SHA-256, pickup coordinates, material coefficients, `meanHalfWidth`, and `edges: []`. `MaterialStratigraphy` accepted two frozen descriptor clones in P1→P2 order: 808 cells have two layers, 457 have one, and 7,951 have none. The original frozen descriptors' hashes did not change.

**Stage 1 decision: `C0 VIABLE`.** It advances only to the long-horizon shadow.

## Stage 2 — 600 s accumulation shadow

The saved 600 s data was insufficient for exact C0 reconstruction, so current-G seed `20261005` was replayed read-only. The run observed 599 production analyses, captured all 600 per-second position snapshots and all 36 actual commits. The observer matched the live selector and left same-state hashes unchanged at every analysis and every second capture.

Parity checks passed against the frozen current-G records:

- RNG final state and calls: `1884230109`, `349136`
- all 600 second snapshots: exact for ID, position, velocity, heading, angular velocity, adherence, confidence, decision/commit timers and blocked state
- contact counts per second and contact-stream SHA-256: exact
- all 36 commit IDs, times, source/target, grid and frozen-mask hashes; birth-stream SHA-256: exact
- pheromone and SurfaceField arrays at 30, 60, 120, 300 and 600 s: exact

The per-layer trajectory is in `data/stage2.json`; all 36 masks are in `data/c0-masks.json.gz`. Selected points show the change:

| Commit | C0 area | Previous-layer overlap | New area beyond older union | Cumulative union |
| --- | ---: | ---: | ---: | ---: |
| P1 | 901 | — | 901 | 901 |
| P2 | 1,172 | 68.9% | 364 | 1,265 |
| P5 | 2,354 | 69.9% | 655 | 2,793 |
| P10 | 2,833 | 90.3% | 172 | 4,090 |
| P20 | 3,050 | 88.4% | 89 | 5,160 |
| P29 | 2,745 | 71.6% | 98 | 5,659 |
| P32 | 2,774 | 93.1% | 9 | 5,713 |
| P36 | 2,832 | 91.4% | 19 | 5,785 |

Across the first five commits, mean C0 area is 1,602 cells, mean new area is 559 cells, and mean successive overlap (P2–P5) is 71.5%. Across the last five, mean area is 2,774, mean new area is 16.2, and mean successive overlap (P32–P36) is 90.1%.

The 36-layer union occupies 5,785 / 9,216 cells (62.77%). Of those occupied cells, 5,680 have repeated layers; 129 cells receive all 36 layers. Every layer passes the compiler and both pickups occupy the same propagating component. Twenty-eight layers compile as one solver component, four as two, and four as three. The accumulated topology contains 17,867 solver nodes.

No coverage cutoff was used. The negative result follows from the joint trajectory: supports spread broadly, late commits mostly re-cover older strata, and new area approaches zero while local layer counts continue to rise. This is a repeated broad-sheet pattern rather than sustained spatial expansion.

### Relation to the pre-G local-accretion counterexample

The 2026-10-08 decision record describes the pre-G local-accretion shadow as converging toward a dense fan/blob-like component that held 99.43–99.72% of local material; more than half of frozen-cell events re-inscribed previously occupied territory. C0 is a different mechanism and these measures are not quantitatively interchangeable. It nevertheless reproduces the relevant failure family: broad permanent material accumulation with high repetition and little late spatial expansion.

## Interpretation and next priority

Implemented facts: production E/H semantics and all actual commit events remained unchanged; the existing compiler accepted each C0 layer; the read-only replay matched the frozen trajectory and event receipts at the checks listed above.

New measurement: complete event-associated E can be finite and solver-valid at individual commits, yet accumulate into a broad, heavily repeated geography over 600 s.

Inference: `all commit-time event-associated qualified history` is insufficiently selective as WHERE. This does not imply that inherited history is ineligible to become matter, and it does not falsify ontology A.

Artistic interpretation: not assessed. Compiler success and this digital accumulation shadow do not establish perceptual or artistic validity.

**One next research priority:** identify and falsify a separate spatial-selectivity principle while keeping event timing and ownership unchanged. Do not derive a replacement candidate in this pass.

## Limits

One current-G seed, 600 simulated seconds, Audio Off. This does not test multiple seeds, realtime audio density, perception, exhibition behavior, or artistic approval. The replay capture required three attempts: two complete attempts failed capture/receipt assertions before the final capture was persisted and validated. Production and frozen input evidence were not changed.
