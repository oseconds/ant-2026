# ANT Plate sonic individuality — 2026-10-13

## Decision

**Selected current-law Plates already have distinct isolated measured responses. No system-wide primary identity bottleneck is demonstrated.** Geometry remains a strong source of spectral variation when every selected Plate uses the same observed median material. The natural material range contributes small frequency shifts and substantial accumulated phase differences, but little level or decay-envelope variation. This does not establish human audible discrimination.

The strongest identified common restriction is the **3 ms contact envelope's frequency-selective excitation**, rather than collapse of all Plate differences inside the solver. It is a supported transfer fact and a candidate responsibility, not a demonstrated cause of inadequate sound. The next bounded hypothesis tests **contact duration only**, in a shadow processor. No production candidate is implemented or adopted here.

## Baseline and boundaries

- Live `origin/main` was fetched and verified at `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`. Branch: `codex/ant-plate-sonic-individuality-20261013`; primary worktree, no new worktree.
- Production source is unchanged. Preserve 3 ms direct contact, 75 ms local recovery, ×50 Plate damping, material mapping, point pickups, Z/Nodule topology, and optional default-Off Base Substrate.
- Audio remains downstream of the world. Formation, morphology, selector, temporal history, vitality, behavior, social feedback, and mature realtime optimization are parked.
- The formation research at `70bef249a4e451e1fc26ee18ecc5da801ff27433` was read only for frozen inputs/provenance. No merge, cherry-pick, or temporal-tool import. `docs/ant/archive/**` was not accessed.
- Selector-shadow stash `243e7453c962dedfa99aeeef2caaec8472af02f3` remains untouched. The pre-existing dirty research worktree is preserved.

The [precommit Git inventory](git-hygiene.json) records tracked, untracked, ignored and worktree state. Existing ignored artifacts and unique research material were preserved; only this investigation's stale regenerable metrics copy was removed.

## Inputs and sampling

The inherited morphology-attribution `birth-measurements.json` at `70bef249…` contains **100 actual frozen births** from current-production/default-On-locomotion runs: seeds `20261005/06/07`, 29/33/38 births. Its declared production baseline is `d45823d`. Read `births[].frozenPlate`; no natural simulation was rerun.

[Descriptor roster](descriptor-roster.json) records every birth and compiled coefficients. Twelve descriptors were selected without images or audio: the median ordinal birth of each seed, both observed stiffness extrema, then deterministic maximin coverage of range-scaled node count, path length, width, boundary fraction, pickup distance, and stiffness. This is a sampling rule, not a sonic ranking. The selected set spans 231–1,844 occupied 96-grid cells and 48–350 solver nodes.

- Seed 05: Plates **1, 15, 23, 24, 27**.
- Seed 06: Plates **14, 17, 24**.
- Seed 07: Plates **1, 20, 26, 31**.

All 100 materials have density **1.2**. Stiffness spans **0.9045947712–0.9208084698**; damping spans **0.3518379085–0.3583233879**, with `damping = 0.4 * stiffness - 0.01`. Thus these two natural coefficients cannot be independently attributed from native observations alone.

[Frozen inputs](frozen-inputs.json.gz) contains portable selected descriptors and a separate seed-07 final 600 s world: 38 Plates and 32 Nodules. The ignored source snapshot's byte size/hash and the Git birth-blob hash are in [render manifest](render-manifest.json). The full source world/temporal records are not copied into this package.

No exact per-foot natural excitation schedule paired with this 100-birth corpus was found. Controls are therefore labeled controlled, not natural replay. The three-contact subset uses identical timing, strength and footprint at homologous path positions; it is not reconstructed gait.

## Controlled renders

Every measurement uses stereo 48 kHz, fixed output gain **1**, 1.5 s duration, first contact at frame **480** (10 ms), strength **0.035**, footprint **0.01**, and the unchanged worklet. Path contacts use nearest actual principal-path cells at 25%, 50%, and 75% of arc length. Different Plates consequently share source conditions, not identical spatial modal projections.

The 97 cases comprise:

1. 12 Plates × 3 positions × native/observed-median material = **72** isolated responses.
2. Three reference geometries × observed low/high paired material at midpoint = **6** responses.
3. Three reference Plates × a common three-contact schedule at 10/260/510 ms = **3** responses.
4. Four exposed Plates × isolated/world-without-links/Z/Z+Nodule = **16** responses.

Isolated topology has no adjacent links, Nodules or Base. Material swaps retain exact geometry, pickups, routing and spatial payload. All median/low/high materials are actual observed descriptors. No synthetic material endpoints, strike randomness, gain tuning, alternate solver, or new production DSP was used.

The VM harness adds exact frame scheduling and observes fields after the unchanged recurrence. A focused control compares its PCM, final fields and physics telemetry to an uninstrumented production processor. Three representative native midpoint responses additionally match Chrome's real OfflineAudioContext/AudioWorklet PCM **byte-for-byte**. [Browser receipts](browser-parity.json) identify frames, browser version, accepted strikes and PCM hashes.

## Measurement results

[Response metrics](response-metrics.json) retain per-case output/field spectra, energy timing, channel/pickup response, matched pairs and ablations. [Measurement summary](measurement-summary.json) provides compact descriptive ranges. These are not one individuality score or a perceptual acceptance rule.

Across the 36 isolated native one-contact responses:

| Measurement | Observed range |
| --- | ---: |
| Pooled response RMS | −58.02 to −37.71 dBFS |
| Spectral centroid | 47.18 to 225.12 Hz |
| Time containing 90% of captured response energy | 453.48 to 524.29 ms |
| Maximum pre-limiter magnitude, all cases | 0.086665 |
| Nonfinite PCM/state, rejected routes, clipped solver steps | 0 |

The level range includes source/pickup position and geometry; it is not solely material character. Spectra and channel responses differ even with common material. At midpoint, native pairwise fine-resolution power-spectrum cosine has median **0.01453**; common-material cosine has median **0.01523**. Narrow modal-line shifts can strongly change this number; it is evidence of measured transfer differences, not proof of audibility. The analysis also reports coarse fixed 50 Hz power bins and 25 ms RMS envelopes to expose this limitation.

The soft limiter applies to every nonzero sample. At the largest observed pre-limiter magnitude it reduces that sample by **0.722 dB** before interpolation. Zero solver clipping does not imply an inactive limiter.

At fixed 50 Hz analysis bins, midpoint output cosine spans **0.0203–0.99896** (median **0.5400**), versus common-material **0.0201–0.99895** (median **0.5352**). Some natural pairs thus have very similar broad distributions even when their modal lines differ. There is no all-Plates-distinguishable conclusion.

Replacing native materials with the observed median changes response RMS by only **−0.0944 to +0.0884 dB**. Yet phase-sensitive relative L2 difference spans **0.0136–1.1091**, and narrow-line spectral cosine spans **0.3603–0.99993**. Coarse 50 Hz cosine remains **0.998785–0.999999999**, 25 ms envelope cosine **0.999111–0.999999972**, and centroid shifts **−0.781 to +0.619 Hz**. Small frequency changes accumulate phase over a ringing response. Therefore “material is silent/redundant” would be false; broad envelope/distribution changes are small at these stated analysis resolutions.

Geometry-only differences persist across common-material renders. Geometry and material are not redundant. Material has a much narrower available native range, while contact position and point observation select which geometry modes reach a channel. The near-common decay envelope is compatible with frequency-independent per-Plate damping; it does not erase spectral identity.

## Descriptor and field/readout responsibility

Implementation facts:

- Compiler coefficients are `[0.012 * stiffness / density, 0.0002, density, 9e-6 + 18e-6 * damping]`; production multiplies the last coefficient by 50.
- The exact 96-grid mask is union-rasterized onto a 32-grid topology; diagonal descriptor edges can add a bridging cell. Four-neighbor stencils define the Plate field.
- Two path pickups snap to occupied solver nodes. Direct contact injects an integrated Gaussian footprint, normalized in L2 and divided by `sqrt(density)`.
- Path, widths, centerline and provenance are not additional vibration variables beyond their geometry/material consequences. Strike `hardness` is carried by the bridge but not read by `applyStrike`.
- Plate pickups now use scale **1**; Sphere modes retain **1/√12**. Their sums pass through `x/(1+abs(x))` and 6→48 kHz interpolation.

Field spectra sum squared Fourier magnitudes across nodes, before spatial cancellation. Output spectra use the actual stereo point readout. Most pairs remain different at both stages. There are selective-observation counterexamples: seed-05 Plate 24 vs seed-06 Plate 24 midpoint has field fine-spectrum cosine **0.06535**, output cosine **0.66248**; their coarse 50 Hz cosines are **0.47282** and **0.82485**. The opposite also occurs: seed-06 Plate 14 vs seed-07 Plate 26 has coarse field cosine **0.94316**, output **0.68092**. Readout can increase or decrease contrast. This is not proof that all identity is lost at pickups. A summed-field energy spectrum is not an alternative microphone or a physically equivalent output.

No repeat of the earlier distance/aperture sweep was needed. Existing 48-node evidence establishes locality with nonmonotonic counterexamples. The rejected one-hop Gaussian aperture and its follow-up do not establish pervasive antiphase cancellation.

## Exact linear modal audit

[Modal transfer](modal-transfer.json) derives the isolated, all-active recurrence directly from current packed stencils. At spatial eigenvalue `q` of `-L`, the recurrence is:

```text
x[n+1] = (2 - d - b*q² - t*q/rho) x[n] - (1-d) x[n-1] + (1-d) f[n]
d = 50 * compiled damping
```

Missing neighbors contribute zero; `-L = 4I - A`. A four-neighbor grid graph is bipartite, so eigenvalues pair around q=4. Identical median mode frequency under common material is a graph identity, not geometry collapse. Common-material lower pole bounds still span about **25.9–109.2 Hz**, upper bounds **633.9–722.7 Hz**.

The 18-step half-sine contact has exact normalized frequency response. It retains about **0.702** amplitude at 200 Hz, **0.423** at 300 Hz, **0.169** at 400 Hz and has a null at 500 Hz. It is not a monotonic filter; higher lobes and nulls remain. At native mode poles, median equal-weight mode attenuation is about **12.1–12.4 dB**. These mode counts are not strike/pickup weights. Damping, spatial excitation and observation still determine which modes matter in real renders.

The modal audit omits stateful compliance, sleep/wake and network coupling. It supports an excitation-bandwidth hypothesis, not a physically calibrated Plate model or an audible preference.

## Z and coupled world

The final current-law seed-07 world compiles to **10,942 nodes**, 38 Plates and 32 Nodules. Test the four Plates with the largest exposed cell counts: **38, 37, 36, 35**. Each receives one contact at the exposed source cell nearest its path midpoint.

Removing links only in the shadow retains all layers/routing and produces **exactly the isolated PCM** for each Plate. Restoring Z changes response phase/transfer: correlation **0.9077–0.9915**, fine power-spectrum cosine **0.8843–0.9933**, relative L2 **0.1301–0.4298**. Coarse 50 Hz power cosine remains **0.999324–0.999999**, while RMS changes only **−0.0188 to +0.0049 dB**. It preserves a closely related response under these probes; this does not establish musical usefulness or absence of dense masking.

Adding the frozen 32 Nodules gives exactly the Z-only PCM in these four 1.5 s single-contact probes. None of the four selected exposed Plates directly hosts a Nodule foundation, and active Sphere-mode telemetry remains zero. This is not an adequately excited Nodule test. Do not conclude that Nodules are silent, redundant or globally harmless. Dense simultaneous contacts, older/deeper layers, evolving topology and long-duration mixing remain unmeasured. No Z simplification or runtime optimization is selected.

## Base versus Born

[Prior transfer verification](prior-transfer-verification.json) freshly checks stored WAV hashes, inverse-limit reconstruction and arithmetic without rewriting prior evidence. Historical matched raw gap **+34.594 dB** decomposes into readout/limiter **+25.793**, reconstructed displacement **+8.801**, expected input proxy **+1.121**, residual **+7.680 dB**. Unrecorded per-node generic strike jitter bounds residual to **+7.021…+8.413 dB**.

The residual remains a mixed transfer bundle: solver discretization, spatial mapping, centroid/group versus per-foot input, dispatch timing, geometry/topology, loss and observation. It is not a pure solver constant or physical-equivalence comparison.

Historical Born readout used `1/√12`. Current Plate readout is 1; its direct scale gap to generic factor 8 is **18.062 dB**. Stored descriptor/schedule-matched current-readout B PCM gives **24.006 dB** matched raw gap for that legacy isolated P1 case. This corrects the historical scale interpretation; it is not a new current-law world render. The generic exact random realization was never captured. No new generic solver render or wholesale replacement was needed to isolate this responsibility.

## Listening and visual artifacts

[Local listening sheet](listening.html) contains the 12 midpoint native clips. Measurement column uses fixed gain 1. Optional listening-only column matches pooled stereo RMS **0.02**; its gain is recorded in [listening manifest](listening-manifest.json). It cannot support amplitude/transfer claims.

**Cross-Plate perceptual status at the original measurement pass: not tested.** The measurements show distinct isolated responses, and the separate contact-position work shows strong within-Plate response change. Neither measurement result establishes perceived cross-Plate identity.

**2026-10-18 listening follow-up:** the exploratory natural blind session is now complete. Its unchanged [source JSON](../../subjective-listening/2026-10-13-plate-sonic-individuality-subjective-listening.json) records this listener's confidence and free notes. The separate [temporal-envelope investigation](../2026-10-18-plate-temporal-modulation/README.md) joins those judgments only after freezing a full-corpus diagnostic. This does not revise the original measurement conclusions or establish population-level perception or cross-position identification.

[Cross-Plate blind viewer](cross-plate-listening.html) prepares six exploratory between-Plate trials from the twelve frozen p50 entries, paired once each in adjacent listening-manifest order. One hidden A/A catch reuses the first entry's exact bytes on both sides. Before Reveal, playback is RMS matched only; fixed-gain playback is available after Reveal as amplitude/transfer context. The matched files remain unchanged and use a playback-stage Web Audio gain to target digital pooled stereo RMS **0.08**. This is not calibrated SPL or equal-loudness evidence. The later completed human session is linked above.

The 24-file cross-Plate listening subset is committed in [`cross-plate-listening/`](cross-plate-listening/) as portable evidence. The larger raw/render package remains ignored under `test-results/ant-plate-sonic-individuality-20261013`; its original listening manifest retains the historical source paths and generation provenance, and the copies preserve its recorded byte sizes and SHA-256 values. Open the viewer from `file://` when the browser permits, or serve the repository root locally with `python -m http.server 8000`. GitHub's file preview is not a playback surface. The generated page contains metadata and relative paths, not embedded PCM. [`cross-plate-viewer-config.json`](cross-plate-viewer-config.json) and [`cross-plate-viewer-validation.json`](cross-plate-viewer-validation.json) record the deterministic roster and source receipts.

No preference, general human identification, formal significance, geometry cause, or production acceptance claim follows from the existing measurements. Any later export can support only a report of this listener's responses on these selected pairs.

[Fixed-scale comparison](isolated-fixed-scale.png) reuses the locked renderer: ±1 waveform; 1024 Hann/256 hop; 0–8 kHz; −100…0 dBFS; no normalization. Six 1.5 s clips are padded to its existing 10 s display. Numeric response spectra use full post-contact rectangular FFTs with Parseval accounting, a separate analysis from the fixed Hann spectrogram.

## Single next bounded pass

**Hypothesis:** If the common 3 ms contact envelope restricts access to geometry-specific higher modes, then changing only its shadow duration from **18 to 6 physics steps (3 to 1 ms)** on these frozen inputs should increase measured 300–1,000 Hz field/output contribution and alter geometry-conditioned spectral contrasts, while preserving topology, solver coefficients, integrated per-node contact impulse, compliance state update, event schedule and pickups.

- One responsibility: temporal width of direct excitation. Retain the same normalized half-sine family and unit envelope sum. Do not change spatial footprint, strength, readout gain, damping, solver rate or material mapping.
- Frozen inputs: these 12 descriptors, 36 one-contact schedules and the common three-contact schedules. Begin isolated; no new natural simulation or coupled-world redesign.
- A/B: production 18-step pulse versus one declared 6-step shadow. No sweep or prettier-sound search.
- Measurements: accepted events and requested/compliant impulse proxies equal; finite state/PCM and limiter accounting; field and actual-output band shares, peaks, envelope/energy timings; same-material geometry pairs and same-geometry material controls; fine and coarse spectra. Unit impulse preservation does not imply equal physical/work energy or equal output RMS.
- Listening: fixed-gain A/B plus explicitly labeled level-matched listening-only A/B. Record timbral/identity judgments separately. No subjective preference becomes an empirical threshold.
- Reject/park if newly reached modes do not alter useful geometry contrasts beyond a common brightening/level shift, if broad response differences already suffice and no listening limitation is demonstrated, or if finite state/contact invariants fail. Do not proceed to damping/readout/material tuning after rejection.
- This proposal is **unimplemented and unadopted**. Production remains 3 ms/75 ms/×50/current mapping/current pickups/current Z/Nodule topology.

## Reproduction, artifacts and validation

```powershell
node scripts/ant-plate-sonic-individuality.js
& '<Python with numpy>' scripts/ant-sonic-response-metrics.py --self-check
& '<Python with numpy>' scripts/ant-sonic-response-metrics.py test-results/ant-plate-sonic-individuality-20261013/render-index.json docs/ant/evidence/2026-10-13-plate-sonic-individuality/response-metrics.json
& '<Python with numpy>' scripts/ant-sonic-modal-transfer.py --self-check
& '<Python with numpy>' scripts/ant-sonic-modal-transfer.py
node scripts/ant-sonic-individuality-report.js
node --test tests/ant-sonic-shadow-render.test.js tests/surface-plate-worklet.test.js tests/compile-surface-topology.test.js tests/surface-audio-bridge.test.js
```

Use the checked-in frozen-input file to reproduce without the original research checkout or ignored source snapshot. First-time extraction records its source Git blob and snapshot hashes; it does not execute formation tools. Installed Chrome and numpy are required; no dependency was added.

Large raw PCM, all-node field arrays and regenerable topology arrays stay in verified ignored `test-results/ant-plate-sonic-individuality-20261013`. Each omitted render artifact has role, path, exact bytes, SHA-256, generation command and source/tool hashes in `render-manifest.json`; listening exports have the same provenance in `listening-manifest.json`. Compact metrics, manifests, frozen descriptors and the useful fixed-scale image are committed. No file above 50 MB is committed; pushed temporal history is not rewritten.

Focused tests **43/43** pass. Python response/modal self-checks pass. Chrome/VM exact PCM parity passes for three representative cases. The fresh [validation receipt](validation.json) verifies all **297 unique manifest paths** by byte size and SHA-256, including **285 ignored output files / 815,353,681 bytes**. Full application tests/build are not rerun: production source/dependencies/config remain unchanged. Test success validates the harness, not the sonic hypothesis.

Fresh [independent acceptance review](independent-review.md), by a Luna subagent at Max reasoning, found no blocking defect and independently reran the five shadow-harness tests. It retained the adequate-system null: no listening evidence establishes a practical sonic deficiency, and the duration proposal remains a falsifiable shadow hypothesis.

The initial attempt finished raw renders but failed on Vite's local bind before parity/manifest completion. The final run used a minimal ephemeral-port HTTP server, repeated the same frozen audio controls and completed all verification. This is tooling recovery, not another world experiment.
