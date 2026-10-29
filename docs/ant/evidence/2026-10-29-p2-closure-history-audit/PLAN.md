# P2 closure-history audit — frozen comparison plan

## Question and authority

Determine whether the exact enclosure selected in the 2026-10-29 joint scope–BODY evidence first appears in P2 qualified support at the 105.016666667 to 106.016666667 second transition, or only in a later representation.

Production authority is main 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785. The dedicated research branch starts at parent a518a76bddd416a074cc3ee1d1d12c90d08bff15. The only event is current-G/H0, seed 20261005, 60 Hz, Audio Off, P2.

## Frozen face

No face is reselected. Import the exact 80-cell background region and 80-cell H boundary arrays from the P2 closure record in the parent joint-scope analysis. That record chose the largest non-edge eight-neighbor background component of P2 COMMIT H, with cell order as tie-break; boundary means its adjacent H cells under the same eight-neighbor grid relation.

Recompute that parent rule only as a consistency assertion. Any mismatch stops the analysis. Do not search another face, enlarge the face, or optimize an adjacency rule.

## Measurements

Use the exact saved E_qualified and H_boundary_length_eligible membership arrays from the frozen structural packet at the two adjacent recorded anchors. The production foreground connectivity is eight-neighbor; also report four-neighbor foreground sensitivity. For the fixed face, preserve E/H membership, boundary connectivity, and complement components under both four- and eight-neighbor background relations. This reports raster conventions separately rather than choosing whichever gives a clearer closure.

Report full-field E/H additions and removals, exact changes inside the face/boundary neighborhood, and the selected I membership at each anchor. Show descriptor adjacency only as a later representation. Do not use its cycle rank, BODY holes, or a new fill as closure evidence.

The atlas has four panels: E and H at each anchor, one crop computed from the frozen face/boundary bounding box plus a fixed four-cell margin. The frozen face and boundary are overlaid consistently; exact E/H change cells are marked. No shading, morphology, smoothing, or gain tuning is used.

## Interpretation gates

- Support closure transition: E itself changes around the frozen face so that the relevant support boundary first becomes connected/enclosing at the later anchor, under production-valid support adjacency.
- Representation-only: the same qualified-support boundary/face relation already exists at the earlier anchor and only a later representation changes its apparent enclosure.
- Insufficient/ambiguous: exact E is unavailable, or the local closure classification changes across equally justified connectivity conventions.

The joint evidence's face-specific history question is not converted into a timer or router. A COMMIT-snapshot operation remains a separate authored choice.

## Validation and stop

Verify source and frozen-input hashes, exact anchor timestamps, parent face coordinates, deterministic analysis and atlas bytes, displayed cell values, and no-RNG behavior. The saved states are approximately one second apart; no interpolation or per-tick claim is allowed.

No replay, body generation, face fill, mode router, production change, audio, additional event, long run, or adoption.
