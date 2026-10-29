# Validation and limits

## Authority / preservation

- Fresh main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent `8dfd99028db9d34fc23663e2b4f6ad7f9c9a4fc3`.
- Branch `codex/ant-materialization-scope-exploration-20261029`.
- Production `src/`, `static/`, canonical `docs/ant/README.md`, prior evidence, movement/fields/events/RNG/audio are unchanged. No branch merge.
- New scope runner imports only Node standard libraries. The static plotter imports Pillow from the bundled Python runtime. No production modules or body generators are invoked, no new dependency/configuration is added.

## Frozen input and extraction

The runner verifies the original gzip SHA-256 before reading the pinned history packet through `git show`. It extracts exactly the P1/P2 intervals supplied by previously frozen event metadata: 21 anchors each. Commit I/path/H/E match the independent body packet; the source-induced 8-neighbor edge set matches both frozen descriptor edge lists exactly. No Plate ribbon, width or material is generated.

The independent reviewer separately compared all 42 extracted maps and candidate fields against the pinned original packet, and verified original/body input hashes. This is frozen-data validation, not observer parity from a new simulation. The original packet's current-G provenance and parity remain its original evidence; no new controller or RNG ran here.

## Checks actually performed

- `node --check scripts/ant-materialization-scope-exploration.js`.
- `node scripts/ant-materialization-scope-exploration.js --self-test`: diagonal/4-neighbor sensitivity, row-wrap exclusion, induced edges, exact membership changes, empty sets, even/odd median definitions.
- `node scripts/ant-materialization-scope-exploration.js --extract`: one pinned packet extraction and offline observation calculation.
- `node scripts/ant-materialization-scope-exploration.js --check`: deterministic calculation rerun from compact frozen input, byte-identical `analysis.json`.
- `python scripts/ant-materialization-scope-atlas.py` and `--check`, using bundled Python below: deterministic PNG/receipt and 55,296 source-coordinate-center classification checks over six native 640×640 panels.
- Final static PNG inspected with the image viewer for layout/legend/readability. This is a structural figure, not ANT canvas rendering or artistic evaluation.
- Source-tree/working-content preservation, document links, package hashes, scoped staging and `git diff --check`; machine receipt in [validation.json](validation.json).
- Fresh independent Luna Max review of code, extraction, graph interpretation and scope semantics. See [independent-review.md](independent-review.md).

Bundled Python used: `C:/Users/5dudt/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`; Pillow `12.3.0`. An unrelated `python3.12` lacks Pillow; its availability is not the reproduction environment. The final PNG is 1960×1590, with each data panel native 640×640. Plot coordinates are `round(cellCoordinate * 639 / 95)`, with 3-pixel structural glyphs that are explicitly not physical widths.

## Corrections during validation

The first atlas had overlapping row labels. Only row spacing/figure height changed; all structural data and per-panel coordinate scale stayed fixed. The final PNG was re-inspected and passes byte-identical rerender checks.

The first metric helper labeled the lower central order statistic as a median for 20 transitions. Independent review caught this. It was replaced with the conventional average of the two central values, and even/odd fixtures were added. The final report/analysis use those corrected medians. For example P2 edge Jaccard median is `.7249774810575955`, averaging `.7160493827160493` and `.7339055793991416`. No input, selected membership, threshold, example, scope definition, or qualitative conclusion changed.

## Explicit omissions

No full `npm test` / build: new tools are frozen-only standard-library calculations and a static Pillow plot, with no production caller/module integration. Focused assertions, independent input comparison and deterministic reruns cover the changed scope. No live observer/browser, new natural replay, additional seed, 600 s candidate sweep, body/compiler/solver/audio qualification, physical branch reconstruction, new event law, or artist verdict.

8-neighbor graph coherence, exact-cell turnover and snapshot endpoint change are representational observations. They do not reveal physical branch genealogy or changes between approximately one-second saved analyses. The recommended contract is authored working semantics, not a natural law or production-ready open-world selector. Post-push final SHA and remote equality are reported with delivery; no self-referential commit receipt is attempted.
