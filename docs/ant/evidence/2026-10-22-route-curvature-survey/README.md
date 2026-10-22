# ANT route curvature responsibility survey

Research only, from freshly fetched `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`, branch `codex/ant-route-curvature-survey-20261022`. Production source, movement/material laws, recruitment, selector, renderer and audio remain unchanged. Canonical production README is therefore unchanged.

The strongest measured responsibility is the **previous-angular-velocity feedback in the local heading correction**, rather than the adherence direction score alone. Natural high-adherence movement frequently alternates saturated turns while traveling almost straight. Removing only that feedback term strongly changes turn persistence in two natural seeds. There is a separate field-grid alignment failure downstream; connected controlled curves can survive unchanged Plate selection.

See [REPORT.md](REPORT.md) for classifications, six answers, claim boundaries and limits; [PLAN.md](PLAN.md) for sequential experiment choices; [source-audit.md](source-audit.md) for code facts and alternatives. [Natural capture](natural/README.md), [controlled probes](controlled/controlled-findings.md), [selector probe](selector/README.md), [readout summaries](readout/summary.json), and [independent review](validation/independent-review.md) contain the supporting detail.

## Evidence and scope

- `natural/`: three 600 s, 60 Hz production model runs, 2,020,081 losslessly packed samples; detached 30/120/300/600 s field/material snapshots; seed/source/artifact receipts. This is accelerated model evidence, not exhibition runtime.
- `decisions/`: matched-current-state decision-only contrasts for the adherence score and exploration probability coupling. No trajectory claim follows.
- `shadows/`: three independent 600 s seed-05 contrasts; only angular damping is replicated on seed 06. No combined intervention. Full coupled counterfactuals diverge in later RNG consumption and lifecycle; they do not preserve the same future event stream.
- `controlled/`: exact production sensing/turning/movement in a disclosed single-agent fixture on straight, constant-radius, mirrored and S-shaped cues; frozen analytic/deposited fields and three forced revisits. The corrected final data alone support conclusions. The initial population-normalization error is retained locally and documented.
- `selector/`: unchanged qualification on controlled connected raster routes, plus real-deposit subcell-alignment comparison. Candidate-to-principal equality is a source copy invariant.
- `readout/`, `visual/`: continuous diagnostics, equal-viewport movement/field/material comparison and isolated shadow/controlled traces. Diagnostic colors are not exhibition rendering or an aesthetic score.
- `execution-sources/`, `validation/`: executed/current tooling copies, regression/build output, provenance verification and fresh review. Source receipts distinguish the original capture writer from the later lossless codec.

## Reproduction

Node 22.23.2 was used. Dependencies are those already installed in the repository. Commands create new evidence cases; supply fresh output directories. Existing committed captures must not be overwritten. Run from the repository root.

```powershell
node scripts/ant-route-curvature-natural.js test-results/curvature-repro-natural 8c60e4bba3bd5b476300e90a2936bfebd1f831c2
node scripts/ant-route-curvature-decisions.js test-results/curvature-repro-decisions
node scripts/ant-route-curvature-natural-shadows.js dampingOff 20261005 test-results/curvature-repro-damping05
node scripts/ant-route-curvature-natural-shadows.js dampingOff 20261006 test-results/curvature-repro-damping06
node scripts/ant-route-curvature-natural-shadows.js scoreOff 20261005 test-results/curvature-repro-score05
node scripts/ant-route-curvature-natural-shadows.js blendOff 20261005 test-results/curvature-repro-blend05
node --test tests/ant-route-curvature-*.test.js
npm test
npm run build
```

The controlled probe and selector-specific README describe their output commands and synthetic inputs. Readout/visual scripts use the canonical input package and accept fresh output paths; they do not step or change production. Complete 60 Hz shadow samples are replayable but only 10 Hz late paths are stored for visualization; sample rolling hashes and full summaries identify the analyzed run. Natural captures retain full precision at 60 Hz. No browser runtime/soak or audio experiment ran in this pass.
