# 2026-10-24 — 316-grid production-Gaussian fixed-cue qualification

Started from freshly fetched `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` and created `codex/ant-316-gaussian-fixed-cue-qualification-20261024` from the 316 CIC evidence tip `4a23ca73d13cd64e7e1afa6604d5b83d7f8dad57`. Committed the F definition and unchanged Gate 2 decision rules before cue evaluation. Production `src/` and canonical ANT README remain unchanged.

Gate 1 passed. The production Gaussian stencil matched exactly at all 6,326,216 positive-node comparisons on the 1,002,001-position lattice; support had no fallback and stayed within R. It preserved uncapped node-sum dose within derived Float32 bounds, while the stored centroid retained measurable subcell error. The fixed short-segment fixture distinguished every F orientation; 96 CIC retained its known horizontal/vertical raster alias.

Gate 2 is **MIXED / NOT QUALIFIED**. F yielded local sign errors `552 → 10` and wide errors `2,378 → 1,401` versus production C. It was still 384 wide errors worse than 316 CIC E (`1,017`). F recovered 326 of E's 334 local sign failures and 233 of E's 1,017 wide failures, but introduced 617 wide errors versus E. The unchanged family rule failed only tight/tightMirror because local MAE increased despite fewer sign and wide errors. All prior D 92 new errors were correct under F, the 92 D recoveries stayed correct, and the 26 target profiles no longer made the D outer-to-inner target-sample switch.

No movement, natural replay, tuning, or production adoption followed. Evidence, frozen comparisons, limits and reproduction are in [the evidence package](../evidence/2026-10-24-cic-316-gaussian-fixed-cue-qualification/README.md). Focused and full test/build results are recorded in its validation receipt.

Fresh independent review found no decision-changing numerical issue. It identified a runner-order mismatch with preregistration; saved C/D/E controls now verify before F construction, and the full regeneration reproduced identical hashes. The reviewer verified the final 41-entry manifest.
