# Candidate G production-candidate review protocol

## Frozen question

Does integrating qualified Candidate G as the production `PheromoneField` default preserve its field/cue behavior, public source-dose semantics, diagnostic honesty and consumer compatibility, and does the production-shaped implementation conform to the saved three-seed natural G result without a blocking runtime regression?

This review does not adopt or merge G. It does not tune movement, sensing, deposition, material, Plate or audio behavior.

## Baseline and input authority

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research decision commit: `c45e1845bd86a5a6f1082b5c67ef6f521cd860c1`.
- Qualified fixed-cue G result: `336e8dc6e680ff5de3c256e50596581797ce0907`.
- Qualified natural movement G result: the same research series, with 600 simulated seconds at 60 Hz for seeds `20261005`, `20261006`, and `20261007`.
- The research branches are input evidence only. No research branch is merged into this candidate branch.

## Candidate contract

Use the exact qualified G contract: 316×316 Float32 node values; normalized `[0,1]²`; 15 s half-life; cap 8; Gaussian radius `0.0045`, sigma `0.00225`; ordinary bilinear reads; and internal source-dose conversion `S=3969/361=10.994459833795014`. Authored input and public returns stay in the existing source-dose convention. The returned value is not the capped stored increment. Boundary truncation/renormalization and cap loss remain unchanged.

The comparable diagnostic is the integral of the bilinear reconstructed nodal field, including half-weight edge nodes and quarter-weight corners. `nodeSum` and legacy `totalMass` remain native nodal coefficient sums; they are not physical mass. The UI must label the reconstructed integral.

No consumer gets a private divide-by-S or threshold change. Local/far sensing, ColonyActivation, TrailPlateBirth's 96×96 analysis grid, renderer fixed absolute mapping, movement, recruitment, materials and audio remain otherwise unchanged.

## Validation fixed before natural conformance

1. Recreate the 24 frozen G raster arms from the pinned physical write streams with the production `PheromoneField` implementation. Require exact raster SHA parity and exact equality for all 99,792 local and 138,600 wide frozen raw reads.
2. Run 600 simulated seconds at 60 Hz for the three frozen seeds, Audio Off. Same-seed initial-state identity is required. Post-divergence RNG/trajectory parity is not required. The state observer must leave state and RNG unchanged. Recent-window occupancy uses the corrected per-second 60 Hz bucket reset; invalid legacy movement-shadow recent arrays are excluded.
3. Record population, realized travel, occupancy, response, field/cap, Plate, contact and source-dose summaries against saved G. This is conformance, not a new morphology acceptance threshold.
4. Run the targeted ANT field/deposition/controller/activation/TrailPlateBirth/renderer tests, the full test suite and `npm run build`. Do not weaken a behavioral test to accommodate G.
5. Run a headed Audio-Off production browser screen after a 600 simulated-second warm-up, then a bounded longer Audio-Off soak if available. Preserve wall/simulation clocks, RAF gaps, field/decay/snapshot/controller/render costs, heap samples, Plate range and browser errors.

## Stop and decision rules

- Any scientific mismatch against the exact fixed raster/query outputs must be explained before claiming G conformance.
- Any existing behavioral test failure is reported as a candidate blocker unless it encodes only the intentionally changed source-dose or diagnostic contract. Behavioral expectations are not relaxed.
- A full-suite/build, natural-run, browser, API or consumer blocker prevents a READY conclusion.
- The result can be READY only for the user's later adoption decision; no merge, production adoption or PR is part of this pass.
- No second representation or behavior candidate will be tested.
