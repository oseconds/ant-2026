# W1: one episodic history-transition family

This specification was fixed before the first natural W1 mechanism analysis. It is a detached modeling experiment, not a claim about biological construction or a production adoption decision. The frozen natural runs are input; no ANT simulation is rerun.

## Input and formation rule

Use the existing 96 × 96 grid and the 599 recorded field observations through approximately 599.25 s. Each packed cell carries three original decision predicates: persistent chemical memory ≥ 0.30; conditional mechanical support ≥ 0.015; and at least two distinct FOOT_CONTACT timestamps accumulated through that observation. Their conjunction is q. Chemical evidence alone or one transient contact cannot qualify q. The contact predicate is cumulative, not a claim of two recent contacts.

Initialize two scalar filters per cell to zero. For each observed interval dt, use α = 1 − exp(−dt/20) and β = 1 − exp(−dt/90). Update F = F + α(q − F) and S = S + β(q − S). A cell is active when F − S > α − β, strictly. The first observation has dt = 0. There is no additional current-q gate. The threshold is the contrast produced by one qualified observation from rest; it is not fitted to natural output.

The 20 s recent timescale and episode persistence reuse existing chemical-memory/qualification concepts. The 90 s established timescale reuses the corridor rebirth refractory interval as an explicit modeling proxy. It is not the SurfaceField decay timescale or a biological parameter. At constant q, this difference decays, so high absolute history does not sustain formation indefinitely. Repeated transitions can still re-inscribe previous material.

## Episodes

Find 8-connected active components at each observation. Link adjacent observations only through identical occupied cells. There is no dilation, target, shortest path, source connectivity, boundary requirement, tree construction, area filter, or morphology template. A split retains shared episode history. A merge preserves all parent geometry and earliest admissions; the smallest ID names the combined lineage, without selecting winning geometry.

An episode closes at the first observation with no active descendant. Freeze its exact active-cell union only when last-active time minus birth time is at least 20 s. Record shorter closed episodes as discarded. Episodes still active at the archive horizon are right-censored and remain unfrozen. Do not force closure or treat their area as successfully frozen material. Measure pending geometry separately, including possible giant open lineages.

## Exactly two primary character coordinates

For each frozen episode, consolidation is the mean of per-cell joint chemical/mechanical qualification duty fractions. Each cell contributes observations from its first admission through episode closure, inclusive. Joint qualification is the original chemical and mechanical predicates, without requiring contact-count qualification again. Each cell is normalized before averaging; area and raw lifetime are not the coordinate. This sampled duty fraction may cluster near one. Report that distribution rather than rescaling it.

Directional order is the magnitude of the travel-weighted mean nematic orientation: hypot(Σw cos(2θ), Σw sin(2θ)) / Σw. Use only actual archived foot positions in episode cells, after each cell's first admission through closure. θ and w come from the latest completed consecutive 60 Hz trajectory segment for that ant; w is segment travel distance. Deduplicate the same ant and segment-end timestamp across multiple feet. Reversed travel has the same nematic orientation. Do not substitute body heading, bridge ant lifetimes, interpolate from future positions, or assign orientation to stationary segments. Report the at-most-one-segment admission-boundary exposure separately.

Both coordinates are finite and bounded in [0, 1]. A frozen episode with no valid positive directional travel raises an explicit data-gap error. Stop that analysis rather than fabricate a second axis. No character-to-sound, movement, vitality, or material-condition mapping belongs in W1.

## Fixed measurement semantics

Reuse the prior local-accretion topology code byte-for-byte. Foreground uses 8-connectivity; primary holes are bounded 4-connected empty regions. Hole areas accompany counts. Skeleton endpoints/junctions and graph cycle rank are analysis proxies only; skeletonization never determines material geometry. The source annulus is used solely to describe isolation, never to form material.

Report all component and hole area distributions. A descriptive substantial-area reference is 18 cells: ceil(π × (0.025 × 95)²), one existing contact-support-radius disk on this grid. This is a review scale, not a formation or acceptance threshold. A one-cell pore is never presented as a materially substantial loop. Visually inspect actual geometry as a separate artistic observation.

At 120 s, 300 s and the last field observation, compare frozen W1 union, pending lineage union, production union, and previous local-accretion union. Recent traffic uses actual feet in the trailing 20 s; mismatch is one minus Jaccard overlap. Report closure-time novelty against all earlier frozen episodes; simultaneous closures use ascending episode ID. Late-time formation is measured over 480 s through the final observation, with pending growth reported separately.

No parameter sweep, output-distribution adjustment, second mechanism family, or rescue rule is authorized in this pass. Near-zero freezing, a giant open lineage, dense late material, speckle, and redundant re-inscription are valid negative results.
