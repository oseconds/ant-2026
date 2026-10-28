# Validation and omissions

## Replay and provenance

- Replayed current production ANT at seed `20261005`, 60 Hz, Audio Off, through tick 6,361 (P2 commit). The run uses the normal seeded controller and adds no causal state, observer callback, random call, or input mutation.
- All 11 production `src/` hashes from the frozen current-G packet matched the current checkout. The history packet's production source main is `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`, an ancestor of the specified production authority; the current source blobs are identical.
- `Math.random` was replaced with a throwing guard during the replay; observed calls: 0. Seeded RNG state/call receipts at P1 and P2 are retained in `analysis.json`.
- P1/P2 commit IDs, exact timestamps, source/target, centerline, selected edges, principal path and immutable mask bytes match frozen inputs. Mask SHA-256 values are `3a5a0f5a7252a19e54ce1db0666226e5fd3a4382d6fda0bb4ba8dcc0ce2417ce` and `099d4f6d1bbe81e814cab9fd8b16369ef6fbc6e900cb203a9f2424656e803a74`.
- At both commits, chemical memory, SurfaceField, support, selected-I, principal-path and frozen-first-Plate map values match the corresponding frozen input/history map arrays exactly.
- The ordered current-G foot-contact payload stream through P2 matches the compact frozen prefix exactly: 3,655 contact groups, 10,849 individual feet, SHA-256 `19bb340be61cf74a8e868d541df11e3b57e8e7427092eb89dd125f52b3de8eaf`. P1 and P2 window contact digests also match exactly.

## Measurement and atlas checks

- The exact event windows cover 1,200 controller ticks each.
- Each associated motion row is derived directly from adjacent tick positions. The heading-change / angular-velocity identity is asserted per sample.
- Production clips observed contact segments at the normalized world boundary. Six P2 raw state endpoints cross that boundary; their spatial association midpoint and atlas segment use the exact in-world clipped endpoint, while raw endpoints and displacement vectors are retained. No P1 segment crosses it; clipping does not change direction angle.
- The event-wide single-direction countermodel is calculated from the actual world-frame movement resultant, then projected onto the same unambiguous sample tangents used by the observed axial-alignment mean. It is an in-sample descriptive countermodel, not an inferential null or an independent validation set.
- Discrete scaffold-axis changes across eligible turning pairs are detected from exact integer-grid edge-direction cross products, avoiding a floating-point zero threshold.
- Nearest-edge tangent ties use exact equality of computed squared distances (`d2 === best`) with no tolerance. Near-equal mathematical ties affected by floating-point rounding may remain unmarked; the ambiguity counts therefore describe exact-double ties only.
- `node --check scripts/ant-traffic-direction-signal-audit.js` passed.
- The runner was executed once to create the capture and a second time with `--check`; the second run matched the compressed motion samples byte-for-byte and matched analysis JSON / atlas HTML after CRLF-to-LF normalization. All passed.
- Atlas checks assert that displayed SVG counts equal the analysis values for every selected I edge, actual movement sample, degree-3-or-higher junction and non-node geometric crossing. Tables and junction/orientation details are generated from the same analysis object.

## Limits

- Frozen current-G data contains no saved 60 Hz ant kinematics, so direct positional parity at every tick is unavailable. Replay parity is established with exact current production source hashes, full ordered contact prefix, commit receipts/masks, and event-time chemical/surface/support/scaffold maps.
- The 60 Hz traces are discrete controller motion, not sub-tick continuous paths. `angularVelocity` is the production heading update and often reaches the existing 4.5 rad/s cap.
- Consecutive samples from one ant are serially dependent. Resultants and quantiles are descriptive; no independent-sample confidence interval or population claim is made.
- The 96-grid I edges are discrete straight segments. Curvature is unsmoothed grid geometry; sub-grid curvature is not inferred.
- Only one seed and two unmatched materialization events are included. No natural-run generality, body law, sonic consequence, artistic preference or production readiness is established.
- No full repository test suite or build was run; the pass adds isolated research tooling and evidence only.
