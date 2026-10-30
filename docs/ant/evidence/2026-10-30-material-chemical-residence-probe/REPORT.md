# Existing chemistry on a material-conditioned world

## Decision

**Distinctness / recipient-leverage gate passed; world outcome untested by this probe.** A local residence law has a different temporal responsibility from new-source attenuation. It preserves a longer source-free tail, including at actual recorded sensor footprints. Existing saturation is substantial, so a larger field is not automatically a larger effective behavioral cue.

This result justified one separately registered coupled screen. It does not establish beneficial traffic redistribution, an allocation law, or production adoption.

## Provenance and one changed responsibility

Production main is `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; common opportunity parent is `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a`. The input source stream and actual material masks are the **production control only** from Pass 3, preserved in `2414d1a9b580296c9c38d4fb796904525a843b78`. The result field `sourceCommit: afea7ec` denotes that common source lineage, not a new production adoption or this probe's eventual commit. Current research branch is `codex/ant-material-feedback-space-20261030`.

Current-G/H0 seed20261005, 60 Hz, 0–600 s, Audio Off. This is a replay of chemical writes and fixed material history, not a new natural simulation. Agents, poses, contacts, C/D, actual births and material masks never respond. The Pass 3 treatment stream is not used.

```text
p(L) = 1 - .50 * (1 - exp(-L/4))
lambda(node) = ln(2)/15 * p(L_tick_entry)
halfLife(node) = 15 / p(L_tick_entry)
```

Each native 316-grid node reads the nearest 96-grid material column at tick entry. Native decay precedes that tick's recorded source requests, in original order, including retirement flushes. A layer born at the end of the tick affects the following decay. The rule changes future loss of existing chemistry, including chemistry written before a new layer existed. It does not generate chemical in the absence of a source.

The 15–30 s range and `/4` are authored screening conventions. This is not measured absorption, porosity, terrain height, stored chemical in a Plate, or sensing of individual buried layers. Source rate, writer geometry, sensor laws and the 20 s B-memory readout are unchanged.

## Validity and the temporal counterexample

The native replay matches all five stored projected96 maps, all five native node sums and reconstructed integrals, and all 40 B-memory maps exactly. All 100,882 control source requests are consumed in order. Input and source hashes, verifier corrections and deterministic output SHA are retained in [results.json](results.json).

A below-cap pulse at L=1 starts at the same value in both decay arms. After 30 s, normalized remaining signal is approximately `.2500` native and `.2914` residence. Halving the initial source dose leaves the normalized native tail at `.2500`: amplitude does not change its half-life.

Under a constant source, a gain change can approximately match the residence equilibrium: `.40139` residence versus `.40141` gain-matched native. After source cessation, the 15 s normalized tails are `.53984` versus `.50000`. **Equilibrium amplitude alone is therefore not evidence of the distinct residence responsibility; source-free time response is.**

The first deterministic actual P1 material/bare interface was used for an edge pulse. The two sides decay differently under the nearest-grid rule. This confirms the piecewise lookup behavior, not its physical correctness or robustness to every raster convention.

## Actual recipient context

At all 600 saved one-second position snapshots, native local sensors are evaluated at the recorded post-tick position/heading: **10,880 prospective matched-state readouts**. They are not the original pre-movement sensor inputs, selected decisions, motor outputs or a counterfactual trajectory.

Native local sensor taps and their weighted bilinear support nodes are retained. Excluding untouched zero nodes:

- 3,063 readouts have entirely old positive source support; 6,918 have mixed old/fresh support.
- 343 have fresh-only positive support; 556 have no positive chemical support.
- 7,944 have at least some old material-node support.
- The distribution of per-read weighted median source age has median **30.35 s**.

“Old” here means no actual source-kernel contribution for at least the existing 15 s half-life. It is a descriptive reference, not a new material eligibility threshold. These counts are prospective read contexts, not ant episodes or independent replicates.

The stored `materialContributingFraction` fields aggregate **bilinear tap-support weights at positive nodes**. They do not weight by chemical magnitude or by the sensor's native cross-band .5/.25 tap factors. Their correct meaning is geometric positive-support coverage, not a fraction of chemical signal or causal contribution. The actual native profile computations retain the full native weights and nonlinear response.

| Native sensor strength | Control | Residence |
| --- | ---: | ---: |
| All-read median | .995552 | .998326 |
| All-read mean | .768909 | .805398 |
| Median paired strength delta | — | .000253 |
| p90 paired strength delta | — | .071121 |

The median full profile is highly saturated. Many stronger field values have little additional strength leverage.

To test old quiet signal specifically, a separate **mask intervention** retains only positive material nodes whose last source contribution is at least 15 s old, then runs the same native sensor at the same saved pose. Both arms have nonzero restricted strength at 7,379 poses. Restricted strength medians are `.23113` control and `.78304` residence; the median paired delta is `.00630`, p90 `.37722`, mean `.09636`. The difference of marginal medians is not the median paired difference. These are nonlinear masked-field readouts, **not additive attribution** of a percentage of the full sensor signal.

At the 40 saved B maps, holding the original D fixed and applying the existing B≥.30 / D≥.015 qualification gives gains of 356–407 cells near 300 s and 932–971 near 600 s, with no losses. The sum over snapshots, 26,898, is not unique cells. No graph selection, new Plate or event is created by this calculation.

## Field and interpretation limits

At 600 s, frozen-source node sum is 6,292.48 residence versus 3,626.44 native, about +73.5%. After matching total field mass descriptively, normalized spatial L1 is `.35486`; the difference is not only one final uniform amplitude multiplier. There is no equal-total global-gain coupled world control, so the added value of locality remains unproven.

**[Measurement]** Source-free temporal tails and matched-state recipients differ while source/material history is frozen. **[Research interpretation]** This is enough leverage to ask the coupled world consequence once, independently. It does not prove ants will preserve a route, relocate, create more material, or use the old history in a particular manner.

**[Authored interpretation]** Material changes the chemical medium's local residence time. Whether this is a useful meaning for ANT's material is not established by pulse mathematics. The same material-conditioned entry region could become even more persistent; repeated max-D layering remains valid.

## Reproduction

```powershell
node scripts/ant-material-chemical-residence-probe.js --self-test
node scripts/ant-material-chemical-residence-probe.js --check
```

`--check` reruns fixed-source chemistry and requires exact compressed output and result JSON; it does not simulate ants. The final replay gzip SHA is `313bd77d45821b9761a40e63fc84c7f30633f0eff546838e4ac39d6fa7e58f73`.

Two early verifier assumptions were corrected and preserved: stored checkpoint maps are 96-grid bilinear projections, not 316-grid arrays; the native integral uses multiplication by hx then hy rather than an algebraically equivalent division with different final rounding. Neither correction changed a physical parameter or sought a preferred result.

See [plan](PLAN.md), [compact results](results.json), [full replay/readouts](data/replay.json.gz), [validation](VALIDATION.md), [manifest](manifest.json) and [daily record](../../daily/2026-10-30-material-chemical-residence-probe.md). No production, ant motion, allocation, X, UPDATE, BODY or audio change.
