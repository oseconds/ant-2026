# 2026-10-09 — W1 cell-local supported-formation shadow

## Question and boundary

Could a per-cell `q === 1 && active === 1` spell produce a local formation-completion event while max-overlap episode ID 0 remains open? This pass reused one existing threshold only: the original W1 20 s persistence. It did not change episode closure, copy historical union into event geometry, tune another threshold, or rerun natural ANT. Movement, DAB, FOOT_CONTACT, production, audio, and feedback stayed unchanged.

The [pre-analysis contract](../evidence/2026-10-09-w1-cell-local-supported-formation-shadow/DESIGN.md) bounded the observer to exact adjacent frozen samples, identity-as-provenance, event cells ending at the same observation grouped by deterministic 8-connectivity, and separate repeat-area accounting. Original W1 and max-overlap remain frozen comparators. The world-model design contract was reviewed and left unchanged.

## Observation

The three original seeds preserved `1,797/1,797` q/EMA/active observations and existing W1/max-overlap geometry and character. ID 0 remained open through all 599.25 s samples after appearance (583–585 observations per seed), and local events began at 47.017–60.017 s. All 30,828 local events occurred while ID 0 was open and currently active; 97.9% intersected its owner history or historical union.

The result is **Negative** under the requested gate: 95.4–96.0% of local events are single-cell and the largest is five cells. The descriptive ≥18-cell count is zero; no size filter was used. The unique local union covers 62.1–62.3% of the world and 94.9–96.5% of final ID 0's historical footprint. Re-inscription accounts for 45.9–47.5% of event-cell samples. This fails the meaningful multi-cell and reduced-saturation requirements; the high event count does not make it a successful material hypothesis.

Most eligible endpoints are q-off while active remains on (89.1%). The cumulative contact bit is still set for every eligible spell, even though the latest actual same-cell FOOT_CONTACT is a median 38–40 s old and often much older. This is a material interpretation risk, not proof that the underlying fields are wrong: q is cumulative qualification and active includes EMA carry-over.

## Decision and verification

Preserve this single negative result and stop the candidate family here. Do not adjust thresholds or reinterpret these events as physical material contribution. The detailed fixed-scale maps, exact timeline, distributions, per-cell data, validation, and reproduction manifest are in the [evidence package](../evidence/2026-10-09-w1-cell-local-supported-formation-shadow/README.md). Ten focused tests, the complete 380-test suite, and the production build pass; the independent result-plus-plot reproduction matched 15 files byte-for-byte. No merge, PR, production adoption, or audio/feedback work was performed.
