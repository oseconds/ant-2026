# W1 Repeat-birth Contact-locality Audit

- Run date: 2026-10-11
- Branch: `ant-w1-episodic-material-shadow`
- Research input HEAD: `ffd8fcaf419b51e873c8a591e45c958189e8c8b5`
- Production reference: `origin/main` at `fbe3959934158f5a05e51926e89287d503804d05`

## Decision

**Supported for this narrow contact-locality hypothesis.** The three frozen natural archives contain 91 actual Plate births. Five are same-corridor repeats under the production latest-prior, `max(mask IoU, tolerant principal-path overlap)`, threshold-0.6 matching rule. All five have at least 30 individual post-baseline FOOT_CONTACT points in both the matched prior footprint and their own frozen new footprint. Source/mirror matching and counter parity passed for all five; no event-order or archive digest gap was found.

This result says only that the new frozen masks contain archived contacts in these five intervals. It does not establish conversion of contact into material, retained contribution, mechanical loading, cohesion, or a physical formation law. W1 remains **Undecided / Research Gap**.

## Measurements

Counts use all individual valid feet from raw contact rows whose mapped trajectory tick is strictly after the matched prior birth tick and at or before the current birth tick. The prior birth tick is a baseline after all archived contact processing at that tick. Membership classes partition both mask totals:

- `priorMask = intersection + priorOnly`
- `newMask = intersection + newOnly`

| Seed | New Plate ← matched prior | Birth interval (s) | Match channel / score | Prior mask | New mask | Intersection | Prior only | New only |
|---:|---|---:|---|---:|---:|---:|---:|---:|
| 20261005 | `trail-plate-20` ← `trail-plate-5` | 202.000 | tolerant path / 0.6000 | 9,947 | 13,202 | 4,698 | 5,249 | 8,504 |
| 20261005 | `trail-plate-26` ← `trail-plate-6` | 253.000 | tolerant path / 0.6197 | 13,055 | 14,220 | 5,107 | 7,948 | 9,113 |
| 20261006 | `trail-plate-20` ← `trail-plate-8` | 169.000 | tolerant path / 0.6712 | 8,328 | 11,769 | 3,962 | 4,366 | 7,807 |
| 20261006 | `trail-plate-27` ← `trail-plate-18` | 125.950 | tolerant path / 0.6216 | 7,234 | 8,200 | 3,283 | 3,951 | 4,917 |
| 20261007 | `trail-plate-22` ← `trail-plate-16` | 107.000 | tolerant path / 0.6905 | 6,461 | 7,827 | 3,325 | 3,136 | 4,502 |

Each source prior-mask count passes the existing `>=30` gate, and each new-mask count also exceeds 30. The two birth intervals in seed 20261005 share 11,052 individual contact-point keys; the two in seed 20261006 share 1,286; seed 20261007 has one repeat interval. These are reported as overlapping interval observations, not deduplicated across births and not interpreted as extra material amount.

## Provenance and replay contract

The audit uses the committed social archive's 60 Hz trajectory, raw contact/birth archive, paired per-tick hashes, manifest, aggregate summary digests, and the prior birth-time descriptor identity record. All 36,001 trajectory frames per seed were indexed and clock-checked. For every frame, raw contact and birth arrays were grouped by the first saved trajectory frame at or after `event.simulationTimeMs / 1000`; archive row order was retained, then contact and birth batch SHA-256 values were compared to both ON and OFF slots in the paired digest file. Contact and birth aggregate digests also match the archived summaries.

Stored trajectory seconds were never multiplied by 1,000 to assign a tick. Contact milliseconds and descriptor `bornAtSimulationTimeMs` were divided by 1,000 and mapped by lower-bound search. The controller contract was checked in archived commit `a6801d609b82f1f1a0b5030b7c6e4b9b5d2ebe72` and research commit `f543531d8e32d5b1479311c31e3605b39ae9e5c8`: controller tick processes each returned FOOT_CONTACT through `TrailPlateBirth.observeFootContact` before incrementing simulation time and calling `TrailPlateBirth.advance`. Relevant source blob IDs and SHA-256 values are preserved in `data/summary.json`. The research checkout's current `TrailPlateBirth.js` and `AntController.js` blobs match the `f543531` versions; later file differences from `a6801d6` do not change the inspected counter, match, grid mapping, or contact-before-birth contract.

The production `TrailPlateBirth` methods `observeFootContact`, `countFootContacts`, and `findSameCorridorBirth` were used without calling `advance`. A separate mirror reproduced grid indexing, mask/path matching, and cumulative counters; all source/mirror prior IDs and contact counts matched. Each birth's prior baseline counter was reconstructed after all contacts in its mapped tick. Public component-level provenance was not used in place of private ribbon-mask contact count.

## Fixtures and verification

Before archive analysis, the isolated fixtures passed:

- Identical masks and identical contacts yield equal prior/new counts.
- Similar principal paths with different ribbon branches match under production rules. Thirty contacts in prior-only cells pass the prior-mask gate while the new-mask count remains zero, showing the diagnostic can detect locality separation.
- 8-neighbor lookup does not wrap across grid rows.
- Millisecond timestamps map to the first saved frame at or after the event; events beyond the final observation fail closed.

For each seed, the archive contained 35,377–35,751 contact rows and 104,829–105,759 individual feet; the recomputed per-tick contact and birth digests matched all archived paired slots and aggregate hashes. The archived 32/28/31 Plate descriptor identity checks all remain true. The three actual Plate totals sum to 91.

Focused regression command:

```powershell
node --test tests/ant-w1-repeat-birth-contact-locality-audit.test.js tests/trail-plate-birth.test.js tests/ant-controller.test.js
```

Result: 30 tests passed. The audit CLI was run in a second independent Node process; SHA-256 values matched for the summary, all three per-seed JSON/CSV outputs, and artifact-hash manifest. No natural replay, full `npm test`, or build was run; production files are unchanged and the requested validation is archive-level plus focused regression coverage.

## Artifacts and reproduction

Run from the repository root:

```powershell
node scripts/ant-w1-repeat-birth-contact-locality-audit.js
```

The command reruns the two sensitivity fixtures first, validates source archive digests, replays only archived contact rows through the production observer/matcher methods, writes detailed per-seed JSON and CSV, and reports the decision. It does not create candidate Plates or advance the production model.

- [Aggregate decision and measurements](data/summary.json)
- [Input/output SHA-256 and byte sizes](data/artifact-hashes.json)
- [Starting branch, archived/research source blobs, and execution-order provenance](source-provenance.json)
- [Seed 20261005 measurements and event provenance](data/seed-20261005-repeat-births.json) · [CSV](data/seed-20261005-repeat-births.csv)
- [Seed 20261006 measurements and event provenance](data/seed-20261006-repeat-births.json) · [CSV](data/seed-20261006-repeat-births.csv)
- [Seed 20261007 measurements and event provenance](data/seed-20261007-repeat-births.json) · [CSV](data/seed-20261007-repeat-births.csv)

In per-seed JSON, `includedContactEvents` records the original raw contact row and event metadata. Each `footPoints` tuple is `[footOrdinal, gridCell, membershipCode]`, where code `0` means prior/new intersection, `1` prior-only, and `2` new-only. The raw event row and foot ordinal resolve to the unchanged archive position and leg data.
