# Validation and explicit omissions

## Baseline and preservation

- Fresh main was confirmed as 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785.
- Branch starts at requested research parent a518a76bddd416a074cc3ee1d1d12c90d08bff15.
- Dedicated branch: codex/ant-p2-closure-history-audit-20261029.
- Target research branch was absent remotely before this pass.
- Starting worktree was clean. No existing evidence, production source, static assets, canonical README, or unrelated worktree was changed.
- Production TrailPlateBirth file hash is LF-canonical SHA-256 cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67; its Git blob is 238cc365f2602dc6a22091d69237b88962825a13 in both this parent and main.

## Frozen input and source receipts

- Exact saved E/H packet: docs/ant/evidence/2026-10-29-materialization-scope-exploration/data/frozen-structures.json.gz; raw gzip SHA-256 541cbf927b0ebdea06a7ae00585c4144a62a1d4ce2f841c40a1bd91af440b075.
- Upstream packet receipt: formation-gate commit 0d5096a920e1ebb2086fa1dae782c5d4e871b590, data/history-packet.json.gz, SHA-256 909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc.
- Parent selected face source: joint-scope analysis.json; LF-canonical SHA-256 9d738207b426c0548f1d1e567aef25ae02b6b4a64d9c3a00d7ce71e172a9f5a4.
- Frozen body descriptor input: frozen-body-inputs.json.gz; SHA-256 907fa598a5906a9c968481278832464b13362e675fc2f82dfad8f8d5144df4a3.
- Frozen extraction source SHA-256: fb158e50f0b4ac07a9ddaa8de76de5f49d551e5b8b331fcd9f336cbea6ac794a.
- Parent joint runner SHA-256: 67831400aa69bb5492d15757b5a56f9157085a505f9fa06469c15f50d6bebbc1.

The original upstream history packet is not in this checkout. This pass reuses its already extracted and hash-receipted E/H arrays; it does not claim a second extraction of the original compressed history.

## Checks performed

- Node syntax check and assert-based self-test passed for adjacency bounds, diagonal sensitivity, row-wrap bounds, a closed/open shell, and cell-domain checks.
- Frozen P2 anchor times matched exactly: 105016.66666667434 ms and 106016.66666667463 ms. The COMMIT descriptor time remains 106016.66666667464 ms.
- Parent face and boundary arrays were recalculated from P2 COMMIT H with the fixed parent rule and matched exactly: 80 face cells and 80 boundary cells.
- Deterministic Node generation and --check reproduce analysis.json, atlas-data.json, and transition-cells.json byte-for-byte.
- The Node runner replaces Math.random with a throwing function. It reads frozen arrays and pure production constants; it does not instantiate an ant, controller, field, renderer, or material system.
- Bundled Python 3.12.14 / Pillow 12.3.0 self-test and atlas generation passed. The same crop, grid scale, panel order, face overlay, and boundary overlay are used in all four panels.
- Atlas cell-center checks matched all source cells in each panel crop. Panel face/boundary counts match analysis.json. Atlas PNG and validation JSON reproduce exactly with --check.
- Atlas was visually inspected for crop alignment, fixed scale, panel order, cell-change markers, and label/data consistency.
- SHA-256 manifest records new artifacts and all frozen/source inputs. The manifest excludes itself.

## Explicit omissions

- No extraction rerun from the absent 17.77 MB upstream history packet; its pinned digest is inherited from the validated frozen-structure extraction.
- No per-tick interpolation or claim about subsecond changes between the saved approximately one-second anchors.
- No deterministic re-thinning of E to distinguish Zhang–Suen removal from downstream H eligibility; the exact observed change is localized to saved H_boundary_length_eligible.
- No new face, BODY fill, body law, face timer, router, production change, event/scope redesign, natural simulation, additional seed, long run, browser/render/audio check, or adoption.
- No full repository build/test; production code is unchanged and the research scripts have focused self-checks and deterministic reruns.
