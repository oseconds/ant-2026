# Scope and analysis plan

## Question

During the actual P1/P2 materialization windows, does ant movement direction, opposition, branch use and turning add spatial-temporal information beyond the selected connection scaffold I's local tangent and curvature?

This is a measurement pass, not a Plate body generator. The only final labels are `REDUNDANT / LOW-INDEPENDENCE`, `INDEPENDENT INFORMATION OBSERVED`, or `INSUFFICIENT EVIDENCE`.

## Frozen baseline and cases

- Production authority: main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `05012e1b02acb565b9e7f6c2c9076b48be337f39`.
- Frozen current-G/H0 history source: packet blob at `0d5096a920e1ebb2086fa1dae782c5d4e871b590`; its ANT production source hashes match the current main source files used by the replay.
- Seed `20261005`, 60 Hz, Audio Off; no seed, parameter, or production-state sweep.
- P1 start and commit: `64016.66666666308 ms` to `84016.66666666823 ms`.
- P2 start and commit: `86016.66666666881 ms` to `106016.66666667463 ms`.
- The exact anchors come from the frozen ownership/materialization event inputs, not the rounded request summary.

The frozen packet has one-second selector/environment analyses and foot-contact records, but no ant position/velocity/heading history at 60 Hz. A deterministic reconstruction from the current production source is therefore necessary for the requested movement and turning measurements. The run stops at the exact P2 commit tick.

## Primary spatial reference

- Use the actual selected I nodes and edges from each frozen Plate descriptor. Coordinates are 96-grid cell centers divided by 95.
- The principal path is displayed only as a secondary reference; it does not replace network I.
- For each actual realized movement segment, associate its midpoint to the nearest point on an actual I edge.
- Where a state endpoint crosses the world boundary, use the exact in-world observed segment end used by production contact observation for the association midpoint and atlas line. Retain the raw state endpoint and raw displacement vector; clipping only limits the spatially observed segment and does not alter its direction ray.
- `r1 = 0.030` is the primary context range; `r0 = 0.012` is the fixed sensitivity check. Both reuse the authored TrailPlate width bounds. No intermediate radius is searched.
- The primary movement orientation is the realized displacement vector between consecutive 60 Hz positions. Heading and angular velocity are recorded separately.
- Edge axes are unoriented for axial comparisons. Signed projection uses ascending node index only as a canonical coordinate convention. It is not an intrinsic travel direction.
- Exact nearest-distance ties with distinct integer-grid edge axes are marked tangent-ambiguous and excluded from tangent comparisons. They remain in local movement summaries. No junction tangent is forced.

## Measurements

Keep the following measures separate:

1. Continuous actual movement angle relative to local scaffold tangent, including signed cosine, absolute cosine, absolute cross-axis component, and the full absolute axial-angle distribution.
2. Directional resultant `Rd` and axial resultant `Ra`, both globally pooled and per edge. One-sample edge resultants are retained with their counts but are not treated as evidence of coherence.
3. Exact scaffold orientation groups (horizontal, vertical, diagonal down-left, diagonal down-right). These compare actual traffic organizations within repeated local tangent classes without fitted neighborhoods.
4. Every degree-3-or-higher graph junction: movement within `r1`, unique incident-edge use, and continuous outward projection for each branch. Also enumerate all non-node geometric edge crossings, including empty-traffic cases.
5. Actual per-tick heading change, angular velocity, realized movement-direction change, unsmoothed degree-2 scaffold curvature, and paired same-edge/degree-2 edge-transition values. Do not interpolate turning between ticks.

No binary angular cutoff, effect-size cutoff, smoothing, eventwise normalization, fitted neighborhood, or selected-junction subset is used. The event rows and every edge/junction value stay in `analysis.json` and the compressed motion packet.

## Boundaries

No W/U edits, body mask, ellipse/disc/anisotropic prototype, new production state, material law, additional seed, long-horizon run, audio render/listening, lifecycle redesign, or gait change. An independent movement signal, if found, stops at measurement; a later role-isolated interpretation remains a separate question.
