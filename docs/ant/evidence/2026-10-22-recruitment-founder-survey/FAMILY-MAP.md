# Recruitment-conditioning family map

## Selection and causal boundary

Stage A supports a large continuing effect of the accepted-spawn heading law on live spatial composition in all three 600-second seeds. The 1 Hz baseline availability screen found the previously proposed actual-outflow sample with at least three eligible segments in only 13.3–15.7% of observed frames. This is a sparse snapshot screen, not an all-tick test, but it makes the already-sampled pheromone sectors the selected input for the finite Stage B comparison.

The selected variants are **pheromoneDirect** and **pheromoneSlow**. They change accepted-spawn heading only and keep position draws, count/cadence law, ordinary movement, scalar activation feedback, pheromone deposition, lifecycle, material birth and the material source selector fixed. The second variant adds temporal filtering to the same input. Compare each with both the fixed-north baseline and the matched isotropic heading control: the former tests the total effect against production; the latter tests whether directional state input adds anything beyond removing the north reference.

This is one world-evidence-to-recruitment link, with one temporal-filter comparison. It does not set a destination, target point, desired composition or scene-wide route. No north blend is used, so a nonzero signal may center headings at any angle, including more than 90° from baseline. This is a bounded shadow survey; it does not change production behavior.

## Shared pheromone-sector rule

Use the 16 angular sectors centered on the existing spawn origin `(0.5, 0.72)`, at radii `[0.06, 0.09, 0.12]`. For finite field concentration `c` at a sample point, use the existing bounded transform `b(c)=max(c,0)/(max(c,0)+0.04)`; treat non-finite samples as zero. For sector `j` at angle `φⱼ=2πj/16`, define its weight as the mean of the three transformed samples:

```text
sⱼ = (1/3) Σᵣ b(cⱼᵣ)
q  = Σⱼ sⱼ (cos φⱼ, sin φⱼ) / Σⱼ sⱼ
R  = |q|
φ  = atan2(qᵧ, qₓ)
```

If the total sector weight is zero, or the normalized resultant magnitude is `≤1e−9`, define `q=(0,0)`, `R=0`, and no direction. Otherwise `R` is the directional resultant magnitude in `[0,1]`; it is not scalar pheromone mass or ColonyActivation. ColonyActivation sorts sector weights and averages its largest four, deliberately discarding angular identity. A uniform or balanced opposing sector pattern can therefore leave scalar activation high while its circular directional resultant is zero. This is directional ambiguity, not an absence of pheromone or colony activity.

The shadow helper implements this normalized-resultant degeneracy rule: zero total weight or normalized `R≤1e−9` produces `q=(0,0)`. A low-amplitude but coherent field is interpreted by its normalized direction, subject to that same resultant cutoff.

For each accepted spawn, use the original heading-uniform draw `U` exactly once and apply:

```text
if R ≤ 1e−9:
    θ = wrap(−π + 2πU)                 # exact matched isotropic null
else:
    w = π − (π − 0.3)R                 # heading half-spread
    θ = wrap(φ + (2U − 1)w)            # resultant direction is the center
```

The resultant direction sets the center; its magnitude also sets spread. At `R=1`, half-spread is the production `0.3` radians. As `R` approaches zero, spread approaches π and headings approach isotropic; at the declared degeneracy cutoff, the exact isotropic rule is used. Thus changes in the pheromone vector can change both heading center and concentration. There is no north fallback or north-centered blend.

## pheromoneDirect

At every completed 1/60-second controller tick, calculate `q` from the pheromone field and retain it as the most recent completed-tick evidence. A later spawn uses that q with the rule above. There is no additional temporal state. At initialization no completed world evidence exists, so the first spawn uses the isotropic null. The runner uses completed-tick context for a subsequent tick's possible spawn decision, giving the policy a one-tick observation lag; do not describe it as an instantaneous response to a spawn's own or partially completed tick.

The strongest countercase is endogenous founder reinforcement: an early chance direction can establish a chemical route that recruits then continue to reinforce. These fresh conditioned runs begin isotropically, so they do not contain an imposed fixed-north first founder. Alignment with an early route is not independently emerging destination selection or evidence of repeated regime change. A zero or near-zero resultant falls back to isotropic even when scalar ColonyActivation remains high. Record directional resultant, angle, scalar activation, spawn heading/timing, and continuous colony descriptors so those cases stay distinguishable.

## pheromoneSlow

Filter the same q every fixed tick with a two-component shared vector initialized to zero:

```text
α = 1 − exp(−dt / 45 s)
g ← (1 − α)g + αq
Rₛ = |g|
φₛ = atan2(gᵧ, gₓ)
```

At spawn, apply the identical heading rule using `Rₛ,φₛ`; if `Rₛ≤1e−9`, use exact isotropic. An empty or directionally ambiguous tick supplies q=`(0,0)`, so g decays instead of resetting immediately. With `g=0` at initialization, the first spawn is isotropic. Use the same completed-tick / one-tick observation timing as direct.

The 45-second constant is borrowed from the existing scalar ColonyActivation response only as a predeclared comparison value; it has no biological validation and is not a production parameter recommendation. Filtering changes vector magnitude as well as its direction over time. When direction changes, or evidence disappears, `|g|` may be lower than `|q|`; because magnitude also controls heading spread, any weaker directional concentration cannot be attributed to direction persistence alone. Report both the center direction and resultant magnitude/spread at spawn. Slow memory may also preserve an obsolete founder route after current evidence changes.

## Deferred alternative: actual local outflow

The direct-flow/slow-flow pair remains unexecuted and is not in Stage B. Its proposed input is realized outward displacement segments `{from,to}` in the `0.018 < r ≤ 0.085` neighborhood, with speed at least `0.008` world units/s, positive radial displacement, and at least `N=3` eligible ant-segments before direction is defined. These radii, speed and count are engineering cutoffs, not biological thresholds. Under the declared N≥3 gate, invalid or near-zero resultant would be isotropic; the slow vector would decay on invalid ticks. This would be a different input from pheromone occupancy, which records where ants deposited material and not signed outgoing-versus-returning travel.

The availability screen used 1 Hz snapshots of post-collision `vx/vy` and an approximate last-tick segment midpoint. It found N≥3 in 94/600, 80/600 and 81/600 frames across the three seeds. It did not inspect all 60 Hz tick segments and does not estimate availability of the proposed policy q. Do not treat those percentages as all-tick support, call `vx/vy` actual displacement, or relax N after seeing the screen. The family remains a possible later alternative if a separately justified all-tick measurement shows the sparse-snapshot result misrepresents support.

## Other mechanisms kept separate

- **Congestion:** `LocalOccupancy` provides pairwise body separation and headway control, not an aggregate nest-egress census. Adding it would mix a second input with pheromone conditioning and is excluded here.
- **Whole-scene distribution / centroid feedback:** excluded because converting global composition into a spawn heading could create a hidden composition objective or prescribed route, contrary to the future world-model contract (`docs/ant/world-model.md:440-449`).
- **Spawn position or moving ports:** a separate causal axis. Stage A changed headings while retaining the position disk. The fixed origin and small jitter make heading the better-supported proximal directional mechanism, but this survey does not estimate a position intervention. Keep positions fixed in Stage B.
- **Material formation:** `TrailPlateBirth` separately uses the fixed origin and source-to-boundary support. Live-route changes may be retained or compressed by that unchanged selector and append-only history. Inspect material only after a meaningful live movement difference; do not alter selector, history or sonic behavior here.

## Comparison and interpretation

The finite Stage B matrix is the two selected variants for seeds `20261005`, `20261006`, and `20261007` at 600 seconds, followed by baseline, isotropic, pheromoneDirect and pheromoneSlow for the preselected seed `20261005` at 1,800 seconds. The long run is a persistence counterexample screen, not multi-seed or hours-long validation. Keep Stage A static controls as the heading-only reference. Compare continuous heading/resultant, angular occupancy, nest-relative centroid and covariance, dispersion, pheromone anisotropy, population, exits, spawn timing/RNG and any downstream material envelope; do not create a mode count or choose an attractive interval after results.

If direct and slow both match isotropic, the selected evidence family has not shown added directional recruitment value. If slow differs from direct, report that difference as coupled changes in vector persistence, magnitude and heading spread. If either remains aligned north, report possible founder-route reinforcement. If live routes differ but material remains within the same envelope, that is downstream evidence about selector/history compression, not grounds for changing `TrailPlateBirth` in this pass. No result establishes social roles, biological colony organization, or goal-directed behavior.
