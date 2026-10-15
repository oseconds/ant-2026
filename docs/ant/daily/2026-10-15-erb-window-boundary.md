# ERB crop-boundary sensitivity — 2026-10-15

## Selection and scope

The user authorized one self-selected bounded project pass, with limited remaining session quota. Initial recovery found P24 modal participation and the blind first-listen viewer already completed and integrated at `a9c138e8fff3ebfec45c09f2f391d8e6f5aedfdd`. Rather than repeating them, this pass tested one unresolved methodology concern from the previous independent review: Hann boundary coverage in natural-event crops.

Used the primary checkout and dedicated `codex/ant-erb-window-boundary-20261015` branch. No worktree was created. Production, shared analysis helpers, previous evidence and audio remain unchanged.

## Protocol and result

Wrote the [protocol](../evidence/2026-10-15-erb-window-boundary/protocol.md) before analysis. Reused the same 10 s Base/Born recordings and source/mapping validators. Compared legacy crop analysis, complete overlapping Hann coverage with crop-edge zeros, and identical supports with real stream context. No parameter sweep or alignment search.

Reproduced all 128 eligible window results, with shape-metric maximum absolute error below 1e-15 and exact fixed-gain metric equality. The legacy analysis omits about 15% of the covered band-time power at 100 ms (median, each stem), falling to about 4% at 500 ms. This is analysis weighting, not physical energy loss. Median full shape cosine remains about 0.48–0.56 across policies. Some individual context changes reach approximately 0.2 cosine.

Decision: aggregate shape separation survives these tested boundary policies; individual short-window values require explicit frame/context definitions. Retain the previous **MIXED** causal verdict. No intrinsic character, audibility, preference or current production balance claim.

## Evidence boundary

Detailed measurements, fixed-axis plot, source receipts and reproduction are in the [new evidence package](../evidence/2026-10-15-erb-window-boundary/README.md). Self-checks cover crop-edge omission and unchanged interior analysis. A fresh independent review checks the implementation and claim boundaries before final acceptance. No automatic second experiment or helper replacement follows this result.

## Resume and acceptance

The first independent-review attempt stopped at a usage limit. On the user's resume request, recovered this pass from its GitHub Desktop stash onto the existing dedicated branch, preserving the stash. Re-running the generator reproduced all three generated artifacts byte-for-byte. Eleven source/tool/protocol/output receipts and staged protocol/tool hashes matched; production, shared helpers and previous evidence had no diff.

A fresh GPT-6 Luna Max reviewer returned **acceptable, no blocker**, after read-only source/result inspection and the self-check. The reviewer emphasized that surrounding context is not an isolated event and that these dependent windows cannot establish significance or intrinsic character. The [review record](../evidence/2026-10-15-erb-window-boundary/independent-review.md) separates reviewer checks from parent full-rerun verification. Accepted the bounded descriptive result with the previous MIXED verdict intact.
