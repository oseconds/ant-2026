# Fixed-nucleus X recapture on frozen P1/P2

## Result

**D — MIXED (descriptive classification among the requested A/B/C/D interpretations; no quantitative cutoff was registered).** P1 had no max-D nucleus movement: stateless X and fixed-nucleus X were identical at all 21 anchors. P2 had four nucleus-changing transitions. Freezing its START nucleus modestly increased mean adjacent-transition Jaccard (0.8900 stateless to 0.9083 fixed), but the dominant fixed-X losses in both events came from saved F thinning changes.

Of 162 fixed-X loss occurrences, 13 were no longer in E, 147 remained in E but were absent from current F, and 2 remained in F but were outside the current fixed-nucleus X. Both events kept n0 edge-bearing in F at every anchor. These measurements do not support adopting a separate incumbency/membership rule from these windows. No incumbency arm was tested, so this pass cannot establish whether such a rule would improve persistence.

## Authority and lineage

**[Current implementation fact]** Analysis starts from origin/main@1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44. Current TrailPlateBirth.js has Git blob 238cc365f2602dc6a22091d69237b88962825a13, LF SHA-256 cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67, and raw SHA-256 283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860. Its blob and bytes match the historical production selector used to capture the frozen states. The later recruitment-heading adoption changed no TrailPlateBirth bytes.

Current production also includes 10% retained-material speed resistance, A material-conditioned turn-rate ceiling, D same-flow headway, endogenous outgoing-flow recruitment heading, and the causal G pheromone field (renderer overlay default Off). TrailPlateBirth remains the authored source→boundary formation law. This analysis does not run those systems or claim that the frozen 2026-10-28 structural histories represent the current natural trajectory.

**[Prior evidence]** The 2026-10-29 capture synthesis registered X as the nucleus-connected component of F intersected with Disk(nucleus,.15) and recorded the max-D priority, edge-bearing eligibility, lower-row-major tie, and ten reference nuclei/X sets. The 2026-10-29 UPDATE diagnostic recorded the same 21 P1/P2 times and exact E/I memberships. Those packages are provenance and validation references; their conclusions are not treated as current source authority.

**[Frozen input]** The source packet is commit 0d5096a920e1ebb2086fa1dae782c5d4e871b590, docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz, SHA-256 909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc (17,766,995 bytes). Its decoded JSON SHA-256 is fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339 (69,227,056 bytes). The evidence packet retains only the 42 exact anchor maps needed here: E, F, D_support, and production I. No new trajectory was generated.

## Exact laws used

- **ALLOCATION at START:** edge-bearing F node with maximum D support; exact ties go to the lower row-major index.
- **CAPTURE:** eight-neighbor component containing the nucleus in current F inside a closed Euclidean radius .15.
- **UPDATE diagnostic:** fixed n0 plus full current-state X re-capture. There is no prior membership input.
- **Stateless comparator:** repeat max-D allocation and X capture at every anchor.
- **Production comparator:** saved current I(t); its source→boundary semantics remain distinct from X.

For the weighted graph-distance structural descriptor only, orthogonal and diagonal grid edges use 1/95 and sqrt(2)/95. That distance does not decide X membership.

## Nucleus validity and reallocation

Both starts selected row-major index 6192, at (0.5052631579, 0.6736842105). Its START D support was 0.3141264319 for P1 and 0.4228560925 for P2. n0 remained an edge-bearing F node through all 21 anchors in both events; neither fixed sequence invalidated.

| Event | Stateless max-D nucleus over time | Nucleus-changing transitions | Fixed vs stateless mean same-anchor Jaccard | Maximum nucleus displacement |
| --- | --- | ---: | ---: | ---: |
| P1 | 6192 at all 21 anchors | 0 / 20 | 1.0000 | 0 |
| P2 | 6192 → 6191 → 6192 → 6287 → 6192 | 4 / 20 | 0.9699 | 0.0148865 |

P2’s four changes occurred at destination times 93.016667, 97.016667, 98.016667, and 100.016667 s. Holding the previous stateless nucleus against destination F and then changing only the nucleus produced 25 lost and 22 gained cells across those four current-F allocation contrasts (mean Jaccard across the four changed-nucleus transitions: 0.8812). In P1 that contrast was zero everywhere.

P2 had 16 transitions with an unchanged stateless nucleus; their X mean Jaccard was 0.9102 with 79 losses and 77 gains. Across all 20 transitions, re-capture under the previous nucleus was available and had mean Jaccard 0.9097 (97 losses and 97 gains). This records recapture turnover separately from the four localized allocation changes.

## Adjacent-transition turnover

Counts below are transition occurrences, so one coordinate can be counted again at later transitions.

| Event | History | Valid transitions | Mean Jaccard | Lost | Gained | Losses no longer E | Still E, no longer F | Still F, outside current capture |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | Production I | 20 | 0.9000 | 74 | 134 | 3 | 28 | 43 |
| P1 | Stateless X | 20 | 0.9149 | 62 | 103 | 7 | 55 | 0 |
| P1 | Fixed-nucleus X | 20 | 0.9149 | 62 | 103 | 7 | 55 | 0 |
| P2 | Production I | 20 | 0.7730 | 490 | 518 | 10 | 91 | 324 |
| P2 | Stateless X | 20 | 0.8900 | 119 | 116 | 5 | 90 | 24 |
| P2 | Fixed-nucleus X | 20 | 0.9083 | 100 | 97 | 6 | 92 | 2 |

Production-I loss attribution also records cells that remained in the destination stateless X despite being dropped from I: 0 in P1 and 65 in P2. Thus production-I exclusions are not evidence that those cells should be kept; they only describe how the source→boundary proposal and local X differ.

The earlier still-E UPDATE counts reproduce: P1 has 71/74 production-I losses still in E (28 no longer F plus 43 still F outside stateless X); P2 has 480/490 (91 no longer F, 324 still F outside X, and 65 inside the destination X). This pass refines that prior observation; it does not overturn it.

For stateless P2, the 24 still-F losses outside the destination X split into 22 outside the Euclidean disk and 2 inside the disk but disconnected from its nucleus. For fixed P2, both still-F losses were inside the disk but disconnected from n0. P1 had no still-F fixed-X losses outside capture.

### Production-I alignment with X

At the same saved anchor, production I and local X were distinct set projections. Mean Jaccard was 0.0788 for P1 I vs X and 0.0859 for P2 I vs stateless X (0.0858 for I vs fixed X). Across 21 anchors, P1 had 1,653 I-only and 1,717 X-only membership occurrences; P2 had 3,585 I-only / 1,568 X-only against stateless X and 3,583 / 1,597 against fixed X. These low overlaps are descriptive; I is not a ground truth for local capture.

Exact same-anchor sizes, Jaccards, lost/gained cell sets, and all transition receipts are in [analysis.json](analysis.json) and [transition-cells.json](transition-cells.json).

## START-X survival

Each entry is still in E / still in F / still in current fixed X. Denominators are 71 P1 START cells and 107 P2 START cells. The full exact times are the corresponding 21 anchor rows in analysis.json.

| Seconds after START | P1 E/F/X | P2 E/F/X |
| ---: | ---: | ---: |
| 0 | 71 / 71 / 71 | 107 / 107 / 107 |
| 1 | 70 / 69 / 69 | 106 / 105 / 105 |
| 2 | 70 / 61 / 61 | 105 / 99 / 99 |
| 3 | 70 / 61 / 61 | 105 / 90 / 90 |
| 4 | 70 / 57 / 57 | 106 / 91 / 91 |
| 5 | 70 / 57 / 57 | 106 / 91 / 91 |
| 6 | 68 / 58 / 58 | 106 / 90 / 90 |
| 7 | 68 / 57 / 57 | 106 / 87 / 87 |
| 8 | 68 / 57 / 57 | 106 / 87 / 87 |
| 9 | 68 / 57 / 57 | 106 / 83 / 83 |
| 10 | 68 / 55 / 55 | 105 / 75 / 75 |
| 11 | 68 / 54 / 54 | 105 / 64 / 64 |
| 12 | 68 / 52 / 52 | 105 / 65 / 65 |
| 13 | 68 / 54 / 54 | 105 / 65 / 65 |
| 14 | 68 / 54 / 54 | 105 / 65 / 65 |
| 15 | 68 / 55 / 55 | 104 / 64 / 64 |
| 16 | 68 / 53 / 53 | 102 / 61 / 61 |
| 17 | 68 / 53 / 53 | 102 / 61 / 60 |
| 18 | 68 / 53 / 53 | 101 / 61 / 60 |
| 19 | 67 / 54 / 54 | 101 / 59 / 58 |
| 20 | 67 / 54 / 54 | 100 / 64 / 63 |

At the endpoint, 67/71 P1 START cells and 100/107 P2 START cells remained in E. Only 54 P1 and 63 P2 remained in current fixed X. The large E-to-F difference explains most START-X exits. This is not material entitlement evidence.

## Fixed-X structure

The structural columns below summarize all 21 fixed-X anchors per event. Every available fixed X was connected and within radius .15; the sequence was available at all anchors.

| Event | X nodes min / median / max | Induced edges min / median / max | Max Euclidean radius min / max | Max weighted graph distance min / max | Degree-3+ nodes min / median / max | Containing F component size min / max |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 68 / 101 / 115 | 101 / 168 / 216 | 0.147368 / 0.149607 | 0.170975 / 0.184055 | 42 / 77 / 95 | 370 / 628 |
| P2 | 93 / 99 / 107 | 151 / 171 / 200 | 0.149607 / 0.149607 | 0.173529 / 0.201496 | 64 / 74 / 87 | 649 / 818 |

Degree-1 endpoint counts, exact component keys/counts, and all per-anchor scope metrics are in analysis.json. The maximum graph distance is a descriptive property of X’s induced 8-neighbor graph; it may exceed .15 and was not used for capture.

## Interpretation boundaries

- **Implementation fact:** current production TrailPlateBirth.js bytes are unchanged; offline code reads frozen maps only. No production selector was added.
- **New measurement:** fixing n0 removes no P1 turnover because stateless max-D never moved there. It modestly reduces P2 turnover, concentrated in four max-D changes.
- **Research interpretation:** current F changes, mostly E→F thinning, dominate fixed-X losses. Repeated global opportunity reallocation does not explain most observed X turnover in these two events.
- **Incumbency judgment:** measured fixed-X losses provide little evidence for retaining cells outside current F: 147/162 loss occurrences were E-qualified but no longer in F; only 2 remained in F but outside fixed X. This pass did not test an incumbency arm and cannot establish whether it would improve persistence. Do not adopt membership memory from this pass.
- **Authored semantics:** max-D priority and radius .15 remain authored conventions, not validated physical allocation/material laws.
- **Artistic interpretation:** none. Similarity to production I is not a success criterion.

**Smallest next question, only if UPDATE is reopened:** should a still-E-qualified cell that has dropped out of current F remain eligible to an episode at all? The current evidence does not answer that semantic choice and does not justify implementing incumbency.

## Decision labels

- **A — allocation explains most turnover:** not supported; P1 has no allocation changes, and P2’s fixed/stateless mean adjacent Jaccard differs by 0.0183.
- **B — local re-capture turnover remains outside E invalidation or F thinning:** this is not the dominant observed pattern; 147/162 fixed-X losses were current E but absent from F. No quantitative significance threshold was registered.
- **C — nucleus invalidates early:** not observed; n0 remains edge-bearing at all 42 anchors.
- **D — MIXED:** selected as a descriptive label from the requested categories. P1 has no allocation contribution; P2 has a limited four-transition reallocation contribution. Preserve the event difference without turning it into a general allocation or retention rule.

No prior source→boundary reach, maturation, birth-gap, refractory, contact, body, descriptor, COMMIT, or geology gate is transferred to X.
