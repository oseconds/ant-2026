# 2026-10-21 — Exhibition AudioWorklet feasibility

## Question and authorized boundary

Find the least physical/acoustic loss that permits a stable Processing Community Day Seoul 2026 presentation. Compare Full Physics, actual Z-off Audio Lite, and Audio Off. Production remains the default; no movement, gait, pheromone, birth, stratigraphy, history eviction, solver-rate, damping, pulse or pickup redesign is authorized.

Starting branch was clean at `79833b4`; fetched `origin/main` is `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Their `src/` and `static/` trees match. The three existing research commits are retained as dependencies. Work uses primary checkout branch `codex/ant-exhibition-audio-runtime-20261021`; the existing separate research worktree is preserved.

## Investigation plan

1. Audit solver cost and the prior runtime/sleep and dense-readout evidence. The supplied dense numbers are confirmed in committed 2026-10-18 evidence: 500 ms focal/rest median -5.38 dB, median 69 strikes, event contributor median 2.10 and window-wide energy-weighted median 2.113. These are overlap/readout statistics, not perceptual masking.
2. Freeze current seed `20261005` natural topology and routed input at 8/20/30 historical Plates. Preserve timing/order, hashes and world-state parity against Audio Off. Clearly distinguish bounded cold-start/frozen-topology replay from an uninterrupted mature physical state.
3. Measure raw baseline, one result-preserving optimization, actual Z removal, and deterministic audio-only Plate/local refractory candidates independently. Preserve Sphere foundation as a separate element. Judge costs separately from PCM/overlap change. Only test combinations after a component benefit is established.
4. Use Chrome offline throughput and actual AudioContext/wall progression, worklet timing and natural simulation/renderer progression. Record device/browser and tested duration. Do not infer runtime from quietness or offline speed alone.
5. Keep only a justified minimal startup opt-in path, if any. Add focused regression checks, full tests/build, fresh independent review, evidence and final recommendation. Commit/push only this pass; no PR, merge or force-push.

## Delegation

- Evidence/provenance lookup: Luna Medium, read-only bounded retrieval.
- Solver/cost adversarial analysis: Luna Max, coupled numerical semantics and equivalence hazards.
- Frozen-input capture and parity: Luna High, tick/message/topology boundaries.
- Audio-only refractory shadow: Luna High, input ordering/locality and noninterference.

## Measurements and decisions

The frozen twelve-second A/B completed at all three stages. Z removal materially reduced cost but did not make 20/30 Plate audio realtime. Full throughput was 0.954 / 0.285 / 0.173; Z off was 1.496 / 0.486 / 0.289. Audio-only 75 ms refractory delivered substantially fewer strikes for the Plate gate and modestly fewer for the local-cell gate, but did not reduce Full active sets or produce sleep. Reduced output level was therefore not accepted as a runtime fix.

The user then explicitly requested same-step sleep-force reuse. An independent numerical audit found that Plate bilaplacian reuse is possible in Float64, while Sphere must use post-`advanceNodules()` values. Z sleep force is evaluated after earlier active nodes commit new state and cannot reuse the recurrence force. The shadow preserved complete PCM, final original-array/numeric state and diagnostics at all 8/20/30 stages, with controlled near-threshold tests as well. Component and combined cache timing did not demonstrate a consistent material gain. A separate operation census explains the tradeoff: skipped local stencil work versus eager cache writes and many extra post-advance Sphere mode terms. The cache stays shadow-only.

The audit also exposed an existing diagnostics boundary: selected diagnostics-on nodes use recurrence-time Z forces for sleep, while diagnostics-off production recomputes sequential-time force. This pass preserves both paths relative to themselves; it does not silently fix historical diagnostic semantics.

The first offline preflight was rejected because the emitted natural contacts were not monotonic in timestamp. Stable frame/original-sequence sorting fixed dispatch; valid runs assert every scheduled strike delivered exactly once. The post-completed-milestone-tick boundary was clarified during independent review: that tick's earlier contacts are pre-boundary history in this cold-start experiment. No frozen input regeneration was needed. A partial cache timing run overlapped acoustic rendering and was rejected; the final cache comparison ran serially.

All four 30-Plate per-layer pickup captures matched the corresponding Chrome benchmark PCM exactly. The acoustic report uses matched common strike keys when comparing focal/rest changes, because gates change the delivered-event set. It keeps summed component energy, signed-rest interference and subjective masking distinct. Fixed-scale plots and a local listening page were prepared; no human listening judgment was collected.

Actual installed-Chrome validation reached different natural milestone ticks from Node, so the two environments are treated as separate workloads. Within Chrome, matching pre-growth world/RNG hashes were verified for each stage. Full audio/wall was approximately 0.914 / 0.209 / 0.113 at 8/20/30 starts. Z-off Lite was approximately 0.317 / 0.202 at 20/30 starts; its 120-second growth from 8 to 18 Plates averaged 0.562. Dense-Lap and its limited combination with Z off did not establish live stability. A zero-Plate control was 0.987, excluding a host clock deficit of the size seen in mature runs. Simulation stayed near 1.000 and canvases continued changing even as audio failed.

Audio Off grew naturally from 30 to 38 Plates for 120 seconds at simulation/wall 1.00014 and approximately 57 Hz renderer callbacks. **Decision: Audio Off is the supported visual-exhibition fallback within this measured interval. No tested Full/Audio Lite configuration is mature-audio exhibition-ready. If live sound is mandatory, technical readiness is not achieved.** There is no claim of a smaller maximum, hours-long stability, physical-device listening or another machine's performance.

The minimal startup `?antAudio=lite` path remains explicitly labeled a prototype and requires that query at page startup; normal Full remains the default physical model. It skips actual adjacency generation and zero-link CSR construction, retains Sphere and individual Plate solvers, and exposes no runtime model switch. No excitation gate, cache or dense-Lap rewrite was adopted into production. Movement, gait, pheromone, birth, stratigraphy, material history and renderer model code are unchanged.

Full tests passed 350/350; production build passed. The artifact verifier closes all primary input/WAV/cache/stem hashes and ten current Chrome runs. The existing separate research worktree is clean but ahead of its remote by two commits; it was preserved and not archived. Detailed data, reproduction, limits and the final code/evidence commit boundary are in [the evidence report](../evidence/2026-10-21-exhibition-audio-runtime/README.md).

Code and reproduction scripts were committed as `d43680eb142ee9b77c6770bc7ec7ef56c0c0c4fb`; evidence and chronology are packaged separately afterward. Final review found no blocking issue. Verifier hardening now checks the complete runtime duration matrix, Z-off at startup and final sample, and permits only the explicitly documented earlier smoke to lack a pairing hash. The final verifier passed. No PR, merge or force-push is part of this pass.
