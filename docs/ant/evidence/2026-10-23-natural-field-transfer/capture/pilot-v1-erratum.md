# Pilot v1 metadata erratum

`pilot-seed-20261005-180s.json.gz` is retained unchanged for provenance. Its `provenance.sampleTimeBeforeTickMs` and `provenance.rngBeforeTick` were read after the sampled replay tick, so those two labels do not contain pre-tick values. Do not use them as pre-tick metadata.

The corrected receipt is `pilot-seed-20261005-180s-v2.json.gz`. Version 2 captures both values immediately before the matched one-tick replay. The underlying pilot parity and field-reconstruction assertions passed in both runs; this correction changes receipt timing metadata only.
