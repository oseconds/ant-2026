# Current-G Plate formation gate research

**Completed at Gate 4: artist judgement about materialization-event support is required.** See [GATE-REPORT.md](GATE-REPORT.md) for findings and decision. No production law, renderer, audio or canonical status changed.

## Provenance

Production: fresh `origin/main@aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`. Research parent: `fd2a42875cc93eedeb319eae14b0e8de21e429d7`. Branch: `codex/ant-plate-formation-gate-20261028`.

One new observed production-H0 current-G replay: seed `20261005`, 60 Hz, Audio Off, 0–120 s. Analysis times are actual production times from 0.016667 to 119.016667 s. Original contact timestamps, not analysis anchors, are retained. The final world endpoint is 120 s; no 120 s qualification map is fabricated.

The parent ledger stored exact arrays only at five checkpoints. One replay recovered all 120 maps and 4,368 original contact groups / 12,954 individual feet. Ten full tick chains match the prior observer OFF/ON baseline across 7,201 ticks. This is not a fresh pair. All 120 analysis metadata rows, 75 checkpoint arrays, source bytes, endpoint field/surface, first Plate receipt and archived contact-prefix counts match. The inherited `frozenChecks.contactDigestComparison` text describes the original ledger OFF/ON check; the new replay is compared to its sealed chain hashes. A 600 s contact digest is not claimed equal to a 120 s digest.

The capture had a 240 s per-tick wall guard and completed within it. Actual elapsed duration was not separately saved; do not infer a runtime benchmark. Frozen passes were bounded at 60/60/30 s, with no new world. No clock/audio reliability measurement is made by Audio-Off Node replay.

Audited authority/evidence: [canonical ANT status](../../README.md), [G adoption](../2026-10-25-g-production-adoption/README.md), [G candidate/frozen input](../2026-10-25-g-production-candidate-review/README.md), [parent formation ledger](../2026-10-27-g-formation-information-ledger/README.md), [retained locomotion adoption](../2026-10-12-retained-material-locomotion-adoption/README.md), [synthetic geometry capability](../2026-10-18-synthetic-plate-shape-capability/README.md), and the immutable pre-G counterexample links in the Gate Report. Actual TrailPlateBirth, SurfaceField, pheromone, gait/FOOT_CONTACT, MaterialStratigraphy, compiler, bridge and worklet sources were checked; file/blob identities are in `validation/source-preservation.json`. `world-model.md` was treated as a future design contract, not implementation evidence.

## Files

| File | Content |
| --- | --- |
| `PLAN.md` | Questions, frozen baselines, checks, cost/decision rules and adaptive registrations before each result |
| `data/history-packet.json.gz` | Full 120 analysis maps, candidate metadata, graph roots/parents/terminals, original feet and two complete real Plate descriptors |
| `data/capture.json` | Raw/compressed hashes, source hashes, exact comparisons and acquisition scope |
| `data/omitted-history.json` | Cell histories, sampled runs/censoring, all component overlap links, exact/neighborhood contact bins and individual-foot times |
| `data/omitted-cohort-summary.json` | First-birth O cohort distributions, pre-birth vs full-window durations, later I/frozen and recurrence gap observations |
| `data/multiplicity.json` | Three fixed shortest-route treatments, all 120 candidates, geometry-only compile fixtures at locked actual birth times and real compiler results |
| `data/terminal-provenance.json` | Root/terminal hull partition, diagonal-guard sensitivity, all frame classifications and fixed-footprint cohort timelines |
| `data/event-scope.json` | Exact two actual birth footprints, existing lineage starts, E tenure and prior material overlap |
| `data/*validation.json` | Result and tool hashes; deterministic rerun/RNG/input checks |
| `review.html` | Self-contained 120-frame technical map viewer; no native AV or candidate adoption |
| `validation/` | Focused tests, browser map checks, independent audit, source preservation and package hashes |
| `data/attempts/analysis-01/` | Superseded derived analysis with a corrected contact-bin error; original bytes preserved compressed |

Frozen packet gzip SHA-256: `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`.
Decoded JSON SHA-256: `fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339`.

## Reproduction without a natural replay

From this branch's repository root, Node v22.23.2:

```powershell
node --test tests/ant-omitted-history.test.js tests/ant-geodesic-multiplicity.test.js tests/ant-terminal-hull.test.js tests/trail-plate-birth.test.js tests/material-stratigraphy.test.js tests/compile-surface-topology.test.js
node scripts/ant-plate-formation-analyze.js --check
node scripts/ant-plate-omission-summary.js
node scripts/ant-plate-multiplicity-shadow.js --check
node scripts/ant-plate-terminal-provenance.js --check
node scripts/ant-plate-event-scope.js --check
node scripts/ant-plate-formation-review.js --check
node scripts/ant-plate-review-check.js
```

The last command uses the existing repository Playwright dependency and installed Chrome to verify the local technical page. It starts no ANT world. It rewrites only its browser-validation/screenshot outputs, whose rendering can vary by browser version.

Analysis/shadow writers refuse to overwrite a measured result; `--check` reruns only the frozen calculations and compares complete JSON bytes. The cohort summary is a deterministic derived view and can be regenerated. The optional capture command `node scripts/ant-plate-formation-capture.js` also refuses to overwrite the existing packet. Use a disposable copy with absent outputs only if deliberate acquisition reproduction is necessary. No repeat acquisition was needed here.

## Checks and QA deviations

- Production/default qualification is not patched on disk. The capture reuses the byte-hashed ledger runner and its nonmutation guard in memory. Tick state/RNG, events, world fields, material and lifecycle match the sealed baseline. It adds no simulation RNG.
- Shadow selectors are loaded from current byte-verified TrailPlateBirth text. Exact single replacement guards reject source drift. The production reference matches every saved candidate; source/target, supported mask and means remain fixed. Complete frozen calculations run twice under a `Math.random` tripwire and compare identical JSON.
- Synthetic fixtures cover absence/return, initial onset, censoring, split/merge links, diagonal artifacts, fractional contact bins, already-frozen coverage, equal alternatives, longer reconnecting alternatives, pendant cyclic lobes and a brute-force simple-path oracle for tiny connected graphs under both adjacency conventions.
- Initial derived analysis used timestamp equality instead of interval contact bins. It was corrected to `(previous analysis, current analysis]`, with a separate post-final-analysis tail and conservation assertion. The first derived output/receipt/summary remain in `data/attempts/analysis-01/`; the raw capture did not change. Other reported first-attempt fields were unaffected. No extra natural replay followed.
- The initial browser checker expected black=0, while the technical page intentionally uses `#111111`. The checker was corrected to compare the actual RGB values; the page and research data were unchanged. The final check validates six saved frames × five maps × 9,216 source-cell centers, all matching; the first-birth button works and page errors are absent.
- A sandbox child-process restriction produced `spawn EPERM` before some initial Node test launches; the same focused runner succeeded with the environment's process permission. This is a tooling execution issue, not world/audio failure.
- Final sealing found Windows CRLF versus Git-index normalization differences. The two original PowerShell validation outputs (`focused-tests.txt`, `source-preservation.json`) are retained byte-for-byte with binary attributes; the root tooling attributes use canonical LF. The final manifest and staged-byte receipt verify the completed file set. No scientific output or historical input was normalized to repair this packaging issue.
- Focused result logs and independent reviews are in `validation/`. Repository-wide `npm test` and build are deliberately not run: production code/dependencies/app integration are unchanged, and the mission requires proportional research-tool validation. Relevant production formation/stratigraphy/compiler fixtures are included in the final focused run.

Final focused run: **41/41 passed**, zero failures/skips, across three research suites and production TrailPlateBirth, MaterialStratigraphy and compiler suites. All five frozen calculation/viewer `--check` reruns passed. The review browser check passed on installed Chrome `156.0.8078.48`, recorded in `validation/browser-review.json`.

## Boundaries

**[Implementation]** The current timer qualifies an evolving candidate corridor, then freezes one complete finite descriptor. E is qualified chemical-memory AND sampled mechanical support; H/I are derived graph representations. Support sampling is broader than raw compaction, and an exact-cell foot count is not an episode count.

**[New measurement]** Four passes describe one seed's first two events and a 120 s horizon. No persistence threshold was fitted, no field episode law was adopted, and no shape-richness score was used.

The descriptors nested under `multiplicity.lockedBirths.*.modes.*.descriptor` are reconstructed compiler fixtures, not complete actual event receipts. Geometry, pickups, metrics and material are checked against production for the reference. Their unused `provenance.footContacts=0` comes from a fresh birth object with no historical counters; it must not be read as a measured zero. Actual complete receipts are `history-packet.births`, and foot measurements come from the original packet contact stream.

**[Modeling hypothesis]** Sustained omitted history can motivate reconsidering event support; it does not imply all eligible history must become material. Terminal hulls are diagnostic upper bounds. Their geometry is not a causal history category by itself.

**[Existing ANT evidence]** Pre-G local accretion and interior-endpoint rejection remain counterexamples. Their late outcomes are not current-G outcomes. Successful single-layer compile is not mature runtime, coupled-wave, Nodule or audible-difference validation.

**[Artistic interpretation]** Pending human review. The technical page does not settle visibility, retained-state identity, listening scale, the value of a particular omission or the correct materialization ontology.
