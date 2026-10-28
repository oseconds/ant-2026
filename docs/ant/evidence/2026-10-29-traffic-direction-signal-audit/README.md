# ANT traffic direction signal audit

Decision: **INDEPENDENT INFORMATION OBSERVED** in the narrow descriptive/representational sense. Deterministic reconstructions of the frozen current-G P1/P2 windows record signed movement and tick-level turning that a static unoriented I graph cannot encode. Local scaffold-specific, statistical, or causal independence is not established; the global-direction countermodel nearly reproduces the pooled axial-alignment result. This one-seed, two-event measurement does not validate a Plate body-generation law.

## Contents

- [PLAN.md](PLAN.md) — frozen scope, windows, association and measurements
- [REPORT.md](REPORT.md) — findings, counterevidence, limits and decision
- [VALIDATION.md](VALIDATION.md) — replay parity and deterministic extraction checks
- [SHA-256 manifest](hash-manifest.json) — hashes and canonical byte lengths for package files, runner and daily record; text normalizes CRLF to LF, binary files use raw bytes (the manifest excludes itself)
- [Technical signal atlas](atlas.html) — P1/P2 selected I, actual 60 Hz movement, edge-direction glyphs and complete junction list
- [analysis.json](analysis.json) — quantitative summaries, edge and junction rows, parity receipts
- [motion-samples.json.gz](data/motion-samples.json.gz) — associated per-tick position, velocity, heading, turn and nearest-edge records
- [frozen-event-inputs.json.gz](data/frozen-event-inputs.json.gz) — copied frozen P1/P2 event descriptors and fields
- [frozen-parity-anchors.json.gz](data/frozen-parity-anchors.json.gz) — compact checks extracted from the pinned current-G history packet
- [runner](../../../../scripts/ant-traffic-direction-signal-audit.js) — read-only deterministic replay and measurement code

The frozen source history packet is retained at commit `0d5096a920e1ebb2086fa1dae782c5d4e871b590`, path `docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz`, SHA-256 `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`. The package stores its exact hash, current-G source hashes, event contact digests, births and event-time map hashes in the compact parity anchor instead of duplicating the 17.77 MB packet.

No production source, renderer, body generator, material law, or event/ownership semantics changed.
