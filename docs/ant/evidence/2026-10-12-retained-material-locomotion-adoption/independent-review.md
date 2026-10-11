# Independent Review — Retained Material Locomotion Adoption

**Verdict: PASS. No blocking findings.**

## Review findings

- **Low, non-blocking — historical A/B wording:** The 2026-10-11 A/B README describes “accumulated exposed stratigraphy” and “exposed layer-count.” The implemented input is `layerCountByCell`, an aggregate local column count that includes underlying layers. The current adoption docs clarify that individual buried-Plate identities are not inputs. This older wording remains imprecise but does not undermine the adoption claim.
- **Resolved before commit — log preservation:** The reviewer found that `.log` files were matched by the repository's `*.log` ignore rule. The validation logs were renamed to `.txt`, and their README links were updated so the evidence package includes them.

## Verification

- The production equation and one-time application remain unchanged. The only production behavior change is the constructor default becoming On.
- The snapshot is read at tick entry; stratigraphy advances later in the tick. The new focused test starts with zero layers, changes the fake stratigraphy to L=10 during end-of-tick `advance()`, verifies tick one matches explicit Off, and verifies tick two applies the L=10 multiplier.
- The conformance JSON reports exact matches across all 14 state fields for all three seeds: explicit Off against the saved shadow and prior A/B Control, default On against explicit On, and explicit On against prior A/B Treatment.
- Historical evidence/replay runners pin explicit Off, preserving pre-adoption replay conditions without changing the production default.
- Canonical docs distinguish the implemented law, supported A/B result, and authored modeling choice. They do not claim biological friction, individual buried-Plate sensing, consistent Plate-birth/coverage direction, or completion of full-world circulation.
- Stored validation logs report 4/4 focused tests, 298/298 full tests, and a successful build.

**Review limits:** Read-only review; no files changed by the reviewer. The reviewer checked saved outputs and did not rerun tests, builds or experiments.
