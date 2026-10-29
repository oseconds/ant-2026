# Sources and exact provenance

## Authority

- Production authority: remote ref `origin/main` at `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: remote ref `origin/codex/ant-authored-materialization-law-synthesis-20261029` at `5b9cd6ba47368cd61c0391cc64f9dc62416c7ef8`.
- New branch: `codex/ant-capture-law-upstream-sensitivity-20261029`, started from the exact research parent.

The production `TrailPlateBirth.js` source and canonical `docs/ant/README.md` were read from the checkout and compared with `origin/main`; the source blob and canonical-LF SHA-256 match that remote authority and the frozen parent receipt. The local `main` name was not used as production authority. The canonical guide was left unchanged.

## Frozen material

No simulation was replayed. The same current-G/H0 packet was reused: seed `20261005`, 60 Hz, Audio Off, five saved anchors for each of P1 and P2. The gzip input is `docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz` with SHA-256 `6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d`.

Parent measurements come from `docs/ant/evidence/2026-10-29-authored-materialization-law-synthesis/analysis.json`, canonical-LF SHA-256 `4fe30c4f8468b45895f2232169dbb3bc8bfe7ae768d459de4d84318d48419ce9`. The parent's runner/evidence defines the exact `X`, `G`, max-D nucleus, direct-F stress cells, dense-F fixture, and event chronology. The new analysis asserts exact parent X/G membership parity for all ten natural frozen anchors and exact direct-F X/G parity at both COMMIT cases.

## Exact anchors

Times below are the stored `timeMs` values divided by 1000 for display; the analysis retains the original millisecond values. Every saved timestamp equals its parent anchor.

| Event | START | +10 s | COMMIT−2 s | COMMIT−1 s | COMMIT |
| --- | ---: | ---: | ---: | ---: | ---: |
| P1 | 64.01666666666308 | 74.01666666666532 | 82.01666666666765 | 83.01666666666794 | 84.01666666666823 |
| P2 | 86.01666666666881 | 96.01666666667172 | 104.01666666667405 | 105.01666666667434 | 106.01666666667463 |

The only stress cells are the parent's recorded direct-F deletions: P1 cell `5619`, P2 cell `5620`. Each is verified to be present in both original E and F. The primary stress removes that one cell from a copied E mask and runs the exact current production Zhang–Suen thinning implementation. D and all frozen packet arrays remain unchanged. The direct-F comparison removes the same cell from a copied F mask without re-thinning.

## Production source facts versus research definitions

Implementation facts rechecked in `src/lib/agents/ant/TrailPlateBirth.js`:

- F is generated from qualified E by current production thinning; the audit imports that unchanged implementation from the hash-verified source.
- The structural representation and thinning use the production 8-neighbor grid convention.
- The existing support map D is used by the parent max-D edge-bearing nucleus policy; this audit does not change or adopt that policy.

Research definitions, not production behavior:

- X is the parent nucleus-connected component of F within a Euclidean disk of radius `0.15` world units.
- G is the parent graph-distance ball within `0.15`, retained only as a representation-sensitivity reference.
- B is the registered diagnostic deterministic shortest-path rooted expansion under one edge-length budget. It charges one parent edge per admitted non-root node and does not charge induced cross-edges or cycles.
- `L_compare = 1.390788333484506` world units, derived once from the parent P1 COMMIT X members' shortest-tree parent edges. It is only a matched diagnostic normalization, not a natural constant or production parameter.

## Source hashes

- Current production `TrailPlateBirth.js`, canonical LF SHA-256: `cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67`.
- Frozen compressed input SHA-256: `6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d`.
- Parent analysis canonical LF SHA-256: `4fe30c4f8468b45895f2232169dbb3bc8bfe7ae768d459de4d84318d48419ce9`.

All authored diagnostic outputs, analyzer and report files are listed in `manifest.json`.
