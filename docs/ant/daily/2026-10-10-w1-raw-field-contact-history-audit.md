# 2026-10-10 — W1 raw-field / contact-history contrast audit

## Question and boundary

From `aad8c30960a8b8511b855321ecc10450b55057b3` on `ant-w1-episodic-material-shadow`, check whether existing W1 binary qualification and EMA activity hide local history differences retained in the original continuous fields and same-cell FOOT_CONTACT archives. First read the project README, world model, latest spatiotemporal-coherence Mixed evidence, per-cell history audit, and daily chronology.

The snapshot and contact archive provenance gate passed before analysis: all three original frozen sources exist, file hashes and byte sizes match, descriptor layout is exact, and each seed has 599 snapshots through 599.25 s. No milestones, flags, or replayed simulation values were used in place of the saved full temporal fields. No natural ANT rerun occurred.

## Analysis

Added `scripts/ant-w1-raw-field-contact-audit.js`, a read-only pass over the original Float32 `chemicalMemory`, `support`, `surface`, and auxiliary `chemical` arrays plus UInt32 contact counts. Actual FOOT_CONTACT point positions and `simulationTimeMs` come from the committed raw contact archives. The audit reconstructs the existing threshold bits and distinct same-cell timestamp qualification, compares them across all 1,797 observations, and verifies existing W1/max-overlap output deep equality. The audit changes no formation or production behavior.

Added focused tests for distinct contact timestamps versus individual points, exact interval boundary handling, archived positions and timestamps, grid indexing, and q-bit reconstruction. `scripts/ant-w1-raw-field-contact-plots.py` writes fixed-scale 96×96 comparison maps for the nearest samples to 120 / 300 / 480 / 599.25 s, plus pooled distributions and exact-sample timelines. Cell geometry is never linked or interpolated.

## Observation and decision

Raw field ranges remain distinct inside binary q states across all seeds. In candidate ID 0's historical union, q=1 `chemicalMemory` spans about 0.3000–0.9519, `support` 0.0408–0.9651, and `surface` 0.0342–0.9761. q=0 `chemicalMemory` and `surface` also vary broadly; conditional `support` is exactly zero for q=0 in this footprint, which bounds that comparison.

The same-cell contact interval contrast repeats across seeds: contacted-cell mean deltas exceed no-contact means for all three fields, particularly `surface`. The measurement is a descriptive association between a contact observed in `(previous,current]` and the change between archived snapshots. It does not establish a causal contact response. No sub-second event response was inferred.

At 599.25 s, every cell in ID 0's historical union has the two distinct contact timestamps needed by q, but its latest contact age has a median of 32.62–41.13 s, p90 of 141.86–154.86 s, and maximum of 512.72–585.97 s. This quantifies the stale-qualification risk; it does not imply current physical support.

**Decision: Informative.** These fixed raw states preserve local/time variation that q and the historical union do not encode. q still includes cumulative contact qualification and current activity still includes EMA carry-over. Raw field amplitude, recent contact, or correlation does not show physical material contribution. No follow-up hypothesis or transformation is proposed.

Detailed SHA provenance, distributions, exact parity, fixed-scale plots, limitations, and reproduction commands are in `docs/ant/evidence/2026-10-10-w1-raw-field-contact-history-audit/README.md`.

## Verification and delivery

The initial numerical run and a second independent process produced byte-identical outputs: 8 numerical files and 15 plot/manifest files. Focused tests pass 5/5; the unchanged full `npm test` passes 393/393; `npm run build` passes with 408 modules transformed and existing annotation and large-chunk warnings. Fixed-scale plot checks pass. The sandbox initially denied child-process creation; the requested test and build commands passed after process permission review. Diagnostic sandbox attempts are labeled separately in the package.

Tooling and evidence are committed separately on the existing shadow branch after verification. The exact remote HEAD and clean worktree are checked at delivery. No main merge, PR, W2 promotion, natural simulation rerun, vitality, audio, feedback, or production work is in scope.
