# Independent post-run review

## Scope and receipts

This is a bounded, read-only reconstruction from the saved CONTROL, OVERLAY, and REAL STRATIGRAPHY arms. I did not rerun the controller, edit implementation, or execute audio. The checked run is seed `20261005`, 300 model seconds at 60 Hz, Audio Off, on code commit `2a0cb35b6c19cdf969d8c887b2eb4577fcb361b6`, with production authority `bc045dc3caa5954df633ecbee37fbabcb8224f30`.

The conformance receipt is `PASS`: all three arms have 300 anchors; CONTROL and OVERLAY each have 18,000 tick hashes; current CONTROL matches the frozen 300-anchor baseline and saved CONTROL; OVERLAY plus exposure exactly matches the saved seed-05 treatment; REAL reached 300 seconds without the 256-Plate stop. Chunk hashes were checked while reading the raw signal runs. Source receipt hashes and machine-readable reconstruction results are in [machine-independent-checks.json](machine-independent-checks.json).

## Exact material reconstruction

I decoded the final 160 immutable Plate masks in insertion order and reconstructed all 9,216 columns. This recovered 151 research-local Plates and 9 native production Plates. The reconstructed layer-count map, top-Plate index map, and native Float32 depth array match the saved arrays exactly. The depth reconstruction follows the native top-to-bottom Float32 accumulation and excludes each column's bottom foundation.

The final material has 14,271 layer-cell incidences across 4,824 covered cells. Its full-grid distribution is 4,392 cells at zero layers, 1,457 at one, 920 at two, 799 at three, 647 at four, 438 at five, 300 at six, 154 at seven, 66 at eight, 39 at nine, 2 at ten, and 2 at eleven. Nearest-observed `q50=1`, `q90=5`, `max=11`.

Research layers account for 2,498 incidences: 863 top and 1,635 buried. Production layers account for 11,773 incidences: 3,961 top and 7,812 buried. The exact final per-cell count of research-local masks equals the OVERLAY arm's increment map. All 151 insertions resolve to one source singleton decision, and each decision's X cells equal its insertion receipt, birth receipt, chronology mask, and retained immutable Plate mask. Decision time, descriptor birth time, actual insertion time, and chronology time agree for every insertion. Same-time native production inserts precede research inserts; accepted coeval research masks are disjoint.

## Movement and exposure relative to OVERLAY

REAL and OVERLAY match exactly in all 18,000 environment/movement fingerprints, all tick-entry effective layer tuples, all per-tick D counts, all 336 B/C event records and decision/X structure, and the native production-Plate birth history. The treatment and real exposure JSON files have the same SHA-256, confirming the full exposure receipts are byte-identical.

Independent arithmetic over the 18,000 tick-entry rows reproduces 268,721 ant-ticks, 52,564 exposed ant-ticks across 361 unique ants, 52,564 applicable speed calls, 52,564 changed A turn-rate calls, and 4,255 changed D same-flow headway targets. The layer histograms and each saved `m`, `qA`, and `hD` production/effective value match the source formulas. The 4,255 D count also matches the exposed-row flags and each per-tick total.

The first local insertion is `research-local-X-0001` at `42016.66666666628 ms` (tick 2521), with source events `20261005:B:6:I002` and `20261005:C:7:I002`, channels B/C, and X cells `[7708, 7804, 7900, 7996]`. The immediately following tick-entry is recorded at that same simulation-clock value, as expected from the controller's completed-tick convention. No ant was on those cells and no ant had research-layer exposure at that entry. The first recorded direct exposure is at tick 2642, `44016.66666666599 ms`, about two model seconds later. This supports the insertion boundary and exposure arithmetic; it does not show an immediate ant movement response on the insertion tick.

## Nodule material responsibility

The research insertions did not themselves change any sampled native Nodule predicate: 2,498 changed-cell before/after readings had zero false-to-true and zero true-to-false transitions. Candidate timers were already inactive at all sampled cells; there were zero active timers cleared or changed. Native Nodule engine state and the production birth engine state were unchanged across each insertion. The later Nodule differences should not be attributed to resetting an active timer.

The native Nodule path was nevertheless exercised by retained research-bearing columns. Checkpoint Nodule counts were CONTROL `[0, 0, 1, 2, 5]`, OVERLAY `[0, 0, 0, 2, 5]`, and REAL `[0, 0, 1, 1, 6]` at 60-second intervals. REAL produced six native Nodule entities; three have research-local source Plates, and all three have a research-local foundation. Their saved source stacks were independently rebuilt from masks and insertion chronology at each Nodule's birth cell and time:

- `buried-sphere-1`, 176.5 s: foundation `research-local-X-0002`, five layers, 4 buried, 6.92 mm, compaction 0.6732, local foot load 463.
- `buried-sphere-4`, 245.633 s: foundation `research-local-X-0002`, seven layers, 6 buried, 10.20 mm, compaction 0.6672, local foot load 480.
- `buried-sphere-5`, 288.9 s: foundation `research-local-X-0011`, six layers, 5 buried, 8.24 mm, compaction 0.5837, local foot load 397.

For the structural contract check, I passed all 160 decoded final Plate descriptors and six saved Nodules through the pure `compileSurfaceTopology` function, with the reconstructed native layer order/counts/top map. It compiled 3,316 solver nodes and 3,077 adjacent links; the compiled 96-grid top routing, layer counts, and order exactly match the reconstructed saved material. No AudioEngine, SurfaceAudioBridge, worklet, enabling, contact, or sound execution was involved. This is a topology contract check, not an audio or listening result.

## Interpretation

For this seed and horizon, REAL STRATIGRAPHY is **close to OVERLAY in the primary movement and B/C formation loop**: the effective tick-entry layer inputs, movement/environment fingerprints, source event/decision structure, and native production births are exact matches.

The run also supports **REAL STRATIGRAPHY ADDS MATERIAL DYNAMICS** in the narrower and directly measured sense that it exercises the native Nodule subloop over research-bearing stratigraphy. REAL's Nodule births have different timing and lineage, and three entities are founded on research-local Plates. The class rests on those native outcomes, not on topology differences alone. No active candidate-timer reset mediated them in this run.

This remains a one-seed, 300-second result. Uniform fixture material values and the default thickness are modeling inputs, not measured B/C material properties. Nothing here establishes audio validity, natural material identity, generality across seeds, or production adoption.
