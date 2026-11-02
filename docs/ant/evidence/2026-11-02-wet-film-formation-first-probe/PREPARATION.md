# Preparation and interpretation safeguards

The protocol was committed at `b2803cb` before any interaction campaign. Authority is current main `5bdd516b412d03d78c2511ceb372180941206968`; the prior research branch remains preserved at918764c. Switching to main removes that earlier branch's default-off research layer-count-provider hook; this pass neither uses nor reinstates it.

An independent Luna Max model review checked the PDE, its potential derivative, the convex split, stability of the flat precursor, the lubrication scaling, the contact-zone length, and the null matching rule. It initially read excess amplitude .5 as background and dimensionless slopes as physical angles. These were clarified before results: background is b=.1, and physical slopes include the explicit aspect ratio .01. Its valid resolution concern led to the preregistered lower wetting coefficients W=.5/2 before implementation or interaction results. The model remains mesoscopic and uncalibrated; no claim of microscopic wetting accuracy follows.

Preflight confirms two separate excess-height components at all three declared levels on N32/64/128. The analytic clear gap .04 spans only1.28 coarse cells, so N32 remains a coarse diagnostic, not an independent proof of front resolution. Fine-only W/precursor sensitivities have about5.2 cells per nominal contact scale and are not separately convergence-backed.

Preparation checks repaired harness definitions before interaction output:

- The embedded Python excludes the script directory from its default import path; the runner explicitly adds its own directory.
- The saved capture encodes Audio Off as the string `Off`, not a boolean; extraction now checks the actual schema.
- The flux test uses `delta(cell mass) = B^T integrated_edge_volume` for the declared incidence orientation. The solver sign was already correct.
- The obstacle-absent control omits the same cell-centered obstacle footprint from its initial inscription. This fixes unequal initial excess volume caused by quadrature straddling excluded cells.
- The slope safeguard combines directional face slopes at the same cell. Multiplying the global maximum edge slope by sqrt(2) had combined extrema from different locations and falsely rejected the absent-obstacle fixture. The reported bound remains conservative on the discrete local directional slopes; it is not a continuum asymptotic-error estimate.

The exact input extract contains1,909 contact groups and5,677 individual feet in authored payload time[0,60)s, from the verified compressed capture. The input ledger retains sub-tick times, original event sequence/tick, ant and leg IDs, and coordinates. No force, moisture or deposition volume is recovered from authored strength. Right-edge one-second binning and the0.1pL-per-foot illustrative dose are declared experiment assumptions.

The first test environment was missing pytest. The core tests were converted to standard-library unittest; no dependency was installed. The core and campaign-definition tests pass9/9 before interaction runs. Source/static files remain unchanged from main.
