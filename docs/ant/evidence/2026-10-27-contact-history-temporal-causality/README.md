# Contact-history temporal-causality shadow

**Status: TECHNICALLY VALID — artist review recorded; interpretation is promising but order-confounded.**

## Question and scope

This pass compares exact foot-contact-to-mark timing with a deterministic within-Plate event-position permutation. It changes no simulation law and does not claim this glyph is a final material identity.

## Provenance

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Branch: `codex/ant-contact-history-temporal-causality-20261027`; created directly from fresh main.
- Prior rigid relocation failure: [separate retained record](./PRIOR-FAILED-PASS.md).
- Contact prerequisite: `9233500dad65ff5bbd09d8b604f4ea86b2208932`; H1 is a diagnostic heading transform only.
- Seed `20261005`, current-G defaults, 60 Hz, 640×640, DPR 1, no audio/DSP.
- Controller source SHA-256: `b5a6344ebed52962a1749d612b0140b6a4249817f159758e13f166877078e9f4`; renderer source SHA-256: `36f76459cc5323b846e04b8bced95b19a4d382c645303dbb9b49aa1050354566`.

## Conditions

- **A:** selected event adds a 2.5 native-pixel black circle at its exact contact position and event time.
- **B:** the same selected event adds the same mark at another eligible event position from the same Plate.
- Both use alpha 72/255, source-over accumulation, no cap/decay; mark is drawn under unchanged production pheromone and ants. Material fill is hidden.
- Current physical/display ownership hides marks once buried or unsupported. H1 and renderer patches exist only in memory.

## H1 event and state audit

| Measure | Result |
| --- | ---: |
| First Plate | tick 4501 / 75.016666667 s |
| Second Plate | tick 5161 / 86.016666667 s |
| Endpoint | tick 6301 / 105.016666667 s |
| Grouped contacts / feet / responses | 4353 / 12871 / 12871 |
| Exposed routed feet | 816 |
| Event-time physical + display eligible | 760 / 816 (93.14%) |
| Event digest vs prerequisite | exact match |
| Prior H1 anchors | 1052/1052 matched |
| Final RNG | state 3450053109; 45352 calls |

Routed feet with event-time physical or display ownership mismatch were excluded from both conditions; see `contacts.jsonl` for each row.

## Event-position assignment

Per-Plate deterministic Hopcroft-Karp matching used only locations supported by the same Plate in both event-time physical and display topology. Only closed cycles were retained, so source and target event instances are the same set. No second mapping order was tried.

| Plate | Eligible sources | Assigned | Coverage | Min px | Median px |
| --- | ---: | ---: | ---: | ---: | ---: |
| trail-plate-1 | 239 | 239 | 100.00% | 18.84 | 180.26 |
| trail-plate-2 | 521 | 521 | 100.00% | 5.41 | 165.32 |

Overall: 760/760 (100.00%); minimum 5.41 px; median 170.07 px; same-native-pixel pairs 0. Gate: **passed**.

A and B use the same matched events, tick curve, per-Plate mark count, and position multiset. Endpoint convergence is expected; visual interpretation remains with the artist.

## Capture and review

- A and B rendered the exact same snapshot stream in lockstep: 901 frames at 30 fps.
- Snapshot/RNG/event parity: passed; selected events reproduced 760/760.
- Native videos and milestone stills: [neutral synchronized review page](./review.html).
- Exact mapping: [capture metadata](./capture.json), [media hashes](./media-manifest.json).

Diagnostics are separate: [event ledger](./contacts.jsonl), [assignment](./assignment.json), [event-position SVG](./diagnostics/event-position-correspondence.svg), [state anchors](./parity-anchors.json).

**Artist review:** recorded verbatim in [ARTIST-REVIEW.md](./ARTIST-REVIEW.md). View 1 was noticed more strongly and opened several possible associations, but View 1 was shown first and the artist explicitly flagged order influence. This is not a clean preference result and does not establish old-history or material-identity semantics.

## Technical result and limits

- Production `src/` remains unchanged; H1 and mark rendering are in-memory research instrumentation.
- Replay matched prerequisite event digest and final RNG: yes.
- Capture performed: yes. Browser errors: 0.
- Capture replay matched 1053 sampled preflight anchors; the registered prerequisite anchors matched 1052/1052.
- Media: two native 640×640, 30 fps, 901-frame lossless VP9 videos; decoded RGB frame hashes match every native PNG frame. Audio tracks: 0. The first-to-endpoint sample span is 30.000 s; inclusive container duration is 30.033333 s.
- View 1 maps to B and View 2 maps to A by the fixed SHA-256 review-order bit (`1`); see the separate [review key](./REVIEW-KEY.json). The viewer itself uses only neutral labels and the registered free-description prompt.
- Validation: focused matcher tests 3/3; full `npm test` 342/342; `npm run build` passed; `git diff --check` passed before commit. Build emitted only the existing dependency annotation and large-chunk warnings.
- Browser page-error and console-error assertions passed during both preflight and capture; the capture runner aborts on any such error.
- Harness-only fixes before final capture are itemized in [runner corrections](./attempts/RUNNER-CORRECTIONS.md); no registered condition or visual parameter changed.
- This result is limited to temporal event-position correspondence for one registered glyph and one H1 scene. It does not establish material identity, naturalness, or a production renderer direction.
