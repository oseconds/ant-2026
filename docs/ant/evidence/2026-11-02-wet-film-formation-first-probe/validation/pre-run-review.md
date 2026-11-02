# Independent pre-run numerical review

Status: **BLOCKED BEFORE CAMPAIGN** pending the retry-log fix below. No interaction campaign was run in this review.

## Checks passed

- The discrete signs match the registered gradient flow. `K = BᵀB/dx²` is positive; mobility matrix `A` is positive semidefinite; the residual is `h_new - h_old + dt A p_new = 0`. The pressure split uses the convex repulsive term and surface term implicitly, and the concave attractive term explicitly. The Newton Jacobian has the corresponding positive `6 W b⁵/h⁷` derivative. See `scripts/ant_wet_film_core.py:105-137`.
- Edge volumes use the same orientation as `B`: `-dt mob (p_j-p_i)`, so `Δ(h dx²) = Bᵀ edge_volume`. The dissipation `dx² pᵀ A p` and energy-defect sign agree with the registered inequality. See `scripts/ant_wet_film_core.py:139-150`. Focused tests include a direct cell-mass reconstruction check.
- The pinned input capture hash and Git blob match the protocol. Independent re-extraction from the pinned commit matched all **5,677** packaged foot rows exactly. Capture metadata says payload simulation time is retained separately; the extractor uses that time and filters `[0,60)`.
- Time binning applies each valid foot dose once at `floor(t)+1` seconds. Bins 1–60 become `0.0001`–`0.006` nondimensional time using the registered `T0=10,000 s`. `run_case` applies a time-keyed source once before the state row/snapshot at that time; retries stay inside the same step loop, so they do not reapply the source. All arms use the same schedule and rasterized dose fields. See `scripts/ant-wet-film-formation.py:112-125, 185-195, 211-247`.
- The `t=60 s` snapshot is post-dose: the final `[59,60)` bin is deposited at its registered right edge, then the source-free evolution proceeds to `120 s`. Reports should describe persistence from this post-dose boundary state.

## Blocking issue

The protocol requires every failed step retry to be logged. The runner increments only `retries` and later stores the aggregate `numerical_retry_count`; it discards each failure's time, attempted `dt`, and exception reason. The halving loop itself is correctly scoped around one unchanged state, but if any retry occurs the required numerical audit trail is unavailable. Add per-retry records before starting the campaign. Relevant code: `scripts/ant-wet-film-formation.py:211-245, 257-263`.

## CSV interpretation to preserve in the report

Each row's field metrics and cumulative transport/dissipation values describe the state at `time`, after any source event at that time and through preceding accepted steps. For thin-film rows, `step`, Newton/residual, energy-defect, and `dt_dissipation` describe the outgoing accepted step. The final row has no outgoing-step fields. State this convention when interpreting the CSV; no off-by-one source application was found.

No morphology, persistence, physical calibration, or acoustic conclusion is available before the campaign.
