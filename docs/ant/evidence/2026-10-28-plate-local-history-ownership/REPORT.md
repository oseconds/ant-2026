# Report — Plate local-history ownership

## Decision

**SUPPORTED — commit-relative ownership interface.** The frozen natural sequence and the existing matched-repeat logical fixture support a reproducible, channel-specific provenance ledger. This is not a production formation law or a physical support rule. Whether carried-in qualification context can be part of a new Plate's material body remains an **ARTIST / ONTOLOGY GATE**.

## Authority and implemented facts

The run is based on fresh `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`, using source-compatible research parent `12473f9ec8c7057ea033d9f72fa68c236c60bb50` on `codex/ant-plate-local-history-ownership-20261028`. Before branching, the complete `src/` tree and the canonical ANT README/world-model guide were verified identical between the parent and fresh main. Production `TrailPlateBirth`, `SurfaceField`, renderer, audio and lifecycle code were not changed. Existing semantics keep a live candidate/connection after commit and retain immutable descriptors; this ledger does not reset or edit that state.

The input is the hash-verified current-G / H0, seed `20261005`, 60 Hz, Audio-Off 0–120 s packet. It contains 120 analyses through 119.016667 s, 4,368 FOOT_CONTACT event groups and 12,954 individual feet through 119.970278 s. The extra contact tail is preserved as packet evidence; no analysis endpoint was fabricated. The pass made no world replay and consumed no RNG.

## Measurement and evidence

### Anchor and identity

| Plate | Anchor | Commit | Anchor basis | Frozen cells | P1 overlap | Prior match |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| `trail-plate-1` | 64.016667 s | 84.016667 s | Current lineage start | 356 | 356 | None |
| `trail-plate-2` | 86.016667 s | 106.016667 s | Current lineage start | 544 | 223 | None |

Both commits are unmatched in the reconstructed event state. P2's 223-cell spatial overlap with P1 does not convert it to a matched repeat or shared event identity. In this observed sequence, the windows are disjoint in time: P1 owns `(64.016667, 84.016667]`; P2 owns `(86.016667, 106.016667]`.

### Chemical memory

The recurrence is replayed over each of the 20 post-anchor saved projection samples. Every `A_projection96` frame is indexed in `data/ownership.json` by analysis index, tick, time, and a SHA-256 digest of the JSON number-array representation. Full per-cell arrays are in `data/ownership-arrays.json.gz`.

| Frozen footprint | Anchor memory mean | Zero-input carried at commit | Conditional endpoint difference | Actual commit endpoint |
| --- | ---: | ---: | ---: | ---: |
| P1, 356 cells | 0.303377 | 0.111606 | 0.320147 | 0.431753 |
| P2, 544 cells | 0.406386 | 0.149501 | 0.338659 | 0.488160 |
| Shared 223 cells, P1 | 0.310422 | 0.114198 | 0.328351 | 0.442549 |
| Shared 223 cells, P2 | 0.451267 | 0.166012 | 0.317092 | 0.483104 |

For each cell, the conditional endpoint difference is the observed stored `B_memory` endpoint minus the no-input carried recurrence from its actual anchor. It is a reproducible comparison against that counterfactual, not a calibrated chemical mass. Replaying the source update from saved rounded projection maps was not bit-exact: P1 differed at 3,872/184,320 cell-steps and P2 at 3,791/184,320; both had maximum absolute endpoint error `5.960464477539063e-8` and maximum 2 ULP distance. Therefore the saved-map replay is a numerical cross-check; the source packet's actual endpoint is used for the reported conditional difference.

The footprint distributions contain both carried and post-anchor values. For example, P1 cell 5134 has 0.169169 carried and 0.140648 post-anchor difference, while cell 4081 has 0.210413 carried and 0.237555 post-anchor difference. P2 cell 4371 has 0.161573 carried and 0.109827 post-anchor difference; cell 1212 has zero carried and 0.543467 post-anchor difference. These are continuous per-cell examples, not thresholds.

### SurfaceField

The existing field-only replay was initialized from each actual anchor state, kept original ordered events, and matched every saved checkpoint: **21/21 exact** for each 20 s window. Its per-footprint results are:

| Frozen footprint | Anchor mean | No-new-contact endpoint | Conditional endpoint difference | Actual endpoint |
| --- | ---: | ---: | ---: | ---: |
| P1, 356 cells | 0.097111 | 0.096366 | 0.038734 | 0.135100 |
| P2, 544 cells | 0.136164 | 0.135119 | 0.032018 | 0.167137 |
| Shared 223 cells, P1 | 0.098532 | 0.097776 | 0.036527 | 0.134302 |
| Shared 223 cells, P2 | 0.138719 | 0.137654 | 0.028234 | 0.165889 |

The difference is conditioned on the actual carried field state and no-new-contact relaxation. Because SurfaceField writes saturate, it is not an independently additive dose or material quantity. Some mask cells have zero conditional difference while other cells in the same mask have positive differences; no cutoff was applied.

### Ordered feet

Each contact row retains its source event index, individual contact index, original timestamp, group/ant/leg identifiers when present, exact position, nearest 96-grid cell, frozen-mask membership, and phase. The packet contains **543 timestamp inversions in source order**; events were not sorted. Timestamp classifies the row, while the immutable event/contact indices preserve its original order.

| Plate | Phase | Event groups | Individual feet | Mapped inside its frozen footprint |
| --- | --- | ---: | ---: | ---: |
| P1 | Carried-in `<= anchor` | 1,892 | 5,632 | 835 |
| P1 | Owned new `(anchor, commit]` | 832 | 2,470 | 351 |
| P1 | Future `> commit` | 1,644 | 4,852 | 581 |
| P2 | Carried-in `<= anchor` | 2,806 | 8,342 | 1,869 |
| P2 | Owned new `(anchor, commit]` | 849 | 2,507 | 486 |
| P2 | Future `> commit` | 713 | 2,105 | 456 |

Each phase partition conserves all 4,368 event groups and 12,954 individual feet. Grid membership uses the existing production nearest-node mapping and the existing frozen footprint solely for summary; it does not assert that an exact-cell foot caused all neighboring field change.

The shared region makes spatial reuse visible without conflating timestamps. P1's owned window has 123/223 overlap cells with at least one mapped new foot; P2's window has 88/223. In the sampled sequence, no timestamp is assigned as new to both windows. This is evidence about these anchors and windows, not a universal theorem for every pair of unmatched lineages.

### Matched-repeat fixture

The existing `continuous-load` logical fixture was used only to validate the time-window rule. Its first three commits use anchors/commits `0→20`, `20→110`, and `110→200` seconds, with 20, 90 and 90 unique contacts respectively. A contact at an anchor belongs to the preceding commit's closed endpoint and is excluded from the following open start. The union has 200 uniquely owned timestamps. The current fixture also shows the candidate and immutable descriptors continuing through commits; at t=21 s and t=109 s the existing repeat counter banks 1 and 89 post-prior feet while 89 s and 1 s of refractory time remain. This fixture does not integrate a natural world or field.

## Interpretation

The anchor rule separates “history can qualify a commit” from “this commit newly owns a timestamped contribution.” Carried-in state and later changes coexist inside the same frozen spatial footprint, and channel histories differ cell by cell. Same place does not imply same event or same committed layer. The matched-repeat anchor prevents the prior interval from being re-owned in the tested continuous fixture; P2's natural unmatched interval is also disjoint from P1's interval in this packet.

This result supports a provenance interface for future WHERE research. It does not show that physical support should exclude inherited context, that every newly owned contact should become material, or that any particular threshold, geometry or sculpture is correct. The remaining question depends on artistic/material ontology: can carried-in qualification context be part of the new layer's physical body, or must that body's support require new contribution during its own ownership window?

## Validity and limits

- Frozen packet, source hashes, birth descriptors, runner/helper receipts and matched-fixture receipts passed exact checks.
- SurfaceField matched all saved anchors. Chemical sample-map replay was within 2 ULP but not bit-exact; exact source replay is not claimed.
- Ordered source contacts, timestamp inversions, per-phase conservation, RNG tripwire and no-world/no-controller checks passed.
- Natural evidence is one seed, two unmatched commits and sampled 1 s analyses. The repeat check is a prescribed-foot logical fixture, not natural spatial behavior.
- Foot counts are contacts, not episode counts, exclusive ant authorship or direct material-causation proof.
- No new mask, threshold, support classifier, reset or production behavior was adopted.

## One next priority

Prepare a compact artist-facing ontology gate using the four contrasting cells and the 223-cell overlap summary already recorded here. Ask whether inherited qualification context may belong to a new layer's physical support, while showing carried, commit-owned and future channels separately. Do not run another simulation or choose a support threshold before that decision.
