# Material-conditioned chemical residence: locality falsification

## Decision

**LOCALITY SUPPORTED — for the frozen native sensor/readout only.** Matching the residence field's node sum with one scalar multiple of the native field did not erase all of its recipient-level difference. The remainder appears where the local sensor has more headroom and grows with the frozen material-support context. The equal-node-sum control was feasible without any cap clipping.

This rejects the narrow claim that **bulk retained amount alone explains the full matched-state readout difference**. It does not show that ants would choose different routes, that residence is beneficial, that the 15–30 s rule is right, or that production should adopt it. Most local-sensor reads were already near the top of the native strength response, so the typical saturated read changed little between the two fields.

## Authority and frozen provenance

- Production authority: `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research base: `codex/ant-material-feedback-space-20261030@3b61f995c8e514e848b1d4133812fa855db92c04`.
- Inputs are the production-control frozen request stream, actual Plate birth masks/history and saved ant position/heading rows already used by the residence probe. No treatment history, new natural simulation or new seed was added.
- The frozen files contain 100,882 source requests, 36 actual birth masks, 600 post-tick one-second position snapshots and 10,880 recipient rows. The three fields were evaluated at those same 600 times and recipient poses.
- Exact input SHA-256: paired input `4bad89763aa226cc113413a30002f35d949caefed0e6e6fde2e1ac6026194a4c`; control source requests `c465157d4ed1f16305b750533db518b72c2789848ff43ec99a75e8305322fb60`; saved raw poses `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`; source pins `b4a34b88b95b52edc5622fb09b851ff27dbf029af27deee78461de8bf2d904a4`.
- The previously validated residence replay is reused as an exact A/B parity reference: gzip SHA-256 `313bd77d45821b9761a40e63fc84c7f30633f0eff546838e4ac39d6fa7e58f73`.

The canonical production `PheromoneField.js` and `AntController.js` hashes match the frozen source pins (`b68e98…f9837` and `b5a634…e9f4`). The control field matches all five saved projected checkpoint maps, sums and reconstructed integrals. The new replay also matches the prior probe's native and residence local profiles exactly for all 10,880 rows after JSON's normal `-0` to `0` serialization. This validates the sparse read-only decay path used to reconstruct the saved chemical fields.

## Implementation facts and measurement definitions

`PheromoneField` stores a capped Float32 coefficient at each 316×316 node, with `maxValue=8`. Its `nodeSum` is the sum of those stored coefficients; it is not a resolution-independent physical mass. Production `senseLocalTrail` returns left/center/right, strength, coherence and steering from the existing two-distance local profile. Production `senseTrail` reads a wider field footprint at a requested heading.

The compared fields are:

- **A — native:** exact production 15 s decay, then the saved source requests in original tick/order.
- **B — residence:** exact prior frozen probe law, with tick-entry material layer count on the nearest 96-grid column: `lambda = ln(2)/15 × (1 − 0.5 × (1 − exp(−L/4)))`. Decay still precedes that tick's source requests. No parameter changed.
- **C — mass-matched spatial null:** at every saved time independently scale A by one nonnegative `k`, then set `Cᵢ = min(8, k × Aᵢ)` in a Float32 field so its node sum matches B. C is a normalized snapshot; it has no source, decay history or feedback.

The solver uses `k = sum(B)/sum(A)` when no node reaches the cap. If that scale would cap a node, it brackets and bisects the Float32 node sum, then picks the best of the two endpoints and midpoint, with ties going to lower `k`. No alternative null was tried.

At each saved recipient pose/heading the unchanged production `senseLocalTrail` ran on A/B/C. The same production `senseTrail` also ran at five fixed authored offsets `[-.92, -.47, 0, .47, .92]` from the saved heading, with the production wide-sensor response curve recorded. The offsets use the source-defined directional set but omit the per-decision jittered headings, which are not present in these saved post-tick snapshots. They are direct readout probes, not reconstructed intention choices or motor outcomes.

Headroom is continuous: local `1 − A.strength`; wide `1 − max(A wide response)`. The lower-native-strength quartile is a descriptive slice whose boundaries come from A alone (`A.strength ≤ 0.7424668536`); it is not a new pass/fail threshold. Material context reuses the prior probe's geometric fraction of **positive native bilinear sensor support** lying over material. It is not weighted by chemical magnitude and is not causal attribution.

## Mass-match and cap feasibility

| Receipt over 600 times | Result |
|---|---:|
| Feasible equal-node-sum controls | 600 / 600 |
| Native-to-null scalar `k` | min 1.000; median 1.342; max 1.801 |
| C nodes reaching the cap | 0 at every saved time |
| Requested amount removed by cap | 0 at every saved time |
| Relative node-sum residual | median `1.17×10⁻¹⁰`; maximum `6.21×10⁻¹⁰` |
| Absolute node-sum residual | median `5.43×10⁻⁷`; maximum `3.03×10⁻⁶` |

There is no cap-feasibility reason to treat C as an invalid control. The null does not create support where A is zero; this is part of the registered scalar-preserving spatial null.

## Field-space result

At 30 s and 60 s, B=A and C=A because no material-conditioned residence had yet separated the frozen fields. Later, the fields share much of their broad pattern but are not a scalar copy:

| Saved time | A node sum | B node sum | C node sum | Pearson(B,C) | `Σ|B−C| / ΣB` | Mean B−C on material nodes | Mean B−C on bare nodes |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 120 s | 2,495.82 | 2,560.81 | 2,560.81 | 0.9992 | 0.0341 | +0.00576 | −0.00046 |
| 300 s | 3,788.82 | 5,080.60 | 5,080.60 | 0.9776 | 0.2163 | +0.00399 | −0.00426 |
| 600 s | 3,626.44 | 6,292.48 | 6,292.48 | 0.9455 | 0.3549 | +0.00352 | −0.00589 |

Over the 600 snapshots, B/C field Pearson correlation has median `0.9763`; normalized L1 difference has median `0.2167`. The field contrast has the expected local sign: relative to global scalar amplification, B retains more at material nodes and less at bare nodes. At 600 s the residence field's node sum is about 73.5% above native; that bulk increase alone does not describe where its values differ from C.

## Recipient-level result

The native local sensor is highly saturated for much of the frozen history: A strength median `0.99555`, with median headroom `0.00445`. Across all 10,880 matched recipients, the B−C local-strength delta has median approximately zero (`−1.33×10⁻⁶`), p90 `+0.0107`, p95 `+0.0907` and p99 `+0.5020`. This is the main counterargument to a large general behavioral leverage claim: for typical high-strength reads, the mass-matched scalar field explains most of the increase.

The difference is clearer in the A-defined lowest-strength quartile (2,721 serial reads). There, A strength is at most `0.74247`, leaving at least `0.25753` continuous output headroom at the upper edge of that slice. B−C local-strength delta has median `0`, mean `+0.0578`, p90 `+0.2724`, p95 `+0.4651` and p99 `+0.7436`. B−C steering has p90 `+0.0279`, p95 `+0.0686` and p99 `+0.1639`; the full local profile also retains left/center/right and coherence values in the machine-readable rows.

Among the 2,721 lowest-strength reads, 2,165 have positive native sensor support with a defined frozen material-support fraction. Its median is `0.8069` and mean `0.5449`. Within that subset, B−C local-strength delta mean is `+0.0726`, p90 `+0.3384`, p95 `+0.5020`; the descriptive Pearson association between geometric material-support fraction and signed B−C strength difference is `+0.4594`. Across all 10,324 reads with defined support context the same association is `+0.1717`; material support versus absolute B−C steering difference is `+0.4190`. These are descriptive relationships within one serial frozen trajectory, not independent trials or causal effect estimates.

The wide sensor tells a more qualified story. Its maximum production response across the five fixed heading probes has median `0.99607` and median headroom `0.00394`, again showing substantial saturation. The pooled five-direction B−C response differences have median near zero, p90 `+0.0372`, p95 `+0.1528` and p99 `+0.4791`. The per-recipient maximum absolute wide-response difference has median `0.0264`, but its correlation with native wide headroom is `−0.0673`; this pass therefore does not claim a broad headroom-linked wide-sensor effect. Wide probes are not the actual jittered heading choices or behavior outcomes.

## Interpretation

**[Implementation fact]** B changes decay of existing shared chemistry at nodes whose tick-entry material column is nonzero; C applies one scalar to the full A snapshot and does not cap any node in this history.

**[Frozen measurement]** At equal stored node sum, the material-conditioned field differs spatially from C. At the exact saved recipient poses, local production profiles differ most in the lower-native-strength slice; those differences are associated with the already-frozen geometric material support. The local response includes steering-relevant quantities. The wide response differences do not show the same positive headroom association.

**[Research interpretation]** Local material placement contributes a recipient/readout difference beyond bulk retained node sum in this frozen history. The result is narrower than claiming that locality dominates: across the full readout population, the median B−C local-strength difference is effectively zero and the median native response is nearly saturated.

**[Authored/artistic meaning]** Whether material should make nearby shared traces remain longer is still a world-design decision. This evidence does not establish that such persistence is desirable, that the authored `/4` scale or 30 s bound is natural, or that stronger local cues should govern movement.

## Scope, limitations and consequence

- One current-G production-control seed/history only. The 10,880 positions are repeated serial observations, not independent samples.
- Saved positions/headings are post-tick. They are matched-state prospective readouts, not the original pre-movement sensor inputs, intention choices, steering actions or a counterfactual trajectory.
- The scalar null preserves A's spatial support and order unless field cap ties intervene; there were no cap ties here. It is the single registered control, not a global-gain world simulation.
- Wide fixed-offset reads omit actual per-decision jitter; no route, contact, Plate, mechanical or material history responds to A/B/C.
- No B-memory/qualification consequence was recomputed, as that readout was optional and not needed for the locality decision.

The result supports continuing to an artist/world-design judgment about whether local chemical residence is a desired material responsibility. It does **not** justify another parameter screen or production adoption. Production remains unchanged.

## Reproduction

```powershell
node scripts/ant-material-chemical-residence-locality.js --self-test
node scripts/ant-material-chemical-residence-locality.js --run
node scripts/ant-material-chemical-residence-locality.js --check
```

`--run` reconstructs only the saved chemical field history and evaluates fixed recipients; it does not tick ants. `--check` repeats that analysis and requires byte-identical compressed data and compact results. See [validation](VALIDATION.md), [plan](PLAN.md), [results](results.json), [full data](data/locality-results.json.gz) and [manifest](manifest.json).
