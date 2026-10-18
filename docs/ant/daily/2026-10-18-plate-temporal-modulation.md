# 2026-10-18 — Plate temporal envelope and modulation diagnostic

## Why this pass opened

The newly exported natural blind session contained confidently different p50 responses even when their time-integrated and late ERB profiles were very similar. The synthetic geometry session supplied a separate controlled comparison. The question was whether time-envelope/modulation structure adds a useful explanatory coordinate, and separately whether that coordinate persists across contact positions.

Latest `origin/main` was fetched and the clean primary checkout fast-forwarded to `3a5fde4c2de32d8d414734610a43003703e0d56f`. Work uses dedicated branch `codex/ant-plate-temporal-modulation-20261018`; no additional worktree was made. Existing research worktree material was left intact.

## Method before subjective join

A judgment-blind Luna Max implementer inspected the existing ERB implementation and frozen sources. A separate judgment-blind Luna Max reviewer checked sampling, nulls and normalization. The parent knew the prompt's examples, so those judgments were deliberately withheld from method delegates. Before freeze, the parent read export schema and hashes, but did not inspect judgment values or join trials to metrics.

The existing 1024-Hann/256-hop ERB-time frontend was adequate for a bounded slow-envelope diagnostic. It did not justify using its 93.75 Hz envelope Nyquist as a usable modulation limit. Known-AM probes established bins 3–17, 6.696–37.946 Hz, over 84 complete frames centered 50–500 ms. The descriptor removes a per-group log-power line, computes Hann-windowed residual spectra and pools them using mean linear group-power shares. Depth, decay/buildup, full-clip envelope and raw versus level-invariant attack companions remain separate.

Unexpected during validation: unweighted log-residual pooling let almost silent groups select a doubled modulation rate from leakage. Energy weighting repaired the exact-pipeline AM test. The protocol records the consequent spectral-balance dependence. One- and two-cycle probes also exposed low-rate phase/trend sensitivity, leading to a three-cycle lower bound before corpus output. These choices were based on synthetic signal controls, not listener judgments. First-write and manifest-schema checks were repaired before outputs were frozen.

All 36 natural native fixed-gain PCM and six synthetic fixed-gain WAV receipts verified. All 42 responses and 861 pairs were computed before interpretation. Two corpus replays were byte-identical; all 234 historical full-time, integrated and late ERB pair values and medians reproduced. The method, protocol, source and artifact hashes were committed in **`b5a9d0041499455e530f0f6cd6a9d0c2a5c0bd47`**. Freeze SHA-256 is `219eaa9ea07aff8f2fc08b03293317eef662e193d0bddf8b90bb544c15d3b332`. Only after that commit did the parent and separate join agent inspect first judgments and join the two sessions.

## Results and decisions

**A: MIXED.** P27/P31 has integrated/late ERB similarity 0.9511/0.9563 but modulation cosine 0.0352, alongside a large difference in early response buildup. It demonstrates temporal contrast hidden by a broad integrated spectrum. However, P24/P23, the confidence-5 comparison, has the highest modulation cosine of the six natural pairs (0.6179), whereas confidence-1 P15/P17 is only 0.1233. The weak comparator's gross decay/t90/crest remain similar, but its selected modulation spectra do not. No consistent strong-versus-weak ordering emerges.

Synthetic Y-branch/loop-like combines weak judgment with high modulation similarity. Compact/elongated and concave/compact show an important failure: nearly the same modulation similarity accompanies no-difference/confidence 2 and different/confidence 4. Curved/Y-branch's strong comparison is described mainly as an attack difference; its normalized crest differs by 5.649 dB. Modulation does not isolate the perceptual cause.

**B: MIXED; stable identity is not supported.** Median valid modulation cosine is 0.2851 within Plate versus 0.2037 between Plates at the same position; descriptive dominance is 56.70%, with wide overlap. One natural p25 response fails the predeclared in-band share guard, leaving 34/187 valid shape pairs out of the predefined 36/198 pairs. Strong contact-position changes remain. Integrated and late ERB already showed limited aggregate grouping; the new coordinate complements that evidence rather than replacing it.

Another unexpected finding is that the low ERB group carries at least 99.9876% of interval power throughout the natural corpus. The weighted modulation descriptor therefore mainly represents low-body envelope variation, not a complete auditory timbre model. A positive group slope for P31 describes output buildup in the chosen window, not negative damping or an unstable mode.

The synthetic A/A exported `different=yes`, confidence 5. The user confirmed this was a UI error; intended answer was `different=no`, confidence 5. A separate [correction annotation](../subjective-listening/2026-10-18-synthetic-plate-shape-capability-corrections.json) retains the raw fields and gives no invented correction timestamp. The original export remains unchanged.

Final preservation checks exposed an existing checkout-format distinction: the original subjective exports and three natural input manifests had CRLF bytes, while their Git blobs were LF-normalized. Exact-file CRLF checkout attributes preserve those original receipt hashes in future checkouts; no input JSON bytes were rewritten. New evidence uses LF. The post-freeze join CSV writer was also pinned to LF so its committed hash matches its generated hash. An independent review caught and resolved a static figure caption overlap; scientific metrics did not change.

## Unresolved and stopping boundary

This is one-listener exploratory evidence, without a fitted confidence model, p-value, population claim or perceptual threshold. Geometry-conditioned modal structure, contact participation, fixed point observability, readout arrival and transient shape remain entangled outside the existing single-Plate modal proof. That proof is for `20261005-trail-plate-24`, not the other seed's P24.

No additional causal link or production mechanism was adopted. Gammatone/cochleogram, roughness, sharpness, tonality, embeddings, pulse/pickup redesign and DSP tuning remain parked. Production `src/` and `static/`, source PCM/WAV and original subjective exports remain unchanged. Detailed measurements, limitations, receipts and commands are in the [evidence package](../evidence/2026-10-18-plate-temporal-modulation/README.md).
