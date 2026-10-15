# Frozen natural-event ERB window-boundary sensitivity

Protocol fixed before running this pass. Baseline: `a9c138e8fff3ebfec45c09f2f391d8e6f5aedfdd`.

## Question

How much does the existing Base/Born shape comparison depend on incomplete Hann coverage at event-crop boundaries? This is one analysis-sensitivity pass, not a new audio render, event isolation, auditory model, or production intervention.

## Frozen inputs and three policies

Reuse the original two 10 s Float32 stereo WAVs, frozen input and 44 parent-group mapping. Verify source hashes and reproduce the prior 100/250/500 ms results before comparing policies. Keep event anchors, dispatch delays, FFT 1024, symmetric Hann, hop 256, 30 ERB bands, power normalization and L/R pooling unchanged.

1. **legacy:** existing helper on the exact event crop, frame starts 0 through the last needed partial frame.
2. **covered-crop:** same crop, zero outside it, every hop-aligned frame whose 1024-sample support overlaps the crop. Starts are -768, -512, -256, 0, 256, ... < crop length. Existing legacy frames must match exactly. This includes both leading and trailing edge coverage; it is not an onset-only intervention.
3. **covered-context:** identical frame starts/supports to covered-crop, but use real surrounding continuous-stream samples instead of crop-edge zeros. Retain zero padding only outside the recorded 10 s stream and report such cases. This includes other event tails/starts and is not a ground-truth event response.

Physical window samples, RMS, peaks and timing are unchanged. No alignment search, parameter selection, band exclusion, new listening export or threshold tuning. No original evidence is overwritten.

## Readouts and acceptance boundaries

For every originally eligible window, report paired A/B full ERB-time cosine, integrated profile cosine and unit-sum total variation under each policy. Report policy deltas and leading/trailing omitted-band-power fractions separately for each stem. Frame centers may lie outside the crop in the covered policies; their support overlaps the crop. Compare only like policies between A and B.

These are descriptive, dependent windows. Do not turn tiny numerical departures from cosine 1 into a perceptual claim. Report the magnitude/range of policy shifts relative to the existing distance from scalar-gain identity; no arbitrary pass threshold. If broad shape separation survives, retain the prior MIXED causal verdict. If it substantially collapses, flag representation sensitivity without assigning intrinsic character. Neither outcome resolves 63-foot/44-group semantics, old readout, jitter or overlapping events.

Self-checks: silence; A/A and scalar-gain shape identity; impulse at crop onset (legacy Hann endpoint is zero); every phase of the 256-sample hop for squared-Hann coverage; exact reuse of legacy frames; full-support interior equality across crop/context; direct extraction check against the existing helper. Confirm deterministic outputs and unchanged input receipts. One fresh independent review follows; no automatic second experiment.
