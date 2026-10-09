# W1 spatiotemporal local-coherence audit — design boundary

## Question

Do the existing eligible terminated supported spells become less fragmented when adjacent cells are connected only where their supported activity was observed at the same archived sample? Does that rule instead chain them into a giant retrospective component?

This is a read-only analysis of the three frozen seeds `20261005`, `20261006`, and `20261007`, ending at the archived observation `599.2500000000696 s`. It starts from verified branch HEAD `5a2afd2ae8ea21929fe2b0430b3b0a1462f616da`. It does not rerun natural ANT or change the original W1 model, max-overlap split/merge/closure, q, 20/90 s EMAs, active mask, movement, DAB, FOOT_CONTACT, production, audio, or feedback.

## Nodes and edges

- A node is one already-recorded cell-local spell that is eligible under the existing 20 s persistence rule and has an observed termination frame. It retains the archived start frame, last supported frame, termination frame, and their exact times.
- Supported means the existing `q === 1 && active === 1` mask. The interval from start through last-supported frame is an interval of archived adjacent observations; activity between observations is not inferred.
- An edge exists only for distinct cells that are 8-neighbors in the 96×96 grid and share at least one identical archived frame where both cells have `q === 1 && active === 1`. Every frame counted on an edge is checked against the source flags and active mask. Spell termination times need not match.
- A spell never connects directly to another spell in the same cell. There is no time-gap tolerance, weighted edge, morphology rule, or size veto.
- A connected component is a retrospective activity-history group. It does not claim that all member cells were simultaneously active, and it is not a material episode, Plate, or formation event.

## Prefix and censoring rules

The graph is replayed forward by observation frame. A node enters only on its observed termination, and an edge enters when both endpoint spells have terminated; future graph information is never projected backward. The four requested cutoffs use the nearest archived sample to `120`, `300`, `480`, and `599.25 s`. Other open q-and-active spells are retained in a separate right-censored table with their actual observed duration. They are not force-terminated. Potential concurrent pairs between censored spells and already-eligible completed neighbors are reported as excluded sensitivity counts, not graph edges.

The prior same-frame local events and 32,252 spell records are reconstructed and compared exactly. The original W1 and max-overlap outputs, per-cell geometry/character, and all 1,797 matched q/EMA/active observations remain deep-equal. ID 0's archived historical union is compared at each prefix without using it to make edges.

## Output and interpretation boundary

`results/` contains compact machine-readable analysis, every observed concurrent-support edge, component rows for each causal prefix, right-censored spells, and the full observation timeline. `plots/` contains fixed-scale 96×96 cell maps, representative group footprints, component-size and concurrent-overlap distributions, and the time series. Geometry marks only archived cells; the plots draw no inferred spatial paths or interpolated cells.

The graph changes no existing event or union. q retains cumulative contact qualification and the active mask retains EMA carry-over, so shared supported observations establish only that the archived predicates coincided. They do not establish present physical loading, material cohesion, or physical birth.
