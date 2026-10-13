# 2026-10-13 — TrailPlateBirth discarded-history audit

Started `codex/ant-selector-history-audit-20261013` from verified morphology-attribution commit `92d5917bc12baca48e936332ec05d22297cb1276`. Kept the interrupted selector-shadow artifacts untouched; this pass used only current C0 geometry and the fixed 100 birth-time inputs.

Decoded and checked all 100 snapshots, reproduced each current chosen component, retained network and frozen descriptor, and accumulated prior frozen Plate unions before adding each current birth. Production hashes matched; the diagnostic used no RNG and did not rerun natural simulations.

The median discarded novelty was 15.4% at skeleton level and 15.7% at production-width footprint level. Novelty declined with time and prior-union area in all three seeds, while discarded skeleton size did not show a consistent decline. Retained footprints had a lower median new-area count, but a higher overlap fraction than discarded footprints.

Decision: **MOSTLY REDUNDANT**. Boundary pruning limits a large repeat footprint while dropping some novel area; it is not a novelty-aware selector. Do not relax it by branch count. Recommend a broader formation/history-transition investigation before proposing selector behavior.

[Evidence package](../evidence/2026-10-13-selector-history/README.md) · focused tests 6/6; tracked repository tests plus this diagnostic 337/337; production build succeeded. `npm test` reported 341/342 because the preserved untracked selector-shadow test failed its `retainedEndpointCount >= endpointCount` assertion; the failure and passing tracked suite are both recorded in the package.
