# Accepted-spawn outgoing-flow availability — locked protocol

This protocol records the user-authored screen before interpreting its result. Thresholds and signal definition stayed fixed through execution.

## Authority and preserved world

- Production authority: origin/main at 301f0740c9fe2e0697e31a716f7226cb2112ede7.
- Spawn center (0.5, 0.72), position radius 0.018, north heading center −π/2, heading half-spread 0.3 rad.
- Preserve accepted-spawn cadence, 12 placement attempts, 0.004 clearance, movement, pheromone, recruitment, Plate birth, material, audio state, and renderer.
- Current material production has the retained-material 10% desired-speed resistance, A turn-rate ceiling, and D same-flow headway.
- Pheromone renderer default Off is presentation only and does not change this simulation.
- Seeds 20261005, 20261006, 20261007; fixed 1/60 s ticks; 600 model seconds; Audio Off. No candidate world.

## Observer and boundary

At each successful placement, sample after production clearance succeeds and immediately before the existing heading random draw. Initial accepted spawn is recorded with no completed movement tick and is unavailable.

For each ant live at that boundary, use one segment from tick-entry position to its actual post-collision position after the just-completed tick. Retired ants are no longer live at the boundary. Do not read requested velocity, intent, pheromone, material orientation, global centroid, or future state.

The segment midpoint sets distance r from SPAWN_CENTER. The locked annulus is 0.018 < r ≤ 0.085. Realized speed is segment length divided by 1/60 s and must be ≥ 0.008 world units/s. Radial outward means strictly increasing endpoint radius, equivalently positive dot product between midpoint-relative radius and segment displacement.

Each eligible ant contributes one realized segment unit direction. For N ≥ 3, q is their equal-weight mean, R = |q|, and phi = arg(q). N < 3 or R ≤ 1e−9 is unavailable. For diagnostics only, w = π − (π − 0.3)R. No heading is changed.

## Opportunity accounting

- Initial spawn call is separate from timed spawn opportunities.
- A scheduled opportunity is a due spawnNextAnt call. Retry calls are a separately counted subset.
- A placement attempt is one candidate position drawn and clearance-checked.
- A successful accepted spawn is the denominator for availability.
- A blocked placement call exhausts 12 candidates and schedules a 120 ms retry. Record placement attempts, rejected positions, blocked calls, retries, and retry recoveries separately.
- Temporal windows are fixed 60 s intervals from 0–60 through 540–600. The final window includes a boundary event at 600 s.

## Authored GO / STOP screen

GO only if every seed has at least 10% available accepted spawns and available events in at least 8 of the 10 fixed windows. These are screening criteria, not biological constants. If any seed fails either condition, STOP this family without changing thresholds or relaxing the signal definition.

Passing only authorizes a separate comparison: isotropic accepted-spawn heading versus outgoing-flow q when available, isotropic fallback otherwise. Position, cadence, population, movement, and material laws remain fixed. This screen does not execute that comparison.
