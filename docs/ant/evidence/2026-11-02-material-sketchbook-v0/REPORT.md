# Material Sketchbook v0 — three independent exploratory worlds

Three executable invented materials now share an isolated observation page. The result is an exploration instrument, not a formation-law selection or production-adoption decision. None of these behaviors is claimed to have been observed in production ANT.

Authority: GitHub `main@6dc73380b1985102bc2fb50da8963a7de5a89c71`, verified at start and again before delivery. Research branch: `codex/ant-material-sketchbook-v0-20261102`. Work began November 2; final verification continued November 3, 2026 (Asia/Seoul).

## Run and observe

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/ant-2026/material-sketchbook.html` (use Vite's reported port if 5173 is occupied). The existing ANT entry remains `/ant-2026/`. The build emits both HTML entries.

The page starts paused, Audio Off, seed `20261005`. Select A/B/C, run/pause/reset, choose 1×/4×/16× display speed, and toggle internal state. Speed changes how many fixed updates run, not their equations. A has separate mass/bond/agitation diagnostic views. B displays the paired samples together. C's ordinary view deliberately keeps its fixed outline; diagnostics reveal capacity.

“현재 구조에 작은 probe” computes and displays a response without changing the material. “응답 듣기” creates Web Audio only on that gesture; B's selector plays either paired sample. The response remains labelled with the time at which it was frozen. Save a JSON record and import it to rebuild from seed and tick, then compare the complete state. The page's observation and replay limit is one hour; model unit tests run independently of that UI limit.

## Implemented laws

| Sketch | State and formation rule | What the current-state probe reads |
|---|---|---|
| A | 24×24 mass, agitation and bond fields. Four seeded wandering sources supply mass and disturbance for 30 s. Conservative neighbor transport grows with agitation and decreases with bond. Agitation decays over 2.5 s; local mass slowly rebuilds bonds while disturbance breaks them. | An 8×8 block graph whose effective mass, ground, damping, springs and contact derive from mass/bond. Material contact gates excitation and pickup. Empty initial material is silent. |
| B | Two identical 8×8 fixed samples receive A then B or B then A. Each type gets the same 20 s envelope, spatial footprint and unit dose. A writes horizontal and B vertical leaky memory; both have a 45 s e-folding time. Inputs stop at 40 s, relaxation continues. | One common law maps directional memory into horizontal/vertical edge stiffness. Sample label never assigns a sound. |
| C | A fixed 8×8 unit-mass network has 112 edge capacities, initially one each. A seeded local sinusoidal force lasts 40 s. Strained incident-edge stars redistribute their incoming capacity sum, sequentially in row-major order. | Current edge stiffness `120c/(1+c)`, fixed mass/ground/damping. The same bounded stiffness also drives C's own scalar mechanical evolution. |

Exact equations, constants, boundaries and omissions: [A](model-a.md), [B](model-b.md), [C](model-c.md), [common probe](probe.md), [protocol](PROTOCOL.md). These are three independent rules; the shared observation graph does not merge their formation laws.

A is a conservative variable-mobility field model with a bond state. It is not a capillary film, viscoelastic fluid, calibrated ant deposition or proof of those phenomena. B implements order-sensitive **recency**, not irreversible memory or a noncommutative plasticity law. C conserves capacity, not energy or the sum of spring stiffness: its nonlinear stiffness mapping can change the latter even at fixed capacity. All C edges remain positive; no actual topological disconnection was implemented.

## Fixed observations, including quiet outcomes

The accepted browser evidence uses one preregistered seed and 0, 30, 120 and 300 s for every sketch. B has an objective additional 40 s checkpoint, the end of both input episodes. No seed search, parameter sweep or post-image aesthetic adjustment was performed.

| Observation | 30 s | 120 s | 300 s |
|---|---:|---:|---:|
| A total mass | 9.600000000000003 | 9.600000000000005 | 9.600000000000016 |
| A mean bond | 0.0140332 | 0.0952601 | 0.238245 |
| A bonded mass, `Σ m b` | 0.388926 | 1.32531 | 2.57892 |
| B paired memory L2 distance | 0.0333704 | 0.00892966 | 0.000163552 |
| B geometry distance | 0 | 0 | 0 |
| C minimum / maximum capacity | 0.300303 / 1.54555 | 0.152091 / 1.67314 | 0.152091 / 1.67314 |
| C capacity-budget error | 7.11e−14 | 5.40e−13 | 2.13e−12 |
| C displacement RMS | 9.84e−4 | 5.66e−12 | 4.69e−32 |

**A:** After supply ends, mass continues to spread while bonds grow and agitation vanishes. Supply and bonding are measurably different states. This did not produce an authored corridor-side structure or a fully immobilized object. The law's positive mobility permits continued redistribution. Compare [30 s](browser/production/captures/A-030s.png), [120 s](browser/production/captures/A-120s.png), [300 s](browser/production/captures/A-300s.png).

**B:** At 40 s each sample received `0.9999999999999992` of each type. Geometry and mass remain exactly equal, but memory L2 distance is `0.0528340`. The two current graphs give different PCM under identical impulse/pickups: stereo RMS difference `1.14465e−5`, maximum absolute difference `3.12873e−5`, without normalization. This is a numerical response difference, not a demonstrated perceptual distinction. The difference fades with the explicitly leaky memory. Compare [40 s](browser/production/captures/B-040s.png) and [120 s internal memory](browser/production/captures/B-120s-diagnostic.png).

**C:** Capacity moves among existing connections while all positions and masses remain fixed. The initial uniform network develops unequal capacities. After the drive ends, motion decays and the connection distribution settles. There was no travelling fracture, extinction or complete separation in this observation; positive capacity cannot create exact edge deletion. Compare [initial](browser/production/captures/C-000s.png), [30 s](browser/production/captures/C-030s.png), [120 s internal connections](browser/production/captures/C-120s-diagnostic.png).

## Mechanical and audio observation scope

The probe integrates small scalar displacements from zero incremental displacement and a fixed impulse on the frozen graph. It does not replay the material's full past vibration. The same Gaussian input, two spatial pickups, impulse dose `0.01`, clock ratio `100×`, fixed gain 1, 24 kHz sample rate and 1.2 s recording apply to all models. Stiffness and damping are not multiplied by the clock ratio. Gershgorin and damping bounds determine numerical substeps. No model-specific preset, effects playback, RMS matching or per-response normalization exists.

The raw waveforms are quiet at the fixed ±1 display scale. A's peak is zero initially, `4.28388e−5` at 30 s, `7.07157e−4` at 120 s and `7.58646e−4` at 300 s. B's peaks are about `0.00145`; C's are about `0.000185`. Numeric peaks remain visible rather than magnifying quiet signals into apparently equal significance. No claim about sonic beauty, audibility on a particular device, radiation physics or listening preference follows from the PCM differences. The actual Web Audio playback path is browser-tested; listening quality is not evaluated.

Probe response never feeds formation. A/B have slow field/memory evolution and a separate counterfactual observation graph. C also has its own mechanical state that drives capacity changes; the common probe observes its current coefficients without writing displacement, velocity or capacity back. The A graph deliberately compresses 24×24 fields to 8×8; its fine spatial distinctions are not preserved acoustically.

## Validation and reproducibility

See [VALIDATION.md](VALIDATION.md) for complete receipts and known failures. Core results:

- New model/probe tests: **15/15 pass**, including deterministic independent instances and finite 1000 s states.
- Accepted production-preview Chrome run: all recorded checks pass, no page/console errors; exact tick/UI time and fresh deterministic state/PCM hashes at all 13 checkpoints.
- Actual run/pause/reset, model switching, seed reset, record download/upload/reconstruction, tamper rejection, optional audio gesture, one-hour observation limit and original entry load are checked.
- `npm run build`: **PASS**, both entries emitted. Existing large shared-lab chunk warning retained.
- `npm test`: **355 pass / 2 fail / 357 total**. The same two failures reproduce in the untouched existing ANT controller/renderer tests (32 pass / 2 fail). Production code and both existing test files are byte-identical to authority. They are reported, not silently fixed or counted as passes.

```sh
npm test
node --test tests/material-sketchbook-*.test.js
npm run build
node scripts/material-sketchbook-browser-check.js --production --record
node scripts/material-sketchbook-evidence.js
```

The browser script regenerates evidence in `browser/production/`; compare hashes before accepting regenerated evidence. Exact state and PCM replay is established within the tested browser build, not across all JS engines. Strict imported-record equality may reject a record created by another engine because transcendental functions can differ in their final bits. No huge PCM archive is needed: responses are deterministically regenerated, with state and Float32 PCM SHA-256 receipts.

The first sandbox run could not start child processes. A later dev attempt encountered a Vite HMR reset during capture and missing-favicon requests. Its incorrectly timed capture was rejected. Exact requested tick and displayed-time assertions now precede every accepted checkpoint, and authoritative captures run from the built preview, without HMR. Only rejected attempt summaries are retained. A probe clock-scaling implementation error was corrected before accepted observations and checked against a free-motion solution. A's bond-to-mobility/contact mapping, B's removal of an arbitrary completion cap and C's stiffness bound were integration/coherence corrections before accepted observation, not image-selected tuning.

## Open exploration, without a winner

The three worlds expose different questions successfully: supply versus retained bonding, recency versus shape, and relationship redistribution versus mass movement. They have not shown all possible interesting behaviors. Long quiet convergence is part of this result.

Small future variations could independently ask whether a second equal activity episode disturbs consolidated A differently, whether B needs persistent reference strain rather than only recency, or whether a moved drive redistributes C's settled capacity again. Each would require its own declared comparison. None is implemented or chosen as a production roadmap here. No model wins this pass.

Production ANT, previous evidence, and production material/audio semantics remain unchanged. The deliverable is three worlds that can be run, paused, recorded, probed and compared.
