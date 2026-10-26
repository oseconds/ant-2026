# Current G native AV observation — capture complete, human observation pending

## Current decision

**Technical capture: usable within the stated timing limits. Perceptual scale: not measured. Post-hoc state interpretation: deferred until first human notes. No production mechanism is selected or implemented.**

The initial request required an unlabelled human viewing/listening response before state comparison. The agent cannot substitute waveform measurements or source knowledge for having heard an event. A neutral [viewer](listening.html) and the unchanged native material are available. Human first notes were requested in the chat before any state-to-perception interpretation. No response has yet been recorded in this package.

The single next priority is to complete that first unlabelled viewing/listening and then compare the reported moments with the existing sidecar. It would be premature to select selective listening, persistence, pre-aged entry or a new excitation mechanism from this package alone.

## Canonical source and scope

- Fresh GitHub `origin/main`: `4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b`.
- Research branch: `codex/ant-g-native-av-observation-20261026`.
- Production `src/` and `static/` remain byte-identical to that baseline. The production bundle is exposed by one reversible, in-memory assignment around its existing app mount; its original SHA-256 is recorded.
- The stale local main and unrelated existing untracked evidence/scripts were preserved. No new worktree, PR, merge or production adoption.
- All measurements below are current-G research capture results. No pre-G runtime measurement is relabelled as G.

## Capture conditions

Seed `20261005`; Chrome `156.0.8078.48` on Windows; headed foreground session; viewport 1280×900, device scale 1; actual default canvas 640×640. Default renderer with no diagnostic overlay; Full Physics, Base Substrate Off, adopted retained-history locomotion resistance On. UI volume remains 100%; measured final gain is `0.699999988079071` (the native Float32 representation of 0.7).

The seeded RNG is injected before controller initialization. Model RAF advancement is held at zero while the real Audio On button gesture enables audio and the capture infrastructure becomes ready. The initial recorder/tap calibration does not advance model time. The released world stops at the first tick completing 30 model seconds after the first Plate, bounded by 180 model / 240 wall seconds.

The first Plate is at 84.016666667 model seconds. The retained capture ends at 114.016666667 model seconds. There is approximately 2.22 seconds of model-zero recorder lead-in in the media; **media time zero is not model time zero**. Human notes should use the video's displayed time. Clocks and event labels retain their separate origins; no time stretching or gap interpolation is applied.

## Attempts and export failure

| Attempt | Outcome |
| --- | --- |
| 01, files at this package root | Natural capture completed at the prescribed endpoint. Same-Chrome world/RNG/contact/strike parity passed. The Float32 PCM and sidecar survived, but the WebM export is seven invalid bytes: the data-URL parser split at the comma inside `video/webm;codecs=vp8,opus`. The browser had closed before discovery, so its video is unrecoverable. This is a research transport failure, not an acoustic result or production runtime regression. |
| 02, [retained assets](attempt-02/) | Exactly one technical repeat after a recorded preregistration amendment. Same seed, world age, gain, laws and stop conditions. Data-URL parser fixed; regression test and WebM EBML-header assertion added. No third capture. |

Attempt-01 assets and [executed runner source](attempt-01-runner.js.txt) are preserved. The repeat was a transport repair, not a search for a better scene. The retained attempt's runner SHA is recorded in its [capture manifest](attempt-02/capture.json).

## Native assets and readout provenance

- [Original combined native AV](attempt-02/native-av.webm): actual canvas VP8 and final-production-gain stereo Opus in one MediaRecorder. Original source hash and bytes preserved.
- [Indexed viewing derivative](attempt-02/native-av-indexed.webm): stream-copy remux only, 116.274 seconds. Every audio/video packet payload hash and PTS/DTS matches the original, with zero timestamp offset. FFmpeg filled/differed in 41 video packet duration metadata fields; the file is not byte-identical. See [media receipt](attempt-02/MEDIA-INDEX.json).
- [Lossless stereo Float32 WAV, gzip](attempt-02/native-stereo-f32.wav.gz): 48 kHz, two channels, 5,579,520 frames / 116.24 seconds including setup lead-in. This is a parallel sample tap after the unchanged final gain, **not a WAV decoded from Opus**. Retained WAV payload SHA-256: `6eb027ccc3ab0706b8bff9d029fb5536c11a0ea2511dbddaf8d23b2407f45ee9`.
- [Minimal sidecar](attempt-02/sidecar.json.gz) and [final world fingerprint](attempt-02/world-final.json.gz): sealed source/state records, not perceptual findings.

The original output connection remains present. The recorder worklet's additional output is zero, preventing a doubled audible output. No output gain, normalization, EQ, resampling, audio replacement or time stretch is introduced. The Opus viewing asset remains compressed; the separate Float32 sample data is lossless. Hardware output and listener audibility were not measured by the digital tap.

## Clock, recording and observer validity

| Retained attempt-02 measurement | Value |
| --- | ---: |
| Wall duration after world release | 114.036 s |
| Model duration | 114.016666667 s |
| AudioContext duration | 114.029333333 s |
| Audio / wall | 0.999941539 |
| Model / wall | 0.999830463 |
| Maximum sampled cumulative audio deficit | 6.8 ms |
| Maximum sampled cumulative model deficit | 26.667 ms |
| Video frames / maximum recorded frame gap | 3,487 / 59 ms |
| Timed observer callback cost | 38.4 ms total, 0.03367% of wall duration |
| Missing-channel PCM frames / non-stereo blocks | 0 / 0 |
| Recorded page/audio/recorder errors | 0 |

**Calibration correction:** the executed runtime gate used 208.633 ms because the initial tap-off calibration included AudioContext startup. This was too broad to describe as a steady-state calibration. Preserve that executed threshold. A stricter **post-capture** check uses tap-on steady scatter of 17.6 ms plus two 128-frame quanta, yielding 22.933 ms; the maximum 6.8 ms sampled deficit passes. This does not retroactively make the executed gate well calibrated. [Full validation](attempt-02/VALIDATION.json).

Empty-topology tap-off/on RAF averages were about 16.666 ms with maximum gaps of 16.8/16.9 ms. This is a narrow infrastructure calibration, not a loaded-world cost A/B. The observer timing covers its timed main-thread operations, not all recorder, wrapper or solver cost. The measured healthy clocks do not prove zero overhead.

The capture encoder checks declared chunk continuity. The verifier checks total frame span equals sample count. With monotonically advancing non-overlapping Web Audio frame ranges, a skipped forward quantum must violate the next chunk boundary or final span. A regression fixture demonstrates that a zero channel-gap counter alone is insufficient and that the combined invariant detects the skip. No exact pixel-to-sample synchronization or hardware loopback claim is made. Video cadence, codec timestamps and asynchronous diagnostics limit single-contact timing inference.

## World, RNG and actual-post preservation

The same Chrome version re-executed **the same SHA-verified compiled production bundle** synchronously for the same 6,841 ticks, with an inert worklet port and no audio DSP/PCM rendering. All gates are exact:

- Final world fingerprint and RNG state/call count.
- 12,042 valid foot response positions, source times, ant/leg/group labels and order.
- 631 actual bridge strike payloads and order.

See [same-browser receipt](attempt-02/BROWSER-PARITY.json). A first Node-versus-Chrome strict comparison did not pass: small floating-point differences occurred across runtime/compiled paths. That failed cross-runtime comparison is retained in [its receipt](attempt-02/CROSS-ENGINE-COMPARISON.json); no tolerance was substituted for same-browser exact equality.

Sidecar compaction is the original response's pre-contact sample. Pheromone is sampled after that ant's gaster deposition, not reconstructed at the source event's sub-tick time. `localL` is the foot contact cell's current column count, not the controller's agent-center locomotion sample. Exposed route and actual bridge posts remain distinct. Post order is preserved; source-event time and controller time at post are not treated as interchangeable.

## Perceptual and artistic status

[First observation status](FIRST-OBSERVATION.json): **pending human response**. No contact-, region-, or world-texture-scale result is claimed. No source/sidecar correlation has been presented as a heard relationship. Post-hoc causal attribution would remain limited by co-varying contact density, compaction, topology and world age even after a response.

This early two-minute encounter does not measure mature 20–30 Plate Audio-On reliability, general audience recognition, material-age hearing, persistence value or selective-readout value. A negative response would apply to this window and playback level, not all retained history. Individual-contact recognition is not an artistic success threshold.

## Reproduction and checks

Production build passed after an initial sandbox `spawn EPERM` was resolved by the authorized build execution. Focused observer/PCM tests pass 7/7 with:

```powershell
node --test --experimental-test-isolation=none tests/ant-g-native-av-observer.test.js tests/ant-g-native-av-pcm.test.js
```

The capture runner targets the retained attempt directory and refuses existing assets:

```powershell
npm run build
node scripts/ant-g-native-av-observation.js
```

Do not run that capture command again in this closed acquisition pass. Recheck existing data without new capture:

```powershell
node scripts/verify-ant-g-native-av-browser-parity.js
node scripts/verify-ant-g-native-av-observation.js
```

These are world-only parity and file/clock checks, not AudioWorklet replay. Full production tests were not rerun because production code is unchanged. [Independent technical review](INDEPENDENT-REVIEW.md) and [chronology](../../daily/2026-10-26-g-native-av-observation.md) preserve corrections and limits.
