# Validation and reproduction

## Provenance and unchanged production

Fresh fetched main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; research parent `66e1b9812fc160910f60b18f17e49e8d3b674ee9`. Production source, static resources and canonical ANT README remain byte-equivalent in Git to both baselines. Prior evidence is not edited.

The extract pins the original Git gzip by SHA before decoding. Re-extraction compares full decoded compact JSON without overwriting. Runtime pins compact gzip SHA and LF-canonical production selector source SHA. `manifest.json` records every new artifact except itself, plus protected production Git tree/blob identities. Text receipts canonicalize CRLF to LF; gzip/PNG receipts hash raw bytes. Text lengths in the manifest are canonical UTF-8 lengths.

No live observer/replay was installed. The new scripts never instantiate a world or agent. Full natural-world parity is therefore inherited only from the original capture receipt; it is not newly claimed here. The newly checked parity is **frozen current selector thinning F and selected I**, ten exact matches each. Current full selector is evaluated on same E/D/B as its saved capture; no alternative BODY is generated.

## Executed checks

| Check | Actual result |
| --- | --- |
| Upstream extraction `--extract`, then `--extract --check` |Pass; same exact raw SHA and compact JSON|
| `ant-proposal-emergence.js --self-test` |Pass; exact graph diameter against independent Floyd-Warshall cyclic/disconnected oracle, simple/empty path and digital-line fixtures, overlap arithmetic|
| `ant-emergence-landscape.js --self-test` |Pass; two known peaks/saddle, plateau, elder tie, simultaneous equal-level merges/reflection, diagonal connectivity, row wrap, invalid/nonfinite domains|
| `ant-proposal-emergence.js --run`, then `--check` |Pass; identical full deterministic JSON; all computations inside registered90wall-second budget; individual command about5.5s on this machine|
| Production F/I parity |10/10 and10/10 exact cell-set matches|
| Containment / topology |Every natural and stress path is in its supplied E; at most one eight-connected component; no duplicate nodes|
| RNG / input preservation |Global Math.random tripwire plus VM Math.random tripwire;10/10 input-frame hashes unchanged|
| Atlas normal generation and `--check` |Pass;2064×871 PNG; deterministic bytes; actual final-image center pixels checked for all highlighted A/B/C cells|
| `node --test tests/trail-plate-birth.test.js` |7/7 pass on unchanged production source|
| Protected paths and scoped diff |No production/canonical/prior-evidence changes|

**Recorded failed environment attempt:** the first focused production test command could not spawn the Node test subprocess (`spawn EPERM`) in the restricted execution context. The identical command was retried with the permitted execution context and passed all7tests. This was not a production assertion failure and was not hidden by changing tests.

Source-contained assertions do not prove artistic success, physical resonance, domain meaning or long-run selectivity. The one-cell stress fixtures deliberately hold B/D fixed while deleting E; they are representation sensitivity tests, not alternative natural histories.

## Reproduce from repository root

```text
node scripts/ant-proposal-emergence.js --extract --check
node scripts/ant-proposal-emergence.js --self-test
node scripts/ant-emergence-landscape.js --self-test
node scripts/ant-proposal-emergence.js --check
python scripts/ant-emergence-atlas.py --check
node --test tests/trail-plate-birth.test.js
```

The Python renderer requires Pillow; this run used Python3.12.14/Pillow12.3.0 from the bundled runtime. Nodev22.23.2. Extraction requires the pinned upstream Git object; all later checks use the committed compact packet and current source. `--run` regenerates analysis only; normal Python invocation regenerates atlas only. A full re-extraction writes only the new package input, not upstream evidence.

## Independent review and omissions

A fresh independent Luna Max reviewer inspected the current scripts, frozen inputs, outputs, atlas and report. The reviewer independently reran proposal self-test/deterministic analysis, landscape fixtures and atlas byte/pixel checks; all passed. Their local Git extraction subprocess met the same environment `EPERM`, covered by the parent's successful permitted-context extraction rerun.

One P2 documentation finding was accepted:901/1172 E-component cells had been mislabeled as preceding thinning/path selection. The row was removed from the funnel and replaced with an explicit downstream crosswalk from the already selected source. Measurements and candidate outputs did not change. Final review found **no remaining blocking math, provenance, containment or claim issue**. Limits remain one source-biased H0 seed, unresolved material semantics/local scale, and no long-run selectivity evidence. Parent accepted those bounded conclusions; technical passage is not an artistic verdict.

Full `npm test` and `npm run build` were not run: changed scope is standalone offline research scripts, atlas and docs; production is untouched and the directly consumed formation module's focused7tests passed. No compiler, pickup, solver, audio, browser runtime, seed generalization, long-run accumulation, natural replay, UPDATE or viewer study was performed.
