# ANT material interfaces after stratigraphy

This is a design record, not an implementation of filament, erosion, fracture or granular audio. It extends the environmental system only. ANT movement, intent, chemical sensing and behavior RNG remain independent.

## Immutable origin, mutable lifecycle, compiled runtime

All materials retain immutable origin descriptors: id, simulation birth time, world geometry, physical material, provenance and observation points. `MaterialStratigraphy` owns later spatial relationships. Age is elapsed simulation time; depth is material accumulated above a location. Exposure is the top accessible material in a local column. A future exhumation edit would change columns and compile a new topology, without rewriting a Plate's origin geometry.

The shared ANT transport receives environmental topology revisions. A compiler converts readable descriptors into validated packed arrays outside DSP integration. The existing AudioEngine and one environmental worklet own all resonant states. Stable material ids preserve vibration across recompilation; immutable geometry and provenance survive physical sleep. Contact routing addresses exposed material rather than a per-ant voice.

## Future persistent filament

A narrow repeatedly contacted tensile corridor might qualify for a String-like structure through local width, directional continuity, tension and loading. Lateral reinforcement/widening may support a Plate transition. Qualification must use accumulated material evidence and simulated persistence rather than a named ant behavior, musical trigger or random timer.

A future filament descriptor should expose centerline, rest lengths, mass per length, tensile stiffness/tension, damping, endpoint constraints and embedded pickup locations. The compiler can add packed 1D neighbor/constraint arrays and contact kernels to the same worklet. Reciprocal attachment springs connect the filament to adjacent material in its actual local Z relationship. The standalone StringModel's temporary main-thread AudioBuffer voices are not an ANT implementation template.

## Future fracture and particulate memory

String rupture, Plate fracture/erosion or Sphere fracture could produce material fragments. A future transition needs a local mechanical criterion and mass/energy accounting: the parent loses the separated material, fragments inherit bounded mass/stiffness/damping and the release impulse cannot create energy without bound. No fracture threshold is active in this pass.

Particulate acoustics should use a bounded shared pool of inexpensive persistent micro-resonators inside the environmental worklet. The pool must report capacity and preserve a compact material/provenance record even when individual integration sleeps. It should not create one WebAudio node per grain, decorate a trail with grain sounds, or impose tempo/scales. Contact, collision, binding and breakup would define timing.

## Required contracts for later transitions

- Deterministic simulation-time qualification with no behavior RNG.
- Explicit spatial extent, depth/exposure and provenance of source material ids.
- Reciprocal bounded coupling and conserved or dissipated mass/energy budgets.
- Dirty topology revisions compiled outside audio hot loops.
- Stable ids, sleep/wake accounting and explicit technical capacities without silent eviction.
- New evidence directories, real synchronized browser motion/stereo output, and the immutable grayscale audio renderer preset.

These interfaces leave room for later experiments. None of the proposed macro outcomes is programmed or asserted here.
