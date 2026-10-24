# Fixed-cue qualification

Gate 1: PASS, conservation only. Gate 2: MIXED / NOT QUALIFIED. Gate 3: NOT RUN.

Same frozen writes, production reader and sensor operators. Analytic A is the frozen engineering reference, not natural-path truth. Every number below is C / CIC. Global local sign errors use 4,012 directional rows; wide errors use 5,072 strict-unique analytic winners. Steering MAE uses every local row (5,544 globally), including analytic-zero cues. The previous QAKR report's approximately 0.063132 baseline uses the 4,012 directional cohort; that separate denominator remains available in RESULTS.json and is not this preregistered all-row MAE.

| Cohort | Rows | Local sign errors | Steering MAE (rad) | Wide winner errors |
| --- | ---: | ---: | ---: | ---: |
| all | 5544 | 552 / 0 | 0.065053540 / 0.022254856 | 2378 / 2378 |
| straight | 924 | 0 / 0 | 0.098274641 / 0.000000000 | 0 / 0 |
| gentle | 924 | 152 / 0 | 0.059255895 / 0.031121283 | 828 / 828 |
| tight | 924 | 39 / 0 | 0.057576138 / 0.022071155 | 301 / 303 |
| gentleMirror | 924 | 152 / 0 | 0.059255895 / 0.031121283 | 828 / 828 |
| tightMirror | 924 | 39 / 0 | 0.057576138 / 0.022071155 | 301 / 303 |
| sCurve | 924 | 170 / 0 | 0.058382531 / 0.027144260 | 120 / 116 |
| p00 | 1386 | 107 / 0 | 0.092333496 / 0.022752002 | 647 / 645 |
| p10 | 1386 | 77 / 0 | 0.090259209 / 0.023635818 | 657 / 647 |
| p01 | 1386 | 195 / 0 | 0.040181083 / 0.020759746 | 534 / 535 |
| p11 | 1386 | 173 / 0 | 0.037440371 / 0.021871858 | 540 / 551 |

## Preregistered checks

- PASS: global denominators and metrics exist
- PASS: global local sign errors strictly decrease
- PASS: global local steering MAE strictly decreases
- PASS: global wide winner errors do not increase
- PASS: families:straight all three primary measures nonregress
- PASS: families:gentle all three primary measures nonregress
- FAIL: families:tight all three primary measures nonregress
- PASS: families:gentleMirror all three primary measures nonregress
- FAIL: families:tightMirror all three primary measures nonregress
- PASS: families:sCurve all three primary measures nonregress
- PASS: phases:p00 all three primary measures nonregress
- PASS: phases:p10 all three primary measures nonregress
- FAIL: phases:p01 all three primary measures nonregress
- FAIL: phases:p11 all three primary measures nonregress
- PASS: zero-control:straight false steering nonregresses
- FAIL: zero-control:sCurveAnalyticZero false steering nonregresses

Complete arm-level measures, recovery/regression counts, zero controls, ties/margins, contrast and raster statistics are in ../RESULTS.json. Raw comparisons are in rows.json.gz. Additional margin/contrast readouts are descriptive, not added qualification gates. No ant was advanced by this assay.
