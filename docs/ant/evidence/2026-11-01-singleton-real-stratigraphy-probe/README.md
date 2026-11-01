# Singleton real-stratigraphy integration probe

**REAL STRATIGRAPHY ADDS MATERIAL DYNAMICS**, limited to retained material/native Nodule history. OVERLAY and REAL are exact movement/environment and B/C formation equivalents through this one seed05, 300 s run. Production formation and default behavior remain unchanged.

- [Report and smallest next question](REPORT.md)
- [Preregistered protocol and descriptor field semantics](PROTOCOL.md)
- [Validation and reproduction](VALIDATION.md)
- [Independent review](validation/independent-review.md)
- [Fresh final report acceptance](validation/report-acceptance.md)
- [Machine independent checks](validation/machine-independent-checks.json)
- [Three-arm summary](analysis/three-arm-summary.json.gz)
- [60 s formation comparison](analysis/formation-comparison-60s.json)
- [Production/research birth comparison and local birth ledger](analysis/production-birth-comparison.json)
- [Stratigraphy chronology, masks, qualification and timer context](analysis/stratigraphy-chronology.json)
- [Nodule lineage](analysis/nodule-lineage.json)
- [Checkpoint world comparison](analysis/checkpoint-world-comparison.json)
- [Conformance gates](analysis/conformance.json.gz)
- [Exact OVERLAY/REAL comparison](validation/overlay-real-exact-comparison.json)
- [Manifest](manifest.json) and [SHA256SUMS](SHA256SUMS)

Raw arm indexes are `analysis/control.signals.json.gz`, `analysis/treatment.signals.json.gz` (OVERLAY), and `analysis/real-stratigraphy.signals.json.gz`. Their adjacent anchor chunks are integral. `readRun()` verifies chunk hashes and restores their logical arrays. Exposure and diagnostics sidecars retain all tick-entry tuples and native lineage. No output is a production formation-law adoption.

## Technical figures

- [Mature X, three arms](visual/mature-x-windows.svg)
- [Production and research-local births](visual/births.svg)
- [Material coverage and layer depth](visual/coverage-depth.svg)
- [Native Nodule births by lineage](visual/nodule-births.svg)
- [Realized travel and population](visual/travel-population.svg)

Figures are compact diagnostics, with separate units and actual 60 s comparison windows. Exact matching OVERLAY/REAL traces can coincide. Audio stayed Off; no sonic or aesthetic result is asserted.
