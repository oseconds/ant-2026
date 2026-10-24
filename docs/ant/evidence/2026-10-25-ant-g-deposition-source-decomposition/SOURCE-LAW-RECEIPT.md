# Production deposition source-law receipt

## Pinned implementation

The current `AntController` source defines:

```text
baselineMultiplier      = 0.5 × (0.75 + 0.25 × E)
reinforcementMultiplier = reinforcementGain × A²
depositionMultiplier   = baselineMultiplier + reinforcementMultiplier
amountPerUnitDistance  = 4.5 × depositionMultiplier
```

For a movement chunk with actual travelled distance `d`, this pass records:

```text
baselineDose      = d × 4.5 × baselineMultiplier
reinforcementDose = d × 4.5 × reinforcementMultiplier
totalDose         = baselineDose + reinforcementDose
```

The source values are `DEPOSITION_BASELINE=0.5`, `DEPOSITION_ADHERENCE_EXPONENT=2`, default `reinforcementGain=5`, and default `amountPerUnitDistance=4.5`. The default field also pins `mode=dab`, half-life `15 s`, radius `0.0045`, and cap `8`.

## Observation boundary

- `E` is `localTrails[index].strength`, sampled in the current tick before `updateIntention()`.
- `updateIntention()` updates `agent.trailAdherence`; `A` is that updated value when `movement.depositionMultiplier` is formed.
- `d` is measured after displacement constraints/collision handling, using the observed in-domain segment end where the ant exits.
- `AntController.tick()` passes `d` and `4.5 × depositionMultiplier` to `GasterDeposition.advance()`.
- In dab mode, `GasterDeposition` accrues dose by movement chunk and may emit the accumulated amount later. The observer attributes source terms to the chunks that accrued them, including pending carry at the 600 s boundary; it does not assign the later dab to the later tick's `E/A`.
- The observer wrapper calls each original method once and reads the already-computed inputs. It performs no new field read and consumes no RNG.

## Candidate G accounting

`S=3969/361=10.994459833795014` is applied to G's emitted field requests. The report preserves `G_scaled` and `G_normalized=G_scaled/S` on the same G trajectory. Normalization is an accounting view, not a rerun or counterfactual. Writer accepted dose, boundary rejection, saturation loss, pending dab carry, and accrued chunk dose are separate quantities in the data.

## Source provenance

The source hashes below were checked against the fetched research baseline and match the parent movement-shadow evidence:

| File | SHA-256 |
| --- | --- |
| `src/lib/agents/ant/AntController.js` | `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04` |
| `src/lib/agents/ant/GasterDeposition.js` | `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41` |
| `src/lib/agents/ant/PheromoneField.js` | `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd` |
| `src/lib/agents/ant/AntAgent.js` | `ed72c33fb26f269c77853b7aa98da9e2b8a07f196bbea114583dedcd52110411` |

This receipt describes implemented source semantics. The dose decomposition is a mathematical accounting of each run's realized chunks; because C/F/G trajectories differ after feedback diverges, it is not an independent causal mediation estimate.
