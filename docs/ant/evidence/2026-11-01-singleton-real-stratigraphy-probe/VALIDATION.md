# Validation — singleton real-stratigraphy integration

## Authority and source scope

The primary checkout began clean at `9b03a392588429643cf43b386706d58bbfb66418`, on the seed06 replication branch. The requested research branch was created at exactly that commit. No worktree was created or removed. Existing unrelated worktrees and ignored history were preserved.

Production authority is `bc045dc3caa5954df633ecbee37fbabcb8224f30`. Relative to that authority, the only inherited source difference is the prior default-off `AntController.researchLayerCountProvider` hook. The runner checks the exact source-diff lines. This pass adds no `src/` or `static/` change relative to its parent, and does not change default production behavior. `TrailPlateBirth`, `MaterialStratigraphy`, Nodule logic, audio and renderer code remain unchanged.

The frozen signal metadata is bound to production authority, authority HEAD, Audio Off, 60 Hz and 600 s reference horizon. All eleven normalized-LF source hashes match untrimmed `git show <authority>:<path>` bytes. The 300 s CONTROL comparison uses the first 300 actual native analysis anchors of that frozen history. [Preflight receipt](validation/authority-preflight.json).

The simulation runner, descriptor helper, protocol and initial analysis tools were committed before the campaign at `2a0cb35b6c19cdf969d8c887b2eb4577fcb361b6`. Matched machine histories and reconstruction receipts were saved separately at `5de07f9`. The authority receipt records the execution HEAD and the exact expected parent. Subsequent result-tool changes concern SVG label spacing, quantitative axis annotations and the births chart's missing fourth categorical color; six derived JSON files remained byte-identical. No world run was repeated after those presentation fixes.

## Runtime and conformance

One campaign ran three fresh seed-20261005 controllers, each 18,000 ticks, dt=1/60, 300 nominal model seconds and no AudioBridge. Each arm captured 300 actual `TrailPlateBirth` analyses, from 16.6666667 ms to 299016.6666666 ms. Nominal checkpoints use completed ticks 3,600/7,200/10,800/14,400/18,000. Floating-point accumulated controller time at the final tick is about 299999.999999983 ms; this is not an approximate research clock.

- CONTROL matched E/F/B/C/D, layer/top maps, 14 native birth IDs/times/masks and RNG at every frozen boundary. It matched 25,364 B/C rows, 1,244,304 X-cell memberships, one-to-one frozen track identities and all 277 maturation events.
- Fresh CONTROL matched the saved seed05 CONTROL run object after removing only branch metadata; its legacy fingerprint, metrics, anchors and checkpoints all matched. This gate passed before OVERLAY.
- Fresh OVERLAY matched the saved seed05 treatment object under the same strict projection and the entire prior exposure receipt. This gate passed before REAL.
- REAL used no overlay/provider, no descriptor RNG, native `addPlate`, native Nodule advancement and the same unchanged observer/decision grammar. Actual per-insertion assertions checked exact clocks, disjoint coeval singleton masks, unchanged completed movement/environment/RNG, one native layer per X cell, immutable birth order, no outside-X timer/top/depth change, native Float32 depth, and unchanged Nodule clock/foot load/list during insertion.
- REAL matched CONTROL's legacy fingerprint through the first completed insertion tick 2,521; its first next-tick material snapshot was tick 2,522. First actual ant exposure was 44.0166667 s. No retroactive movement effect occurred.
- All arms checked finite position/velocity/heading, in-domain agents and spawn clearance. No capacity, observer-neutrality or replication stop was encountered. REAL ended with 160/256 actual Plates.

Receipts: [campaign output](validation/campaign.txt), [conformance](analysis/conformance.json.gz), [authority](analysis/authority.json), [exact OVERLAY/REAL comparison](validation/overlay-real-exact-comparison.json). No failed parity gate was relaxed or tuned around.

The legacy controller digest is retained to reproduce the earlier probe. It includes selected material arrays/revisions, but not every private Nodule timer. The separate movement/environment digest deliberately omits stratigraphy/Nodule state. Full material claims instead use immutable masks, insertion receipts, native lineage and reconstructed columns; do not call the movement digest complete material equality.

## Independent reconstruction and contract checks

A fresh Luna Max reviewer checked definitions and code before execution, then independently reconstructed the raw receipts. [Review](validation/independent-review.md) and [machine checks](validation/machine-independent-checks.json) record the exact scope.

- All 151 local descriptors resolve to the accepted source decision/event IDs/channels/time/X and actual insertion order. Every final research mask is exact X.
- All 9,216 native columns, counts, top identities and descending-Float32 above-foundation depths reconstruct exactly from 160 immutable masks. The research component equals OVERLAY's final increment map exactly.
- All 18,000 native tick-entry tuples and exposed-state speed/A/D arithmetic were checked. Complete OVERLAY/REAL exposure JSON and compressed bytes match, including 52,564 exposed ant ticks, 361 ants and 4,255 D outcomes.
- Movement/environment hashes, B/C events/decision-X structures and native birth receipts match through all 18,000 ticks/336 events/nine production births.
- Every research insertion's changed-cell predicates and timers were checked. All 2,498 predicates were unchanged and all timers were already inactive; no effective timer clearing occurred.
- Six REAL Nodule source stacks reconstruct at their actual birth times. Three have research foundations, versus five production-only births in OVERLAY. This is an actual native Nodule difference, not an inferred pressure or a timer-reset effect.
- Pure `compileSurfaceTopology` accepts all 160 actual descriptors plus six Nodules, producing 3,316 solver nodes and 3,077 adjacent links with exact 96-grid top routing/count/order. No AudioEngine, listening, AudioWorklet runtime or performance study was enabled. Solver projection remains 32-grid.

Delegation used Luna High for bounded runner/descriptor/results implementation and Luna Max for contract/causal-order/independent arithmetic review. Parent retained scope, code freeze, execution, classification and final delivery. No new mechanism was invented during review.

## Tests and derived-output determinism

Before the campaign, focused descriptor/stratigraphy/audio-contract/observer/movement/conformance/results/manifest tests passed **44/44**, under normal Node isolation. [Focused output](validation/focused-tests.txt). Agent-local default child-process attempts initially encountered sandbox `spawn EPERM`; the parent reran normal isolated Node tests with approved execution. This was an execution restriction, not a simulation mismatch.

The full suite ran **390 tests: 388 passed, two failed**. [Output](validation/full-tests.txt) and [summary](validation/full-test-summary.json). The failures are the same unchanged authority assumptions recorded by the preceding probes:

1. `tests/ant-controller.test.js:180`: retired north-spawn heading expectation.
2. `tests/ant-renderer.test.js:180`: historical-mask draw-count expectation (one versus two).

Neither test nor its production source was changed here. The later SVG-only repair is covered by the final results suite, **6/6 passed**, including valid rendered colors and numeric axes. [Final results-test output](validation/results-tests.txt). Broad production tests were not rerun for SVG annotation/color changes.

All eleven derived JSON/SVG outputs were regenerated twice from the saved immutable campaign, with exact byte equality; [derived determinism](validation/derived-determinism.json). This replays postprocessing only, not a second simulation campaign. The receipt preserves presentation corrections and unchanged data hashes. Headless SVG screenshots were reopened for [technical inspection](validation/visual-inspection.md), without an audience renderer redesign or artistic approval. A separate [fresh final report review](validation/report-acceptance.md) accepted the bounded class and aggregate arithmetic; its review-time manifest gate was still pending and remains the parent's delivery responsibility.

## Reproduce without overwriting this evidence

Use the installed Node v22.23.2/dependencies and inspect status/diffs first. The runner is intentionally bound to the research branch and source guard. Copy the saved package elsewhere before invoking it: it writes this fixed package path, so a rerun would replace the saved arm receipts. No rerun is required for receipt verification.

```powershell
# Full experiment: only when intentionally reproducing the one-seed campaign.
node --max-old-space-size=8192 scripts/ant-singleton-real-stratigraphy-probe.js

# Saved-data derivation only; no controller is run.
node --max-old-space-size=4096 scripts/ant-singleton-real-stratigraphy-results.js

# Verify delivered package, source/tool hashes, documentation and sums.
node scripts/ant-singleton-real-stratigraphy-manifest.js
```

Raw signal indexes reference adjacent compressed anchor chunks. `readRun()` checks every chunk hash on load. Large field distributions and all singleton/contested observations remain in machine receipts; they were not discarded for a small report.

`manifest.json` and `SHA256SUMS` explicitly use normalized-LF UTF-8 for text and raw bytes for gzip/PNG. The manifest excludes itself and SHA256SUMS; sums include the manifest and exclude themselves. Runtime `.log` files are excluded. The manifest verifier checks complete package inventory, not only listed hashes. Final commit and remote SHA are reported after push without self-embedding a final commit in its own hashed file.

Final package checks verified **128 evidence files, 25 source/tool/test hashes, three branch documentation hashes and 157 SHA256SUMS entries**. All 45 local file links across seven package Markdown files resolved. Staged source/documentation/artifact whitespace checks passed, excluding only `validation/full-tests.txt`: Node's failure formatter emits indentation on four blank lines, preserved as verbatim evidence rather than edited to satisfy whitespace lint.

End-of-pass worktree inspection preserved the two pre-existing unrelated checkouts. Compaction-shielding was clean and up to date; material-experience had two commits ahead of its configured upstream and ignored `.codex/`/`test-results/` state. No checkout was created or removed for this pass. Primary ignored caches and technical screenshot intermediates were inspected and preserved; unique campaign measurements are committed in the package.

Audio On, sonic quality, realtime cost, another seed/horizon, different neutral descriptor coefficients, and production adoption remain untested. The technical compatibility result does not settle material ontology or a formation law.
