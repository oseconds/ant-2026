# Delayed contact-history reveal — preregistration

## Question

When the same true foot-contact mark remains at the contact coordinate, does revealing it only after the responsible ant has moved away make the history perceptually more independent from current activity?

This pass changes reveal timing only. It does not permute positions, tune the glyph, or claim literal footprints or material identity.

## Provenance and fixed world

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- New branch is created directly from that commit.
- Contact prerequisite: `9233500dad65ff5bbd09d8b604f4ea86b2208932`.
- Prior failed rigid relocation: `394bd8136601c832a49b521f47d1ae446a17d0ed`.
- Valid temporal-causality comparison: `1c5ebb250398648d99edf9210f74487a3ddb4661`.
- Prior artist review is preserved on its own branch in `codex/ant-contact-history-temporal-causality-20261027`, review-update commit `1f5a396b5e9765944f28719de7b5aa6b2cf8257b`, at `docs/ant/evidence/2026-10-27-contact-history-temporal-causality/ARTIST-REVIEW.md`. Its wording is not copied into this package.
- H1 accepted-heading reference: `bee3a6908b36e23c826e1fde00d461b426c75992`; H1 is diagnostic only.
- Seed `20261005`, current-G defaults, 60 Hz, 640×640, DPR 1, no audio/DSP.
- Review interval: first Plate tick 4501 through endpoint tick 6301 (+30 model seconds).

## Fixed glyph and visibility

Both conditions use the same registered glyph: black, 2.5 native-pixel circle, alpha 72/255, source-over, uncapped, no decay, drawn below unchanged production pheromone and ants. Material fill and all other material cues are disabled. Production files under `src/` remain byte-identical to fresh main; H1 and renderer instrumentation exist only in memory.

The selected event set uses the prior event-time eligibility rule: the routed event's Plate must own that exact contact coordinate in both current physical support and canonical display support at event time. A mark is archived in both conditions and is drawn only while its event-time Plate remains the current valid physical and display owner at that coordinate. No buried-history reveal is added.

## Delay preflight — registered before any candidate media

Measure fixed delays of 0.5, 1.0, 2.0, and 3.0 seconds, exactly 30, 60, 120, and 180 model ticks at 60 Hz. Use each eligible event in the registered first-Plate-to-+30 s interval. At the first completed model tick at or after `eventTimeMs + delayMs`, measure native-canvas Euclidean distance from its exact contact coordinate to the active position of its originating ant. If that ant is absent, count it as not qualifying for the ≥12 px share and mark its distance unavailable; percentiles are nearest-rank over available distances, with the available denominator reported.

The registered target timestamp is `eventTimeMs + delayMs`. Contact times can fall within a 60 Hz tick, so the preflight samples the ant at the first completed model tick at or after that target. The capture records the scheduled target and actual model-clock time at reveal; the exported 30 fps video adds its own frame-sampling quantization.

The registered target timestamp is `eventTimeMs + delayMs`. Contact times can fall within a 60 Hz tick, so the preflight samples the originating ant at the first completed model tick at or after that target. The capture records the scheduled target and actual model-clock time at reveal; the exported 30 fps video adds its own frame-sampling quantization.

Select the shortest delay for which at least 75% of all eligible events are ≥12 native pixels away. No delay beyond 3.0 seconds may be introduced. The preflight trajectory may continue to endpoint +180 ticks solely to measure the longest registered delay; registered event digest, RNG, and world-state parity are checked at tick 6301, the actual review endpoint. No candidate renderer media are produced during preflight.

After the delay is selected, write the chosen value and measured table into this PLAN before artist-facing capture. Then use a common event subset with `event tick ≤ 6301 − delay ticks`; both conditions use exactly this subset.

## Conditions

- **A — immediate causal reveal:** reveal the exact event mark at its true contact coordinate and event time.
- **B — delayed causal reveal:** schedule the same mark at the same coordinate for `eventTimeMs + selected delay`; make it renderable at the first 60 Hz model tick at or after that target.

After reveal, both use the same current-owner visibility rule. B uses no shuffled, synthetic, or alternative contact positions. At the endpoint, every selected B event must have been revealed; with the same simulation topology and ownership rule, A/B visible positions and counts must match exactly.

## Capture and review

Render both conditions in lockstep from the same deterministic H1 snapshot stream. Capture ticks 4501–6301 inclusive at 30 fps, sampling every two 60 Hz ticks for 901 frames. Preserve separate native 640×640 lossless videos, birth / +15 s / +30 s stills, and a synchronized side-by-side review page that starts and seeks both videos together. Choose left/right assignment deterministically from a pass-specific SHA-256 label, independent of simulation RNG; keep its key outside the viewer. The page shows only View 1 and View 2 and the first prompt: `둘을 동시에 봤을 때 뭐가 다르게 느껴지고, 어떤 점이 자연스럽거나 이상하게 느껴지는지 자유롭게 적어 주세요.`

This is not a fully blind experiment: the artist knows the general research context and has seen the prior pass. Simultaneous playback is intended to reduce sequential order bias, not eliminate all presentation effects.

## Stop and interpretation boundary

If no registered delay meets the 75% rule, stop as manipulation-invalid and produce no candidate media. If selected, stop after same-state capture, endpoint equality, validation, and review preparation. No alternate delay, fade, glyph, position change, production transfer, or further variant is permitted in this pass.

Technical validity does not establish perceptual success, archaeological history, invisible-agent meaning, material identity, or a final renderer direction.

## Preflight-selected delay

**Selected delay: 0.5 s**. Shortest registered delay meeting the 75% ≥12 px rule. Common selected event subset: 746, with event tick ≤ 6271. At the time this pre-capture PLAN amendment was written, candidate media had not yet been rendered.

| Delay | Eligible | Ant position available | ≥12 px | ≥12 px / all eligible | p25 px | Median px | p75 px |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 s | 760 | 750 | 737 | 96.97% | 18.98 | 25.08 | 30.71 |
| 1 s | 760 | 725 | 716 | 94.21% | 34.87 | 45.32 | 54.79 |
| 2 s | 760 | 675 | 675 | 88.82% | 65.50 | 86.21 | 105.40 |
| 3 s | 760 | 616 | 616 | 81.05% | 95.14 | 123.87 | 155.04 |
