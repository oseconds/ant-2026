# Base/Born implementation responsibilities

Source audit before shadow construction. Production `src/` and `static/` at research baseline `2a65dc892f96fef2254afdb3c0621e3023e67c0b` match fetched `origin/main` `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`.

| Responsibility | Current generic Base | Current Born surface Plate | Causal boundary |
| --- | --- | --- | --- |
| Temporal input | One previous-displacement decrement at strike dispatch | Same velocity-increment mechanism, spread over 18 normalized half-sine steps / 3 ms | Equal summed impulse does not imply equal work or output level. Historical Base dispatch was block-rounded; new controlled schedules separate that latency. |
| Spatial footprint | Point Gaussian, sigma 0.72 generic-grid cells, 7×7 window | Integrated Gaussian over Born node cells, sigma 0.009–0.014 world units, L2-normalized | Generic world-to-grid slope gives sigma ≈0.0758 ANT-world units at normal quality. Literal grid-kernel and world-width translations answer different questions. Neither establishes physical equivalence. |
| Group semantics and strength | One validated tripod centroid; square-to-disk coordinates; amplitude `0.01 + 0.24 * strength` | One exposed route per supported foot, group strength shared in L2; delivered impulse divided by sqrt(density) | Different event counts, locations and normalization. A centroid can fall outside a Born mask. Do not invent a matched natural group replay. |
| Strike jitter | Independent per-node `0.92 + 0.16 * Math.random()` | None | New diagnostic draws must be deterministic and recorded. Normalize the spatial vector for texture-only tests; this differs from generic jitter's incidental level variation. |
| Elastic recurrence | Masked four-neighbor Laplacian and its square; tension/bending terms | Same stencil family and core second-order recurrence; tension divided by density | No distinct generic solver principle is demonstrated by the source. Elastic coefficient/rate laws and boundary geometry differ. |
| Loss | Uniform velocity loss plus `gamma * (L current - L previous)` | Uniform velocity loss, frozen-material coefficient multiplied by 50 | The extra generic term creates modal loss proportional to spatial eigenvalue q. Uniform magnitude and frequency slope are separate controls. |
| Rate and coefficient law | One update per audio sample, ordinarily 48 kHz; coefficients depend on radius/quality and sample rate | Fixed 6 kHz physics, descriptor-derived coefficients | A numeric RATE swap changes the intended elastic law. A rate-aware sensitivity must rescale stiffness/tension, loss and discrete velocity-input units. |
| Geometry/topology | One 17×17 circular mask at normal quality, radius 7.3, 177 occupied nodes | Frozen 96-grid masks compiled to sparse 32-grid nodes; optional Z/Nodule links | Isolate Born geometry for responsibility transfer. Circular reference remains a different domain, not a production candidate. |
| Pickup/observation | Fixed stereo disk pickups `(-0.32,-0.18)` and `(0.32,-0.18)` | Two principal-path pickups snapped to occupied nodes | Point observations weight modes differently. Keep Born pickups fixed for causal shadows; compare summed-field power separately. |
| Readout/limiter | Displacement ×8, then `x/(1+abs(x))` | Plate displacement ×1, same limiter, then 6→48 kHz interpolation | Gain before a nonlinear limiter can alter character as well as level. Measure field, unscaled pickups and pre/post-limiter signals. |
| Bridge output | Optional, default Off; `.7 * master * .015` | `.7 * master` | External gain is level-only. Historical Born pickup mix was 1/sqrt(12), making old total-gap attribution stale for current readout. |
| Compliance/coupling | No local contact recovery or stratigraphy coupling | 75 ms local recovery, bounded 25% compliance loss; Z/Nodule support | Preserve Born compliance in isolated shadows. Do not reopen coupling or runtime optimization. |

Exact isolated all-active modal recurrence, with `-L` eigenvalue q:

```text
Born:    x[n+1] = (2 - d - b*q² - tau*q) x[n] - (1-d) x[n-1]
Generic: x[n+1] = (2 - d - gamma*q - b*q² - tau*q) x[n]
                    - (1-d-gamma*q) x[n-1]
```

Strikes edit previous state before recurrence. The generic frequency-loss input contribution therefore also sees the changed previous Laplacian. A Born shadow computes that Laplacian from the current previous-state array, not a stale cache.

At actual current Base normal-quality parameters (stiffness 0.92, processor damping 100, 48 kHz), `b=0.01041070909374015`, `tau=0.0012476847034339226`, `d=0.000178`, `gamma=0.0000616140594288357`. Uniform loss per second is approximately `d*Fs=8.544`; the frequency-loss slope is `gamma*Fs=2.9574748526` per q. Amplitude decay rate is approximately half that velocity-loss rate, with the exact pole radius recorded by the equation audit.

Selected Born uniform velocity loss per second is approximately 4.60–4.62. Generic and Born bending coefficients look numerically close, but act at different step rates and on different domains. Comparing their raw coefficient numbers is not a physical or perceptual equivalence argument.

Sources: [generic worklet](../../../../static/worklets/plate.worklet.js), [Born worklet](../../../../static/worklets/surface-plate.worklet.js), [legacy bridge](../../../../src/lib/audio/AntAudioBridge.js), [environment bridge](../../../../src/lib/audio/AntEnvironmentAudioBridge.js), [Born bridge](../../../../src/lib/audio/SurfaceAudioBridge.js), [compiler](../../../../src/lib/audio/compileSurfaceTopology.js), [Plate config serialization](../../../../src/lib/models/plate/PlateModel.js), [prior investigation](../2026-10-13-plate-sonic-individuality/README.md).

Historical fact: the matched Base/Born P1 gap retains a residual transfer bundle, not a solver constant. The exact historic generic random realization was unrecorded. New shadow results must not be used to retrospectively identify that realization or assign its +7.680 dB residual to one term.
