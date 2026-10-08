# 2026-10-08 — Interior endpoint shadow selector

Started `ant-interior-endpoint-shadow-selector` from fetched `origin/main` at `746af8fb72f1bc835115d6886bdab001b2a638d7`. Read the ANT guide, prior movement/material morphology audit, and daily chronology; invoked the installed `caveman` skill. The production selector and frozen ANT behavior stayed unchanged.

The experiment tested whether admitting source-connected, non-boundary skeleton graph endpoints changes which supported morphology can be selected. The shadow used the existing source annulus, weighted Dijkstra and path tie-breaking, production boundary targets, and 0.30 geodesic floor. It did not sample endpoints or alter source-selection rules. On every analysis where both selectors returned candidates, the chosen source cell matched.

Ran all three frozen seeds for 600 s. There were 599 qualification analyses and 36,001 paired tick rows including initialization per seed. Instrumented-versus-plain parity matched across agents, RNG, chemical and mechanical fields, chemical memory, candidate/birth state, contact counts, raw contacts, births, and lifecycle. Complete trajectories, ordered FOOT_CONTACT groups, and birth descriptors matched each committed archive exactly.

The shadow selected 40 / 52 / 61 additional candidates where production selected none. Among paired candidates, all selected geometries differed; median retained network additions were 278 / 287 / 294 skeleton cells, and median footprint increases were 0.086 / 0.090 / 0.093 normalized area. Endpoint and junction proxies increased. Principal-path geodesic-length and tortuosity median deltas were zero in each seed, so the effect is clearest in retained branch network and spatial footprint rather than the median principal route.

Persistence qualified 519 / 524 / 522 of 559 / 544 / 552 shadow candidate observations. The separate scheduler reached a virtual-birth-ready state 44 / 48 / 44 times. Global gap and same-corridor refractory were the main first-failure gates. These are repeated one-second diagnostic observations, not actual Plates or independent samples.

Three fixed-scale plots show a largest added network, highest measured 0.10-scale curvature, and smallest observed shadow footprint among changed paired candidates. No exact unchanged-candidate example existed; no-candidate frames were not plotted. The result supports the narrow observation that boundary eligibility suppresses source-connected interior history in these runs, but it does not establish that the larger networks fit the intended material scale.

Tooling commit: `b9e08961a5e47e4ce7531bce87902fc81b9a8dd8`. Focused tests passed 14/14; full suite passed 292/292; build passed with existing dependency annotation and chunk-size warnings. Production `src/` files were untouched. The final report records the separate evidence commit and verified remote branch SHA.

Decision: stop after this one shadow-selector comparison. Preserve the results for review; make no production selector, movement, width, material, stratigraphy, or audio change.

[Evidence package](../evidence/2026-10-08-interior-endpoint-shadow/README.md) · [Replay verification](../evidence/2026-10-08-interior-endpoint-shadow/data/replay-verification.json)
