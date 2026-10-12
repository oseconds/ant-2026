# Independent review

**Verdict: PASS WITH LIMITATIONS.** No scientific or data correction was requested.

The reviewer independently checked the strict cohort threshold, tick-entry sampling, `L`/`P` and top-versus-buried classification, observer parity, and reported arithmetic. They ran 39 reconciliation checks over the saved distributions, ant records and episode records; all passed. They also recomputed actual `m(L)`, diagnostic `m(L-P)`, and aggregate/top/buried delta summaries from the joint counts; the results matched exactly.

The review confirmed that production `src/` and `package.json` have no difference from baseline `e5e4c52db22512f53d32014f54232f6ff7e3d4cf`, and that the reproduction command uses a fresh output directory and the manifest observer hash matches the current script. The review was read-only and did not rerun the three 600 s natural simulations.

The only requested correction was to link the existing validation logs and review from this evidence README; that documentation link has been added. Scientific limitations remain as stated in the main report: three deterministic seeds, 600 s horizon, no creator provenance, no buried-material sensing measurement, and no behavior counterfactual with old layers removed.
