# CIC per-transverse-sample stage diagnosis — 2026-10-24

Started from the CIC wide stage-attribution branch after freezing the question and full recovered-cohort comparator rule. Reproduced the saved 5,072 strict-unique census: C and D each remain wrong on 2,378 rows, with 92 recovered and 92 new errors. The focal artifact preserves all 26 weighted-max-first new errors plus all 92 recovered rows, with exact A/C/D five-sample and weight parity.

**Read-only result:** all 26 new-error rows are tight/tightMirror cases. D keeps the analytic target top at unweighted raw maximum, but its target max sample moves from an outer `±1` slot (weight 0.55) to `±0.5` (weight 0.775) after weighting; the rival already maxes at `±0.5` and keeps that sample. Target-minus-rival margin crosses sign in all 26: raw median `+0.001890`, weighted median `-0.001745`. There are 26 target sample switches, zero rival switches, zero same-sample reorderings, and zero relevant exact ties.

The inverse recovered subgroup (14 rows) is mostly rival-side: 13 rival sample switches and one mixed switch restore the target after weighting. Another 68 recovered rows retain the target through weighting despite some sample changes; 10 recover only at final score. Thus sample switching alone does not guarantee a winner change. The primary phase counts are p00=8, p10=2, p01=10, p11=6; this is not a p11-dominated subset.

Decision: **ARGMAX-SWITCH DOMINATED for the saved 26-row transition; independent causal responsibility remains unproven.** No field or sensor candidate was tested. CIC Gate 2 stays **MIXED / NOT QUALIFIED**, Gate 3 stays **NOT RUN**. [Evidence package](../evidence/2026-10-24-cic-transverse-sample-diagnostic/README.md).
