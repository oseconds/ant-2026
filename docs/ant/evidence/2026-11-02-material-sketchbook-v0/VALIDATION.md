# Validation — Material Sketchbook v0

## Authority and scope

- Branch: `codex/ant-material-sketchbook-v0-20261102`.
- GitHub main checked twice: `6dc73380b1985102bc2fb50da8963a7de5a89c71`.
- Primary worktree used; no extra worktree created or existing worktree removed.
- No dependency change. Original `index.html`, production entry, `src/lib`, `src/demo` and `static` are unchanged. Existing controller/renderer tests are unchanged.
- `.gitattributes` adds only scoped line-ending rules for the new byte-hashed package and its two-entry Vite config. Text receipts use LF; PNGs remain binary.
- The existing ignored data, partial material and other worktrees are left untouched. Only this pass's source, tests, entry/config, evidence and daily record are staged.

## Commands and results

| Check | Result | Receipt |
|---|---|---|
| `node --test tests/material-sketchbook-*.test.js` | **15 pass, 0 fail** | [focused log](sketch-test-output.txt) |
| `npm test` | **355 pass, 2 fail, 357 total** | [full log](test-output.txt) |
| `node --test tests/ant-controller.test.js tests/ant-renderer.test.js` | **32 pass, same 2 fail** | [unchanged-test log](baseline-test-output.txt) |
| `npm run build` | **PASS**, original and sketchbook HTML emitted | [build log](build-output.txt) |
| `node scripts/material-sketchbook-browser-check.js --production --record` | **92 pass, 0 browser errors** | [browser summary](browser/production/summary.json) |
| Independent definition/code/claim review | **No remaining blocking defect** | review description below |

The full test suite is **not all green**. The two failures are:

1. `tests/ant-controller.test.js:166`: the old test expects a north-biased recruitment heading, `abs(heading + π/2) <= .3`. Current authority already adopted endogenous outgoing-flow/isotropic recruitment.
2. `tests/ant-renderer.test.js:170`: historical-mask cache drawing expects 2 calls but gets 1.

Both failures reproduce in the isolated unchanged tests. Their files and their production implementation are identical to the authority. This pass imports none of the sketchbook into those paths. The unrelated assertions are preserved rather than repaired here. Sandbox process restrictions initially produced `spawn EPERM` before tests/build could execute; authorized process execution then produced the actual results above. EPERM is not counted as a test success or model defect.

The build retains the existing >500 kB shared-lab chunk warning. No bundle optimization is attempted in this isolated pass.

## Model and probe checks

- A: deterministic replay and inert observation; supplied mass matches retained mass; redistribution continues after source stop; bond reduces mobility; empty graph has zero contact/ground/springs; 1000 s finite positive states.
- B: exact shared initial geometry/masses/footprint; equal normalized input doses and duration in opposite order; different memory after matched input; one shared state-derived stiffness law; quiet decay continues beyond 60 s; 1000 s finite deterministic states.
- C: fixed geometry and masses; positive finite capacities; each star update preserves its incoming capacity sum; global budget remains within floating-point tolerance through 1000 s; bounded state-derived stiffness and stable finite mechanics.
- Probe: empty/zero-contact silence; unchanged input graph; deterministic PCM; mass/stiffness sensitivity; common-clock free-motion solution; high-stiffness graph with numerical substeps.

The single-node clock test confirms `0.01` momentum impulse on mass 1 gives displacement `1.2` after a 1.2 s recording at the declared 100× virtual clock. Doubling mass halves that response. This caught and prevents accidental coefficient-plus-clock double scaling.

## Actual browser evidence

Chrome `157.0.8103.26`, headless, Windows, fixed 1280×1100 viewport and device scale 1. Authoritative evidence comes from the built Vite preview. It is an actual browser run, not a renderer mock.

Thirteen checkpoints cover A/C at 0/30/120/300 s and B at 0/30/40/120/300 s. Every checkpoint asserts `record.tick == state.tick == seconds*60` and the visible time. Every checkpoint is independently rebuilt from the same seed and schedule within the browser; full state SHA-256 and Float32 stereo PCM SHA-256 match. Source state remains unchanged by observation/probe.

Sixteen accepted PNGs include the thirteen ordinary frames plus one diagnostic frame at 120 s for each world. All are verified 1280×1100. They show fixed-scale, monochrome state views, not selected aesthetic highlights. Files and numeric states are in [captures](browser/production/captures/). The main report links representative frames.

The real control path confirms run advances ticks, pause holds them, reset reconstructs the seed, changing worlds creates a fresh independent instance, and the one-hour UI limit accepts its boundary and rejects overrun. API restore and actual JSON download/file-upload restore reproduce the full saved state. A tampered digest is rejected and leaves the current state intact. Imported files cannot replace arbitrary model fields: reconstruction runs the model from seed and checks its entire state before replacement.

Web Audio stays absent through silent exploration and probe rendering. A real listen click creates one running AudioContext, starts a stereo BufferSource with 24 kHz / 28,800-sample data, and transfers PCM exactly matching the selected response (SHA-256 `36e7aa1f56db3236fe31efc96e4f0b1a417d26336b9b0ce10df6f045cb397b77`). This checks playback setup and data, not hardware audibility or sonic quality. The original ANT page also loads without browser errors; this is a load smoke check, not a new ANT behavior campaign.

Rejected attempts remain separate: [sandbox launch](browser/attempt-sandbox.json), [dev rejection note](browser/rejected-dev-hmr-404/attempt-note.md), [failed dev receipt](browser/rejected-dev-hmr-404/summary.json). The dev run was invalidated by HMR changing the world during capture and favicon 404s. It supplied no accepted observations. The final exact-time gate and built-preview route prevent that error from being silently accepted. Data favicon removes the missing resource without changing production HTML.

## Independent review

A fresh Luna agent at Max reasoning independently inspected equations, stability/conservation, UI/replay boundaries, probe causality, final browser receipts and report claims. It found no blocking defect in A/B/C or the frozen probe. It identified an observation/replay limit asymmetry; a shared one-hour UI cap and explicit footer resolved it. The reviewer verified 92 passing browser checks, the B40 matched-input comparison, state-derived responses and matching audio buffer. It retained these claim limits:

- Exact replay is verified in the observed runtime. Cross-engine bit-exact replay is unproven because `sin`, `exp` and `tanh` may differ in final bits.
- B demonstrates leaky directional recency, not immutable or plastic material memory.
- PCM differences and playback setup do not establish perceived sonic differences.
- C conserves the declared abstract capacity, not all mechanical quantities; no zero-capacity edge deletion occurs.

## Hashes and regeneration

The manifest covers all new source/tests, entry/config/line-ending metadata, evidence and daily documentation. It excludes itself and SHA256SUMS from its file list; SHA256SUMS also hashes the manifest. The verification script checks current bytes and guards production source/dependencies and existing tests against authority.

```sh
node scripts/material-sketchbook-evidence.js --write
node scripts/material-sketchbook-evidence.js
```

`--write` creates/replaces the manifest and checksums. Normal invocation verifies without rewriting. Re-run it after regenerating browser receipts to detect changed content. Browser recording uses `--record` explicitly; it intentionally rewrites this pass's generated capture files. Raw PCM is omitted because deterministic regeneration and PCM hashes preserve the tested claim with less stored data.

No PR, merge, force-push, production adoption, or automatic next experiment belongs to this pass.
