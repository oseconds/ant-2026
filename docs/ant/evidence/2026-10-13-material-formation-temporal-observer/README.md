# Material formation temporal observer

## Question

For current production seed `20261006` over 600 simulated seconds, do restarted and continued selected-candidate lineages, and separately sampled cell eligibility loss/return, expose spatial formation information beyond the existing birth summaries and material state?

This is a read-only observation pass. It does not add formation rules, state, thresholds, selector changes, RNG calls, or material changes. A positive finding supports only that current summaries omit observable temporal information; it does not imply that production needs episode state or should form different Plates.

## Baseline and provenance

- Investigation branch: `codex/ant-material-formation-responsibility-20261013`, created from verified material-formation investigation commit `ca0aaac4e1994078758d88bf72511f0203a6c70c`.
- Production reference: live `origin/main`, recorded with its resolved commit in `data/source-tool-hashes.json`.
- Immediately before the final run, `git ls-remote origin refs/heads/main` resolved to `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`; the baseline-source equality and production ANT-source equality `git diff --exit-code` preflights both returned 0. The runner records that these checks are external and does not claim to execute them.
- The run uses the default `AntController` at fixed 60 Hz, the counted LCG seeded with `20261006`, and no audio bridge or state overrides.
- Relevant current sources and observer/test SHA-256 hashes are recorded in `data/source-tool-hashes.json`.
- The interrupted selector-shadow work remains separately preserved in the Phase 0 stash. Its generated outputs are unverified and are not inputs to this pass.

## Observation boundary and causal order

The observer records only when `TrailPlateBirth.lastAnalysisTimeMs` advances during the existing 60 Hz controller tick. The first analysis is at the first production tick (`16.666… ms`); subsequent observations follow the production approximately one-second cadence. The observer does not synthesize an analysis at 600 seconds. The trailing interval is recorded as contact-count tail data and is censored for eligibility transitions.

Each row contains a detached material/column snapshot from interval start `t0`, per-cell cumulative contact counts and their differences through the ending analysis time `t1`, current field and candidate state, and any Plate born at `t1` in a separate `birthsAtEndBoundary` field. Such a birth is excluded from the interval-start material snapshot. The same birth may also appear in `materialChangesDuringInterval` as a change-log record; it is one boundary event, not a second birth. Other material events during the interval are recorded with their production timestamps.

Columns use CSR encoding: `columnOffsets` indexes each cell's bottom-to-top values in `columnPlateIndices`; each value indexes `plateIds`. Top layer, layer count, total depth, insertion order, layer summary, and nodule IDs are also retained. Prior Plate masks and paths are copied from immutable production descriptors. The prior match is the production newest-match result; its age, post-birth contacts, repeat diagnostics, and interval-start column relationship are recorded.

## Separate continuity axes

- Candidate lineage is `INITIAL`, `CONTINUED`, `RESTARTED`, `DISAPPEARED`, or `ABSENT`. Continuity follows the production candidate `startedAtMs`; identity changes and disappearance are recorded separately.
- Cell eligibility is the production combined supported mask. Cell transitions are computed independently in the union of previous/current candidate and matched-prior territories; rows retain eligible-to-eligible, eligible-to-ineligible, ineligible-to-eligible, and ineligible-to-ineligible masks. Each transition mask also supports intersections with the current candidate and frozen prior masks. A sampled local return requires the loss and return transitions to each fall within that interval's relevant territory union. A loss elsewhere in the grid does not qualify a local return.
- Candidate restart without cell loss and local return without candidate restart are explicit, separate counts. Neither is called an episode.
- The first sample has no preceding qualification sample; open losses and current candidate state at the run end are right-censored. One-second sampling cannot establish subsecond absence.
- A prior-mask cell counts as continuously eligible when it is eligible now and has no sampled loss since the first formation observation. This is left-censored before that first sample.

## Recorded fields

Each gzip-compressed JSONL row stores exact typed arrays as base64, with their JavaScript type and element count. It includes the full TrailPlate chemical-memory field, chemical-qualified mask, full-cell mechanical support and mask, production-conditioned supports, production combined mask, candidate and prior masks, cumulative accepted per-cell contacts, interval increments, and observed zero-increment durations in the matched prior mask. Transition masks retain the spatial distribution of chemical, mechanical, combined, and local eligibility losses/returns. Counts are additionally summarized in `data/analysis-rows.csv`.

Production's `buildSupportedMask` is called read-only after the controller tick. Its support values are used where chemical-qualified; `SurfaceField.sampleSupport` fills the remaining cells. The reconstructed full-cell joint mask is asserted equal to the production mask at every observation. Observer capture is bracketed by exact production-state hashes.

## Parity

Plain and observer runs are fresh controllers with identical seed and default settings. SHA-256 chains compare every 60 Hz tick for full agent states, lifecycle/spawning, RNG state and calls, pheromone, SurfaceField, gait, body pose, deposition, activation, occupancy, exact contact and birth events, TrailPlateBirth state including chemical memory/counters/candidate/descriptors, and full MaterialStratigraphy state. `data/parity.json` records per-field hashes and final world snapshot equality.

## Result and decision

The fixed run recorded 599 formation observations. The first was at 16.667 ms; between later analyses there were 524 1000 ms intervals and 74 1016.667 ms intervals. The final observation was at 599250 ms, leaving a 750 ms right-censored tail.

Of 238 observations matched to a prior Plate, 237 had a continued candidate lineage and 1 a restarted lineage. Relevant sampled prior-mask eligibility loss-to-return occurred in 207 observations (564 returning cells); all 238 had at least one currently eligible prior-mask cell with no sampled loss since the first observation. The matched restarted observation had 5 local sampled returns. Candidate restart without local eligibility loss occurred in 0 matched observations; local loss or return without candidate restart occurred in 237. The newest prior-Plate match changed in 67 matched observations.

Within the prior masks, continued observations contained 12077 fresh contacts, 1153 chemical qualification onsets, 0 mechanical support onsets, and 1153 combined qualification onsets across sampled transitions, plus 2124 sampled eligibility losses and 559 relevant returns. The single restarted observation contained 45 fresh contacts, 6 chemical onsets, 0 mechanical support onsets, 6 combined onsets, 10 sampled eligibility losses, and 5 relevant returns. These are summed sampled cell transitions; repeated transitions of one cell can contribute more than once.

The one matched restart occurred at analysis 308 with prior Plate `trail-plate-7`. Its exact candidate source/target/path/mask identity did not occur in any continued observation with that same prior Plate. Thus this run has no exact geometry/prior comparator. Decision: **INSUFFICIENT NATURAL CASES**. No additional seed was run. Across all 599 analyses there were 12 candidate restarts, but only 1 was associated with a matched prior Plate.

The strict current-summary hash has 238 unique groups and no repeats. It hashes selected candidate/prior production summaries and interval-start column ordering, including exact prior age and accumulated values that change across observations; it does not hash every field in a row. This is a diagnostic, not evidence that temporal information survives current summaries. The lineage comparator instead requires the same exact candidate source/target/path/mask identity and matched prior Plate ID; no continued/restarted pair met that criterion. Temporal signatures include contact increments, per-cell qualification and eligibility transitions, and prior-mask zero-increment durations. This seed cannot determine whether temporal differences survive current summaries. The one-second sampling does not establish subsecond absence.

## Reproduction

From the repository root, first verify the refs and source equality recorded in the manifest. Then run from an empty output directory:

```powershell
node scripts/run-ant-material-formation-temporal-observer.js --seed=20261006 --seconds=600 --baseline=ca0aaac4e1994078758d88bf72511f0203a6c70c --production=origin/main --production-commit=d45823d40c9a87c1b333fa9872f3c897ee9ab01b --start-commit=ca0aaac4e1994078758d88bf72511f0203a6c70c --branch=codex/ant-material-formation-responsibility-20261013 --output=docs/ant/evidence/2026-10-13-material-formation-temporal-observer/data
```

Output files:

- `data/temporal-records.jsonl.gz` — lossless machine-readable typed-array observations.
- `data/analysis-rows.csv` — one row per matched-prior observation with scalar and spatial-transition summaries.
- `data/class-lineage-summary.json` — lineage and spatial profiles, comparison counts, boundary censoring, and decision.
- `data/parity.json` — full per-tick parity evidence and final-world snapshot digest.
- `data/final-world-snapshot.json.gz` — encoded observer-run world at 600 seconds; its digest matches the plain run.
- `data/source-tool-hashes.json` — baseline, production, source, and diagnostic-tool provenance.
- `data/manifest.json` — run context, observer definitions, and reproduction command.
