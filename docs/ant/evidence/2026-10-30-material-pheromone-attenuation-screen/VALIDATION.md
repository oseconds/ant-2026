# Pass 3 validation

## Executed checks

```powershell
node scripts/ant-material-pheromone-attenuation-screen.js --self-test
node --test tests/ant-material-pheromone-attenuation-screen.test.js
node --test tests/ant-gaster-deposition.test.js tests/ant-gaster-integration.test.js tests/ant-material-locomotion-resistance.test.js tests/pheromone-field.test.js
node --input-type=module -e "import('./scripts/ant-material-feedback-screen-analysis.js').then(m => console.log(m.selfTest()))"
node scripts/ant-material-pheromone-attenuation-screen.js --run
node scripts/ant-material-pheromone-attenuation-screen.js --analyze-only
& 'C:/Users/5dudt/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/ant-material-pheromone-attenuation-atlas.py --check
```

All passed. New direct tests: **7/7**. Relevant unchanged production tests: **24/24**. Pure analysis self-checks passed. The second saved-data analysis invocation required exact JSON equality, not a replacement of existing analysis. The atlas regenerates byte-for-byte and was visually inspected. Node v22.23.2; bundled Python 3.12.14 / Pillow 12.3.0.

There was one completed control replay and one completed candidate run, with no failed natural-world attempts. Observed wall time was approximately 14.53 s control and 14.80 s treatment on this machine; neither value claims browser/audio performance. Full repository tests/build were not run for this offline research scope. No production source, configuration, dependency, browser resource or audio path changed.

## Manipulation validity

- Tick-entry public material column counts at existing ant body cells are captured as scalar values. Native motion cannot move the lookup to the destination or expose later layer writes to it.
- Current 10% locomotion resistance is explicitly asserted On in both arms. Production source hashes pin its actual implementation and the unchanged native controller/Gaster/field paths.
- Only native `GasterDeposition.advance`'s rate argument changes. Each tick-entry ant has exactly one advance. Every emitted deposit's native geometry matches a nominal accumulator on that **same realized path**; no claim makes that accumulator a control world.
- The mixed-L single-ant fixture carries .004 distance at L=4, then .004 at L=8 across a .006 dab threshold. The amount and remainder match chunk-wise integration; retirement after L changes again flushes the stored amount without another factor.
- Complete L=0 identity, factor bounds/monotonicity, destination-versus-entry behavior and same-tick mutation are tested. No rate, distance, dab threshold, release position, retirement, gait, sensing or field-decay parameter is tuned.
- Native teardown clears transient gaster state after the final simulated tick. The audit retains the last observed pending amount; it does not manufacture a final field flush. Effective dose equals emitted plus pending within approximately `1.3e-10` in the full runs.
- Native source requests are saved, including retirement deposits. The candidate's 98,475 point requests reconcile requested dose to accepted in-domain dose plus boundary rejection; no saturation or writer mismatch was observed. Their sums remain authored source units, separate from field coefficients/integral.
- Source reads precede all 36 actual Plate births in each arm; every birth replaces the layer array after the reads. The first attenuated/pending chunk is tick 5,042, after the shared P1 birth. No future material leakage is observed.
- The instrumentation contains no RNG calls. Control parity below verifies observer neutrality in the full production replay. Treatment trajectories and later RNG scheduling may diverge; final RNG call counts are reported rather than claimed equal.

## Control and frozen provenance

The control raw gzip is byte-identical to frozen current-G seed005, SHA-256 `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`. All five checkpoint gzip files match their original hashes exactly. This includes raw positions/contact buckets, contact and Plate hashes, stored Nodule records, field/surface/occupancy/persistent masks, initial state and final RNG. Checkpoint RNG state/calls also match at 30/60/120/300/600 s.

Before starting treatment, all **40** control B/C/D/E/F/S/pre-existing-material anchors match the frozen late opportunity input. All treatment anchors are present at the same tick/time, without interpolation. Strict birth-time `< anchor` defines prior material in both arms. Saved actual masks match their arm's birth receipts; C0 or proxy masks are not used.

Current production authority is fresh main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; common research parent is `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a`. `SOURCE-HASHES.json` pins the inspected implementation/tooling. `manifest.json` additionally covers generated outputs, research scripts/tests, daily records and reused inputs, using canonical-LF text/raw binary receipts.

## Independent review and limits

A fresh Max-reasoning acceptance reviewer independently checked the control raw/five checkpoint bytes, all 17 recorded source hashes, 40 frozen control anchors, recent-foot windows and all 36 original mask hashes/times. It reran the self-check and saved-data analysis; no replay, provenance or evidence blocker was found. It independently recommended **MIXED**.

The strongest remaining counterexample is untested locality value: there is no equal-total-dose global-throttle world control. Outcome differences can combine lower chemical supply, changed source placement, adherence, traffic and recruitment. Serial anchors are not independent seeds. One-second first/last sightings and divergence times are sampled, not exact lifetimes or first motor events. Nodule endpoint equality is cap-censored.

Per-chunk rows were hashed and runtime-asserted, not retained individually. The emitted source stream permits independent dose/field reconstruction, not reconstruction of every chunk's L, distance or nominal rate. No artistic benefit or multi-seed robustness is established.

## Pre-result corrections and preservation

- Direct tests initially compared ants at different fixed L. Independent review required the actual same-ant, mixed-L pending-dose fixture; it was added before world execution.
- Parent inspection found the native runner's controller teardown would erase pending-dose state before audit. The audit now uses retained last-tick values; a teardown fixture passed before execution.
- Parent strengthened consumed geometry, birth ordering, checkpoint RNG/persistent-mask parity, and preservation of full run summaries/source requests before launch. Incomplete attempts would retain their temporary directory instead of deleting diagnostic material. No natural run failed in this pass.
- Prospective position divergence is ID/x/y only, distinct from changed local telemetry/adherence. Offline analysis separately preserves the first sampled telemetry/contact changes.
- Only the registered law was run. There was no amplitude/scale sweep, treatment stacking or outcome-driven tuning.

The full investigation later creates a separate frozen-source residence probe. Its files are outside this Pass 3 commit scope and do not change this run. Production/static/canonical guide equality, scoped staging, output hashes and remote equality are checked at delivery. No PR, merge, force-push or adoption.
