# W1 Archived Chemical–Memory Recurrence Consistency Check — 2026-10-10

## Scope

Checked whether the frozen three-seed archive's `chemical` arrays reproduce stored `chemicalMemory` values under the current production sampler, updater, clock, and Float32 storage order. This was a read-only archive consistency check, not a runner-provenance recovery or a material formation experiment.

## Work and result

- Confirmed branch starting HEAD `22ead7669af28145e9c6966d4a042a692c905057`; inspected latest available main baseline `a78249fc02fb7990568d62709e9a087489fe632b`, design gate, production recurrence sources, and prior sufficiency/provenance evidence.
- Added a separate `--consistency-check` route to the existing audit script. The original route still stops on the archived runner hash gap; the new route permits only that one known gap and always marks runner provenance as unverified.
- Added synthetic byte-level fixtures for unchanged recurrence, changed input, omitted frame, reordered inputs, and the existing runner-only stop condition.
- Reconstructed production time from fixed `1/60` s ticks; used 1 s for the first update and actual reconstructed `simulationTimeMs` differences thereafter.
- Compared all 599 frames per seed and all 9,216 cells per frame: 16,561,152 / 16,561,152 bytes matched; mismatch count and maximum absolute error were both zero.
- Confirmed through a separate Node process that all three result artifact hashes exactly reproduce. Existing q/EMA/active, original W1, max-overlap, and identity parity ledgers remained true.
- Ran the legacy audit route at a separate output path: it remained `Inconclusive / BLOCKED`, did not execute recurrence, and the original blocked evidence package remained untouched.
- Focused tests passed 9/9; full suite passed 409/409; `npm run build` passed with third-party annotation and chunk-size warnings.

## Decision boundary

The result supports archive-internal numerical consistency with the current production recurrence. It does not verify the archived runner bytes or prove same-update input/output capture timing. The earlier sufficiency result remains **Inconclusive / Blocked**, provenance recovery remains **Partially Resolved**, and W1 remains **Undecided / Research Gap**. No natural ANT run, material mechanism, or production change was made.

Evidence: [W1 Archived Chemical–Memory Recurrence Consistency Check](../evidence/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check/README.md).
