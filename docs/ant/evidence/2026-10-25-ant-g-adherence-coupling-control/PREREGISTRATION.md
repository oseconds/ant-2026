# Preregistration — G tick-budget-preserving adherence-coupling control

## Frozen question

Does the agent-local coupling `A_i → that ant's own reinforcement deposition` contribute to Candidate G's natural occupancy concentration when the intact-law reinforcement request is preserved in aggregate on every simulation tick?

This is a research-only causal control. It does not test a replacement production law, tune a gain, or claim biological correctness.

## Provenance and frozen baseline

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Parent G-R0 branch/tip: `codex/ant-g-reinforcement-ablation-20261025` / `f1b03e8666f3b920524c458855ff59153156c710`.
- Parent G movement shadow: `codex/ant-316-gaussian-dose-unit-movement-shadow-20261024` / `6c44253f7f1d6bb99653afe791bf257577a94e78`.
- Parent G source decomposition: `codex/ant-g-deposition-source-decomposition-20261025` / `a4bed839b2775e774e075324c176213ccbae6dae`.
- Parent G-R0 evidence: `docs/ant/evidence/2026-10-25-ant-g-reinforcement-ablation/`.
- Production `src/` and canonical `docs/ant/README.md` remain unchanged.

The prior G-R0 ablation removed reinforcement and also reduced total requested dose. It found that cumulative concentration persisted, so intact reinforcement was not necessary; it did not isolate the local A-to-own-secretion coupling from total reinforcement quantity.

## Arms and sole intervention

Primary pair:

- **G:** the exact parent Candidate G configuration and current deposition law.
- **H:** the same state and laws, but the reinforcement budget is redistributed uniformly by actual travel distance across all ants that moved during the current tick.

At each tick, using each moving ant's post-intention adherence `A_i` and actual post-collision travelled distance `d_i`:

```text
B = Σ_i d_i × 4.5 × 5 × A_i²
D = Σ_i d_i
U = B / (4.5 × D), when D > 0 and B > 0; otherwise U = 0
```

For H, each movement chunk receives the unchanged ant-local baseline multiplier `0.5 × (0.75 + 0.25 × E_i)` plus the same tick-wide `U`. Thus H preserves that tick's intact-law reinforcement requested dose `B`, subject only to floating-point accumulation, while an ant's own `A_i` does not determine its reinforcement allocation except through the shared budget `B`.

G and H both retain the G scale `3969/361`, 316×316 production-Gaussian representation, `R=0.0045`, `σ=0.00225`, ordinary bilinear reader, cap 8, decay, all sensing, Hill response, movement, recruitment, gait, collision, SurfaceField, Plate and material rules. No RNG is used to allocate H.

## Tick-order validity gate

Source audit (`AntController.tick`) found the following order:

1. Material snapshot and previous rear positions are captured.
2. Occupancy and field decay run; local trails for all current ants are sampled.
3. Every ant's `updateIntention` runs, including any due wide `senseTrail` calls.
4. Every ant's displacement is computed.
5. Collision constraints are applied; actual travel and rear positions are then resolved in the per-agent commit loop.
6. That loop advances gait, updates `SurfaceField` / contact qualification / material, and emits contact events.
7. After the loop, `TrailPlateBirth.advance` reads pheromone and surface state; `ColonyActivation.advance` later reads the field before recruitment/spawn synchronization.

The research runner will queue only `GasterDeposition.advance` / `retire` calls, preserving their original call order and arguments. Once all actual chunk distances and A/E states for the tick are known, it will compute `U`, execute the queued deposition-accumulator operations in their original order, and apply their emitted field writes before `TrailPlateBirth.advance` and `ColonyActivation.advance`. This keeps same-tick movement sensing, all displacements, material/contact updates, Plate qualification, activation, and recruitment on their existing read/write boundary. The runner's contact subscription records event payloads only and does not inspect or mutate the field.

The runner must stop as `INCONCLUSIVE — MANIPULATION INVALID` if it cannot establish these boundaries, if any same-tick consumer reads the field before the flush point, if physical deposit positions/order change, or if buffered G fails parent trajectory/evidence reproduction. No H outcomes will be interpreted before the G-buffered control passes.

## Natural protocol

- Seeds: `20261005`, `20261006`, `20261007`.
- 600 simulated seconds at 60 Hz; fixed checkpoints 30, 60, 120, 300, 600 s.
- Natural initialization/recruitment, empty field, no warm-up trail, forced route/birth, or manual milestone.
- Audio Off.
- Same seed means matched initial condition only; behavior-dependent trajectories and RNG may diverge after H changes the field.

## Frozen observations

Primary occupancy outcomes, per seed/checkpoint and without a composite score:

- cumulative coverage;
- cumulative top-10% occupancy share;
- corrected recent-30-second coverage and normalized entropy, using the independent 60 Hz observer from the G-R0 pass (not the invalid inherited rolling array).

Movement controls: population, travel, travel per active-ant-second, speed, angular velocity, blocked fraction, exits/retirements, recruitment, and existing finite/speed/turn/collision/population-ceiling invariants.

Source and response observations: baseline/reinforcement/total requested dose, reinforcement per travel, E, A, A², far Hill response, field mass/max/cap/saturation, and uniform `U(t)`. Reuse the existing 40-bin adherence histogram and report `A ≥ 0.75` as a descriptive stratum. For G and H, high-A travel share and high-A reinforcement share use that same frozen cut.

Also retain FOOT_CONTACT, SurfaceField, Plate-birth and material summaries descriptively. They are not primary endpoints.

## Validation and stop rules

Before H interpretation:

1. Verify source/config hashes, G representation and matching initial fingerprints.
2. Run G through the identical buffering path and reproduce the parent G raw timelines, checkpoint maps, source ledgers and summary exactly.
3. Verify observer-on/off tick parity and zero observer RNG calls.
4. For every H tick, verify delivered reinforcement equals the intact-law target `B` within a tolerance derived from the operations and floating-point roundoff; record the maximum residual and bound.
5. Verify baseline law is unchanged, H reinforcement is independent of each ant's own A except through shared `B`, G scale is unchanged, positions and queued operation order are unchanged, and the reinforcement source closes.
6. Require deterministic regeneration and existing state/movement/field invariants.

Any failed manipulation, budget closure, observer parity, parent G reproduction, or deterministic check makes the result `INCONCLUSIVE`; do not compensate or tune.

## Decision rules

- **ADHERENCE-COUPLING CONTRIBUTION SUPPORTED:** valid H consistently shifts G's cumulative concentration pattern across seeds (lower top-10% share and/or broader cumulative/recent coverage), without gross population or locomotion collapse.
- **TOTAL-DOSE / OTHER LOOP DOMINATES:** valid H remains similarly concentrated or is more concentrated despite preserving the tick budget and removing own-A allocation.
- **MIXED:** seed/metric directions conflict, or apparent broadening coincides with major population/locomotion collapse.
- **INCONCLUSIVE:** any validity condition fails.

No post-hoc thresholds, significance tests, gain alternatives, dose-matched arm, or scalar concentration score will be added. Even a positive H result does not establish that `5 × A²` is wrong or that uniform allocation is a suitable production law. A negative result does not show reinforcement is irrelevant. Stop after this G↔H control.
