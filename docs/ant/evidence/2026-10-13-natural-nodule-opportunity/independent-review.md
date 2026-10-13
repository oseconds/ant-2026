# Independent review — natural Nodule opportunity census

**Verdict: MIXED; no blocking validity issue for this bounded decision.** The reviewer concluded that the evidence shows strong spatial exclusion among qualified cells and actual matured timers, plus real cap censoring after each run reaches 32 Nodules. It does not show complete spatial closure: A cells remain at cap crossing and at 600 seconds.

The review independently inspected the current runner and focused tests, production logic, the completed three-seed output, the committed canonical replay, and the fixed 400–460 s evidence. It verified that production source is unchanged and the run-manifest runner hash matches the current script.

## Findings

- The runner's Q census matches production: four overlapping Plates, three buried layers, compaction `>=0.55`, and local FOOT_CONTACT load `>=200`. Production persistence is 30 s, sampled at least once per second; a gap over two seconds resets timers. The strict nearby predicate is `distance < nodule.radius + 0.028`.
- A is Q that is spatially unblocked by that exact predicate. Nearby-cell counts are geometry, not actual rejections. Maturity calls and rejections are recorded only at actual production timer checks; every non-near maturity corresponds to a production birth.
- At cap, the observer records the actual production early return and verifies timer clearing. Post-cap rows omit timer events and active timers. Clock-end census is separate from a production evaluation and contains no hypothetical timer.
- Per-seed cap results are 553,383 / 515,900 / 546,267 ms; pre-birth → post-birth Q/A are 765/21→765/19, 599/6→599/5, and 765/15→765/13. First cap early returns clear 761 / 595 / 761 active timers. Post-cap evaluations are 45 / 82 / 52. Last production and 600 s clock-end Q/A counts remain separate.
- Actual maturity / nearby-rejection / birth counts are 1513/1481/32, 903/871/32, and 1377/1345/32. Across seeds, 3,697 of 3,793 actual maturity calls were nearby rejections and 96 were births.
- Observer Off/On normalized state hashes match at each actual evaluation and at final state. Per-tick RNG traces and evaluation times match. All canonical replay fields other than `ownStateV8Sha256` match, and normalized final state digests match the production-only control. V8 serialization hashes differ for observer runs; the byte-level cause remains unisolated, and the manifest does not use this hash as state-parity evidence.
- For the prior fixed-window dataset, 31/32 target cells were nearby at clock end; all 27 active timers were nearby. The only non-near cell was seed `20261006`, cell 2921, with compaction below threshold and no timer. Actual production nearby rejections were 0/5/1 by seed, six total; the geometry count is not rejection evidence.

The review did not run additional simulations or modify files. It does not support a cap-free counterfactual, future birth claim, or conclusion beyond 600 seconds.
