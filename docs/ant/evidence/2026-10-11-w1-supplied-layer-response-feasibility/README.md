# W1 supplied-layer response fixture feasibility — 2026-10-11

**Type:** isolated synthetic compiler/worklet feasibility check during independent design review. **Not formation evidence, a completed PN-arrival-0 discriminator, a natural simulation or production adoption.** W1 remains Undecided / Research Gap. [Contract](../../w1-plate-native-formation-retention-response-contract.md), [daily process](../../daily/2026-10-11-w1-formation-retention-response-contract.md).

## Why this limited check was run

The reviewer questioned whether the proposed old-only strike could reach and wake a new overlapping layer under current sleep rules. A single inline read-only fixture tested the exact prescribed geometry, coefficients, strike and fixed horizon. It changed only the supplied descriptor/topology between arms and preserved the current compiler/worklet, old Plate, normalized strike, sleep, coupling, pulse/recovery and damping settings. No parameter search, natural input generation or production edit occurred.

Three output labels were corrected before acceptance: `newLayerAwakeCountAtEnd` accumulated awake **node-steps** over the horizon; `oldPulseRingMismatchCountBeforeStepping` was measured **after** all 3,000 steps; and `newLayerWakeCount` was a **whole-processor wake-transition delta** (treatment minus control), not isolated added-layer transitions. The preserved [probe](probe.mjs) names these `newLayerAwakeNodeSteps`, `oldPulseRingMismatchCountAfterHorizon` and `wakeTransitionDeltaTreatmentMinusControl`, and resolves source imports relative to its file. Calculations, fixture and ordering are otherwise the same. A parent reproducibility check compares the complete corrected JSON with [results](results.json). The original inline command was the same JavaScript body with repository-root imports, passed through PowerShell `@' ... '@ | node --input-type=module -`; its original values are preserved below through an explicit label mapping rather than treated as pre-step or layer-filtered evidence.

## Inputs and comparison

- Two fresh Node VM processors with sample rate 48,000 Hz and default zero state. Install old topology in both, reinstall it in control and append the new descriptor in treatment. All old solver cells are retained; no nodules or Base Substrate.
- Old inclusive source mask `x=30..66, y=44..50`; added mask `x=48..76, y=44..50`; source grid 96². Both have empty edges, pickups at `(x_min/95,48/95)` and `(x_max/95,48/95)`, thickness `0.001`, and fixed material `.9 / 1.1 / .35` stiffness/density/damping.
- Explicit layer order is `['old']` versus `['old','s0']`. This check compiles these descriptors directly; it does not instantiate `MaterialStratigraphy`, perform contact qualification, debit a supply token, or reconstruct birth history.
- Same one `strike` payload in both arms: Plate ID `old`, point `(45/95,48/95)`, strength `.035`, footprint radius `.012`. This is a normalized worklet excitation, not measured ANT force or displacement control.
- Process 3,000 blocks of 8 samples, 6,000 physics steps/s, fixed 0.5 s. Compare inherited node values by the same array positions after each step; record maximum new-layer current/previous amplitude and wake activity. No traces were saved in this limited check; aggregate results are reproducible from the complete fixed script.

## Observed results and permitted inference

| Observation | Value | Meaning / limit |
| --- | --- | --- |
| Compiled nodes and links | 39 old, 30 added, 21 Z links | Prescribed overlap is represented |
| First inherited-node trace difference | Step 2, maximum `9.822542779147625e-11` | A deterministic numeric difference; no independent interval attribution performed |
| Maximum inherited-node difference | `0.005292651825584471`, step 2613 | Normalized displacement comparison; no SI/audibility claim |
| First new-layer awake node | Step 6 | The layer is not pinned asleep for this input |
| Total wake-transition delta (treatment minus control) | 30 | Whole-processor count difference; not isolated added-layer transitions |
| Added-layer awake node-steps | 89,157 | Layer-filtered accumulated activity, not final awake count |
| Maximum new-layer amplitude | `0.0022179395891726017` | Current/previous values over the horizon |
| Post-horizon pulse-ring mismatches | 0 | Consumed rings agree at the end; **does not prove pre-step input equality** |
| Treatment drop / route drop / nonfinite / physics steps | 0 / 0 / 0 / 3,000 | Limited telemetry, not a global solver proof |

The exact fixture can produce inherited-layer response divergence and wake the added layer with frozen sleep/settings. This resolves only the review's efficacy concern. No-probe/disjoint/identical-topology parity, full-state replay, initial pulse equality, activation/idempotence and first-step arithmetic attribution remain unexecuted. A new layer changes topology by assumption; this output does not validate how material forms, retains contact contributions, or derives intrinsic Character. The fixed coefficients deliberately supply no history-to-property map.

## Reproduction and integrity

Run from repository root at source baseline `1d36cc6eefbc9c6c7564c403ab0bfe86d1cbc9bd` (the matching main `src`/`static` trees are recorded in the contract):

```powershell
node docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/probe.mjs
```

Strict aggregate reproduction check:

```powershell
node docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/probe.mjs | node -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(0,"utf8")),JSON.parse(fs.readFileSync("docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/results.json","utf8")));console.log("feasibility aggregate replay: exact JSON parity");'
```

[Artifact hashes and runtime](artifact-hashes.json) pin the complete executable input, output, compiler and worklet. Raw SHA-256/byte lengths record this checkout; normalized-LF SHA-256 allows source-content verification across text line-ending differences. Parent checks passed on Node `v22.23.2`, Windows x64. This package holds a small feasibility result, not the future contract comparator. Do not tune or expand it to infer endogenous formation.
