# CIC transverse-sample diagnostic — preregistration

## Frozen question

For the 26 Gate 2 rows where CIC D keeps A's strict-unique final target top at the unweighted raw-maximum stage, then first loses that target at the production weighted-maximum stage, identify the transverse sample values and max-contributing sample slots for A, production C, and CIC D. Determine whether target loss coincides with a within-candidate max-sample switch, a stable-sample weighted reordering, or a mixed/tied pattern. Do not interpret saved-data stage order as an isolated causal effect.

## Baseline and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch: `codex/ant-cic-wide-stage-attribution-20261024`, starting commit `05c855cac06dd3659abfc1502e91071980ecc00b`.
- CIC qualification source: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Reused source package: `docs/ant/evidence/2026-10-24-cic-wide-stage-attribution/`.
- Gate 2 rows SHA-256: `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Frozen station rows SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Prior stage census SHA-256: `384e4ec7982e336db432ea98ea8006934cf6b2276ac145b9a3e84b0ae8645d25`.
- Prior focal rows SHA-256: `d15db82408c08819956218c472192e3dffeebe084a081d8720e63b2af696291c`.
- Production `AntController.js` and attribution-helper hashes must match the previous package before replay. No production source is changed.

## Stage definitions and calculation rules

Use only the existing saved five raw transverse samples per candidate and the saved geometry. For each candidate and arm A/C/D, preserve the five sample identities in stored order, physical query coordinates and sample offsets where present, raw values, the exact saved production weights, and weighted values `raw[s] × weight[s]`.

- Raw maximum is an unweighted diagnostic in the existing helper, not a production choice.
- Weighted maximum is the unchanged production reduction: multiply each of five samples by its saved geometry weight, then take the maximum.
- Hill response and deterministic field-only score are retained only to verify the final stored path; they are not decomposed into new sub-stages.
- For raw and weighted sample maxima, retain the full set of sample indices whose values equal the maximum exactly. Do not break an exact sample tie by inventing a physical argmax identity. No new near-zero tolerance is introduced.
- The analytic target is the saved A strict-unique final winner. The weighted rival is the unique D weighted-max winner at target departure; the final D winner is also retained. Record candidate orders and target-versus-rival margins before and after weighting.

Per-row transition tags are descriptive and may overlap:

1. `target-max-sample-set-changed`: the target candidate's exact raw-argmax sample set differs from its weighted-argmax sample set.
2. `rival-max-sample-set-changed`: the weighted-stage rival's exact raw-argmax sample set differs from its weighted-argmax sample set.
3. `stable-max-sample-reordering`: both target and weighted rival retain their own exact sample-max set across raw→weighted, while their target/rival candidate order changes. Record each candidate's sample index and applied weight; do not imply the same spatial sample index for both candidates.
4. `mixed-or-exact-tie`: any relevant max has multiple exact co-maximizing sample indices or more than one of the above mechanisms is present. Preserve the underlying flags rather than forcing one exclusive causal label.

## Frozen cohorts

Re-derive membership from the prior 5,072-row strict-unique census and verify row keys and hashes before examining per-sample details.

- **Harmful transition (primary):** every new-error row where D's analytic target is top after raw maximum, is not top after weighted maximum, and is still not the final D winner. Expected count from the prior saved stage census: 26.
- **R-weight-restored comparator:** every recovered row where D's target is not top after raw maximum, returns to top after weighted maximum, and remains the final correct D winner. Include all qualifying rows; prior stage evidence predicts 14. This is a cohort-level inverse transition, not a 1:1 match.
- **R-held comparator:** every recovered row where D's target remains top after both raw and weighted maximum and is the final correct D winner. Include all qualifying rows; prior stage evidence predicts 68.
- **R-score-restored control:** every other recovered row whose D final winner is correct but whose target is not top after weighted maximum. Include all qualifying rows; prior evidence predicts 10. Keep separate because restoration occurs at final scoring.

No 1:1 matching will be attempted. Report the full comparator cohorts and route/phase strata; do not select rows by sample values, margin, or visual interest. Preserve exact row keys and sample arrays for all rows.

## Validation and stop boundary

Before stage attribution, require exact parity with the prior package: 5,072 strict-unique rows; 2,378 C and D final mismatches; 92 recovered and 92 new-error rows; 26 primary harmful transitions; the expected 14/68/10 recovered subgroups; unchanged route/phase membership and row keys; and exact equality of each focal row's A/C/D five-sample arrays with the saved focal artifact. Any mismatch stops analysis.

Generate the decomposition twice and require byte-identical outputs and manifest. Add focused tests for membership, saved sample/weight parity, argmax-set behavior including exact ties, weighted-max parity, and transition tags. Do not change the writer, reader, sensor, controller, movement, score law, or any field parameter. Gate 2 remains `MIXED / NOT QUALIFIED`; Gate 3 remains `NOT RUN`.
