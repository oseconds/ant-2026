# Validation and provenance

## Authority

- Current production: `origin/main@1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44`.
- Research branch: `codex/ant-materialization-e-incumbent-bounded-20261031`, based on the prior stop commit whose merge-base is the pinned current main.
- Previous fixed-nucleus result: `codex/ant-materialization-update-fixed-nucleus-20261031@3ddf7a2fb08e6a91ce71f9edf3ec4c7c8237e386`.
- Previous stop: `codex/ant-materialization-e-eligibility-20261031@7118412b1df3f7155859fd0a9eb4394b01ba0efd`.
- Current `TrailPlateBirth.js`: Git blob `238cc365f2602dc6a22091d69237b88962825a13`; raw SHA-256 `283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860`; LF SHA-256 `cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67`.

## Frozen input validation

- Exact predecessor frozen-input packet: 2,933,202 bytes; SHA-256 `ec56df45a4e346f7ea79d3e368654b788dc08e8a9c4d40009df8fd57a80cd864`.
- Exact prior B reference: SHA-256 `395ec41625c9806f40321a3511b4230e04b30d03e73e62d2d463df3f5211ff07`.
- Exact registered stateless-X reference: SHA-256 `3315321b5bbe0599949d742e794236de1b855b98fe96669a6f1b5244764c0345`.
- Prior UPDATE receipt: E, I and exact model times match 42/42.
- Prior capture receipt: E/F/D match 10/10 shared anchors.
- Prior stop witness hash matches `c802ddac0f0b3d71b8f0895f1014445a93711dbeffd78092e210c9a7a6f3e3e5`.
- Current production Zhang–Suen F reproduces frozen F at 42/42 anchors.
- Fresh fixed-nucleus B reproduces prior registered memberships index-for-index at 42/42 anchors.
- START max-D nuclei match at 2/2 events; both are 6192.
- Registered stateless X matches at 10/10 shared anchors.

## Corrected recurrence checks

- Fresh ingress: 322 total Q entries, all 322 through current B; zero outside-B entries.
- Q-only incumbent signature: 1,150 anchor/cell occurrences checked; all were previous Q, current E, and connected through current admissibility.
- Forbidden current-F ingress outside B: zero.
- Re-entry checks: 68 P1 and 46 P2; observed returns were through B only; zero violations.
- Nucleus invalidation: none in either 21-anchor sequence.
- Observer RNG calls: zero; `Math.random` is replaced with a throwing counter during analysis.
- Determinism: `--check` byte-compares all generated machine outputs after a second analysis run.
- No simulation, replay, new seed, production source modification, PR, merge, Plate creation, COMMIT, or Residence work.

## Commands

```powershell
node --check scripts/ant-materialization-e-incumbent-eligibility.js
node scripts/ant-materialization-e-incumbent-eligibility.js --write
node scripts/ant-materialization-e-incumbent-eligibility.js --check
git diff --check
```

`hash-manifest.json` records exact raw hashes for the new report, analysis outputs, script, current source and reused predecessor inputs. The predecessor stop report and witness are preserved unchanged in their original package.
