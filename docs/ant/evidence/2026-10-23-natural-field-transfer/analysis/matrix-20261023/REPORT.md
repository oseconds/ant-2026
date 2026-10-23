# Natural-field transfer analysis

Manifest SHA-256: `8ea739584be0425ba9e2d166a4af04b4a84d4d3ccb6228ef6745026ad9a4ade3`

This is a conditional one-tick read-side comparison from paired arms restored from one exact natural state. The production and dtFeedback origin histories are summarized separately and are not matched treatments. It does not establish field-representation dominance, write/read contribution across divergent histories, or an adoption decision.

## Receipt verification

Verified 14 frozen source copies, 6 generated controller copies, 66 state receipts, and 6 field-operation streams. Replayed 66 field reconstruction checkpoints and verified compressed/uncompressed byte receipts.

Causal gate: 66/66 frozen states valid; 0 invalid. Complete three-arm ant observations: 1255/1255.

## Overall paired counts

| Seed | Natural origin | Arm pair | States | Causal ant-world n | Cue-eligible n | Left feedback opposes cue | Left local cancel / reverse / same-sign | Right local cancel / reverse / same-sign | Left actual-travel cancel / reverse / same-sign | First divergence (sense / choice / local / target / omega / travel / none) |
|---:|---|---|---:|---:|---:|---:|---|---|---|---|
| 20261005 | dtFeedback | dtFeedback vs dampingOff | 11 | 216 | 206 | 114/206 | 0/13/193 | 0/0/206 | 0/82/124 | 0 / 0 / 216 / 0 / 0 / 0 / 0 |
| 20261005 | dtFeedback | production vs dampingOff | 11 | 216 | 206 | 114/206 | 0/98/108 | 0/0/206 | 0/102/104 | 0 / 0 / 216 / 0 / 0 / 0 / 0 |
| 20261005 | dtFeedback | production vs dtFeedback | 11 | 216 | 206 | 114/206 | 0/98/108 | 0/13/193 | 0/102/104 | 0 / 0 / 214 / 0 / 0 / 0 / 2 |
| 20261005 | production | dtFeedback vs dampingOff | 11 | 203 | 188 | 93/188 | 0/17/171 | 0/0/188 | 0/55/133 | 0 / 0 / 203 / 0 / 0 / 0 / 0 |
| 20261005 | production | production vs dampingOff | 11 | 203 | 188 | 93/188 | 0/92/96 | 0/0/188 | 0/94/94 | 0 / 0 / 203 / 0 / 0 / 0 / 0 |
| 20261005 | production | production vs dtFeedback | 11 | 203 | 188 | 93/188 | 0/92/96 | 0/17/171 | 0/94/94 | 0 / 0 / 203 / 0 / 0 / 0 / 0 |
| 20261006 | dtFeedback | dtFeedback vs dampingOff | 11 | 213 | 202 | 112/202 | 0/12/190 | 0/0/202 | 0/75/127 | 0 / 0 / 213 / 0 / 0 / 0 / 0 |
| 20261006 | dtFeedback | production vs dampingOff | 11 | 213 | 202 | 112/202 | 0/93/109 | 0/0/202 | 0/111/91 | 0 / 0 / 213 / 0 / 0 / 0 / 0 |
| 20261006 | dtFeedback | production vs dtFeedback | 11 | 213 | 202 | 112/202 | 0/93/109 | 0/12/190 | 0/111/91 | 0 / 0 / 212 / 0 / 0 / 0 / 1 |
| 20261006 | production | dtFeedback vs dampingOff | 11 | 207 | 188 | 97/188 | 0/21/167 | 0/0/188 | 0/63/125 | 0 / 0 / 207 / 0 / 0 / 0 / 0 |
| 20261006 | production | production vs dampingOff | 11 | 207 | 188 | 97/188 | 0/97/91 | 0/0/188 | 0/92/96 | 0 / 0 / 207 / 0 / 0 / 0 / 0 |
| 20261006 | production | production vs dtFeedback | 11 | 207 | 188 | 97/188 | 0/97/91 | 0/21/167 | 0/92/96 | 0 / 0 / 207 / 0 / 0 / 0 / 0 |
| 20261007 | dtFeedback | dtFeedback vs dampingOff | 11 | 219 | 204 | 111/204 | 0/12/192 | 0/0/204 | 0/77/127 | 0 / 0 / 219 / 0 / 0 / 0 / 0 |
| 20261007 | dtFeedback | production vs dampingOff | 11 | 219 | 204 | 111/204 | 0/93/111 | 0/0/204 | 0/102/102 | 0 / 0 / 219 / 0 / 0 / 0 / 0 |
| 20261007 | dtFeedback | production vs dtFeedback | 11 | 219 | 204 | 111/204 | 0/93/111 | 0/12/192 | 0/102/102 | 0 / 0 / 218 / 0 / 0 / 0 / 1 |
| 20261007 | production | dtFeedback vs dampingOff | 11 | 197 | 180 | 84/180 | 0/18/162 | 0/0/180 | 0/53/127 | 0 / 0 / 197 / 0 / 0 / 0 / 0 |
| 20261007 | production | production vs dampingOff | 11 | 197 | 180 | 84/180 | 0/83/97 | 0/0/180 | 0/91/89 | 0 / 0 / 197 / 0 / 0 / 0 / 0 |
| 20261007 | production | production vs dtFeedback | 11 | 197 | 180 | 84/180 | 0/83/97 | 0/18/162 | 0/91/89 | 0 / 0 / 197 / 0 / 0 / 0 / 0 |

### Production vs dtFeedback paired difference ranges

| Seed | Natural origin | Cue-eligible n | Local turn Δ (P−dt), rad | Command residual Δ, rad | Body turn Δ, rad | Actual travel angle Δ, rad | Observed travel angle Δ, rad | Collision-scale Δ |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | dtFeedback | 206 | -0.654404…0.749126 | -0.552249…0.969557 | -0.150000…0.150000 | -0.068596…0.068473 | -0.068596…0.068473 | 0.000000…0.000000 |
| 20261005 | production | 188 | -0.725988…0.709148 | -0.566834…0.909323 | -0.150000…0.150000 | -0.068905…0.071583 | -0.068905…0.071583 | 0.000000…0.000000 |
| 20261006 | dtFeedback | 202 | -0.698342…0.740988 | -0.754429…1.114135 | -0.150000…0.150000 | -0.068966…0.108865 | -0.068966…0.108865 | 0.000000…0.000000 |
| 20261006 | production | 188 | -0.751577…0.649522 | -0.601577…0.672762 | -0.150000…0.150000 | -0.069013…0.077373 | -0.069013…0.077373 | 0.000000…0.000000 |
| 20261007 | dtFeedback | 204 | -0.703815…0.752411 | -0.646178…0.713484 | -0.150000…0.150000 | -0.068613…0.069013 | -0.068613…0.069013 | 0.000000…0.000000 |
| 20261007 | production | 180 | -0.655203…0.654925 | -1.505638…0.913131 | -0.150000…0.150000 | -0.150691…0.068548 | -0.150691…0.068548 | -0.000289…0.000000 |

All marginal strata, denominators, sign counts, continuous ranges, body-cap counts and first-divergence counts are in [marginal-summaries.csv](marginal-summaries.csv). The full ant-by-state paired values and fixed-state validation flags are in [results.json.gz](results.json.gz); [RECEIPTS.json](RECEIPTS.json) records its uncompressed SHA-256 and byte count. These repeated observations are dependent within each natural world.

## High-adherence production vs dtFeedback

| Seed | Natural origin | Cue-eligible n | Left feedback opposes cue | Production local cancel / reverse / same-sign | dtFeedback local cancel / reverse / same-sign | Body-turn cap hits P / dt |
|---:|---|---:|---:|---|---|---:|
| 20261005 | dtFeedback | 63 | 34/63 | 0/27/36 | 0/1/62 | 55/3 of 63 |
| 20261005 | production | 35 | 17/35 | 0/17/18 | 0/0/35 | 35/31 of 35 |
| 20261006 | dtFeedback | 71 | 40/71 | 0/33/38 | 0/3/68 | 64/10 of 72 |
| 20261006 | production | 31 | 17/31 | 0/17/14 | 0/1/30 | 31/23 of 31 |
| 20261007 | dtFeedback | 66 | 37/66 | 0/31/35 | 0/5/61 | 58/3 of 66 |
| 20261007 | production | 34 | 15/34 | 0/15/19 | 0/3/31 | 34/28 of 34 |

## Conditional A1/A2 findings

The fixed-state result addresses only conditional read-side transfer. In the high entry-adherence stratum, production feedback opposes the nonzero local cue in 49/100 cue-eligible observations from production-origin states and 111/200 from dtFeedback-origin states. Production local turn reverses the cue in 49/100 and 91/200, respectively; the paired dtFeedback local turn reverses it in 4/100 and 9/200. Canceled-or-zero outcomes are 0/0 for production local turn and 0/0 for dtFeedback. This supports the mechanism-level A1 finding that the production feedback term often reverses a natural local cue in this sampled stratum. It does not identify which direction is a correct route or make the independently grown origins matched comparisons.

The downstream body turn still differs from the local correction: production reaches the 4.5 rad/s turn cap in 100/100 high-adherence production-origin observations and 177/201 high-adherence dtFeedback-origin observations; the dtFeedback arm reaches it in 82/100 and 16/201. Actual postcollision travel tangent-turn reversals are 51/100 vs 20/100 in production-origin states and 103/200 vs 71/200 in dtFeedback-origin states. Tangent-turn sign is measured against the preceding segment; it is descriptive transfer, not route correctness.

A2 remains unidentified here. The P/dt/off arms share each captured raster by design. The six independently grown write streams establish exact history reconstruction, but do not compare field representations or make production and dtFeedback histories matched.

## Entry adherence and ±2.2 rad/s clamp exposure

Adherence strata use tick-entry adherence as frozen in PLAN.md; the local-cue and feedback expressions use the separately recorded updated adherence. The strict-clamp count is `abs(previousOmega) > 2.2 rad/s`; these are complete, causal-valid ant-by-frozen-state observations, not independent trials.

| Seed | Natural origin | Ant-world observations | Mean entry → updated adherence | Updated changed | `abs(previousOmega) > 2.2` | High-entry-adherence n | High adherence with clamp |
|---:|---|---:|---:|---:|---:|---:|---:|
| 20261005 | production | 203 | 0.487935 → 0.488527 | 203/203 | 196/203 | 35 | 35/35 |
| 20261006 | production | 207 | 0.468933 → 0.469215 | 207/207 | 199/207 | 31 | 31/31 |
| 20261007 | production | 197 | 0.461493 → 0.461622 | 197/197 | 188/197 | 34 | 34/34 |
| 20261005 | dtFeedback | 216 | 0.566253 → 0.566391 | 216/216 | 50/216 | 63 | 19/63 |
| 20261006 | dtFeedback | 213 | 0.597563 → 0.597827 | 213/213 | 52/213 | 72 | 19/72 |
| 20261007 | dtFeedback | 219 | 0.585329 → 0.585879 | 219/219 | 46/219 | 66 | 14/66 |

### Clamp exposure by entry-adherence band

Pooled over the three seeds; denominators are complete, causal-valid ant-world observations. Each band is the frozen tick-entry adherence value.

| Natural origin | Low | Middle | High | All |
|---|---:|---:|---:|---:|
| production | 125/142 | 358/365 | 100/100 | 583/607 |
| dtFeedback | 19/65 | 77/382 | 52/201 | 148/648 |

### dtFeedback vs dampingOff: realized body turn and actual travel angle

The pooled table counts paired differences above `1e-9 rad` in absolute magnitude, the frozen numerical-zero tolerance. Ranges include all cue-eligible observations, including exact zeros. This measures the fixed-state arm contrast; it does not test the audit-proposed unclipped angular-displacement candidate.

| Natural origin | Entry stratum | Cue-eligible n | Body-turn Δ nonzero / n (rad) | Actual travel-angle Δ nonzero / n (rad) | Collision-scale Δ nonzero / n |
|---|---|---:|---|---|---:|
| production | all | 556 | 124/556 (-0.043074…0.021206) | 124/556 (-0.018087…0.009655) | 0/556 |
| production | high entry adherence | 100 | 20/100 (-0.043074…0.021206) | 20/100 (-0.018087…0.009655) | 0/100 |
| dtFeedback | all | 612 | 528/612 (-0.022235…0.020686) | 528/612 (-0.010191…0.009116) | 0/612 |
| dtFeedback | high entry adherence | 200 | 185/200 (-0.022235…0.020686) | 185/200 (-0.010191…0.009116) | 0/200 |

Per-seed counts and ranges:

| Seed | Natural origin | Entry stratum | Cue-eligible n | Body-turn Δ nonzero / n (rad) | Actual travel-angle Δ nonzero / n (rad) | Collision-scale Δ nonzero / n |
|---:|---|---|---:|---|---|---:|
| 20261005 | production | all | 188 | 45/188 (-0.043074…0.018397) | 45/188 (-0.018087…0.007885) | 0/188 |
| 20261005 | production | high entry adherence | 35 | 6/35 (-0.043074…0.018397) | 6/35 (-0.018087…0.007885) | 0/35 |
| 20261006 | production | all | 188 | 42/188 (-0.020221…0.020445) | 42/188 (-0.008469…0.009296) | 0/188 |
| 20261006 | production | high entry adherence | 31 | 8/31 (-0.020221…0.020445) | 8/31 (-0.008469…0.009296) | 0/31 |
| 20261007 | production | all | 180 | 37/180 (-0.018135…0.021206) | 37/180 (-0.008290…0.009655) | 0/180 |
| 20261007 | production | high entry adherence | 34 | 6/34 (-0.018135…0.021206) | 6/34 (-0.008290…0.009655) | 0/34 |
| 20261005 | dtFeedback | all | 206 | 178/206 (-0.022235…0.019980) | 178/206 (-0.010191…0.009116) | 0/206 |
| 20261005 | dtFeedback | high entry adherence | 63 | 60/63 (-0.022235…0.019980) | 60/63 (-0.010191…0.009116) | 0/63 |
| 20261006 | dtFeedback | all | 202 | 170/202 (-0.019146…0.017947) | 170/202 (-0.008249…0.008054) | 0/202 |
| 20261006 | dtFeedback | high entry adherence | 71 | 62/71 (-0.019146…0.017947) | 62/71 (-0.008249…0.008054) | 0/71 |
| 20261007 | dtFeedback | all | 204 | 180/204 (-0.020716…0.020686) | 180/204 (-0.009508…0.008968) | 0/204 |
| 20261007 | dtFeedback | high entry adherence | 66 | 63/66 (-0.020716…0.020686) | 63/66 (-0.009508…0.008968) | 0/66 |

Across complete, causal-valid ant-world observations, strict ±2.2 rad/s clamp exposure was 583/607 in production-origin histories (100/100 high-entry-adherence observations) and 148/648 in dtFeedback-origin histories (52/201 high-entry-adherence observations). 0 samples were exactly at ±2.2. This shows that an unclipped-input contrast would change a frequently clamped input in production-origin states; the matrix does not measure its resulting turn response, so it remains a separate candidate test rather than a finding or selected law.


## Fixed representative traces

Selection was fixed independently of outcomes: for each origin, seed 20261005 at 30 seconds, then the numerically lowest ant ID with complete three-arm traces. Values below retain entry and updated adherence separately. Command error is defined as requested angular step (heading before turn to post-crowding target) minus realized body turn; wrapped angles use the signed shortest difference.

### production origin, ant ant-3

Replay gate valid: true. Entry adherence: 0.105360; updated adherence: 0.104389; local coherence: 0.000000; raw sensor steering: 0.000000. Prior observed one-second travel: {"completeOneSecond":true,"exactTickCoverage":true,"actual":{"lastTravelAngle":-2.3751091534240696,"signedTurnRad":0.8823951922528777,"absoluteTurnRad":1.9609399743979081,"adjacentTurnAgreement":0.39655172413793105,"pathLength":0.10462640050508115,"chordLength":0.09703542634818056,"chordToPathRatio":0.9274468573872812,"chordDisplacementRate":0.09703542634818044},"observed":{"lastTravelAngle":-2.3751091534240696,"signedTurnRad":0.8823951922528777,"absoluteTurnRad":1.9609399743979081,"adjacentTurnAgreement":0.39655172413793105,"pathLength":0.10462640050508115,"chordLength":0.09703542634818056,"chordToPathRatio":0.9274468573872812,"chordDisplacementRate":0.09703542634818044}}.

| Arm | Cue u | Feedback v | u+v | Clamped local turn | Requested step | Command residual | Body turn | Omega after | Velocity angle before → after | Actual travel angle | Observed travel angle | Actual tangent turn | Observed tangent turn | Collision scale |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| production | 0.000000 | 0.149276 | 0.149276 | 0.149276 | -0.338422 | -0.263422 | -0.075000 | -4.500000 | -2.375109 → -2.447483 | -2.447483 | -2.447483 | -0.072374 | -0.072374 | 1.000000 |
| dtFeedback | 0.000000 | 0.002488 | 0.002488 | 0.002488 | -0.485210 | -0.410210 | -0.075000 | -4.500000 | -2.375109 → -2.447483 | -2.447483 | -2.447483 | -0.072374 | -0.072374 | 1.000000 |
| dampingOff | 0.000000 | 0.000000 | 0.000000 | 0.000000 | -0.487698 | -0.412698 | -0.075000 | -4.500000 | -2.375109 → -2.447483 | -2.447483 | -2.447483 | -0.072374 | -0.072374 | 1.000000 |

### dtFeedback origin, ant ant-1

Replay gate valid: true. Entry adherence: 0.076783; updated adherence: 0.076075; local coherence: 0.000000; raw sensor steering: 0.000000. Prior observed one-second travel: {"completeOneSecond":true,"exactTickCoverage":true,"actual":{"lastTravelAngle":2.312792886982035,"signedTurnRad":-1.076318304692564,"absoluteTurnRad":1.087897047013257,"adjacentTurnAgreement":0.9655172413793104,"pathLength":0.011046792818353138,"chordLength":0.010777672376964049,"chordToPathRatio":0.975638138071896,"chordDisplacementRate":0.010777672376964035},"observed":{"lastTravelAngle":2.312792886982035,"signedTurnRad":-1.076318304692564,"absoluteTurnRad":1.087897047013257,"adjacentTurnAgreement":0.9655172413793104,"pathLength":0.011046792818353138,"chordLength":0.010777672376964049,"chordToPathRatio":0.975638138071896,"chordDisplacementRate":0.010777672376964035}}.

| Arm | Cue u | Feedback v | u+v | Clamped local turn | Requested step | Command residual | Body turn | Omega after | Velocity angle before → after | Actual travel angle | Observed travel angle | Actual tangent turn | Observed tangent turn | Collision scale |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| production | 0.000000 | 0.000301 | 0.000301 | 0.000301 | 0.000282 | -0.000000 | 0.000282 | 0.016918 | 2.312793 → 2.307927 | 2.307927 | 2.307927 | -0.004866 | -0.004866 | 1.000000 |
| dtFeedback | 0.000000 | 0.000005 | 0.000005 | 0.000005 | -0.000014 | -0.000000 | -0.000014 | -0.000830 | 2.312793 → 2.307803 | 2.307803 | 2.307803 | -0.004989 | -0.004989 | 1.000000 |
| dampingOff | 0.000000 | 0.000000 | 0.000000 | 0.000000 | -0.000019 | 0.000000 | -0.000019 | -0.001131 | 2.312793 → 2.307801 | 2.307801 | 2.307801 | -0.004992 | -0.004992 | 1.000000 |

## Reading limits

Adherence and coherence bins, heading sectors, raster phases and authored crowd branches are descriptive engineering strata. A local cue reversal or same-tick travel difference does not establish a correct route, total pheromone contribution, or a field-representation winner. Body heading, velocity direction and postcollision travel remain separate observables. The reported chord displacement rate is per completed tick; the prior one-second chord rate is not actual path speed.

