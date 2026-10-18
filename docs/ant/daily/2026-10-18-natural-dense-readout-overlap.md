# 2026-10-18 — Natural dense Plate readout overlap

## Question and boundary

After the pickup-stem observer was validated, this pass asked whether one natural current-production 10-second window from the eight-historical-Plate milestone contains dense simultaneous Plate readouts and overlapping tails around directly routed focal strikes, even when replayed offline without realtime deadlines.

The work stayed observational. It retained the current authored formation/material laws, 3 ms contact pulse, 75 ms recovery, ×50 damping, point pickups, full Plate/Z/Nodule coupling, Base Off, strike routing, limiter, 6 kHz physics, 48 kHz interpolation, and sleep/wake behavior. No production solver, audio, controller, renderer, or world source changed.

## Frozen capture and control

Seed `20261005` first reached eight historical Plates at tick `17521` (`292016.66666664043 ms`), the same timestamp as Plate 8's birth. The measured half-open interval is 600 ticks / 10 seconds, output frames `[14016800, 14496800)`. Repeated Float64 tick-time accumulation puts the controller's tick-18121 endpoint `11.68 ns` after nominal `start+10,000 ms`; tick count and output frames define the interval. The complete pre-roll and endpoint topology/event stream are preserved so the same coupled solver can reach the milestone state. Messages stamped at the exact start boundary remain in captured sequence order for replay but are excluded from focal-event analysis.

An Audio-Off controller and the audio-bridge capture controller matched at every one of 18,122 tick snapshots from initialization through the endpoint. Trajectory, lifecycle, RNG, pheromone, SurfaceField, gait, pose, gaster deposition, activation, occupancy, FOOT_CONTACT, births, TrailPlateBirth, and MaterialStratigraphy hashes all matched. Final RNG state and call count matched. The capture stored all topology installations, strike payloads, positions/strengths, IDs, births, Sphere/Nodule topology, per-tick Plate history, and interval metadata. Eight Plates and one buried Sphere/Nodule were present throughout the half-open audio interval; a ninth Plate appeared on the 600th tick endpoint, just beyond the nominal timestamp due to accumulated Float64 time.

Full capture details, source hashes, recompilation checks, and binary input SHA are in the [evidence package](../evidence/2026-10-18-natural-dense-readout-overlap/README.md). Its input SHA remained stable across capture reruns.

## Replay validation

The exact event/topology sequence was replayed through the uninstrumented worklet and the validated readout observer. Both used one full coupled solve; each Plate stem is its existing point pickup from that shared state, not an isolated Plate simulation.

- All 120,004 saved Float64 Plate/Sphere samples reconstructed the production pre-limiter mix in the existing accumulation order, with maximum absolute error `0`.
- All 960,000 output Float32 values matched between raw and observed renders, with maximum absolute error `0`. The existing shared limiter and interpolation also reconstructed the output window exactly.
- Existing ERB full-mix checks covered 101,400,000 samples across complete event windows; all matched, maximum absolute error `0`.
- Raw and observed telemetry were exact matches. Worklet route audit counted 8,279 accepted strikes and one rejected pre-window strike: at frame `10992549`, `trail-plate-2` was not the exposed layer in topology generation 4. No route was rejected in the analysis interval; zero invalid topology, non-finite or clipped counts were observed.
- Stem storage was preallocated at 12,000,400 bytes. One offline run measured 514.405 s raw versus 520.273 s observed replay, about 1.14% additional wall time; this single run is not a benchmark. Production worklet source is unchanged, so disabled production cost remains zero.
- Focused existing Plate/worklet/topology/bridge/audio tests passed `55/55`.

The route audit first disagreed with the worklet because it used capture order instead of renderer frame order; it now applies the same frame/sequence ordering. Strike event frames are not always aligned to 6 kHz steps, so energy windows begin at the first physics sample after the exact event frame. ERB and listening excerpts retain exact 48 kHz event-frame alignment; the saved full-mix checks pass sample-for-sample.

## Measured overlap

The interval contained 1,279 directly routed strikes, or 127.9 messages/s (91–144 by second). Of those, 1,270 had a complete 100 ms window, 1,255 a complete 250 ms window, and 1,231 a complete 500 ms window. In complete 500 ms windows, the median was 69 routed strikes and 29 distinct contact-group indices.

| Window | Focal/rest energy level p10 / median / p90 | Median event effective contributors | Median post/pre RMS change |
| ---: | ---: | ---: | ---: |
| 100 ms | −17.72 / −5.13 / +5.34 dB | 2.14 | −0.451 dB |
| 250 ms | −17.60 / −5.46 / +4.75 dB | 2.13 | −0.444 dB |
| 500 ms | −17.89 / −5.38 / +4.51 dB | 2.10 | −0.448 dB |

In 742 of 1,231 complete 500 ms windows (60.3%), the signed sum of all other Plate stems had at least as much energy as the focal stem. The full range was `−30.61` to `+6.68 dB`, so the focal Plate led in many events as well.

Across the 60,000 physics samples, exact nonzero support was seven or eight Plate stems (median eight); energy-weighted effective contributors had median 2.113, p90 3.587, and mean 2.277. One Plate held a strict arithmetic majority of Plate pickup power in 73.23% of samples. This uses no amplitude cutoff and is not a masking threshold.

Sphere readout remained separate and nonzero, but was small: aggregate Plate pickup energy was 75.51 dB above Sphere energy. The common limiter gain medians were 0.9755 left and 0.9854 right; minimum gains were 0.8650 and 0.8493. The 500 ms post-limiter/interpolated versus pre-limiter RMS change had median −0.448 dB. Mean gain in the highest effective-contributor quartile was 0.9832, compared with 0.9681 in the lowest quartile.

The existing ERB frontend found median 500 ms focal/rest full time-frequency cosine `0.468` (p10/p90 `0.233/0.599`) and integrated-profile cosine `0.852` (`0.416/0.972`). These are descriptive signal-shape comparisons, not masking or audibility measures.

## Listening selection and decision

Before writing assets, the analysis selected complete 500 ms cases at rounded p10, p50, and p90 of focal/rest level: sequences `7258` (−17.889 dB), `7860` (−5.379 dB), and `8225` (+4.515 dB). Each has aligned fixed-gain full, focal, rest, and Sphere WAVs plus a simple comparison page. No RMS-matched copies or subjective reports were produced.

**Decision: DENSE-OVERLAP CANDIDATE SUPPORTED.** Rest-of-Plate contribution repeatedly exceeds focal contribution during busy windows, while focal/rest time-frequency shapes remain differentiated in the existing descriptive ERB measurements. This supports a separate later listening check. It does not establish perceived masking, consistent focal burial, a psychoacoustic law, or a production mix responsibility. No follow-up experiment or production change is started here.

## Review correction

Independent review found that an exported physics-start frame label used `event.frame + 8`, which was wrong for off-grid events even though the selected stem samples and analysis windows were correct. The label now comes from the selected stem index and is asserted to identify the next 6 kHz sample boundary; event frame `14017134` maps to physics frame `14017136`. The frozen analysis and aligned listening manifest were regenerated. Energy/overlap values, example selections, reconstruction, and full-mix ERB comparisons remain unchanged; the corrected analysis SHA-256 is recorded in the evidence package.
