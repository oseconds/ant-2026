# G Natural Hardness → Contact Pulse Shadow — 2026-10-26

- Question: does the single frozen `3−2h ms` pulse-width rule change natural G output relative to fixed 3 ms?
- Captured and parity-checked actual `SurfaceAudioBridge` topology/strike posts for three 600 s G runs. World traces, contacts, births, event streams, RNG receipts, and routed strike payloads matched the saved G baseline.
- The corrected continuous renderer batch ran eight jobs: six seed/arm renders and two repeat renders. None completed by the user-set 240 CPU min/arm stop. All eight workers were stopped; no extra replay started.
- Candidate self-checks passed; focused research tests passed 9/9 before and after rendering when run without child-process isolation. The default isolated runner hit environment `spawn EPERM`. The nine fixed windows have input-only hardness and derived B pulse distributions; they have no PCM or acoustic metrics.
- Decision: **INCONCLUSIVE**. No listening files or human listening result. Production remains fixed at 3 ms; no production or worklet change.
- [Evidence package](../evidence/2026-10-26-g-hardness-pulse-shadow/README.md) · [cutoff receipt](../evidence/2026-10-26-g-hardness-pulse-shadow/cutoff-receipt.json)
