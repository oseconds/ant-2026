# ANT — Current Architecture, Evidence and Research Boundary

**Current repository state: 2026-10-07**

이 문서는 ANT의 **현재 verified state**를 위한 GitHub-side hub다. 과정은 [daily logs](daily/README.md), 실험별 원본과 재현 자료는 [evidence packages](evidence/)에 둔다.

## Current status

```text
equal ants
→ pheromone
→ FOOT_CONTACT
→ SurfaceField
→ TrailPlateBirth
→ MaterialStratigraphy
→ Plate / Z / buried Sphere
→ physical vibration / audio

current/recent proximity
→ DynamicSocialGraph
→ TemporalSocialTopology
(read-only)
```

현재 production behavior baseline은 founder refinement commit `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9` 이후 동결되어 있다.

S0/S1 read-only social observation pass의 구현/evidence 흐름:

```text
8076de6  Add read-only ANT dynamic social graph
a6801d6  Add temporal social topology analysis
f4365b1  Add ANT social graph evidence harness
af9c417  Record ANT social graph baseline evidence
```

그 이후 커밋은 daily/documentation을 추가할 수 있으므로 **repository HEAD와 latest implementation baseline을 구분**한다.

## Architecture

### Agent / movement

- 모든 ant는 동일한 `AntAgent`.
- leader, caste, pioneer role/state 없음.
- inertia / acceleration / braking / bounded turn.
- local occupancy와 swept collision constraint.
- 자연 퇴장 + gradual recruitment.
- behavior는 framework-independent model에 있고 renderer는 snapshot만 그린다.

### Chemical memory

`PheromoneField`는 shared environmental memory다.

- 96×96 grid
- 15 s half-life
- gaster rear에서 실제 이동 거리 기반 deposition
- short-range evidence 기반 `trailAdherence`
- founder refinement는 low-evidence 새 commitment와 baseline deposition만 약하게 낮춤

Founder pass 이후 behavior를 더 튜닝해서 branch/procession을 만들지 않는다.

### Mechanical memory

실제 six-leg tripod gait가 `FOOT_CONTACT`를 만들고, 이 이벤트가:

```text
gait
→ FOOT_CONTACT
→ SurfaceField
→ Plate qualification
→ material/audio excitation
```

의 공통 입력이 된다.

`SurfaceField`는 느린 mechanical compaction memory다. gait와 SurfaceField는 social observer 때문에 변경되지 않았다.

### Frozen material history

`TrailPlateBirth`는 persistent chemical + mechanical corridor만 immutable Plate descriptor로 만든다.

`MaterialStratigraphy`가 이후 overlap에 따른 exposed/buried/depth를 관리한다.

핵심 invariant:

- birth 후 geometry/material은 frozen
- age ≠ depth
- later overlap만 burial을 만든다
- direct foot strike는 exposed top material 하나에만 전달
- buried material은 reciprocal coupling으로만 반응
- technical ceiling은 history eviction semantics가 아님

### Physical audio

현재 production sonic baseline:

```text
3 ms finite direct-contact pulse
75 ms local mechanical recovery
×50 Plate damping
```

Plate history는 장기 저장되지만 vibration memory는 짧게 둔다.

`ant-base-substrate-debug` continuation은 optional audio-only base substrate를 **Off 기본값**으로 유지한다. Invariance와 Plate Debug 검증 후 PCM harness만 수리해 pre-birth Off silence/On nonzero 및 born Plate Off/On PCM 동일성을 확인했다. First-Plate window의 substrate RMS는 born보다 **29.19 dB 높아**, non-masking acceptance는 미확인이고 main integration은 보류한다. [설정·PCM·고정 스케일 evidence](evidence/2026-10-07-base-substrate-debug/README.md).

mature 20–30 Plate의 AudioWorklet realtime collapse는 unresolved known issue다. Audio/runtime, sleep/wake, ROM optimization은 현재 연구 본선에서 보류한다.

### Read-only social observation

`DynamicSocialGraph`:

- caller가 fixed tick 뒤 복사한 `id/x/y/radius`만 읽음
- undirected body-scale proximity episodes
- stable IDs, start/end, duration, min distance
- 60 Hz raw observation
- no RNG, no callback into behavior, no controller/renderer auto integration

`TemporalSocialTopology`:

- 20 Hz analysis
- windows: 0.25 / 1 / 5 / 20 s
- active isolates 포함
- weighted edge = window 안 cumulative proximity seconds
- component / merge / split / edge lifetime
- persistent bridge / articulation / retrospective connector events
- recent-edge tail과 current encounter를 분리

## Latest S0/S1 result

Encounter observable:

```text
q(A,B) = distance(A,B) / (radiusA + radiusB)
q ≤ k
k = 1, 1.25, 1.5, 2
```

기본 radius 0.006에서 center-distance threshold는 0.012 / 0.015 / 0.018 / 0.024다. 이는 collision/body-scale proximity proxy이며 literal antenna/head contact가 아니다.

세 matched seeds(20261005/06/07), 각 600 s에서 graph OFF/ON을 비교했다.

- 108,000 matched simulation ticks
- trajectory/RNG/pheromone/SurfaceField/FOOT_CONTACT/lifecycle/birth hashes match
- focused 120 s pass는 gait/body pose/gaster/activation/stratigraphy/audio command까지 매 tick deep-compare
- final full tests 261/261
- Chrome dev + production preview smoke pass

자연 topology는 sparse했다.

| Window | 해석 |
| --- | --- |
| 0.25 s | current transient를 가장 잘 드러냄 |
| 1 s | primary recent-proximity observation window |
| 5 s | accumulated recent context |
| 20 s | memory/turnover sensitivity case |

k=2 / 0.25 s connector는 총 11건, 0.30–0.65 s였다. 전부 recruitment origin `(0.5, 0.72)`에서 0.019 이내였고, 1 s 이상 window에서는 connector PERSIST가 0이었다.

또한 1 s component count와 population correlation은 seed별 0.953–0.959였다. 이는 기술통계이며 유의성이나 causal null test가 아니다.

**현재 해석:** persistent pioneer/social organization은 미입증이다. 관찰 결과는 proximity, recruitment density, movement geometry, window memory로 설명 가능한지 먼저 검증해야 한다.

전체 수치와 raw archive: [2026-10-07 social graph evidence](evidence/2026-10-07-social-graph/README.md).

## Social graph vs material graph

### Social graph

```text
fast
mobile
ephemeral
current/recent interaction-derived
```

### Material graph

```text
slow
spatial
persistent
history-derived
```

장기 연구 질문은:

> transient social topology가 repeated traffic을 거쳐 persistent material topology로 전환되는가?

이지만, 아직 둘을 coupling하지 않는다.

## Current research boundary

현재 **하지 않는 것**:

- social role / pioneer state
- adaptive partner memory
- graph → ant behavior
- graph → Plate excitation
- λ₂ / eigenmode를 biological entity로 해석
- Plate birth retuning
- mature audio runtime optimization
- naive Erdős–Rényi만으로 emergence 주장

Research evidence와 artistic/modeling interpretation을 구분한다. Graph spectral mode → material excitation은 향후 가능한 artistic/mathematical mapping이지 ant biology의 검증된 mechanism이 아니다.

## Next pass

다음 pass는 **movement-constrained null validation**이다.

우선순위:

```text
recorded lossless trajectories
→ preserve geometry / density / lifecycle as much as possible
→ break synchrony or temporal alignment
→ rebuild encounters/topology
→ compare simple temporal observables
```

후보:

- trajectory-preserving time shifts
- synchrony breaking
- path-segment randomization
- movement/density/geometry-preserving comparators

질문:

> 현재 graph event가 raw position, recruitment density, movement geometry를 넘어 추가 정보를 가지는가?

Null에서도 설명되지 않는 structure가 있을 때만 spectral diagnostics를 검토한다.

현재 roadmap:

```text
S0/S1  dynamic graph + temporal observables        COMPLETE
S2     movement-constrained null validation        NEXT
S3     spectral diagnostics if they add value      CONDITIONAL
S4     social ↔ material comparison                LATER
S5     weak one-way mapping                        LATER
S6+    memory / sensing / closed loop               ONLY IF JUSTIFIED
```

## Evidence index

### Behavior / movement

- [Integrated refinement](evidence/2026-10-05-integrated-refinement/README.md)
- [Gait / FOOT_CONTACT](evidence/2026-10-05-gait/README.md)
- [Reinforcement](evidence/2026-10-05-reinforcement/README.md)
- [Turnover](evidence/2026-10-05-turnover/README.md)
- [Founder-effect refinement](evidence/2026-10-07-founder-effect-refinement/README.md)

### Material / audio

- [Surface Plates](evidence/2026-10-05-surface-plates/README.md)
- [Contact sonic baseline](evidence/2026-10-06-contact-sonic-baseline/README.md)
- [Plate decay](evidence/2026-10-06-plate-decay/README.md)
- [Stratigraphy / runtime](evidence/2026-10-06-stratigraphy-runtime/README.md)
- [Runtime re-check](evidence/2026-10-06-runtime-recheck/README.md)
- [Base substrate / Plate Debug — PCM captured, non-masking gate unresolved](evidence/2026-10-07-base-substrate-debug/README.md)

### Social observation

- [S0/S1 DynamicSocialGraph evidence](evidence/2026-10-07-social-graph/README.md)

## Daily chronology

날짜별 실험의 출발 질문, negative result, 방향 전환은 [`docs/ant/daily/`](daily/README.md)에 기록한다.

Daily log는 현재 상태를 덮어쓰는 source가 아니라 chronology다. Current state가 필요하면 이 문서를 먼저 보고, 실험의 상세 claim은 해당 evidence README로 내려간다.
