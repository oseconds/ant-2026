# Base substrate audio A/B — captured PCM follow-up

The scheduler repair captured six stereo float32 WAVs through Chrome 154.0.8037.98 `OfflineAudioContext` and the actual AudioWorklets at 48 kHz. Each condition contains 480,000 samples per channel. Production DSP, substrate settings, contact routing, Plate physics and simulation behavior were unchanged from branch commit `ad85d6bbfd489c3ec028e977eebfe4b4f0558693`.

This pass establishes exact pre-birth Off silence, nonzero On PCM and unchanged born Plate PCM. It does not establish that substrate preserves born Plate audibility: the post-birth substrate stem has **+29.19 dB pooled RMS** relative to the born Plate stem. Default remains Off and main integration remains withheld. No level tuning was authorized.

## Frozen windows and input

Fresh natural AntController seed 20261005 reaches P1 (`trail-plate-1`) at simulation 103.01666666667376 s. The input retains natural FOOT_CONTACT payloads, SurfaceField contact responses, accepted bridge routes and the frozen first Plate descriptor. The pre-birth interval is `[93.01666666667376, 103.01666666667376)` s; the first-Plate interval is `[103.01666666667376, 113.01666666667376)` s. Both last exactly 10 s.

Each window starts from rest. These are controlled window replays, not a continuous live recording or a stitched audio timeline. Off and On share the same frozen input and born topology. Generic Plate strike jitter still uses its production `Math.random`; the base noise realization may vary on another render. The captured input and first Plate hashes match the constructor-only provisional run exactly.

- Input: [fresh-seed-20261005-through-first-birth-plus-10s.json.gz](fresh-seed-20261005-through-first-birth-plus-10s.json.gz), SHA-256 `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`.
- First Plate descriptor SHA-256: `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- Complete settings, per-channel peak/RMS, SHA-256 values, schedules and worklet receipts: [audio-ab-report.json](audio-ab-report.json).

## Scheduler and clock mapping

The old harness awaited a MessagePort readiness reply before starting offline rendering. Schedule/topology now arrive through constructor-cloned `processorOptions`, and readiness is acknowledged from process frame 0 after rendering starts. Rendering, all readiness replies and completion replies are awaited together; processor errors reject the run. A second reporting bug indexed flat completion arrays as nested arrays.

Original contact emission order can contain decreasing sub-tick timestamps across ants. Stable sorting schedules by requested sample frame preserves every timestamp/payload and equal-frame emission order. The earlier constructor-only provisional capture delivered some events late; it is retained below and is not the accepted timing measurement.

The mapping is `requestedFrame = round((simulationTimeMs - windowStartMs) * 48)`. Absolute anchors map each simulation start/end to audio samples 0/480,000. The display origin shifts to window start only because the existing overview API requires a zero-relative simulation span. P1 maps to sample 0 in the first-Plate window. The pre-birth interval excludes that endpoint and therefore contains no Plate-birth event.

Born routes dispatch at their requested sample before physics. The unchanged legacy replay dispatches at the next 128-frame block boundary. Actual receipts obey `actualFrame = ceil(requestedFrame / 128) * 128`; measured maximum delay is 127 samples (2.645833 ms). Requested and actual frames are retained separately in the report and plot manifest.

Ten worklets across four conditions acknowledged frame 0 and completed all 480,000 frames. All 561 pre-birth base messages and 624 post-birth base messages were injected. Each first-Plate processor received exactly 63 accepted P1 strike messages, with zero rejected routes. FOOT_CONTACT groups and accepted born strike messages are separate quantities; no one-to-one assumption is made.

## PCM levels and equality

Peak below is the maximum absolute L/R sample; RMS pools both channels. Raw amplitudes are float PCM full-scale units. Per-channel amplitudes and dBFS are in the report. Exact zero has peak/RMS 0; its report dBFS uses the existing numerical floor rather than mathematical negative infinity. All files contain zero non-finite or clipped samples.

| Condition / PCM | Peak | Pooled RMS |
| --- | ---: | ---: |
| [Pre-birth Off](prebirth-off-silence-10s-48khz-f32.wav) | 0 | 0 |
| [Pre-birth On](prebirth-on-substrate-10s-48khz-f32.wav) | 0.0429722666740 | 0.0216270263343 |
| [First Plate, Off](postbirth-off-born-only-10s-48khz-f32.wav) | 0.00649256166071 | 0.000779757180402 |
| [Isolated born control](postbirth-born-only-10s-48khz-f32.wav) | 0.00649256166071 | 0.000779757180402 |
| [Post-birth substrate stem](postbirth-substrate-only-10s-48khz-f32.wav) | 0.0442604422569 | 0.0224675204299 |
| [Post-birth On sum](postbirth-on-summed-10s-48khz-f32.wav) | 0.0443426221609 | 0.0225040458693 |

Off/On born Plate outputs and a duplicate born control match exactly over 960,000 channel samples, with zero different samples and zero maximum absolute difference. Substrate RMS is 28.81 times born RMS in this window. This level difference is an audibility concern to resolve separately; PCM energy alone is not a psychoacoustic masking test.

Master volume is 0.35. Substrate output ratio remains 0.22; damping control remains 1 (generic processor damping 100). Final substrate gain is 0.0539 and born gain is 0.245. Born baseline remains 3 ms pulse / 75 ms recovery / ×50 damping. Base substrate remains audio-only and adds no material history.

## Existing waveform/spectrogram conventions

The new evidence script calls the existing immutable renderers from `scripts/audio-snapshot-renderer.js` and `scripts/stratigraphy-audio-overview.js`. It uses the conventions already documented in the [contact sonic baseline](../../2026-10-06-contact-sonic-baseline/README.md) and [stratigraphy runtime evidence](../../2026-10-06-stratigraphy-runtime/README.md). Neither shared renderer was edited.

All conditions use separate L/R channels, waveform amplitude ±1, FFT 1024 Hann, hop 256, frequency 0–8 kHz, grayscale −100…0 dBFS and gamma 1. There is no normalization, autocontrast or per-condition scaling. The comparison layout, 1200×1000 event details and 1800×1200 overviews retain their existing dimensions and axes. Details draw original per-group FOOT_CONTACT ticks; overviews draw the native fixed contact strip and P1 birth line/label. Headers state absolute simulation intervals and the frozen Plate ID/time. [audio-visual-manifest.json](audio-visual-manifest.json) retains absolute/display anchors, every contact marker, base dispatch receipts, accepted born strike schedules and image hashes.

- [Pre-birth Off/On comparison](prebirth-off-on.png).
- [First-birth Off / born / substrate / On comparison](first-birth-off-born-substrate-on.png).
- First-birth marker overview: [Off](postOff-fixed-10s-overview.png), [On sum](postOn-fixed-10s-overview.png).
- Per-event detail: [pre-birth Off](preOff-fixed-10s-events.png), [pre-birth On](preOn-fixed-10s-events.png), [first Plate Off](postOff-fixed-10s-events.png), [On sum](postOn-fixed-10s-events.png). The manifest lists all six details and overviews.

## Validation and reproduction

```powershell
node scripts/ant-base-substrate-audio-evidence.js
node scripts/ant-base-substrate-audio-visuals.js
node --test tests/audio-snapshot-renderer.test.js tests/stratigraphy-audio-overview.test.js
```

The repaired capture passed its readiness, completion, route-count, receipt-clock, silence/nonzero, finite/clipping and born-equality assertions. Existing renderer/overview tests passed 17/17. Production files, shared renderers and the completed invariance/Plate debug harnesses have no diff from `ad85d6b`; [pcm-repair-scope.json](pcm-repair-scope.json) records the checked paths and hashes. The completed full tests/build/browser and long invariance evidence from the previous pass were not restarted or broadened for this repair.

Historical records remain unchanged: [initial failure](FAILURE.md), [constructor-only provisional report](constructor-only-provisional-report.json) and [provisional run output](constructor-only-provisional-run.txt). The provisional report's capture status is historical and does not mean its timing was accepted. Only `audio-ab-report.json` and its SHA-matched WAVs describe the final sorted-scheduler capture. This follow-up also retains the [indexing failure](pcm-reproduce-index-failure.txt), [final successful run](pcm-final-run.txt) and [existing preset test log](preset-tests.txt).
