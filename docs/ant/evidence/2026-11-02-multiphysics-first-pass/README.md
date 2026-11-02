# ANT multi-physics broad first pass

Research branch: `codex/ant-multiphysics-first-pass-20261102`. Production authority: `5bdd516b412d03d78c2511ceb372180941206968`. Research base: `796d5c7f6c028ea47ca99825d58f15bad3fbc5cc`. Audio reference: `918764c2d4924eb89fd6874122edc30b73d1499c`.

Start with [REPORT.md](REPORT.md). Definitions precede results in the [parent protocol](PROTOCOL.md) and each family protocol. [REUSED-EVIDENCE.md](REUSED-EVIDENCE.md) preserves the scope of the prior audio and 25-run wet-film results. [SURVEY.md](SURVEY.md) covers every archived candidate; [COUPLING.md](COUPLING.md) separates coexistence, explicit transfer laws and executed coupled checks. The archive is an explicitly authorized historical hypothesis source, not production authority.

## Environment and commands

Executed environment: Windows, Node `v22.23.2`; Python `3.13.14`; NumPy `2.5.1`; SciPy `1.18.0`; Matplotlib `3.11.1`. These packages were already installed. No dependency or production file was changed. The embedded interpreter needs the scripts' local import setup; use `-B` to avoid unrelated bytecode files.

From the repository root:

```powershell
$physicsPython = 'C:\AI\ComfyUI_windows_portable\python_embeded\python.exe'

# Focused synthetic, contact, acoustic and inventory checks.
& $physicsPython -B -m unittest discover -s tests -p 'test_ant_multiphysics*.py' -v
node tests/ant-multiphysics-orientation.test.js

# Existing completed film: integrity only, not another 25-run campaign.
# The new verifier checks its immutable files and its pinned former daily index.
& $physicsPython -B scripts/ant-multiphysics-verify.py

# Regenerate isolated controlled cases, without running ANT or audio.
& $physicsPython -B scripts/ant-multiphysics-cavity.py
& $physicsPython -B scripts/ant-multiphysics-fragments.py

# Reanalyze the saved current-production trajectory, without rerunning the world.
& $physicsPython -B scripts/ant-multiphysics-orientation-analysis.py
```

`node --test` uses a child process and encountered `spawn EPERM` in the restricted environment. Running the same focused test file directly worked and still executes the Node test assertions. This is an execution-environment limit, not a waived synthetic check.

The orientation runner's historical input is the exact compressed CONTROL capture at the pinned audio commit. It is not duplicated in this package. A binary-safe extraction, followed by the single-seed paired capture, is:

```powershell
& $physicsPython -B -c 'import pathlib,subprocess; p=pathlib.Path(".cache/multiphysics-reference-control.json.gz"); p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(subprocess.check_output(["git","show","918764c2d4924eb89fd6874122edc30b73d1499c:docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis/seed-20261005-control-capture.json.gz"]))'
node scripts/ant-multiphysics-orientation.js --reference-capture=.cache/multiphysics-reference-control.json.gz --output=.cache/multiphysics-recapture
& $physicsPython -B scripts/ant-multiphysics-orientation-analysis.py --input .cache/multiphysics-recapture --output .cache/multiphysics-recapture
```

The runner checks the capture SHA-256 before use. The required Git object must be available; absence is not permission to substitute older trajectories. Existing saved results need no ANT recapture to reproduce the orientation analysis. Natural interpretation is refused if RUN/REFERENCE conformance fails.

## Data and integrity

- `orientation/`: exact surviving-agent realized segments and prior-material revisions, per-tick state hashes, source/historical conformance, local P/Q fields, supported-loop winding, temporal summaries and the fixed atlas. It contains one current-production history, not a cross-seed population study.
- `cavity/`: explicit geometry/model summary, frequency and time histories, wall-surrogate energy exchange, and fixed-axis figures. The two preparation directories retain superseded short-neck and out-of-band diagnostics; accepted claims exclude them.
- `fragments/`: registered controlled disk/contact cases with timestep/stiffness/friction comparisons, contact/trajectory receipts and figures. Signed energy bookkeeping is diagnostic; its validity limit remains visible in the result.
- `validation/`: definition and literature audits, focused test receipts and final independent review.

The top-level `manifest.json` covers this evidence package, new scripts/tests, the new daily record and shared chronology index. Text is hashed after CRLF-to-LF normalization; gzip/NPZ/NPY/PNG/WAV are raw bytes. `SHA256SUMS` also covers the manifest. Child output receipts may identify the exact emitted file bytes; the top-level convention defines checkout integrity across line-ending changes.

The prior wet-film inventory has 116 file records plus its manifest, giving 117 SHA256SUMS entries. It references the shared daily index, which this pass legitimately extends. Its former index is therefore verified from pinned `796d5c7`; its other 115 records are verified in the current checkout using the older verifier's exact convention (including raw JavaScript and `.gitattributes`). Its evidence package is also required to have an empty diff against that base. No prior receipt is rewritten or reinterpreted under the new package's broader text convention.

After an intentional evidence update, rebuild and then check the inventory:

```powershell
& $physicsPython -B scripts/ant-multiphysics-verify.py --write-manifest
& $physicsPython -B scripts/ant-multiphysics-verify.py
```

The verifier also rejects production/decision-register changes relative to the main authority. Generators overwrite only their own declared research outputs; use a separate checkout/output location when retaining another numerical variant. No command here runs the production AudioWorklet, renderer, a new formation law, a PR, merge or adoption.
