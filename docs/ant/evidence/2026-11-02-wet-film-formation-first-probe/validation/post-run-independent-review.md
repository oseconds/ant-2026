# Independent post-run numerical and claim review

Review date: **2026-11-02**

Scope: 25-run wet-film evidence package, current [REPORT.md](../REPORT.md), and current research solver. Review ran from the primary research branch without relying on the prior pre-run review's conclusions; protocol definitions were treated as the frozen contract.

## Acceptance and bounded classifications

**Overall: MIXED.** The stated finite-grid liquid model executes with the recorded conservation and energy checks, and the separated-pair result is distinguishable from both registered nulls through the fixed source-free horizon at the lower two observer levels. The supplied single-patch case is a counterexample to a suite-wide persistence claim: the film has no region above any of the three levels by its endpoint. The ANT-contact run is compatible with the assumed liquid model only; it does not establish that ANT has this liquid, water budget, or formation law.

| Claim | Verdict | Limit |
|---|---|---|
| Declared thin-film equation and source ledger executed as recorded | **SUPPORTED** | Supports the tested discrete solver and records, not calibrated physical accuracy or a proved continuum limit. |
| Different persistent morphology in the controlled separated pair | **SUPPORTED, bounded** | At `N=64`, levels `h-b=.05,.125` remain one connected excess-height region through `t*=.02`; the `.25` region disappears. Counts are descriptive threshold observers. |
| Every local deposit produces a persistent raised region | **NEGATIVE for the prescribed supply-off patch** | The four-pulse case has zero regions above all three levels at `t*=.02`; total excess liquid remains. |
| Morphology under recorded ANT contacts | **MIXED, conditional shadow only** | Real contact coordinates/times drive assumed per-foot liquid doses. Threshold outcomes differ by observer and this is one seed, one dose/radius choice, and one grid. |
| Dry disconnected bodies make contact and fuse; a new acoustic body forms | **INCONCLUSIVE / not represented or tested** | All active cells begin with precursor liquid; there is no solidification, bond, elasticity, sound solver, or listening measurement. |

The parent report's principal conclusion is supported with these boundaries. Its strongest counterexample is the four-pulse supply-off patch, not a numerical failure.

## Independent record and arithmetic

I read [PROTOCOL.md](../PROTOCOL.md), [PREPARATION.md](../PREPARATION.md), the current solver in `scripts/ant-wet-film-formation.py` and `scripts/ant_wet_film_core.py`, and the raw run records. I independently re-extracted the input from its pinned Git object and recomputed quantities from CSV/NPZ data rather than importing the analysis functions.

The run matrix contains **25/25** records: 15 primary arms across pair, cross, obstacle, open-obstacle, and supply-off; six pair resolution/parameter sensitivities; and four ANT-shadow arms. The saved [budget receipt](budgets.json) says PASS for all 25. My direct checks found:

- Maximum absolute recorded mass residual: **3.44e-15** nondimensional volume. Reconstructing mass from every stored snapshot agrees with its CSV state row within **2.78e-17**; recomputing `expected_mass` from each pre-source NPZ initial field plus cumulative supplied volume leaves at most **3.44e-15** residual.
- Independently recomputed discrete energy for every saved snapshot agrees with the CSV energy within **4.44e-15**. I used `E = 1/2 sum_faces((h_j-h_i)^2) + dx^2 sum(Phi(h))`, omitting faces incident to excluded cells, which is the stored no-flux graph energy.
- All accepted histories report **zero Newton retries**; the largest recorded film energy-inequality defect is **3.31e-31** (roundoff scale). Minimum active height over the full campaign is **0.0430177 > 0**. Maximum recorded physical directional-slope bound is **0.16330**, below the protocol's 0.2 safeguard; that is not a continuum asymptotic-error estimate.
- Re-labeling every stored NPZ snapshot at all three fixed levels with four-neighbor connectivity reproduced every stored component count (**zero mismatches**). This checks snapshot rows; intermediate event timing still comes from the per-step CSV histories.
- For film histories, each row's outgoing accepted `step` equals the next CSV state's time difference within **2.86e-18**; terminal rows have no outgoing step. State metrics are post-source at that row's time. In the `supply_off` case the first dose is applied at `t*=0` before the first state row, so the summary's `initial` record is post-dose; use the saved pre-source `initial` array for a pre-dose comparison and do not add that dose twice.

The potential and its derivative agree: `Phi'(h)=W(b^2/h^3-b^5/h^6)` and `Phi''(b)=3W/b^2>0`. With `p=delta E/delta h`, the source-free continuum form is `partial_t h = div(h^3 grad p)`, giving `dE/dt=-integral h^3 |grad p|^2 dA`. The code's edge orientation, convex/concave split, positive old-state mobility, mass sign, and discrete energy-defect sign are consistent with that law. The standard lubrication/precursor framework is supported by the primary thin-film literature; the cited sessile-drop paper explicitly treats the precursor as a fictitious regularization, and the cited convex-splitting analysis is for a different potential/model, not a proof of this implementation ([Sellier & Trelluyer 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2717581/), [Thiele 2010](https://arxiv.org/abs/1010.2928), [Zhang et al. 2020](https://arxiv.org/abs/2012.11802)).

## Source provenance and dose accounting

The raw pinned capture at commit `918764c2d4924eb89fd6874122edc30b73d1499c` has SHA-256 `4871d4d24b4f235b9626f1e95baa3b79f81ec1c4ad800fc57187202fbfcb1003`. I recomputed the `[0,60)` payload-time extraction and matched the packaged ledger row-for-row: **1,909** event sequence IDs and **5,677** individual feet, seed `20261005`, CONTROL, Audio Off. The packaged gzip ledger's own SHA-256 is `44d079f09ae6828e46a8eebc2476c2864de1823ae1f38935a4081f7275841abe`.

Each foot contributes the declared `1e-5` nondimensional volume, so `5,677 * 1e-5 = .05677`; all four ANT arms record that same total at `t*=.006` and final mass `.15677`. The 60 one-second bins end at `.006`; the last dose is included in that boundary state and no source follows through `.012`. The `.1 pL/foot`, compact radius `.04`, right-edge placement, and illustrative dimensional clock remain assumptions; the capture supplies positions and times, not water content, pressure, force, or material properties.

## Morphology, nulls, and refinement

For the primary pair at `N=64`, I recomputed initial/final film mass **.14197863993091125** and discrete energy **4.044440014134388 → -.053153196961533** at `t*=.02`; final min/max are **.09316910/.26570879**. Final component counts for levels `.05/.125/.25` are **1/1/0** for film, **2/2/2** for frozen, and **0/0/0** for heat. The low/middle first-one times from the raw per-step histories are `.0001/.0002`; the one-component tails are `.0199/.0198`. The high-level contour reaches one transiently but is absent at the endpoint. Thus “persistence” means only the observed threshold tail through this finite horizon, not equilibrium, rigidity, or fusion.

Independent normalized endpoint excess-height L1 calculations reproduce the stored pair mesh values **.00204311** (`N32→64`) and **.000655265** (`N64→128`), and time-step values **.00308934** (`1e-4→5e-5`) and **.00230970** (`5e-5→2.5e-5`), each divided by initial excess mass. Low/middle final counts remain stable in the tested ladder, but early one-component times move with `dt` (`.0002/.00015/.0001` at level `.125`). `N32` has only 1.28 cells across the initial clear gap. The mesh L1 trend is an empirical field comparison, not proof of continuum convergence or converged event time. Cross, obstacle, open-obstacle, and supply-off geometries have no spatial ladder; each fine-only `W`/`b` sensitivity is a single run.

The strongest negative morphology result is the supply-off patch: after four doses totaling `.004`, the `t*=.02` film has **zero** components at `.05/.125/.25` (peak `.13727239`), while frozen retains one at each level and heat has none. The film has not lost mass; the excess has spread below these observer levels. This supports the report's overall MIXED classification and prevents generalizing the pair result to every inscription.

The ANT shadow is threshold-dependent at `t*=.012`: film counts **1/1/0**, heat **1/0/0**, and frozen **5/2/1**. The low-level film/heat count agrees, the middle-level count differs, and the high-level count is zero for both evolving arms. The half-step film result differs by **.00091944** L1 normalized by the total `.05677` source budget and by **.00016998** in peak height. This is a reproducible conditional response, not a natural ANT material finding.

The fixed heat coefficient is `D=16.488801738871686`, matched before results at one declared reference thickness/wavelength (`h_ref=.35`, `k_ref=pi/(2*.08)`). It is a one-mode smoothing Null, not a match to the nonlinear film spectrum. The reported N128 sensitivity distances, **9.12%** for `W=2` and **25.39%** for `b=.05`, confirm that the wetting/precursor choices materially affect the endpoint; each is one fine-grid comparison, not a sweep.

## Claim review and remaining gate

The current [REPORT.md](../REPORT.md) arithmetic checks against the raw records, including source total, pair endpoint values, mesh/time L1 values, ANT timestep delta, and precursor-deficit integral. One wording should stay explicit: the `.000856846` deficit is a volume integral; **27.539%** is the separate domain-area fraction of cells with `h<b`. The report now distinguishes these quantities. Its heat-null opener also correctly limits spectral matching to one reference thickness/wavelength. No other scientific or arithmetic blocker was found.

The [derived-determinism receipt](derived-determinism.json) shows byte identity for the regenerated comparison JSON, plot receipt, and seven atlas PNGs; [deterministic-rerun.json](deterministic-rerun.json) covers the primary pair and ANT film case outputs. I did not rerun the focused test suite or campaign. At this review cutoff, `manifest.json` and `SHA256SUMS` are intentionally pending so the final manifest can include this report without a self-hash cycle. Treat package integrity as the one remaining delivery gate; it is not a scientific blocker.

## Limits

No image-by-image artistic review, physical calibration, laboratory comparison, new ANT run, acoustic simulation, render, or listening study was performed. All ANT-dose results remain conditional on the prescribed volume, radius, binning, and precursor assumptions; numerical stability does not establish physical interpretation or a real-world convergence claim.
