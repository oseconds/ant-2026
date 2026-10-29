# Peak–saddle domain reproducibility audit

Registered before generating the new all-domain census.

## Question and authority

Test whether finite peak–saddle domains in the existing B-memory landscape are spatially reproducible independently of the greatest-contrast winner ranking.

- Production authority: `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-proposal-emergence-exploration-20261029@3a3eb22def8c6b89983458f9e5ffb73b0ec5d1db`.
- New branch: `codex/ant-peak-saddle-domain-reproducibility-20261029`.
- Production source read: `TrailPlateBirth.js`, blob `238cc365f2602dc6a22091d69237b88962825a13`; no source edits.
- Frozen input: parent `data/frozen-inputs.json.gz`, expected SHA-256 `6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d`, derived from current-G/H0 seed `20261005`, 60 Hz, Audio Off.
- Raw history provenance: `0d5096a920e1ebb2086fa1dae782c5d4e871b590:docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz`, gzip SHA-256 `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`.

No natural replay, new seed, later-state reconstruction, or production behavior change is in scope.

## Frozen states

Use the exact five saved states per event from the parent packet, preserving source `timeMs` values:

- P1: START, +10 s, COMMIT−2 s, COMMIT−1 s, COMMIT (approximately 64.016667, 74.016667, 82.016667, 83.016667, 84.016667 s).
- P2: START, +10 s, COMMIT−2 s, COMMIT−1 s, COMMIT (approximately 86.016667, 96.016667, 104.016667, 105.016667, 106.016667 s).

Only the final two transitions per event are adjacent 1 s comparisons. Earlier gaps remain explicitly labeled 10 s and 8 s.

## Registered representation

For each saved state, analyze the unchanged Float32 B-memory values restricted to binary E, independently under 8-neighbor and 4-neighbor adjacency. The primary definition remains 8-neighbor, matching the parent B countermodel; 4-neighbor is only the declared corner-contact sensitivity control.

Use the parent helper's exact 0-D superlevel merge semantics: activate equal-valued cells atomically; each connected maximum plateau is one peak; elder preference is greater birth level, then smaller row-major peak index. Every non-elder peak at a multi-root merge receives that exact merge level as death/saddle and the elder peak as parent. A finite domain is the strict-superlevel component `E && B > deathLevel` containing that peak under the same adjacency. Essential peaks remain in the census with their E-component support and no finite internal death; they are never converted into finite domains.

Enumerate every finite lobe without size, prominence, visual, or winner filtering. Record peak plateau, levels, contrast, saddle cells/parent, cell set, size and bounds. For essentials, record plateau, birth, final E component support/size and no-death status.

## Registered comparisons

1. **State census:** full peak/domain census and unfiltered size/contrast distributions for all ten states and both adjacency conventions.
2. **Temporal correspondence:** for each consecutive saved-state pair, compute the complete sparse nonzero-overlap matrix for all finite domains independently under both 8- and 4-neighbor adjacency. Best-by-intersection ties use greater Jaccard then lower counterpart peak index; best-by-Jaccard ties use greater intersection then lower counterpart peak index. Report reciprocal-best links, zero-overlap domains, and bipartite split/merge degrees. This is descriptive correspondence, not an identity threshold.
3. **Peak/saddle changes:** separately record peak-plateau overlap, peak-cell displacement, birth/death/saddle-level changes, saddle-cell overlap, elder-parent changes, finite/essential flips, and domain pairs with no shared cells.
4. **Winner control:** only after the all-domain census, mark each state's greatest finite contrast peak using the parent tie rule. For winner changes, show the prior winner's complete next-state overlap options and ranks, and whether another domain ranks higher while the prior winner's domain still has spatial overlap. Do not add incumbent preference or hysteresis.
5. **Same-state 8-vs-4 sensitivity:** compare every finite domain pair and peak plateau pair with full nonzero-overlap receipts, unfiltered counts and size distributions; record essential/finite changes and unpaired domains.
6. **Technical atlas:** show the four adjacent late transitions in identical 96×96 coordinates, all finite domains, overlap receipts, 8/4 domain overlays and winner annotations. Labels reset per panel unless the full correspondence receipt connects them.

No angular/spatial scale, identity threshold, cutoff, smoothing, essential-root workaround, or post-hoc case selection will be introduced. B remains a mathematical organization of chemical-memory history, not a physical material domain.

## Validation and stop

- Verify frozen input and production-source hashes against the parent receipts.
- Assert exact 8-neighbor census parity with the parent's B peak/level/contrast and selected-domain results at all ten states.
- Check equal-value plateau atomicity, deterministic elder/tie handling, row boundaries, and both connectivity rules with small fixtures.
- Recompute all census and correspondence bytes and compare exact deterministic outputs.
- Validate each atlas datum against the generated census/correspondence data and hash final artifacts.
- Confirm no production files or prior evidence changed; use no RNG.

The final label is one of the four requested domain-family decisions. A positive finding supports only further study of finite-domain availability independently of global ranking; it does not establish material meaning, event identity, selector semantics, UPDATE, or long-run accumulation. No BODY, production selector, hysteresis, replay, audio, full repository test/build, PR, or merge is in scope.
