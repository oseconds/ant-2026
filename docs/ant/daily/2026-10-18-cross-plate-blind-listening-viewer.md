# Cross-Plate p50 blind listening preparation — 2026-10-18

## Question

At the same p50 contact condition, are selected frozen natural Plates perceptually distinguishable in an exploratory blind first-listen session?

This pass prepares the comparison. It does not collect a listening assessment. It tests only selected between-Plate pairs. Same-Plate position persistence, between-versus-within comparison, identification accuracy, preference, formal psychophysics and production acceptance remain out of scope.

## Baseline and frozen inputs

- Fetched `origin`; starting `origin/main` was `2914080168ca29dff3d00240300a3119e60883ee`.
- Used the existing 12 p50 entries in `docs/ant/evidence/2026-10-13-plate-sonic-individuality/listening-manifest.json` and the existing descriptor roster and measurement summary.
- Verified all 24 original sonic-individuality fixed and level-matched WAV receipts by byte size and SHA-256. Verified all 12 Base/Born WAV receipts the same way.
- The sonic-individuality WAVs remain in ignored `test-results/ant-plate-sonic-individuality-20261013`. No render, simulation, source PCM rewrite or copy into docs occurred.
- Production `src/` and `static/` remain outside this pass.

## Pairing and catch

Pairing follows `manifest-order-adjacent-v1`: retain listening-manifest order, pair adjacent entries, and use each of the twelve sources once.

1. `20261005-trail-plate-15-p50-native` vs `20261006-trail-plate-17-p50-native`
2. `20261007-trail-plate-20-p50-native` vs `20261005-trail-plate-1-p50-native`
3. `20261006-trail-plate-14-p50-native` vs `20261005-trail-plate-24-p50-native`
4. `20261007-trail-plate-1-p50-native` vs `20261007-trail-plate-26-p50-native`
5. `20261006-trail-plate-24-p50-native` vs `20261005-trail-plate-23-p50-native`
6. `20261005-trail-plate-27-p50-native` vs `20261007-trail-plate-31-p50-native`

One hidden A/A catch reuses the first entry, `20261005-trail-plate-15-p50-native`, with identical matched and fixed source bytes on A and B. It is an exploratory difference-seeking-bias check, not a score or pass/fail gate.

## Implementation

- Extended the reusable viewer to accept explicitly configured repository-relative audio paths that resolve inside repository root and match source-manifest byte size and SHA-256. Browser paths are relative to generated HTML. The static viewer does not contain PCM.
- Decoupled blind sessions from ERB. Existing Base/Born ERB reveal and fixed-gain analysis remain enabled. Cross-Plate pre-Reveal playback is RMS-matched only; fixed-gain context is available after Reveal.
- Added a playback-stage Web Audio `GainNode` after matched WAV playback. Every A/B pair receives one common gain calculated from manifest matched RMS to digital pooled stereo RMS `0.08`. Fixed-gain playback stays at unity. No limiter or compressor is used; generation fails if a predicted peak reaches full scale.
- Base/Born uses its existing per-pair matched RMS values to calculate gain independently for q25/q50/q75. Its twelve WAVs remain unchanged.
- Reveal and JSON export include existing corpus/Plate/geometry/material metadata, source receipts, matched source RMS/peak, target RMS, linear/dB gain and predicted peak. No new score or psychoacoustic measure is added.
- The committed 2026-10-15 Base/Born subjective JSON remains unchanged. That session predates this playback convenience gain; it remains historical evidence and is not recalculated under the new playback level.

## Validation and evidence boundary

- Cross-Plate matched gain is `4.0` (`+12.0411998266 dB`) for every p50 source. Maximum predicted post-gain peak is `0.7604373693`, below full scale.
- Base/Born matched gains range `10.1109092277–32.3965625995` (`+20.0958042291–+30.2099786466 dB`); maximum predicted peak is `0.5834092845`.
- Generator validates all source receipts and pair RMS/headroom. Base/Born ERB parity remains exact at `0 dB` error on q25/q50/q75 and continues to use fixed-gain WAVs only.
- Focused Chromium 153 / Playwright 1.63 checks passed for `file://` and repository-root loopback HTTP playback, matched GainNode values, AudioContext resume after a user gesture, unity fixed-gain playback, exclusive A/B playback, restart-at-zero, blind DOM, no-ERB Reveal, seeded order/mapping replay, immutable first judgment, separate revision and completed-session JSON receipts. No runtime fetch, external request or uncaught page error occurred.
- Browser automation used synthetic values in isolated test contexts. It did not listen to or assess the Plates.
- Existing measurements show isolated Plate responses differ measurably, and contact position strongly changes response. Perceptual cross-Plate identity remains untested. No cross-Plate human listening assessment has been collected. Base/Born scientific decision remains **MIXED**.

Reproduce both viewers and the focused browser checks from the repository root:

```powershell
python scripts/ant-audio-evidence-viewer.py docs/ant/evidence/2026-10-14-base-born-natural-event-erb/viewer-config.json
python scripts/ant-audio-evidence-viewer.py docs/ant/evidence/2026-10-13-plate-sonic-individuality/cross-plate-viewer-config.json
node scripts/ant-audio-evidence-viewer-browser-check.js
```

The cross-Plate HTML requires the existing ignored WAVs beside the checked-out repository. Use a browser that permits the `file://` path, or run `python -m http.server 8000` from repository root. GitHub file preview is not the playback surface.
