# 2026-10-18 — Plate audio reassessment and live dense-mix next pass

## Current decision

Production remains the current `main` sonic baseline: 3 ms finite direct-contact pulse, 75 ms local recovery, ×50 Plate damping, point pickups, default-Off Base Substrate, and the authored source-to-boundary Plate formation law.

The new human evidence weakens the earlier generic “Plate individuality may be insufficient” concern:

- Natural cross-Plate blind listening used **12 Plates in six selected p50 pairs**. This one listener judged all six real pairs different; the hidden A/A catch was judged no-difference. Confidence records certainty in the categorical answer, not perceptual distance.
- Synthetic controlled geometry listening produced different judgments for five of six real pairs. The compact A/A catch remains raw `different=yes / confidence 5`, with a separate interpretation-only correction recording the intended `different=no / confidence 5`; the raw export is unchanged.
- Existing isolated and synthetic evidence therefore supports geometry/contact-sensitive response capacity. Cross-position human recognition, population-level perception, and native live-world audibility remain unestablished.

The Plate core is **supported enough for now** for its present role. Generic descriptor hunting, 1 ms pulse escalation, pickup redesign, and selector changes are parked unless a specific production requirement reopens them.

## Separate live-world issue

The live dense-world report must not be collapsed into the isolated individuality question.

**Established implementation/runtime facts:**

- The worklet advances all currently active Plate nodes, sums every Plate point-pickup contribution, adds Sphere output, then applies one shared `x/(1+abs(x))` soft limiter.
- The output is not divided by current Plate/layer count.
- Mature natural runtime collapse remains independently established at 20–30 Plates; this is not solved by the individuality evidence.

**Open hypothesis:**

Natural simultaneous contacts and overlapping resonant tails may mask otherwise distinct Plate responses before or independently of realtime failure. This is currently an artistic/engineering hypothesis, not an established masking result.

## Next bounded pass — frozen natural dense-mix decomposition

**Question:** Under a current-production natural dense window, does simultaneous Plate readout bury focal Plate response structure even when the same stream is rendered offline without realtime deadlines?

**Baseline:** current `origin/main` beginning from `3a5fde4c2de32d8d414734610a43003703e0d56f` unless `main` advances before execution. Re-fetch `main` before work and record the actual starting SHA.

**Frozen natural input:**

- Use seed `20261005`.
- Capture the first 10 simulation seconds beginning when the current-production world first reaches eight historical Plates.
- Preserve every topology installation and routed strike in that interval exactly as generated. The interval is “starts at eight Plates”, not a promise that topology remains at exactly eight throughout.
- Capture must not feed back into behavior. Verify trajectory / lifecycle / FOOT_CONTACT / birth hashes against an Audio-Off control over the same interval before interpreting audio.

**Render / decomposition:**

1. Replay the exact captured topology and strike stream through the unchanged production worklet in Chrome OfflineAudioContext. This full render removes realtime deadline failure from the listening condition.
2. Add shadow instrumentation only at observation: record each Plate layer’s pre-soft-limiter L/R pickup contribution while the **full coupled physics continues unchanged**. Do not solo physics, remove Z, remove Nodules, change strikes, or change state.
3. Verify that the sum of per-layer pre-limiter Plate contributions plus Sphere contribution reconstructs the production pre-limiter mix, and that applying the existing soft limiter/interpolation reproduces the production offline PCM.
4. Export fixed-gain full-mix context and diagnostic focal/rest stems. Optional RMS-matched copies may be provided for character listening only and must not support level claims.

**Descriptive measurements:**

- accepted/routed strikes by Plate and total event density;
- per-layer pickup power share through time and a continuous effective-contributor-count / concentration description, without an acceptance threshold;
- for each directly struck focal Plate, focal-versus-rest energy over the already-used 100 / 250 / 500 ms post-event windows;
- ERB overlap between focal and rest/full where useful, using the existing frontend rather than introducing a new perceptual model;
- production pre-limiter peak, post-limiter output, and limiter effect;
- full/solo/rest aligned listening assets for exploratory human judgment.

These are overlap/readout diagnostics, not a formal psychoacoustic masking model.

## Decision boundary

- **Dense overlap supported as a live sonic problem:** focal responses remain structured in the same full-network solo readout, while the ideal offline full mix consistently places substantial concurrent rest-of-world energy/spectral overlap over those events and exploratory listening reports the focal character as buried. Only then open one bounded mix/readout responsibility pass.
- **Runtime first:** the ideal offline full mix retains the distinctions that were missing in live playback. Prioritize realtime/underrun work before changing sonic character or Plate design.
- **Mixed/inconclusive:** retain both hypotheses and stop. Do not tune pulse, damping, material, pickups, Z, selector, or event rates to manufacture separation.

No production change is authorized by this plan.
