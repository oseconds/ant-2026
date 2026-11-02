# Wet-film formation: first discriminating experiment

Start with [REPORT.md](REPORT.md). [PROTOCOL.md](PROTOCOL.md) was committed before interaction results; [PREPARATION.md](PREPARATION.md) distinguishes numerical-definition repairs from physical choices. This is an isolated Newtonian precursor-film experiment, not an ANT production law, viscoelastic material, solidification or audio model.

Authority: GitHub main `5bdd516b412d03d78c2511ceb372180941206968`. Research branch: `codex/ant-wet-film-formation-first-probe-20261102`. Protocol commit `b2803cb`; numerical implementation commit `1f85754`. The [earlier audio study](https://github.com/oseconds/ant-2026/blob/918764c2d4924eb89fd6874122edc30b73d1499c/docs/ant/evidence/2026-11-01-local-x-audio-reassessment/REPORT.md) is a separate frozen reference. The authorized [Argon archive](../../archive/2026-11-02-material-formation-physics-brainstorming/README.md) is unvalidated motivation.

## Reproduction

Measured environment: Python3.13.14, NumPy2.5.1, SciPy1.18.0, Matplotlib3.11.1, Windows. No dependency was added to this repository. The local interpreter used below is installed already; another Python with those packages can run the same scripts. The scripts set single-thread numerical environment variables and use no RNG.

```powershell
$wetPython = 'C:\AI\ComfyUI_windows_portable\python_embeded\python.exe'
& $wetPython -B -m unittest discover -s tests -p test_ant_wet_film*.py -v
& $wetPython -B scripts/ant-wet-film-formation.py --preflight
& $wetPython -B scripts/ant-wet-film-formation.py
& $wetPython -B scripts/ant-wet-film-results.py
& $wetPython -B scripts/ant-wet-film-atlas.py
& $wetPython -B scripts/ant-wet-film-verify.py
& $wetPython -B scripts/ant-wet-film-verify.py --rerun
& $wetPython -B scripts/ant-wet-film-verify.py --manifest-only
```

The campaign regenerates the canonical 25 cases. For a numerical rerun without replacing canonical evidence, use `--output .cache/wet-film-first-probe/full-rerun`; the saved canonical contact input is reused. The verifier's `--rerun` runs the primary pair and conditional ANT-input film cases into a separate cache and requires byte identity of their NPZ/CSV/JSON files. The plot and comparison generators read the canonical data. `--write-manifest` is only for intentional reviewed package updates; it is not needed to verify the committed package.

The committed extracted contact ledger is sufficient for the fluid campaign. Optional exact source re-extraction is:

```powershell
& $wetPython -B scripts/ant-wet-film-formation.py --extract-input
```

This requires Git object918764c locally (fetch the named completed audio research branch if necessary). The extractor checks the original compressed-capture SHA-256, reads only its committed bytes, and retains all5,677 valid feet in[0,60)s. It does not run ANT. Its water/dose/radius and one-second source binning assumptions are in the protocol.

## Evidence index

- [All run definitions and endpoints](data/summary.json)
- [Morphology, refinement, source-off and parameter comparisons](analysis/comparisons.json)
- [All25 mass/energy/snapshot checks](validation/budgets.json)
- [Two independent numerical reruns](validation/deterministic-rerun.json)
- [Fixed-scale technical atlas](ATLAS.md) and [plot receipts](visual/plot-receipts.json)
- [Pre-run numerical review](validation/pre-run-review.md), [post-run independent review](validation/post-run-independent-review.md)
- [Validation and limits](VALIDATION.md), [manifest](manifest.json), [SHA256SUMS](SHA256SUMS)

Each data case has a JSON receipt, CSV accepted-step history and NPZ arrays (`heights`, `times`, `blocked`, `initial`). Blocked cells are NaN, never material. The fluid height is positive; excess `h-b` may be negative because the precursor itself redistributes. Field metrics/cumulative values are post-source states at CSV `time`; solver-step fields describe the outgoing transition. The terminal row has no outgoing transition.

Text hashes use LF-normalized UTF-8. Compressed input, NPZ and PNG hashes use raw bytes. No production source/static file, formation law, renderer, sound solver, PR, merge or adoption is part of this pass.
