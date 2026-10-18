# ANT static A/B audio evidence viewer

Generate a standalone `listening.html` from a small JSON config:

```powershell
python scripts/ant-audio-evidence-viewer.py docs/ant/evidence/<package>/viewer-config.json
```

Schema version 1 uses the existing `listening-manifest.json` as the source for clip sizes, hashes, gains, RMS and peaks. Each configured arm supplies evidence-relative `fixedGainPath` and `rmsMatchedPath` values; it may name its own `sourcePairLabel` when A and B come from different manifest entries. The generator requires each path to match its manifest receipt. `sourceAnalysis` plus `contactIndex` is optional; when present, the page exposes the existing window summary in its closed measurement disclosure. Pair `measurement` or arm `measurementMetadata` can supply existing descriptors directly.

Normal audio paths stay inside the evidence package. For intentionally local frozen sources stored elsewhere inside the repository, set `allowRepositoryRelativeAudioPaths: true` and use repository-relative paths. The generator rejects absolute paths, `..` traversal and resolved paths outside the repository; every source must still match its manifest byte size and SHA-256. Generated browser paths are relative to the output HTML. PCM stays in place; it is not copied into committed HTML or base64 embedded.

`blindSession` is an optional opt-in for exploratory blind first-listen sessions. ERB is optional. A `catchTrial` names an existing source pair/arm; the catch reuses that exact arm's existing fixed-gain and RMS-matched files on both sides. `preRevealMode: "matched-only"` hides and disables fixed-gain playback until Reveal. `pairingRule: "manifest-order-adjacent-v1"` validates deterministic adjacent pairing across a `listening` manifest. Its small config shape is:

```json
"blindSession": {
  "enabled": true,
  "preRevealMode": "matched-only",
  "catchTrial": { "id": "control-aa-q50-base", "sourcePairId": "q50", "sourceArm": "a" }
}
```

When enabled, the page displays only anonymous A/B playback before Reveal. A fresh browser-random seed drives the versioned `fnv1a32-xorshift32-fisher-yates-v1` trial order and side assignment; the seed is exported after the session rather than shown before listening. Reveal shows condition identity and supplied metadata; it shows ERB only when configured. The browser UI withholds names until Reveal, but this static artifact is not cryptographic blinding: a technically curious user can inspect its downloaded source. The A/A catch is an exploratory difference-seeking-bias check, not a formal psychophysical statistic or part of the scientific evidence.

An optional `listeningPostGainTargetRms` applies one common final gain to both RMS-matched arms in each pair. The gain is calculated from the mean of their manifest matched RMS values; the generator accepts only differences within Float32 serialization tolerance (relative `1e-8`, absolute `1e-12`) and fails if any predicted post-gain peak reaches 1.0. Matched playback uses a Web Audio `GainNode` after the existing WAV. Fixed-gain playback remains at unity. There is no limiter, compressor or automatic gain reduction, and the playback gain never enters measurement or ERB analysis. The target **0.08** is digital pooled stereo RMS, not calibrated SPL or equal-loudness evidence. Exported Reveal mapping includes each source RMS and peak, the shared pair reference RMS, target, linear gain, dB gain and predicted peak.

Optional `erb` data enables a fixed-gain ERB-time reveal. The config declares one shared `absolutePowerDbScale` and one symmetric `differenceDbScale`; the generator rejects missing or invalid scales. ERB analysis reuses `scripts/ant-base-born-loss-analysis.py`: 48 kHz, symmetric Hann FFT 1024, hop 256, 0–8 kHz, 30 equal ERB-rate bands, summed linear power, and mean L/R power per cell. RMS-matched files are never analyzed. A/B share one absolute scale; all pair differences share the declared symmetric scale. There is no per-pair autoscale.

```json
{
  "schemaVersion": 1,
  "viewerId": "base-born-sample",
  "evidenceId": "2026-10-14-example",
  "title": "Base / Born",
  "sourceListeningManifest": "listening-manifest.json",
  "sourceAnalysis": "analysis.json",
  "analysisWindowMs": 500,
  "output": "listening.html",
  "erb": { "absolutePowerDbScale": [-180, 0], "differenceDbScale": [-120, 120] },
  "pairs": [{
    "id": "q25",
    "label": "q25",
    "contactIndex": 4392,
    "a": { "label": "Base", "fixedGainPath": "listening/q25-base-fixed-gain.wav", "rmsMatchedPath": "listening/q25-base-rms-matched-listening-only.wav" },
    "b": { "label": "Born", "fixedGainPath": "listening/q25-born-fixed-gain.wav", "rmsMatchedPath": "listening/q25-born-rms-matched-listening-only.wav" }
  }]
}
```

The generated page embeds its metadata and optional ERB arrays, uses paths relative to the output HTML, and has no runtime `fetch()` or external dependency. RMS-matched listening-only mode is the default and is labeled as character comparison, not audibility evidence. Fixed gain is labeled amplitude / transfer context. Each pair pauses its other clip; its restart button starts from time zero. The AudioContext starts or resumes from that playback gesture.

Subjective notes stay in browser `localStorage` until the user exports JSON. Legacy pair mode export remains schema version 1. Blind sessions export schema version 2 with viewer/evidence IDs; session ID, seed, randomization algorithm and trial order; per-trial sequence, side mapping and source file byte/SHA-256 receipts; catch/reveal state; per-mode `first` and `latest` pre-reveal judgment snapshots; separate per-mode post-reveal notes; and timestamped events. Blind-session export unlocks when the trials have all been revealed so the mapping is not offered early. Pre-reveal `first` values are immutable; later revisions go to `latest`. RMS-matched and fixed-gain judgments never replace each other, and export synchronizes the currently visible post-note field before serialization.

RMS-matched playback is a listening-only character comparison, not audibility evidence. Every ERB analysis uses only fixed-gain sources and the configured shared scales. Subjective exports stay separate from measurement evidence; the viewer never writes notes into evidence or changes a scientific decision. Existing evidence pages are not migrated.

Static playback surface is a checked-out repository. Open local HTML via `file://` when the browser permits, or start `python -m http.server 8000` from the repository root and open the package path on loopback. GitHub's file preview is not a playback surface. A session tests the listener's selected clips only; it does not establish general identity recognition, preference, formal significance or production acceptance.

For the natural-event integration, run `node scripts/ant-audio-evidence-viewer-browser-check.js` to repeat the headless Chromium interaction checks. The check prints its report and does not write into the evidence package.
