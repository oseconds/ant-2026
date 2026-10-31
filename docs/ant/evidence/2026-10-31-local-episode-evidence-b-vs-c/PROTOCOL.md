# Protocol — local episode evidence B vs C

## Authority and reuse

The analysis reuses the exact three-seed observer packet from `codex/ant-local-opportunity-competition-audit-20261031@da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`, whose saved observations were produced from `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`. It reads the existing 599 boundaries per seed and saved signal/opportunity chunks. It does not initialize a controller, advance a world, or consume RNG.

## Locked responsibilities

**B — qualified chemical history.** Use the native `TrailPlateBirth.chemicalMemory` values. Production transforms sampled pheromone as `p / (p + .04)` and updates the bounded memory with a 20 s EMA (`tau = 20 s`). Do not replace B with its signed change or alter its time constant.

**C — contact-written compaction.** Use the native normalized `SurfaceField.sample(x,y)` value. `FOOT_CONTACT` writes this field; its native half-life is 1800 s. This is not a force, pressure, stress, or material-density measurement. Do not substitute D or alter the half-life.

Values and signed changes stay in their native channels and units. Comparisons use within-channel ranks and structural outcomes, never a B+C score or a cross-channel normalized amplitude.

## Opportunity, correspondence, and X

The existing opportunity representation is unchanged:

1. Positive local maximum plateaus on edge-bearing F carrier S.
2. Exact-equal plateau values use 8-neighbor connectivity; the lowest row-major coordinate is canonical.
3. `.15` grouping is primary; `.30` remains a tracking/grouping sensitivity.
4. Reciprocal-nearest `.025` correspondence is primary; `.075` is a sensitivity. The registered F-component safeguard and tie handling remain intact.
5. For each center, X is the 8-neighbor component containing that center in `F ∩ EuclideanDisk(center, .15)`.

No center is selected as a winner for a future episode. No criterion uses prior material, activity, or channel mixing.

## Time and input comparisons

Primary tracks use `.15` groups and reciprocal `.025` correspondence. Existing center and changing-X observations retain native B/C levels, signed Δ1/Δ5/Δ20, and their paired recent input: realized travel for B and individual `FOOT_CONTACT` counts for C. Activity totals inside a changing X are kept distinct from center-cell input. Correlations are per-track descriptive Spearman summaries over serial observations; they are not independent replicates or causal estimates.

Rank inertia reports one-analysis, nearest-prior 5 s, and nearest-prior 20 s autocorrelation and absolute rank displacement from raw tracked rows. No substantial-change threshold or persistence cutoff is introduced. Zero recent input is descriptive only and does not make a track eligible or ineligible.

## Objective cases

Six examples were selected from the registered objective categories: longest wholly non-entry B, longest wholly non-entry C, longest wholly entry B, longest wholly entry C, strongest sustained non-entry B, and strongest sustained non-entry C. “Strongest sustained” is the lowest arithmetic mean within-channel rank among non-entry tracks with at least two observations; ties use longer duration, then seed and track ID. This is an example-selection rule only, not a candidate threshold. The panel shows each case’s state/rank/activity time series and three X snapshots aligned with the simultaneous max-D X for visual context.

## Exclusions

No new opportunity definition, materialization threshold, competition, winner rule, B/C fusion, D input, novelty, inhibition, timer, Plate birth, production X, Residence, or production-source change is included. Similarity to existing Plate births and low material overlap are not success criteria.
