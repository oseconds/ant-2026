# Recruitment heading: endogenous outgoing flow vs isotropic

## Registered question

After removing the authored north spawn bias, does actual local outgoing traffic provide a distinct and useful recruitment-heading responsibility beyond isotropic recruitment alone?

## Authority and preserved world

- Production authority: origin/main at 301f0740c9fe2e0697e31a716f7226cb2112ede7.
- Preserve production retained-material desired-speed resistance, A turn-rate ceiling, D same-flow headway, G pheromone, movement, gait, collision, activation/recruitment, TrailPlateBirth and MaterialStratigraphy.
- Spawn center (0.5, 0.72), radius 0.018, cadence, placement attempts, clearance and retry timing stay at production values.
- Pheromone is causal; renderer overlay stays Off. Material stays On.
- Three seeds (20261005, 20261006, 20261007), two arms, fresh controller per arm, 60 Hz, 600 model seconds, Audio Off.

## Heading laws

CONTROL consumes the existing accepted-spawn uniform variate U once and applies:

    theta = -pi + 2*pi*U

TREATMENT measures only the prior completed tick's actual post-collision segments for currently live ants. An eligible segment has midpoint radius 0.018 < r <= 0.085, realized speed at least 0.008, and positive outward radial motion. Use one segment per ant. Require N >= 3, then compute the equal-weight mean of segment unit directions, q, R=|q|, and phi=arg(q).

If N < 3 or R <= 1e-9, apply the exact CONTROL transform with the same U. Otherwise apply:

    w = pi - (pi - 0.3)*R
    theta = wrap(phi + (2*U - 1)*w)

The treatment signal is generated only by that treatment world. No smoothing, pheromone, congestion, centroid, persistence, entrance motion, or parameter relaxation is allowed.

## Boundary and manipulation checks

Measure q after placement clearance succeeds and before calling the existing heading draw. The draw callback forwards the original random value once. Runtime instrumentation must not alter spawn position, retries, cadence, or any other production law. Record RNG state and count around each heading draw, all accepted positions/times, each placement attempt/reject, retries and blocked calls, flow availability, N/R/phi/w, applied heading, and angular error during direct use.

CONTROL retains read-only outgoing-flow diagnostics at accepted-spawn events and at each fixed one-second observation. TREATMENT records the same diagnostics and the fraction of accepted spawns that directly use q.

For treatment recruits directly conditioned by q, record actual displacement projected on the birth q direction at 0.5 s and 1.0 s. Retirement before a horizon is censored at the first observed missing tick; unfinished horizons at 600 s are right-censored.

## Temporal and world measurements

Use 60-second windows from 0–60 through 540–600. Record one-Hz flow support, N, R, circular phi, concentration, and diagnostic/applied w; also report accepted-spawn availability and direct treatment use per window. Keep direction by time so an early self-reinforcing lock is visible.

Record one-second population centroid, covariance/dispersion, south-of-entrance fraction, 16-sector angular occupancy, 8x8 spatial occupancy, velocity polarization, realized travel/speed, population chronology, admissions, retirements, activity, capacity-limited ticks, blocked placements, retry recovery, same-flow ant ticks, FOOT_CONTACT events/legs, pheromone sector geography, Plate/Nodule births, SurfaceField state, material union centroid/coverage, and buried-layer history. Seeds are the replication units; within-run samples are serially dependent. Summarize nominal integer-second observations 300–600 inclusive for direct continuity with the founder survey.

Save matched unchanged AntRenderer views for both arms, all seeds, at 60, 120, 300 and 600 s. Keep viewport, scale, renderer, material visibility, and pheromone-Off presentation identical.

## Decision rubric

Use the four user-authorized categories only:

- FLOW DISTINCT / WORTH ARTIST REVIEW if the treatment's own flow is recurrently used, the intended heading effect is verified, and multiple seeds show a meaningful transport/world distinction from isotropic without clear lock-in, congestion, recruitment failure, or movement collapse. This requests author visual review; it is not an artistic judgment or production adoption.
- TRACKS ISOTROPIC if the law operates technically but its endogenous world remains effectively similar to isotropic at the useful temporal/spatial level.
- LOCK-IN / PATHOLOGICAL if feedback produces a clear self-reinforcing directional attractor, congestion, movement collapse, recruitment problem, or other clear failure. Do not tune to rescue it.
- INCONCLUSIVE if endogenous availability collapses or evidence cannot distinguish the arms.

No numeric outcome threshold is introduced after the availability gate. Directional concentration alone is not scored as better or worse. If flow is not clearly better, recommend a separate isotropic production-adoption review. If flow is distinct, recommend author visual review before any adoption. Chemical Residence stays paused.

## Scope limits

No production change, candidate tuning, pheromone-conditioned heading, north comparison arm, spawn-position change, Residence work, merge, PR, or adoption. The experiment cannot establish biological following, artistic superiority, or the causal responsibility of the fixed entrance position.
