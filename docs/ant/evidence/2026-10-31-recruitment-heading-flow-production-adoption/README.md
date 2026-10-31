# Outgoing-flow recruitment heading — production adoption

## Decision

**ADOPTED for production on 2026-10-31, pending merge of this branch.**

The author reviewed the matched isotropic-versus-outgoing-flow visual comparison after the registered research classification **FLOW DISTINCT / WORTH ARTIST REVIEW** and approved the outgoing-flow candidate for production.

Research authority:

- branch `codex/ant-recruitment-heading-flow-vs-isotropic-20261031`
- research commit `7d7f0d0928cdda2fa9dee0a5e73c8dc338e1eabb`
- full report: [flow vs isotropic](../2026-10-31-recruitment-heading-flow-vs-isotropic/REPORT.md)
- matched author-viewed sheet: [all seeds / all times](../2026-10-31-recruitment-heading-flow-vs-isotropic/visual/all-seeds-time-comparison.png)

The production implementation preserves the registered candidate law rather than introducing a new tuned version.

## Adopted law

The old fixed north-biased recruitment heading:

```text
-π/2 ± 0.3 rad
```

is removed.

Spawn position, spawn disk, cadence, placement attempts, clearance, retry timing, population activation/recruitment and all living-ant steering laws remain unchanged.

At every successfully accepted spawn, the existing heading uniform draw `U` is consumed exactly once.

### Isotropic fallback

If no qualifying completed outgoing flow exists:

```text
theta = -π + 2πU
```

This includes the initialization spawn.

### Endogenous outgoing-flow condition

Read only the previous completed simulation tick's realized post-collision displacement for ants still alive at recruitment time.

One segment per ant is eligible when:

```text
0.018 < midpoint radius from SPAWN_CENTER <= 0.085
realized speed >= 0.008 world units / s
outward radial dot displacement > 0
```

Require at least three eligible ants.

For their equal-weight mean unit direction:

```text
q = mean(unit realized segment direction)
R = |q|
phi = arg(q)
```

If `N < 3` or `R <= 1e-9`, use isotropic fallback.

Otherwise:

```text
w = π - (π - 0.3)R
theta = wrap(phi + (2U - 1)w)
```

No pheromone direction, material direction, global centroid, north reference, smoothing state, congestion term or extra RNG draw is added.

## Evidence basis

Across seeds `20261005/06/07`, 600 s at 60 Hz with current production material/A/D/G laws and Audio Off:

- outgoing-flow heading was directly used on 20.9%, 22.9% and 18.9% of accepted spawns;
- direct use occurred in all ten fixed 60 s windows in all three seeds;
- median active-event `R` was 0.415–0.462 and median applied half-spread `w` was 1.775–1.962 rad;
- 1.0 s realized displacement along birth `q` was positive for 84.0%, 78.0% and 81.6% of directly conditioned recruits;
- angular and 8×8 spatial occupancy differed from matched isotropic in all three paired seeds;
- run-wide q directions were not concentrated on one common fixed direction and the 60 s window directions changed through time;
- no measured nonfinite, domain or sampled-overlap violation occurred;
- no capacity-suppressed spawn call occurred and all retry queues were clear by 600 s.

The author then reviewed the matched visual sheet and accepted the outgoing-flow presentation for production.

## Open cost

Treatment produced more entrance placement pressure than isotropic in all three seeds:

- 20261005 clearance rejects 985 → 1,214; blocked placement calls 10 → 27
- 20261006 clearance rejects 976 → 1,195; blocked calls 17 → 24
- 20261007 clearance rejects 799 → 834; blocked calls 9 → 11

Accepted/retired totals remained close and retries recovered within the run. This increase is retained as an explicit production observation, not erased by tuning.

The evidence is limited to three seeds and 600 s. It does not establish behavior beyond 600 s, biological recruitment, entrance-position optimality or a general theorem against directional lock-in.

## Boundary

This adoption changes recruitment **initial heading only**.

It does not change:

- spawn center `(0.5, 0.72)` or radius `0.018`;
- recruitment cadence / clearance / retry policy;
- pheromone / ColonyActivation;
- living-ant intention or steering;
- material feedback speed/A/D laws;
- TrailPlateBirth or material formation;
- renderer or audio;
- Chemical Residence.

The fixed spawn-position responsibility remains causally untested.

The current visible radial/starburst material tendency is therefore not assigned to this heading rule; the unchanged source-connected TrailPlateBirth selector remains a separate later formation question.

## Next boundary

With recruitment heading closed, the next bounded material-feedback pass may return to **Chemical Residence** on top of the then-current production system.

No Residence adoption is implied here.
