# Independent review

## Verdict

No blocking scientific, numerical, provenance, or interpretation issue found in the frozen temporal diagnostic or its post-freeze join. The conclusions remain appropriately exploratory and do not support a production change or a stable Plate-identity claim.

## Checks

- Rechecked the frozen method/protocol/output boundary: freeze SHA-256 `219eaa9ea07aff8f2fc08b03293317eef662e193d0bddf8b90bb544c15d3b332`; 42 response receipts and all four frozen artifact receipts verify. Replayed the deterministic corpus and the self-checks; identical-input cosine, positive gain scaling, exponential-envelope slope, silence handling and known-AM controls pass. Historical ERB pair checks reproduce.
- Independently joined the 14 post-freeze interpretation rows to the two raw exports. Session/trial IDs, first pre-reveal judgments and A/B side mappings match. The six natural pairs are all raw `different=yes`; the six synthetic pairs contain five `yes` and one `no`. The synthetic A/A raw `yes` remains preserved while its separate interpretation records the user-confirmed `no`, confidence 5 correction. Raw exports match their recorded hashes.
- Verified both interpretation-output receipts, the visualization script receipt, and the final image receipt. The figure's shared axes, fixed-interval shading and full-clip-RMS-squared display normalization are legible and labeled. The envelope display is descriptive; normalized axes do not change frozen metrics.
- Confirmed the CSV now uses LF line endings and matches its manifest hash. `git diff --check` is clean; production `src/` and `static/` remained unchanged in the inspected checkout.

## Scientific limits retained

The pooled modulation shape is dominated by the low ERB group because it holds 99.9876–99.9999% of natural interval power. One natural response fails the predeclared 1% selected-band-share guard, leaving 34 valid within-Plate and 187 valid same-position between-Plate comparisons. Missing values stay unavailable; they are not zeros. These details support the README's limited-coordinate framing.

The natural comparison does not produce a consistent judgment ordering: P27/P31 has strong temporal contrast despite similar integrated ERB, while the highest-confidence P24/P23 pair has the highest modulation cosine, and weak P15/P17 also has low cosine. The position summaries show only a modest aggregate within-Plate difference with broad overlap and strong per-Plate changes. The synthetic comparisons remain geometry-conditioned output observations under common anchors; the material, excitation participation, modal structure and fixed point readout are not isolated. The single existing modal proof remains scoped to `20261005-trail-plate-24` over its verified autonomous suffix.

These are one-listener observations from one session per corpus. Confidence is descriptive. The evidence does not establish population perception, a perceptual threshold, stable cross-position identity, a causal sound source, or a new production mechanism.

## Commands and read-only audits

```powershell
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -B scripts/ant-plate-temporal-modulation.py --self-check
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -B scripts/ant-plate-temporal-modulation.py
git diff --check
git diff origin/main -- src static
```

The review also compared the interpretation JSON/CSV and image hashes against their manifests and checked the raw session-to-join mappings with a read-only Python audit.

## Post-review provenance check

The five existing inputs whose recorded byte hashes are CRLF now have exact-file `text eol=crlf` rules: the two raw subjective exports, natural render manifest, descriptor roster and listening manifest. I tested `git cat-file --filters --path=<path> HEAD:<path>` with `core.autocrlf=false` and `core.eol=lf` overrides for each path. All filtered checkout outputs exactly match the current working-file bytes and their recorded SHA-256 values. For every input, `git hash-object --path=<path>`, the `HEAD:<path>` blob and the index `:<path>` blob IDs are identical. There is no staged or unstaged content diff in the five input files. New diagnostic JSON/CSV and the separate correction remain explicitly LF.

## CSV free-note preservation check

The derived CSV stores each full note in `freeNoteJson`, JSON-encoding embedded newlines and trailing spaces so they do not become literal line-ending whitespace. I decoded all 14 cells and verified exact string equality with each joined row's `rawFirstJudgment.freeNote`. Current JSON/CSV hashes match the updated interpretation manifest; both original export hashes remain unchanged. This is a serialization-only change with no frozen metric or interpretation change.
