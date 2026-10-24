# ANT audio / Plate timeline observation

**Status: MIXED.** This is one observational run. Its shared time axis makes the transition into Plate audio and later changes visible, but it does not establish that Plate births caused those changes.

## Frozen run

- Production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Seed: `20261005`.
- Simulation: `0–180.2333 s` (`180.2333 s` elapsed).
- Wall clock: `180.2556 s`.
- AudioContext: `180.2507 s`.
- Decoded continuous stereo PCM: `180.2400 s`, 48 kHz, 8,651,520 frames.
- Current default settings were kept: controller material locomotion resistance enabled by its constructor default, audio volume `1.0`, final output gain `0.7`, Base substrate Off. The production source hashes and capture settings are in [render-manifest.json](render-manifest.json) and the compressed capture record.
- The existing 3 ms contact pulse, 75 ms local recovery, ×50 damping, worklet solver, and output path were not modified. No production source file changed.

The first capture attempt used the older harness's 35% volume override. It was discarded from the evidence package. The reported run preserves the current UI default volume; its capture and render outputs were regenerated from that run.

## Open the synchronized observation

- [Full-run timeline overview](timeline-overview.png) — 2400 × 1510, one 0–180.233 s axis for L/R waveforms, L/R spectrograms, 10-second FOOT_CONTACT-group density, exact Plate birth markers, Plate count, population, activation, and A/B/C spatial-frame markers.
- [Continuous final-gain stereo audio](audio/continuous-final-gain.webm) — actual 180-second recorder output at the existing default volume. The local float32 PCM used for metrics remains in ignored `test-results/ant-audio-plate-timeline-primary-default-volume/`.
- [Three aligned detail panels](zoom-details.png) — first Plate-birth neighborhood, densest FOOT_CONTACT bucket, and the nearest non-overlapping late window. Each panel is 10 decoded-audio seconds; exact FOOT_CONTACT event-group ticks and Plate-birth labels share its time axis.
- [A — early spatial snapshot](spatial/A-early.png) — simulation start, before the first birth.
- [B — formation spatial snapshot](spatial/B-formation.png) — first birth + approximately 100 ms; captured frame time `103.1217 s` for the event at `103.0167 s`.
- [C — late spatial snapshot](spatial/C-late.png) — run end at `180.2333 s`.

The B and C images use the normal ANT canvas. The overview and detail panels are a separate research layout; the existing immutable overview and audio presets were not changed. Waveforms retain fixed ±1 amplitude with no normalization. Spectrograms retain FFT 1024, symmetric Hann, hop 256, 0–8000 Hz, fixed −100..0 dBFS, gamma 1 and grayscale. Time-column aggregation takes the maximum fixed-scale FFT-frame value. The contact density row counts **event groups**, not individual feet; individual feet are reported separately. Population is drawn as a sample-held step trace from the recorded approximately 10-second snapshots. Activation joins those sampled values; Plate count uses exact birth timestamps.

## Measured run result

### Events and state

- `FOOT_CONTACT`: 8,990 event groups / 26,678 individual foot contacts.
- Plate births: 2; Plate count accumulated from 0 to 2. No Plate removal occurred. No nodule/Sphere birth occurred.
- `P1` / `trail-plate-1`: `103.0167 s`, 240 mask cells, source `(0.4632, 0.6421)`, target `(0.9789, 0.0947)`.
- `P2` / `trail-plate-2`: `151.0167 s`, 776 mask cells, source `(0.4211, 0.6842)`, target `(0.9789, 0.2000)`.
- Birth interval: `48.0000 s`.
- Population: 1 at capture start, then 8–20 on the 10-second observations, ending at 20.
- Colony activation: 0 at capture start, 0.0314–0.7080 on the 10-second observations, ending at 0.7145.

Both births occurred in the latter portion of this window. Their source locations sit near the lower-center route fan and their targets extend toward the upper-right boundary. Across A/B/C the visible routes expand from that lower-center region into a broader fan; Plate formation remains sparse and spatially associated with that route system in this run, rather than appearing as evenly dispersed events.

### Audio and bucket correspondence

Whole-run fixed-gain PCM:

- Stereo RMS `0.007700`; L RMS `0.009169`, R RMS `0.005875`.
- Stereo peak `0.084898`; L peak `0.084898`, R peak `0.073657`.
- Non-finite samples: 0. Samples at or above unity: 0.

Before P1, the captured output PCM was silent across the 0–100 s buckets. After P1, buckets without another birth still changed: stereo RMS was `0.00553` at 110–120 s, `0.01328` at 120–130 s, `0.01054` at 130–140 s, and `0.00587` at 140–150 s. The P2 bucket (150–160 s) measured `0.01491`; the following no-birth buckets measured `0.01649` and `0.01383`. Contact density also varied over these intervals.

Across the 19 fixed buckets, Pearson correlations were `0.347` for FOOT_CONTACT groups vs stereo RMS, `0.943` for accumulated Plate count vs stereo RMS, and `0.610` for population vs stereo RMS. These are descriptive summaries of a single, time-ordered run. The Plate-count value is strongly coupled to the initial silent / zero-Plate period and is not evidence that a birth caused a spectral change. See [audio-metrics.json](audio-metrics.json) for every bucket and the adjacent first-birth values.

### Clock and integrity receipts

- 722 sampled anchors map simulation time to wall time, AudioContext time, and sample index. No interval had zero AudioContext advance.
- The final anchor was 512 samples (`10.67 ms`) longer than decoded PCM. The renderer preserves all intermediate anchors and reconciles only this small terminal endpoint difference; it does not stretch or retime PCM.
- All clocks and timeline state points are monotonic; sample ranges are valid; event times lie inside the run; Plate count matches accumulated birth events; event counts match the captured stream/controller counter; observation `getSnapshot()` and event observation added 0 LCG calls.
- The raw controller event stream contains 1,474 timestamp inversions because simultaneous per-ant event dispatch order is not timestamp order. Raw order is retained in [events-and-timeline.json.gz](capture/events-and-timeline.json.gz); only display and time-bucket assignment sort by exact event timestamp.
- [capture-validation.json](validation/capture-validation.json) records the checks. [clock-health.json](clock-health.json) records elapsed clocks and 10-second intervals.

The evidence package was rendered twice from the same frozen capture. All 11 generated artifacts, excluding this README, were byte-identical between renders. SHA-256 values, capture-source hashes, research renderer hashes, and selected zoom provenance are in [render-manifest.json](render-manifest.json). The raw capture and float32 WAV are ignored under `test-results`; the committed WebM, compressed events/state, metrics, receipts, and images are sufficient to inspect the output and reproduce the render.

## Interpretation boundary

**Implementation fact:** the existing bridge recorded the full coupled production output at its current default volume with Base Off. The timeline tool observed events and snapshots without consuming additional simulation RNG.

**Measured run result:** the run had a long silent interval before the first Plate, two later births 48 seconds apart, and several non-birth buckets with changing audio RMS and spectrum.

**Temporal correspondence:** the first audible/spectral transition is aligned near P1, and P2 is another visible timeline landmark. Activity and audio also vary in intervals with no new birth.

**Artistic interpretation:** at this scale the audio reads as a coarse change in simulation history—silence followed by a low-frequency texture with local fluctuations—rather than a continuously shifting soundscape. The two Plate births are legible visual landmarks; the corresponding audio changes are visible around that transition but do not read as isolated birth signatures. Plate formation appears sparse and concentrated in the latter part of this particular run.

**Open hypothesis:** a longer or differently seeded natural window may show a different balance of contact activity, material accumulation and audio change. No causal attribution, birth-law judgment, audio tuning or production adoption follows from this single run.

## Reproduction

From the repository root, with dependencies, Chrome and ffmpeg available:

```powershell
node scripts/stratigraphy-motion-evidence.js --continuous --seconds=180 --watchdog-seconds=2400 --seed=20261005 --production-defaults --name=continuous-natural-0-180s --output-dir=test-results/ant-audio-plate-timeline-primary-default-volume
node scripts/ant-audio-plate-timeline-render.js test-results/ant-audio-plate-timeline-primary-default-volume continuous-natural-0-180s docs/ant/evidence/2026-10-24-audio-plate-timeline
node tests/ant-audio-plate-timeline.test.js
```

Focused tests also passed for the existing audio snapshot (8), audio overview (9), AntController (21), Plate birth (7), and material stratigraphy (8). They were run directly with Node because this sandbox blocked `node --test` child-process creation (`spawn EPERM`). A full build was omitted because production `src/` is unchanged.
