# Material-feedback A/D production adoption

## Decision

**ADOPTED on production `main` on 2026-10-30.**

PR #10 merged the validated material-feedback production candidate:

```text
existing retained-material desired-speed resistance
+ A — material-conditioned native turn-rate ceiling
+ D — material-conditioned native same-flow comfortable headway
```

Merge commit: `5f1a80b27876948d9ecd62a9a078b6081241106e`.

The research candidate before adoption was:

- branch `codex/ant-material-feedback-ad-production-candidate-20261030`
- commit `7b86a4733629abdba5f9bfa9f199f640a8b48eda`
- full evidence: [production-candidate report](../2026-10-30-material-feedback-ad-production-candidate/REPORT.md)

## Adopted laws

Production reads one tick-entry `layerCountByCell` value `L` per active ant and reuses it across the three material-conditioned consumers.

```text
m(L)  = 1 - 0.10 * (1 - exp(-L/4))
qA(L) = 1 - 0.50 * (1 - exp(-L/4))
hD(L) = 1 + 0.50 * (1 - exp(-L/4))
```

- `m(L)` multiplies the existing final desired-speed target once.
- `qA(L)` multiplies the native `4.5 rad/s` maximum turn-rate ceiling; requested heading remains native.
- `hD(L)` multiplies only the native `0.4 s` speed-based same-flow comfortable-headway term. Native same-flow classification, personal-space floor, emergency/opposing handling and collision guards remain unchanged.
- `L=0` is native behavior for all three links.

No material direction cue, attraction/avoidance target, explicit feedback mode switch, chemical Residence, C/G candidate, allocation, UPDATE, or audio change is adopted here.

## Evidence boundary

The registered 20261005 / 600 s matched candidate screen found:

- production slowdown remained correctly applied once;
- A changed 427,177 / 442,962 material-exposed turn calls;
- D changed 21,694 / 40,418 material-exposed same-flow final targets after slowdown;
- total travel differed by -0.09%, individual FOOT_CONTACT count by -0.04%, and active-ant seconds by +0.64%;
- no registered finite, speed/turn-cap, collision-overlap, population-ceiling, time, contact-count, Plate-count, or field-finiteness violation;
- blocked frames increased from 9,468 to 10,715 (+13.17%).

The blocked-frame increase remains a production observation/cost to inspect, not a demonstrated long-lived jam pathology. The adoption evidence is one deterministic seed and does not establish cross-seed robustness or artistic preference.

## Material-information boundary

The separate [material information-axes audit](../2026-10-30-material-information-axes/REPORT.md) concluded **MULTI-AXIS**: local `L` nearly compresses burial depth in the observed history, but not top-Plate age/birth properties, current compaction, or cumulative foot-load context.

Therefore this adoption means:

> `L` is the currently tested and adopted authored conditioning coordinate for these three links.

It does **not** mean that `L` is established as the final physical or artistic material descriptor, or that all future feedback responsibilities should share it.

## Next boundary

Chemical Residence remains research-only. Its next integration question is whether a distinct material-conditioned environmental-memory responsibility can coexist with the adopted speed/A/D production system without pathological lock-in or congestion.

No Residence production adoption is implied by this record.
