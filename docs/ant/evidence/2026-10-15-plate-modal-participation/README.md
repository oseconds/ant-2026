# P24 contact-position modal participation — 2026-10-15

**Decision: SUPPORTED**, scoped to the frozen P24 isolated one-shots and their measured autonomous intervals. The full modal sum predicts the held-out 6 kHz raw pickup and the position/loss-control differences. The first valid autonomous target occurs 17.17–26.17 ms after pulse end because the worklet does not update the entire masked node set from the first strike step. The prediction does not cover that early active-set expansion interval.

## Question and interpretation

Do p25/p50/p75 response differences come from one shared pole/eigenspace set, with a different spatial strike projection feeding distinct L/R pickup residues?

Yes, for these frozen inputs. The P24 poles and eigenspaces are identical across p25/p50/p75. Contact power is redistributed across the shared eigenspaces; pairwise cosine of the normalized source-projection power maps is 0.109 (p25/p50), 0.410 (p25/p75), and 0.329 (p50/p75). The L and R pickup vectors themselves do **not** change with contact position: the compiler points remain nodes 143 and 33, and the eigenspace observability norms are exactly equal across all three positions. Those fixed, channel-specific pickup weights filter the changed contact-mode distribution into different L/R residues.

The direct finite-pulse transfer uses the current worklet's JavaScript-generated 18-step half-sine envelope. Python and worklet envelope samples cast identically to Float32, and all per-node force-ring values match after Float32 storage for p25/p50/p75. This transfer closely matches pulse-end field residues without coefficient fitting. Across all 257 eigenspaces, the largest L/R complex-vector relative L2 difference for p25/p50/p75 is 0.324% (p50 L); the corresponding normalized complex inner-product real part is at least 0.9999948. The saved pulse-end field and previous field also round-trip through the complete eigenbasis with maximum absolute residual `8.33e-17`; the eigenspace residue sum reproduces both point pickups to below `5e-17`.

For held-out validation, each saved all-node state immediately before the first exact full recurrence is projected into the complete modal basis. No mode count, coefficient, pole, or state amplitude is fit. On that valid suffix, individual pooled relative L2 errors are 2.08e-6 (p25), 2.98e-6 (p50), and 2.51e-6 (p75), with correlations above 0.999999999996. Over the common position interval beginning at row 234 (26.17 ms after pulse end), each actual pairwise L/R raw-pickup difference is predicted at 2.65e-6–3.36e-6 relative L2 error. This identifies the modal responsibility for the later raw response; it does not claim a full linear prediction through the earlier node-wake expansion.

The q=4 flat/frequency-loss control separates a different responsibility. Its p50 contact vector and L/R pickup observability stay identical, while off-q poles, decay and modal input gain change. The q=4 eigenspace (multiplicity 21) remains matched to Float32 storage precision: flat/frequency differences are `-5.95e-10 Hz`, `3.26e-12` pole radius, and `6.51e-12` input gain. Across all eigenspaces, the largest frequency, radius, decay-tau and input-gain changes are recorded with their q values in `modal-participation.json` and the complete CSV. The q=4 control's held-out flat-minus-frequency raw pickup difference is predicted at 4.18e-6 relative L2 error.

This adds a modal mechanism to the prior ERB position result without fitting the modal metrics to ERB cosine. It does not establish perceived timbre or human discrimination.

## Inputs and source boundary

- Primary inputs: native isolated `20261005-trail-plate-24` p25/p50/p75 renders from the 2026-10-13 position package.
- Secondary inputs: existing P24 p50 q=4-matched flat/frequency-loss renders from the 2026-10-14 loss package.
- Reused artifacts: exact compiled topology, schedules, all-node 6 kHz Float32 fields, pre-limiter 6 kHz L/R pickup, and 48 kHz Float32 PCM. All 15 field/raw-pickup/PCM files are checked against manifest byte lengths and SHA-256; full receipts are in `validation.json`.
- Position arms share topology SHA `054638b345610bff0304662b691343878eab0f9482add24768591e61caaf0f01`, native coefficients, contact strength `0.035`, footprint radius `0.01`, pulse length 18 physics steps, and L/R pickup nodes `[143, 33]`. The position in the strike schedule is the only differing schedule field.
- The loss-control evidence's prior pair assertions confirm equal schedule, geometry, elastic coefficients, pickups/readout and a loss-coefficient-only topology change. The two stored loss-control source vectors and pickup observability maps also compare exactly here.
- The current `surface-plate.worklet.js` and `compileSurfaceTopology.js` match the frozen source hashes. The position manifest's hash for `scripts/ant-sonic-response-metrics.py` does not match the current source; that post-render metrics helper is not used by this modal calculation. The saved binary inputs and the raw-render generator/worklet/compiler hashes verify.
- Production `src/` and `static/` are unchanged from `main`. No new render, limiter, 48 kHz interpolation, matrix-pencil fit, mode selection, human listening or parameter tuning was used.

## Operator and residue definitions

The topology compiler supplies the symmetric masked graph Laplacian `L` with diagonal `-4` and `+1` for each in-mask four-neighbor; missing neighbors remain zero. We diagonalize `K = -L = V diag(q) Vᵀ`. The production isolated recurrence is re-derived from the current worklet:

```text
y[n+1] = (2 - d - b q² - (t/ρ)q) y[n] - (1 - d)y[n-1] + (1 - d)f[n]
d = 50 × cD
```

The frequency-loss recurrence uses `a(q)=2-d-(t/ρ+γ)q-bq²` and `g(q)=1-d-γq` in `y[n+1]=a(q)y[n]-g(q)y[n-1]+g(q)f[n]`. For a complex pole `p` and its conjugate, the state coefficient is `C=(p y₀-g y₋₁)/(p-conjugate(p))`. L/R output residues multiply that coefficient by the compiler's one-hot point-pickup projection. The full 18-step force transfer is included as `g Σ f[k]p^(18-k)/(p-conjugate(p))`; `f[k]` contains the reconstructed per-node Float32 force-ring values.

Degenerate eigenvalues are grouped using `64 × float64 epsilon × node count × max(spectral norm(K), 1)` (tolerance `2.9555e-11`). The q=4 eigenspace has multiplicity 21; it is reported as one projector-based space, never as 21 physically identified eigenvectors. Its invariants passed a within-space basis rotation check. The 277 eigenvalues form 257 eigenspaces; all are represented in the CSV and plots.

The worklet snapshots `current` after each 6 kHz physics update. The solver state uses Float32 storage. A reproduction of its operation order, including the loss-control term, first becomes bit-for-bit equal to the saved field at target rows p25 180, p50/flat/frequency 214, and p75 234. Frozen aggregate telemetry reports 277 wakes, zero sleeps, zero coupling links and zero compliance-attenuated strike contributions for each position arm. It does not timestamp each wake, so the report uses the empirically checked exact-recurrence boundary and does not infer a precise final wake tick.

## Files

- `modal-participation.json`: complete provenance, condition summaries, operator checks, position and loss-control comparison metrics, and generated-artifact hashes.
- `eigenspace-residues.csv`: one row per condition/eigenspace, including q/pole/decay, source projection, L/R observability, finite-pulse transfer, pulse-end residues and autonomous-start residues.
- `validation.json`: source/artifact receipts, pulse-envelope/force-ring equivalence, eigendecomposition and projector checks, pulse-end state/readout round trip, basis invariance, held-out interval boundaries, and production-source equality.
- `p24-contact-modal-participation.png`: all p25/p50/p75 eigenspaces on common row scales; contact projection and L/R output-residue magnitude.
- `p24-modal-prediction-and-loss-control.png`: actual and modal-predicted L/R raw-pickup 5 ms RMS envelopes plus residuals for all position and loss conditions.

## Reproduction and focused checks

Run from the repository root with the bundled Python 3.12 runtime and existing frozen `test-results/` inputs:

```powershell
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -B scripts/ant-plate-modal-participation.py --self-check
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -B scripts/ant-plate-modal-participation.py
```

The focused ESM import run passed 60 tests across `ant-base-born-shadow`, `ant-sonic-shadow-render`, `compile-surface-topology`, `surface-plate-worklet`, `surface-audio-bridge`, and `audio-snapshot-renderer`:

```powershell
& 'C:\Program Files\nodejs\node.exe' --input-type=module -e "await import('./tests/ant-base-born-shadow.test.js'); await import('./tests/ant-sonic-shadow-render.test.js'); await import('./tests/compile-surface-topology.test.js'); await import('./tests/surface-plate-worklet.test.js'); await import('./tests/surface-audio-bridge.test.js'); await import('./tests/audio-snapshot-renderer.test.js');"
```

The new script self-check and the existing modal-transfer and loss-analysis self-checks passed. Two consecutive full generator runs produced identical SHA-256 hashes for the analysis JSON, eigenspace CSV, both PNGs and `validation.json`.
