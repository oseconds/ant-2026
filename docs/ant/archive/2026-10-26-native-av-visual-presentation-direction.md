# ANT — Native AV visual presentation direction review (2026-10-26)

> **Status:** archived visual/review synthesis / next-pass rationale / **not a production adoption**  
> **Current main at archive time:** `4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b`  
> **Current-G AV observation:** research branch `codex/ant-g-native-av-observation-20261026`, retained result `c18f62ab1ac096e4e713335283d51a56ae1b11c8`  
> **Heading/founder survey:** research branch `codex/ant-recruitment-founder-survey-20261022`, final `046b21cb083ec167352afdeed206466af8eeba04`  
> **Production changes in this archive pass:** none.

This document preserves the design reasoning that followed the first current-G native audiovisual observation. It separates verified implementation/evidence from Argon/Astra review interpretation and records the small renderer experiment selected for the next pass. It is historical provenance, not a replacement for [the current ANT hub](../README.md), current `main` source, or evidence packages. Ordinary implementation work should continue to ignore `archive/**` unless historical context is explicitly requested.

## 1. What the first current-G viewing actually established

The retained native AV acquisition used current G production with seed `20261005`, default 640×640 renderer, Full Physics, Base Substrate Off and Audio On from model start. The first Plate occurred at model 84.0167 s, approximately media 86.2591 s. The retained capture ends 30 model seconds later with two Plates and no Nodules.

The artist's unlabelled first response began by following individual ants, then widened to the population/canvas after the followed ant left the frame. The visible gaster trail was described as looking like excretion; darker trails were associated perceptually with more decisive straight movement. Audible onset was noticed near media 1:26, but its cause, location and relation to ants were not identifiable. An upper-canvas goal-like impression also emerged.

Post-hoc evidence supports only bounded statements:

- the reported sound onset coincided with the first material-enabled excitation opportunity;
- the first Plate and first exposed-Plate strike were close in time, but millisecond ordering across model/media/audio clocks is unresolved;
- no individual foot, Plate identity, retained-history age, source location, or coherent global sounding-body interpretation was established;
- the visible gaster deposit and the audible exposed-Plate foot excitation are different causal paths;
- the upper-goal impression is compatible with the current authored spawn condition and does not imply a global target.

Primary record:
- [current-G AV observation README](https://github.com/oseconds/ant-2026/blob/c18f62ab1ac096e4e713335283d51a56ae1b11c8/docs/ant/evidence/2026-10-26-g-native-av-observation/README.md)
- [first observation](https://github.com/oseconds/ant-2026/blob/c18f62ab1ac096e4e713335283d51a56ae1b11c8/docs/ant/evidence/2026-10-26-g-native-av-observation/FIRST-OBSERVATION.json)
- [post-hoc interpretation](https://github.com/oseconds/ant-2026/blob/c18f62ab1ac096e4e713335283d51a56ae1b11c8/docs/ant/evidence/2026-10-26-g-native-av-observation/POSTHOC.md)

## 2. Renderer fact behind the visual question

Current [AntRenderer](../../../src/lib/renderers/AntRenderer.js) draws frozen material before live pheromone. Material uses RGB 100 with alpha `min(21, 9 + layerCount * 1.25)`; the first visible layer is therefore deliberately faint. Pheromone uses a much stronger activity range, with `BASE_TRACE_ALPHA=22` and `ESTABLISHED_ROUTE_ALPHA=90`, and is composited over material.

The material alpha is a function of local layer count/presence, **not age**. Buried Plate identity, SurfaceField, Nodule state and individual stratigraphic history are not directly shown by the default renderer.

Therefore the verified problem is not “the renderer omits all history.” It is narrower:

> a retained material change can be structurally important while remaining perceptually weak beneath a visually stronger chemical trail that uses a similar grayscale/alpha language.

This motivates a renderer shadow. It does **not** prove that visual presentation is the only reason sound/place attribution was absent.

## 3. Heading is a separate known confound, not part of the renderer pass

Current production still recruits near `(0.5, 0.72)` with heading centered at `-π/2` and half-spread `0.3` rad.

The 2026-10-22 founder-condition survey tested baseline north, +π/2, reversal and isotropic accepted-spawn heading laws. Across three 600 s seeds the macro spatial distributions differed strongly. The survey therefore judged responsibility of the continuing fixed-heading component **SUPPORTED** within those runs. The fixed spawn-position component was not causally manipulated.

The subsequent pheromone-direct and 45 s pheromone-slow heading candidates tracked the isotropic control broadly and did not establish an additional temporal/spatial advantage. No new recruitment law was adopted. Actual outgoing-flow-conditioned heading was left as a possible later closed pass, conditional on a locked availability gate.

Stable report:
[recruitment/founder survey](https://github.com/oseconds/ant-2026/blob/046b21cb083ec167352afdeed206466af8eeba04/docs/ant/evidence/2026-10-22-recruitment-founder-survey/REPORT.md)

**Boundary for the visual experiment:** keep the production heading unchanged. Record whether a visual treatment makes the existing “upper goal / road network” impression stronger or weaker. Do not solve heading and rendering in the same pass.

## 4. Argon review — useful as an interpretive amplifier

Argon's visual review reframed the problem aggressively. Its most useful diagnosis was that ant, pheromone and retained material have different temporal/ontological roles while the current screen gives most salience to figure + immediate emission. It proposed that pheromone and material should stop sharing one grayscale-alpha language and explored three broad blueprints:

1. **Lithographic / monochrome palimpsest:** recognizable ants; weak single-pass pheromone; accumulated soft field; fixed material grain/contour.
2. **Warm trace → calcified relief:** restrained warm volatile trace versus cool retained surface, with stronger material metaphor.
3. **Dark-field inversion:** radical secondary reading in which material accumulation increasingly defines the visible world.

The review was valuable because it pushed beyond “increase material alpha” toward differences in spatial frequency, temporal stability, edge behavior, relief, negative space and figure/ground hierarchy.

Several claims were intentionally **not** adopted:

- persistence time does not imply that visual salience must scale directly with internal importance;
- mineral grain, warm/cool coding, relief and calcification are artistic mappings rather than measured material microstructure;
- Plate birth should not automatically suppress pheromone or imply that pheromone literally transforms into solid matter;
- a first sound should not be staged as proof that the birth itself caused an impact;
- making ants disappear or reducing them to contact points would discard a currently successful perceptual entry point;
- “ground becomes the protagonist” is a possible artistic frame, not an implementation requirement.

The strongest retained Argon principle is therefore:

> **field and retained matter should be distinguishable by visual behavior, not merely by “more or less gray.”**

The radical dark-field proposal is parked as a possible future alternate/secondary display of the same world state, not the main renderer direction.

## 5. Astra review — experimental decomposition and perceptual prediction

Astra agreed that the current material change is visually weak but rejected the need to pre-script a protagonist transfer from ant to ground. Its central reframing was more operational:

> **Can a viewer following ants later rediscover that a place remains different, without needing to witness the birth event?**

This shifts the criterion from “make material birth dramatic” to **place persistence and rediscovery**.

Astra also separated two hypotheses that had begun to merge:

- **material legibility:** can retained matter be recognized as a stable place property while ant and pheromone stay unchanged?
- **pheromone salience:** does reducing weak single-pass trace reduce the bodily/excretion association without erasing useful exploratory history?

It recommended testing material first. This is the adopted experiment order because changing pheromone and material simultaneously would make attribution difficult.

Additional useful constraints:

- repeated pheromone is an accumulated state, but the field does not directly encode “how many different ants cooperated”; avoid calling darkness a direct measure of collectivity;
- material texture should be world-fixed/deterministic, not regenerated per frame;
- a readable low-contrast surface may be necessary before micro-grain can be perceptually useful;
- contour can become map/road/selection-outline language if overused;
- relief strongly implies geometric height and is therefore a later authored mapping;
- renderer emphasis should arise from **local state**, not global clock stages such as “first Plate → all ants dim”;
- material and pheromone may coexist at the same place; a local Plate should not automatically trigger a whole-screen mode change;
- “the excretion joke disappears” is too narrow a success criterion. The stronger question is whether persistent place becomes an additional experience.

## 6. Working visual principles after both reviews

These are design hypotheses for testing, not production facts.

### Ant

Keep the current recognizable ant rendering unchanged for the first visual passes. It already supports individual tracking and provides a strong entry point. Do not add foot-contact flashes or reduce ants to particles. Revisit ant contrast only if environment remains unreadable after material and pheromone treatment are independently tested.

### Pheromone

Do not yet change it in the first pass.

For a later isolated pheromone pass, the likely first change is to lower the display salience of the low-concentration region while preserving the established-route maximum and the underlying field/deposition/decay law. The purpose would be to distinguish whether the “emission/excretion” reading comes mainly from display contrast or from the gaster-linked location/rhythm itself.

Spatial blur, display delay, color and chemical-to-material transition animation should not be combined with that first pheromone-only test.

### Material

The first priority is **stable surface presence**, not a dramatic birth effect.

Preferred order of visual properties:

1. a low but clearly readable area/surface contrast;
2. sparse deterministic world-fixed texture that survives ordinary 640×640 viewing;
3. limited exposed boundary/edge only if needed;
4. relief and color-temperature coding only in later aesthetic expansions.

The visual texture is a representation device. It must not be described as measured grain, exact geological roughness, age, or literal height unless a future mapping explicitly establishes that contract.

### Temporal relation

The desired shift is not a scripted global sequence from “ant phase” to “terrain phase.” Local material accumulation should naturally change the total visual balance as more of the world actually becomes retained material.

A birth may be visible if the viewer happens to look at it, but no flash, crystallization cue or global transition is required. Missing the event should not prevent later rediscovery.

### Audio relation

Keep exact foot→sound source attribution ambiguous in this visual pass. A viewer may infer that the world acquired a sound-capable condition once material appears, which is compatible with current Base-Off routing. Avoid stronger claims that pheromone became stone, Plate birth itself sounded, or a visible point is the exact current audio source.

## 7. Selected next pass — Material-only renderer shadow

**Hypothesis:** making retained material a stable, readable surface while leaving ant and pheromone untouched will create place rediscovery without sacrificing the current ant-tracking experience or inventing a stronger causal story.

### Change

Only the material display language.

Candidate should test:
- slightly stronger but restrained area/surface visibility;
- deterministic world-fixed sparse texture or equivalent stable structural cue;
- optional very limited boundary treatment only if the surface itself remains ambiguous.

A plain surface with similar average luminance should be retained as a useful control against texture, so a more complex grain is not automatically preferred.

### Hold fixed

- ant rendering, gait, size and contrast;
- pheromone field and current renderer mapping;
- white background;
- production movement, recruitment heading and spawn geometry;
- TrailPlateBirth, stratigraphy, locomotion resistance;
- physics/audio law and gain;
- no birth animation, hue coding, Plate-over-pheromone clearing or global stage switch.

### Observe

Primary perceptual questions:

1. Can a viewer rediscover the same changed place after the ant that drew attention there has left?
2. Does material read as something different from “the trail got darker”?
3. Does ant tracking remain easy?
4. Does the existing upper-canvas target/road-network impression become stronger, weaker or unchanged?
5. Does the texture survive actual 640×640/web/video presentation, or only work when enlarged?
6. Does a fixed surface remain stable during overlapping pheromone activity without flicker or apparent procedural motion?

### Decision boundary

- If material-only already creates place persistence, do **not** weaken pheromone merely because it was originally proposed.
- If material remains invisible, check area contrast, effective display scale and compositing before adding more elaborate grain.
- If plain surface and textured surface read equally well, prefer the simpler mapping.
- If material becomes a map/road graphic rather than a retained surface, reduce contour/edge language before changing ontology.
- Do not use this early two-Plate clip as evidence of mature terrain behavior. A later accumulation check needs a more mature current-G state.

## 8. Planned sequence after the material-only result

Only proceed conditionally:

1. **Material-only:** selected first pass above.
2. **Pheromone-only:** reduce low-concentration display salience while holding material at current production, if the excretion/immediate-emission question still matters.
3. **Combined 2×2:** current / material-only / pheromone-only / combined on the same underlying state stream.
4. **Accumulation and aesthetic expansion:** verify the selected mapping at more mature current-G material states; only then consider Blueprint-2-like off-white ground, restrained warm/cool distinction or subtle relief.

The previous AV evidence proposed sound On/Off of the same clip as the smallest audio-role question. That remains valid but is not bundled into the first material renderer intervention. Visual legibility and audiovisual binding should remain distinguishable outcomes.

## 9. Current conceptual shorthand

Two phrases are useful as artistic interpretation, not implementation requirements:

- **“지나간 자들의 움직임이 남은 자들의 대지가 된다.”**
- **“생명이 지형을 만들고, 그 지형이 다시 생명의 움직임을 조건 짓는다.”**

Argon's “Geology Produced by Life / Sounding Terrain” is retained as a possible artistic north star, but the present pass does not commit ANT to mineral imagery, a ground-only protagonist, or a literal geological ontology.

The practical design target is narrower:

> **개별 원인은 숨겨도 된다. 하지만 세계가 달라졌다는 사실은 다시 발견할 수 있어야 한다.**

That is the handoff into the next renderer pass.
