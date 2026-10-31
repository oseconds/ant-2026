# Protocol

## Authority and input lineage

- Production authority represented by the frozen observations: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Frozen opportunity packet: `codex/ant-local-opportunity-competition-audit-20261031@da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`.
- B/C responsibility: `codex/ant-local-episode-evidence-b-vs-c-20261031@a75b83ce5dbeece36d60d966b9d86fc85ddb5f54`.
- Matched author review: `codex/ant-b-vs-c-author-review-20261031@dfc29559860ec9e6312d2ea556041d956117bc5e`.
- Registered shadow events: `codex/ant-bc-dual-material-shadow-20261031@248da39a4d7d342022a27a5b9ec183cad9b160e`.
- Analysis branch starts at `248da39a4d7d342022a27a5b9ec183cad9b160e`.

The analysis reuses three saved event files (`analysis/events-20261005.json.gz`, `...20261006...`, `...20261007...`) and the matching frozen material/birth observations under `2026-10-31-local-opportunity-competition-audit/analysis/seed-*.signals.json.gz`. It creates no natural-world history.

## Event-to-layer mapping

For each of the 2,089 registered events, save one immutable record containing provenance `B` or `C`, exact `timeMs`, seed, originating track, exact saved X cell indices/hash, center, entry class, and source-event receipt references. No new geometry is built. The X cell set is copied without expansion, dilation, or re-centering.

At each cell, events are grouped only when their numeric `timeMs` values compare exactly equal. A group records all present provenance channels and event IDs. If both channels touch the same cell at that exact timestamp, its group is `{B,C}`. Events in a coeval group have no physical ordering. The globally serialized `layers` array sorts B before C solely for deterministic file output; column views use the grouped chronology and never infer top/bottom order within a tie.

The cell ledger retains every ordered time group, the event-layer count in each group, total B and C layer counts, total time-group count, sequence, coeval count, and top temporal group. “Top” means latest timestamp only.

## Shared descriptions

- Coverage counts cells touched by B, C, both, either, or neither channel. These are separate channel sets, so B-only and C-only are not an exclusive partition from the `both` set.
- Layer-cell incidence is the sum of all event-mask memberships. Mean, q90, and maximum layers are computed over covered cells; the full grid histograms, including zero cells, are retained.
- A strict B→C or C→B transition joins adjacent singleton time groups only. A coeval `{B,C}` group breaks strict adjacency; it is not arbitrarily ordered.
- Alternation and repeated-channel summaries use those same per-cell time groups.
- Entry/non-entry touched-cell counts follow the saved event `entryClass` and count cells in the associated masks. These two sets can overlap. They do not define spatial zones or a new entry threshold.
- Spatial radii use normalized cell centers and the existing entry center `(0.5, 0.72)`; this is descriptive only.
- Fixed 60 s windows are `[start,end)` except the last window, which includes 600 s. Event rates are reported as event counts per fixed 60 s window.

## Snapshot and actual-production context

For requested times 60, 120, 180, 300, 450, and 600 s, choose the latest exact saved shadow event time at or before each request. Read the frozen actual-material grid and actual birth list from the same source anchor; require exact `anchor.timeMs === snapshot.timeMs`. Snapshot maps never combine actual production material with the virtual ledger.

Prototype layer, time-group, B-layer, and C-layer maps use fixed scales across all three seeds and all six requested snapshots. Actual production material uses its own fixed scale across all 599 saved source anchors. Objective context panels show the B and C event masks, virtual state before/after the selected event interval, and actual production material at the later event's exact source anchor.

## Display and semantics

The neutral view draws the accumulated union without provenance color. The diagnostic view shows the latest provenance group, `{B,C}` ties, and a hatch for mixed provenance below the latest group. Count panels separate total event layers, timestamp groups, B, and C. Actual production layer maps are a separate reference panel.

No thickness or display volume is assigned. No B/C-specific density, modulus, damping, audio, locomotion, or compaction values exist. No Plate is instantiated, and no layer is written to production `MaterialStratigraphy`.
