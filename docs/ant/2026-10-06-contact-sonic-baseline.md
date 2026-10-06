# ANT direct-contact sonic baseline

2026-10-06 Asia/Seoul. Starting local/remote main: `2d9430bcc5a1d76d6f42d0aa99e905a6792177ad`. Working tree was clean. Starting tests: 227/227; build: pass.

This pass changes only direct exposed-Plate contact excitation. ANT behavior, event generation/routing, SurfaceField, immutable births, stratigraphy, Z springs, Sphere/nodules, sleep, pickups, renderer, output gain and limiter remain unchanged. There is no runtime optimization or behavior feedback. The controlled single-Plate topology exists only in the evidence/test harness.

## Finite force

The old Gaussian spatial kernel produces nodal discrete velocity increments `dv_i = strength * w_i / sqrt(sum(w²)) / sqrt(density)`. Instead of changing all nodal velocities immediately, the same increments are scheduled over 18 physics steps at the unchanged 6000 Hz rate: 3 ms.

The force weights are `h[s] = sin(pi*(s+0.5)/18) / sum(h)`, s=0..17. Their discrete sum is one. Before each unchanged Plate recurrence, the corresponding fraction is integrated as `previous[i] -= dv_i*h[s]`. An isolated fresh individual strike therefore preserves its old signed per-node impulse within Float32 rounding. The temporal distribution changes, so resonant output RMS/peak need not be identical.

A preallocated step-major Float32 ring has 18 slots per compiled node. Overlapping contacts add their force contributions; there is no event pool ceiling, rate limiter, event discarding or global gate. The ring cursor persists across audio quanta and topology recompiles. No new allocation occurs in process() or its force-step helper. The ring is an excitation buffer, not a runtime-frontier optimization.

## Short local mechanical recovery

Each physical Plate node has its own recent load memory m in [0,1] and a last-contact physics-step timestamp. On contact:

```
m = m * exp(-(currentPhysicsStep-lastContactStep)/(6000*0.075))
transfer = 1 - 0.25*m
load = min(1, abs(dv_i)/0.020)
m = m + (1-m)*load
scheduled_dv_i = dv_i*transfer
```

75 ms is the midpoint of the requested 50–100 ms recovery range. 0.020 is an internal nodal velocity-increment reference comparable to the existing nominal 0.035 tripod budget divided by sqrt(3); it is not a calibrated force or loudness target. Maximum new impulse reduction is restrained at 25% amplitude, so transfer stays between 0.75 and 1. There is no subsequent energy renormalization to undo this compliance.

Memory lives on the contacted material and follows the existing Gaussian footprint. Unloaded distant nodes and newly born material start fresh. Nearby feet within one tripod can share a region and mechanically load it in sequence; the group is still routed and counted in full. Recovery depends on audio physics time, not wall time, ant identity, event ordinal, output energy or colony state. Existing resonance is retained rather than reset.

The unchanged bridge still validates every real FOOT_CONTACT, routes only exposed material, divides the group budget across valid feet, preserves unsupported shares, and applies its existing L2 bound. Node compliance can reduce that input budget and cannot increase it. Buried Plate and Sphere input paths still operate through existing coupling.

## Lifecycle and regression

Same-ID, same-geometry topology installation copies pending pulse slots, cursor and local load state along with existing vibration state. New or changed geometry starts with fresh excitation memory. Stop/destroy clears pending force and short contact memory; historical material remains managed by the unchanged controller/lifecycle.

The numerical Plate, Z, Sphere and sleep equations are unchanged. A golden test using the committed pre-pass worklet proves exact sample/state equality when identical Plate/Z/Sphere state evolves without direct foot input. Existing collision/gait/pheromone/colony tests continue to pass.

The original spatial-footprint test now measures the integrated queued impulse distribution rather than an immediate velocity jump. Seven new focused tests check the 18-step shape and old impulse sum, local attenuation/recovery/distant response, every accepted strike with zero drops, pending state across topology changes, stop/no replay, three sample rates and split quanta, and no-contact golden recurrence parity.

Final suite: 234/234, zero failures/skips. Build and installed Chrome development/production lifecycle checks passed. All tracked src files, generic Plate/Sphere DSP and existing fixed-scale renderer are unchanged from the starting HEAD. Historical evidence is unchanged.

## A/B evidence and interpretation

[New evidence index](evidence/2026-10-06-contact-sonic-baseline/README.md) contains the actual Chrome OfflineAudioContext/AudioWorklet stereo output, four ten-second WAV files, aligned fixed-scale comparison, frame/payload hashes, contact counts and PCM statistics. This is a deterministic controlled audio experiment, not a realtime performance benchmark or a new natural material history.

A uses the exact committed instantaneous worklet. B uses the new production worklet. Both process the same 154–164 s recorded natural FOOT_CONTACT window through the same production bridge, one frozen Plate, zero Z links/nodules, 48 kHz and final gain 0.245 (35% Volume). The sparse harness subset is deterministic and identical between A/B; no such thinning is added to production.

Dense A/B: 648 groups, 1916 valid individual feet, 242 routed/applied strikes in each. Sparse A/B: 10 groups, 30 feet, 4 routed/applied strikes in each. No non-finite sample or PCM clipping appears in any capture.

The change reduces peak/RMS and a first-difference slope proxy, with a modest increase in 50 ms envelope variation, chiefly on the left channel. Lower slope is not a measured high-frequency band-energy result; much of the fixed spectrogram already lies at its -100 dBFS floor. This is limited objective support for softer excitation and slightly less uniform amplitude, not proof that the dense resonant wash has become clearly separated footsteps. Human listening has not been assessed by the harness. Constants were not retuned to manufacture a dramatic contrast.
