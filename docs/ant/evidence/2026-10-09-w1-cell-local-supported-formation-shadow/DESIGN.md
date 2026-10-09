# W1 cell-local supported formation shadow — pre-analysis contract

Starting revision: `9c838039b614685a8f639958188486a447a04724` on `ant-w1-episodic-material-shadow`.

## Question

Can a local activity spell create a distinct formation-completion candidate while its historical episode remains open, without materializing the historical union or changing episode closure?

## Frozen inputs and models

- Reuse seeds `20261005`, `20261006`, and `20261007` through their exact final `599.25 s` observations.
- Reuse the archived q/qualification flags, existing 20/90 s EMA, and active mask.
- Keep original W1 and the existing max-overlap split/merge/closure analysis unchanged. They are comparison baselines, not part of this candidate.
- Do not rerun natural ANT or change movement, DAB, FOOT_CONTACT, production, audio, or feedback.

## One candidate

For each cell, start a spell while `q === 1 && active === 1`. Keep it across adjacent recorded samples only; episode-identity changes are provenance and do not reset the spell. Duration is the last supported observation time minus the first supported observation time; no state is inserted between samples. On the first sample where q or active is false, record the spell's observed duration and `q-off`, `active-off`, or `both` reason. A spell becomes eligible only at the existing W1 20 s persistence. The 20 s value is reused for this experiment and is not separately tuned.

At one observation, group only eligible cells whose spells end at that observation with deterministic 8-connectivity. Store those cells as the candidate event geometry. Record overlap with prior local events separately from new cells. Pending spells at the final observation remain right-censored and never become events.

## Interpretation limits

- A supported-spell ending is a formation hypothesis for this shadow, not evidence of physical consolidation or material birth.
- q is the existing cumulative qualification predicate. Its contact bit records prior same-cell contacts; it is not present contact pressure or support quantity. Report the most recent actual same-cell FOOT_CONTACT age separately.
- Active EMA carry-over can persist after q turns off. Count those observations, but do not reinterpret them as current physical support.
- Freeze no new material ontology and make no biological claim from the event geometry.

## Required validation boundary

Deep-compare existing original W1 and max-overlap geometry/character, verify q/EMA/active parity for all `1,797` matched frames, and verify deterministic same-frame event grouping, causal cutoffs, q/active termination causes, no RNG, finite/index/overlap accounting, and independent byte reproduction of results and plots. Keep evidence and chronology on this branch; no main merge or PR.
