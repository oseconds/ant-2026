# Preregistration: CIC wide failure stage attribution

Date: 2026-10-24 KST. This is a read-only decomposition of saved Gate 2 rows. It does not alter a writer, raster, reader, query, sensor operator, movement law, or qualification gate.

## Verified starting point

- Fresh remote `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Remote CIC qualification branch tip: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Merge base: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; the qualification commit is two commits ahead (`54f7bac`, `1fbfec5`).
- This attribution branch is created at the qualification commit, retaining its saved data and code. The qualification commit's Gate 2 decision remains `MIXED / NOT QUALIFIED`; Gate 3 remains `NOT RUN`.
- Gate 2 row artifact: `gate2/rows.json.gz`, 5,544 rows, SHA-256 `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Frozen source rows: `inputs/station-raw.json.gz`, SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.

## Stage definitions

Use the existing production sensor and Gate 2 evaluation semantics. For each candidate heading, retain its five frozen transverse raw samples and the corresponding five production weights.

1. **Raw samples:** the five physical field reads per candidate. These have no winner by themselves.
2. **Unweighted raw maximum (diagnostic only):** maximum of the five raw values for each candidate and their rank. This saved helper diagnostic is not a production decision stage.
3. **Weighted samples and weighted maximum:** multiply each frozen raw read by its production geometry weight, then take the candidate maximum. `AntController.senseTrail()` performs this weighted max.
4. **Hill response:** apply the existing monotone response with half-saturation `0.035` and exponent `3` to each weighted maximum.
5. **Deterministic field-only score:** apply the existing `2.8 × response` trail score and the existing confidence-based directional penalty; rank by score. This is the Gate 2 fixed-cue evaluation, not the full stochastic `AntController.updateIntention()` choice with crowding, exploration, adherence, and RNG.
6. **Final diagnostic winner:** first item in the helper's descending score order. Exact ties retain its fixed candidate-index tie-break. Preserve the qualification artifact's analytic strict-unique eligibility flag and existing precision-near-tie semantics; do not add a new threshold.

The helper's `rawOrder`, weighted order, Hill order, and score order are all retained. For every arm, also record at each stage whether the final analytic A winner is top. Primary “first cross-arm divergence” is the earliest ranked stage where C or D order differs from A's order at that same stage. Separately record the first stage where C or D ceases to put the final analytic A winner first. This prevents a difference already present in A's own intermediate stage from being mislabeled as new C/D responsibility.

These are stage-of-departure labels on saved deterministic outputs, not causal interventions. A and C/D do not encode a biological or natural-path ground truth.

## Frozen cohorts and attribution rules

- Reconstruct the full saved 5,544-row key set and its 5,072 rows marked strict-unique by the saved analytic-reference flag. Keep route, phase, and station identity; sort by this key for membership hashes.
- **Recovered:** C final winner differs from A final winner and D final winner equals A.
- **New error:** C final winner equals A and D final winner differs from A.
- Report all other correct/incorrect and tie/ambiguous rows in the full census; do not force them into the two focal cohorts.
- Report the `tight`, `tightMirror`, `p01`, and `p11` groups separately, including intersections. Retain exact saved ties and existing near-tie classification separately from strict-unique A rows.
- Keep the 392 `sCurve` analytic-zero local rows as a separate local zero-cue control; do not add them to the wide-winner denominator. Recheck the saved 364→377 false-nonzero steering counts and corresponding absolute-steering measures only as that separate control.

For each focal row, retain A/C/D raw samples, weighted samples, candidate maxima, Hill responses, scores, candidate orders, margins, identity, and first-divergence labels. For the full 5,072-row census, retain compact per-stage orders, margins, target-top flags, and classifications. No result-driven threshold or candidate is permitted.

Representative examples are selected mechanically: use C as the affected arm for recovered rows and D for new-error rows; within each focal cohort, take the first row in frozen input order for each distinct first rank-divergence-from-A stage. If a cohort has no divergence-stage example, take its first row. Include every such row, with no listening, visual, or magnitude-based selection.

## Validation and stop boundary

Before interpreting counts, verify the recorded Gate 2 artifact SHA and row count, the frozen input SHA and row-key identity, source hashes, saved C/D/analytic winners, strict-unique and tie accounting, `2,378 / 5,072` for both C and D, and the exact 92 recovered / 92 new-error memberships. Recompute A/C/D stage values only from the saved raw values and the unchanged helper plus the exact frozen geometry; require exact numeric parity to saved C/D scores and winners. If any essential parity fails, stop and report the boundary as inconclusive.

Generate the stage census twice from the same bytes and require deterministic artifact hashes. Add focused tests for pipeline-stage parity, row/cohort identity, transition rules, subgroup/tie accounting, and repeatability. Production `src/` remains unchanged. This pass ends after attribution; it cannot authorize or implement a second writer, reader, sensor/operator candidate, movement replay, or natural run.
