# Spatial dynamics visual artifacts

Offline diagnostic views of the completed accelerated 7,200 model-second seed `20261005` captures. The rows compare `production` and `dtFeedback` from the same starting seed. They are not browser/runtime stability evidence or evidence that behavior is biologically/socially organized.

The checkpoint sheets cover 300, 600, 1200, 1800, 3600, 7200 model seconds. The trace sheet uses the exact preceding 120 model seconds at 10 Hz for 600, 1800 and 7200 seconds. Source coordinates remain in renderer screen convention: normalized x increases rightward and normalized y increases downward.

Pheromone panels use the same fixed two-scale alpha transfer as `src/lib/renderers/AntRenderer.js`, rendered as gray over white, with checkpoint ant positions and headings overlaid. It is not normalized per panel. Material panels show the OR union of the per-Plate 96×96 masks. Principal route colors are fixed 1200-second birth cohorts for legibility; those colors are diagnostic and are not part of the production renderer. Ant headings use `cos(heading), sin(heading)` in screen coordinates.

Traces connect an ID only across adjacent samples where it remains present. An absent sample breaks the line; a displacement over 0.1 normalized units is treated as a wrap/teleport break. No identity is inferred across exit or re-entry.

These graphics distinguish live snapshots, persistent union and principal-route history. They are visual aids and do not establish route turnover or social roles. Input hashes, source hashes, definitions and image receipts are in `manifest.json`.

## Reproduction

From repository root, with Pillow available in the bundled Python runtime:

```powershell
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/ant-spatial-visual.py
```

The script refuses to overwrite an existing output directory and reads only the two explicitly named completed `result.json` inputs. It checks schema, seed, checkpoint presence, fixed field/mask shapes, route indices, sampled tick range and output receipts.

## Outputs

- `field-checkpoints.png` — 2548×962, SHA-256 `906246af3bc0de150905079658650480c5cac79a3621d99185a9d2b90ad6171f`
- `ants-checkpoints.png` — 2548×962, SHA-256 `67a4521e87e21638fa26c63ff64be1eb4641f160db18344e2e49fd6f46462411`
- `material-checkpoints.png` — 2548×962, SHA-256 `18b3b488fa7c49fae5bed7e41924887cf49d6d193cad43a9444c06f4f23aa73c`
- `routes-checkpoints.png` — 2548×962, SHA-256 `e928123799b0aa81019a2bc514bffc88f719c648517ce9ba20cc8d0f73ba7c35`
- `ant-traces-120s.png` — 1336×966, SHA-256 `3b571cd5edf97edd3f844a04f6fa50dced72dfcea08767380856b1a5ac171198`
