# 2026-10-31 — Recruitment heading: endogenous flow vs isotropic

**Question:** After removing the authored north heading, does the treatment world's own completed outgoing traffic provide a distinct heading responsibility beyond isotropic recruitment?

**Baseline:** `origin/main@301f0740c9fe2e0697e31a716f7226cb2112ede7`, including retained-material 10% desired-speed resistance, A material-conditioned turn ceiling, D material-conditioned same-flow headway, G pheromone, and existing recruitment/material laws. The completed accepted-spawn availability gate on `codex/ant-recruitment-outgoing-flow-availability-20261031@717c7ba2be8abf24c23d46ac3db7beb2534ef1c4` authorized one heading comparison only.

**Pass:** On `codex/ant-recruitment-heading-flow-vs-isotropic-20261031`, ran isotropic CONTROL against endogenous outgoing-flow TREATMENT with fresh controllers for seeds `20261005`, `20261006`, and `20261007`, 60 Hz, 600 s, Audio Off. Position, cadence, placement, movement, A/D, pheromone, recruitment, material, and birth laws remained pinned. Each treatment began isotropically; q used only its own previous completed tick.

**Measurement:** Treatment directly used q for 181/868, 200/875, and 158/834 accepted spawns. Direct use recurred in all ten 60 s windows per seed. Median `R` was 0.415–0.462 and median applied `w` was 1.775–1.962 rad. At 1 s, positive displacement along birth q occurred in 78.0–84.0% of uncensored conditioned recruits. Angular and 8×8 spatial occupancy differed from CONTROL in all three paired seeds; global travel and polarization changes were small or mixed. q direction varied over time, with low run-wide circular concentration. Clearance rejects rose under treatment, but no retry remained pending and measured invariant failures were zero.

**Decision:** **FLOW DISTINCT / WORTH ARTIST REVIEW.** This supports matched author visual review only; it does not establish artistic superiority, biology, long-term stability, or production adoption. The fixed spawn-position question remains untested. No threshold change, longer extension, production edit, PR, merge, or Chemical Residence work occurred. Chemical Residence remains paused until the heading question is closed.

**Evidence:** [`REPORT.md`](../evidence/2026-10-31-recruitment-heading-flow-vs-isotropic/REPORT.md), [`VALIDATION.md`](../evidence/2026-10-31-recruitment-heading-flow-vs-isotropic/VALIDATION.md), six raw run JSONs, 60 temporal windows, matched visual sheets, and SHA-256 manifest in the evidence package.
