# Independent review and final verification — 2026-10-15

## Review scope and verdict

A fresh GPT-6 Luna reviewer with Max reasoning reviewed this pass read-only, without inheriting the implementation conversation. Max was selected for coupled STFT boundary, power-normalization and causal-interpretation questions. The baseline was `a9c138e8fff3ebfec45c09f2f391d8e6f5aedfdd`, on `codex/ant-erb-window-boundary-20261015`.

**Verdict: acceptable within the stated descriptive scope; no blocking defect found.** This is a summary of the returned review, not an independent rerun of the complete analysis.

The reviewer inspected the runner, protocol, report, saved analysis, dependencies and claim boundaries. The reviewer ran `--self-check` successfully and audited the saved JSON: 128 non-silent eligible windows (43/43/42), no recording-edge padding, and reported medians and paired deltas consistent with the JSON. Frame support correctly distinguishes crop boundaries from recording boundaries. Exact reuse of legacy/interior frames and the onset-impulse counterexample passed the self-check.

The strongest counterargument remains that `covered-context` incorporates neighboring event starts and tails. It cannot isolate an event response. The report explicitly retains this limitation, the 63-foot/44-group semantics, overlap and dispatch-delay confounds. Aggregate separation under the three tested policies therefore supports retaining **MIXED**, not intrinsic character, causal separation or audibility.

## Parent verification

- Re-executed the complete generator after recovering the interrupted work. `analysis.json`, `boundary-sensitivity.png` and `report-manifest.json` remained byte-identical to the saved outputs.
- Verified all 11 protocol/source/tool/artifact byte counts and SHA-256 receipts. Protocol and all three tool hashes also match their staged Git blobs.
- Reproduced 128 prior windows with maximum shape-metric error `9.992007221626409e-16` and exact fixed-gain metric equality. The runner verifies source receipts before and after processing.
- Checked `git diff --check` and `git diff --cached --check`. Inspected the fixed-axis plot visually.
- Confirmed no diff against the baseline in production `src`/`static`, either reused analysis helper, or the previous natural-event evidence package. Changes are confined to this runner/package, its daily record/index, the evidence link and line-ending attributes.

## Recovery and remaining limits

The first review attempt failed at a usage limit and produced no review verdict. On resume, the primary checkout was on `main`; GitHub Desktop had preserved this pass in its branch-specific stash. The dedicated branch and matching stash were restored without dropping the stash. The successful review above used a new reviewer. No second experiment or new audio render was performed.

The reviewer did not execute the full generator; that deterministic rerun belongs to the parent verification above. No listening test, browser test, production build or unrelated JavaScript suite was run. These dependent windows from one frozen recording do not establish statistical significance, event-specific impulse responses, perceptual differences or robustness to untested representation choices. Existing ignored assets and the other research worktree were preserved.
