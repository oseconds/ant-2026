# 2026-10-14 — Base/Born natural event ERB comparison

Question: in the frozen seed `20261005` first-birth 10 s stream, do the existing generic Base and Born P1 raw worklet stems retain repeatable ERB-time differences when grouped at the same 44 parent `FOOT_CONTACT` anchors?

Reused the original 63-Born-strike to 44-parent-group mapping, frozen input gzip, and both raw pre-bridge worklet PCM files. Verified each PCM path, 3,840,044-byte size, float32 stereo 48 kHz header, and SHA-256 against the original event report. No simulation or audio render was created. Base's unrecorded generic-worklet random jitter realization was preserved by using the historical PCM without replay.

Measured complete 100/250/500 ms windows at the common requested parent sample. Eligible counts were 43/43/42. Whole-stem Born RMS was 34.59 dB below Base. Shape-only full ERB-time cosine medians were 0.488/0.476/0.546; integrated-profile medians were 0.603/0.672/0.668; late-half profile medians were 0.589/0.635/0.672. The 500 ms event-wise shape-change pattern cosine had median 0.497 across 861 event pairs. Some normalized energy shift toward ERB bands 5–8 recurred, but the event pattern varied.

500 ms windows included a median of 3 other parent group starts and 5 other Born strikes; overlap counts did not show a positive monotonic relationship with shape distance in this frozen set. The windows are not isolated. Base's single group-level event and Born's 63 individual foot responses also preserve different event semantics. These observations establish ERB-time differences beyond level alone in the existing stems, with only partial cross-event pattern consistency.

Decision: **MIXED**. The result is bounded to these verified frozen stems and does not establish a stable intrinsic Base/Born character independent of event semantics and overlap. No human listening assessment was performed. Twelve fixed-gain and RMS-matched listening-preparation WAVs were produced; the matched files are listening-only. Production sources and canonical research status were not changed.

Evidence: [Base/Born natural event ERB package](../evidence/2026-10-14-base-born-natural-event-erb/README.md). Reproduction: `python scripts/ant-base-born-natural-event-erb.py`.
