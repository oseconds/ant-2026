# Residence world-screen validation

## Executed checks

The production control and independent residence candidate each completed 36,000 current-G/H0 ticks, seed20261005, Audio Off. Control parity was gated before launching the candidate. Both use production's 10% material locomotion law and unattenuated source.

- Disabled residence wrapper plus disabled source auditor reproduce the original raw gzip and five checkpoint gzips byte-for-byte. Initial state, positions, contact and birth stream hashes, checkpoint RNG and final RNG match.
- All 40 late control anchors match saved B/C/D/E/F/S/material inputs. Both arms are captured at the same exact ticks/time, with no interpolation.
- Eleven production source files match the pinned Pass 3 source authority before replay. Additional helper/source receipts are retained in SOURCE-HASHES and manifest. Production src/static/canonical guide have no diff.
- Three focused tests pass: one-step Float32/tick-entry decay, real pre-init attachment lifecycle, and native source authority. Self-test covers bare identity, material contraction, half-life, mixed boundary lookup and no same-tick future map leakage.
- Native field decay is called exactly once per tick in both arms, totaling 600 s. Candidate first conditioned decay is tick5042; 36 material-array replacements are seen. Source audits record zero attenuated chunks and effective/authored ratio 1 in both arms.
- Same-realized-path source geometry is asserted for 651,938 control / 654,376 candidate chunks; dose conservation residuals are −1.03e−11 / +1.71e−11. This checks source semantics within an arm, not identical source locations after world divergence.
- Saved-data `--analyze-only` reproduces the complete analysis JSON exactly. Frozen-source probe `--check` independently reproduces its exact replay gzip and compact result JSON.

Commands:

```powershell
node scripts/ant-material-chemical-residence-screen.js --self-test
node --test tests/ant-material-chemical-residence-screen.test.js
node scripts/ant-material-chemical-residence-screen.js --analyze-only
node scripts/ant-material-chemical-residence-probe.js --check
```

Node test subprocess creation required the permitted elevated command runner on this Windows host; the tests then passed. No physical parameter changed to address this host permission behavior.

## Corrections before the coupled replay

The inherited runner invokes observer setup before `controller.init()`, when `field` is null. Preflight caught eager field installation; the wrapper now installs lazily at the first tick. A real create/attach/init/tick test verifies this lifecycle. This was corrected before the paired natural runs; no failed natural world is replaced by a successful tuned one.

The control also receives the disabled residence wrapper, making it a full sham rather than an unwrapped control. Conditioned values are computed from pre-decay Float32 state with a single declared exponential step. Bare values and native counters follow the original decay call. No multiply-back correction or additional random source is used.

## Independent inspection and final packaging

A fresh Max-reasoning reviewer inspected the decay/probe kernels, native source and scheduling, full control parity, prospective recipient limitations and coupled results. It found no causal/replay blocker and treated residence as a promising distinct responsibility only up to a material-meaning/research gate. It required explicit treatment/schema labeling and rejected an outward-max-D relocation requirement. Its last packaging turn could not run because its account usage limit was reached. A separate fresh Medium-reasoning artifact reviewer then checked the completed reports against saved results, reproduced the offline analysis, spot-checked main figures and links, and found no actionable claim/numeric blocker. It did not manually recalculate every statistic or verify the not-yet-written manifests. Final receipt verification was completed by the parent; review boundaries are not collapsed into a blanket independent approval.

The shared analyzer's legacy attenuation schema and channel strings are preserved for reproducibility. B means chemicalMemory, F means thinned skeleton, S means edge-bearing F; `noSimulation` applies to analysis. Actual birth IDs after divergence are ordinal comparisons, not established event correspondences. Quantiles use upper nearest-order statistics. No contact-count difference is claimed to be the first exact-coordinate difference.

## Scope and omissions

No production file changes, no extra RNG use, no stacking of Screens1–3, and no max-D/X adoption. RNG schedules diverge through downstream native behavior; no later common-random-draw causal attribution is made. Full native source rows are not retained for this screen; aggregate source audit and raw worlds are retained. The probe retains the frozen source requests used for its separate exact chemical replay.

Full `npm test` and build were not run: changes are isolated research wrappers/docs, covered by focused tests, native replay parity and saved-input deterministic reproduction. The P3 work separately passed seven new and 24 native focused tests. No cross-seed, equal-total global retention world control, audio/runtime, artistic or perceptual validation was performed.
