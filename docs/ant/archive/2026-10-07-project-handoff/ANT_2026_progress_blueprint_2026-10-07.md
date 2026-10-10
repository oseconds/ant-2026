# ANT_2026 — 진행상황 및 청사진

**기준일:** 2026-10-07  
**목적:** 현재까지 채택된 ANT 시뮬레이션의 구조·실험 결과·보류된 문제를 한 문서에 정리하고, 다음 개발 순서를 명확히 고정한다.

---

## 0. 한 줄 요약

ANT는 현재 **개체 이동 → 화학적 흔적 → 기계적 축적 → 재질/Plate 형성 → 물리 진동/오디오**까지 연결된 상태다.  
최근에는 초반 founder lock-in을 줄이는 작은 행동 수정까지 채택했고, 오디오의 사건성은 Plate decay 개선으로 좋아졌다.  
반면 mature Plate stack의 AudioWorklet realtime 붕괴는 아직 해결되지 않았으며, 이 문제는 당분간 보류한다.

다음 본선은 **기존 behavior를 더 튜닝하는 것이 아니라, 현재 colony organization을 읽는 read-only `DynamicSocialGraph` 관찰층(S0/S1)** 을 추가하는 것이다.

---

# 1. 프로젝트의 기본 원칙

## 1.1 핵심 철학

- 모든 ant는 동등한 agent이며 leader/caste/role을 미리 부여하지 않는다.
- pheromone은 shared environmental memory다.
- procession, jam, raid, pioneer 같은 결과를 명시적인 상태로 코딩하지 않는다.
- 소리는 x→pan, y→pitch 같은 직접 sonification보다 실제 접촉과 물리 구조에서 발생한다.
- 개체는 일시적이지만 환경의 흔적과 재질은 누적된다.
- 서로 다른 시간척도의 기억을 분리한다.
- path dependence를 단순 randomness보다 중요하게 본다.
- **결과를 코딩하지 말고, 결과가 생길 수 있는 상호작용을 코딩한다.**

## 1.2 현재 프로젝트를 보는 가장 중요한 프레임

```text
FAST
ant position / motion / local encounter
        ↓
MEDIUM
PheromoneField
chemical route memory
        ↓
SLOW
SurfaceField
mechanical compaction
        ↓
VERY SLOW / FROZEN
trail skeleton → Plate birth → stratigraphy
        ↓
PHYSICAL
Plate / Z coupling / Sphere / vibration / audio
```

여기에 앞으로 추가할 층은:

```text
LIVE SOCIAL GRAPH
ants = nodes
current/recent encounters = edges
```

이다.

중요한 점은 social graph가 처음에는 **행동을 만드는 시스템이 아니라 현재 행동을 읽는 관찰 시스템**이라는 것이다.

---

# 2. 현재 구현 상태

## 2.1 Agent / Movement

현재 ANT는 다음을 이미 구현하고 있다.

- 동등한 ant agent
- 개체별 지속적 성향
- 관성·가속·감속·회전 제한
- local occupancy / collision avoidance
- 경계 밖 자연 퇴장
- gradual recruitment
- 실제 이동량 기반 gait
- articulated body pose
- 실제 6-leg tripod FOOT_CONTACT

특정 군집 상태를 직접 지시하는 상태 머신은 두지 않는다.

## 2.2 Chemical memory — PheromoneField

현재 chemical layer의 역할:

- 이동 거리 기반 deposition
- gaster rear 위치에서 흔적 생성
- 96×96 field
- 15 s half-life
- trailAdherence 기반 reinforcement
- long-range trail discovery + short-range correction
- trailAdherence의 빠른 상승 / 느린 하강

최근 founder refinement 이후 저증거 구간에서는 초기 침적과 방향 유지가 약간 낮아지지만, real trail evidence가 커지면 기존 동작으로 연속 복귀한다.

## 2.3 Mechanical memory — SurfaceField

FOOT_CONTACT는 단순 시각 이벤트가 아니라:

```text
actual gait
→ FOOT_CONTACT
→ SurfaceField support / compaction
→ TrailPlateBirth qualification
→ MaterialStratigraphy
→ Audio excitation
```

의 공통 물리 입력이다.

즉 gait·환경·material·audio가 같은 실제 contact event를 공유한다.

## 2.4 Plate birth / material history

현재 Plate는 persistent chemical + mechanical route에서 태어난다.

핵심 원칙:

- chemical + support를 동시에 요구
- 충분한 geodesic route 길이 요구
- 일정 persistence 필요
- 같은 corridor의 즉시 재생성을 막음
- 실제 추가 foot contacts를 요구
- birth rule은 최근 founder refinement에서도 변경하지 않음

현재 판단은 **Plate birth rule을 아직 별도로 튜닝할 근거가 없다**는 것이다.

## 2.5 Material stratigraphy

현재 material system:

- Plate는 frozen geometry/material history로 남음
- later material은 실제 공간 overlap에서만 기존 material을 덮음
- age와 depth는 동일하지 않음
- direct FOOT_CONTACT는 현재 exposed top Plate만 직접 strike
- buried Plate는 Z coupling을 통해서만 반응
- Sphere/nodule은 별도 qualification을 통해 형성

이 구조는 “과거 행동이 환경에 고체 history로 남는다”는 프로젝트의 중요한 축이다.

---

# 3. 최근 오디오 패스

## 3.1 문제

기존 Surface Plate 소리는 dense FOOT_CONTACT가 들어오면 개별 사건보다 지속적인 wind/noise-like resonant bed로 들리는 경향이 있었다.

핵심 원인은 두 단계로 분리해서 확인했다.

### 입력부
너무 많은 contact가 거의 instantaneous impulse로 입력됨.

### 공진부
Plate vibration이 지나치게 오래 살아 남음.

---

## 3.2 채택된 direct-contact excitation

현재 production baseline:

- **3 ms finite pulse**
- 6000 Hz physics에서 18 step half-sine envelope
- envelope sum = 1
- 기존 impulse budget 보존
- allocation-safe ring buffer
- 이벤트 dropping 없음

추가로:

- **75 ms local mechanical recovery**
- 같은 local region의 빠른 반복 접촉은 최대 25% 정도 새 impulse 감소
- 새로운 위치는 그대로 반응
- global debounce/gate 아님

이 패스는 peak와 dense amplitude variation을 조금 개선했지만, event salience를 근본적으로 해결하지는 못했다.

---

## 3.3 Plate damping / decay 개선

실제 isolated Plate impulse response를 Chrome OfflineAudioContext 경로로 측정한 결과:

### 변경 전
- T20 ≈ 49.7 s
- T40 / T60: 60 s 안에 미도달

### 변경 후
- T20 ≈ 1.0 s
- T40 ≈ 2.0 s
- T60 ≈ 3.0 s

변경은 Plate velocity-loss coefficient에 공통 **×50 damping multiplier**를 적용한 것뿐이다.

재질별 damping의 순서와 상대적 차이는 유지된다.

Dense 10 s 비교에서는:

- RMS 크게 감소
- crest factor 증가
- quiet valley 증가
- 50 ms RMS variation 증가

즉 “항상 차 있는 공명 바닥”은 줄어들었다.

### 현재 해석

```text
material memory = 오래 남음
vibration memory = 짧음
```

을 분리한 것이 맞는 방향이다.

---

# 4. Audio runtime 문제 — 보류된 known issue

## 4.1 현재 증상

mature natural run에서:

- simulation/main thread ≈ realtime
- AudioContext clock만 크게 뒤처짐
- 20–30 Plates에서 AudioWorklet가 realtime을 따라가지 못함
- 30 Plates 기준 약 9,806 / 9,806 Plate nodes가 active
- sleeping Plate layer = 0

대표 측정:

```text
~10 Plates : audio/wall ≈ 0.45
~20 Plates : audio/wall ≈ 0.19
~29 Plates : audio/wall ≈ 0.13
~30 Plates : audio/wall ≈ 0.13
```

즉 AudioContext state는 `running`이지만 실제 render progression은 약 13% realtime까지 떨어진다.

## 4.2 확인된 사실

Plate decay를 T60 ≈ 3 s로 줄여도 natural run에서는 Plate sleep이 발생하지 않았다.

원인 조사 결과:

- wake timer reset API가 주원인은 아니었음
- oldest buried Plate도 실제 state / restoring force가 계속 threshold를 넘음
- Z coupling은 의미 있는 기여
- Sphere force는 sleep blocker로는 상대적으로 작았음
- coupled material network 자체가 계속 물리적으로 움직이고 있음

## 4.3 rejected approaches

### Stateless target-energy gate
성능은 줄였지만 weak Z accumulation을 실제로 잘라냈다.

예:
- baseline buried response ≈ −36.5 dB
- candidate gate에서는 사실상 floor

따라서 production 부적합.

### Eigenmode reduced-order dormant Plate
rank가 낮으면 물리/파형 error가 큼.
rank가 높으면 full Plate solver보다 오히려 비쌈.

결론:

> tested modal ROM path는 unattractive.

POD/Krylov 가능성을 이론적으로 완전히 부정한 것은 아니지만, 당분간 더 파지 않는다.

## 4.4 현재 결정

**Audio runtime 최적화 연구를 잠시 동결한다.**

이유:

- 현재 작품의 핵심 질문보다 범용 coupled-physics optimization 문제로 너무 깊게 들어감
- pioneer/founder refinement 이후 Plate topology 자체가 달라질 수 있음
- 지금은 시스템의 생성 언어를 먼저 발전시키는 것이 더 중요함

현재 audio production baseline은 유지:

```text
3 ms pulse
75 ms local recovery
×50 Plate damping
```

---

# 5. Founder-effect refinement — 현재 behavior baseline

## 5.1 확인된 문제

저증거/unknown field에서도 기존 시스템은:

- 정상 decision/commitment duration을 그대로 사용
- `trailAdherence = 0`이어도 deposition multiplier 0.5 유지

즉 초기 우연한 route도 비교적 빠르게 환경 evidence로 변환될 수 있었다.

또한 신선한 ant가:

- 완전히 빈 field
- 강하지만 균일한 field

를 읽었을 때 directional confidence/coherence/adherence가 모두 0이 될 수 있어, 두 상황이 behavior 일부에서 충분히 구분되지 않았다.

## 5.2 absolute evidence scalar

현재 절대 trail evidence `E`는 기존 short-range trail strength를 재사용한다.

```text
H(c,h) = c³ / (c³ + h³)

E = H(sqrt(peak1 × peak2), 0.018)
```

여기서 peak1/peak2는 두 short-range cross-section의 절대 농도 peak다.

이 값은 directional contrast가 아니라 **환경에 실제 signal이 존재하는 정도**다.

## 5.3 채택된 최소 변경

```text
durationScale = 0.8 + 0.2 × E

new decision  = old decision  × durationScale
new committed = old committed × durationScale

depositionMultiplier =
    0.5 × (0.75 + 0.25 × E)
    + reinforcementGain × trailAdherence²
```

따라서:

### E = 0
- directional holding ≈ 20% 짧음
- baseline deposition 0.5 → 0.375

### E → 1
- 기존 behavior로 연속 복귀

중요:

- pioneer state 없음
- hard switch 없음
- steering/noise/speed/gait/collision 변경 없음
- pheromone half-life/reinforcement gain 변경 없음
- Plate birth rule 변경 없음

## 5.4 matched-seed 결과

3 seeds × 600 s 기준:

초기 pheromone mass:

```text
30 s  : −34.3%
60 s  : −26.5%
120 s : −19.2%
300 s : −11.6%
600 s : +0.2%
```

즉 초기 흔적 형성은 약해졌지만 mature mass는 거의 완전히 회복했다.

평균 Plate 수:

```text
120 s : 1.00 → 0.33
300 s : 13.00 → 8.67
600 s : 35.33 → 30.33
```

하지만 mature Plate formation은 계속 유지된다.

저증거 예정 유지 시간은 약 20.5–20.8% 감소했다.

FOOT_CONTACT 총량은 줄지 않았다.

## 5.5 현재 해석

이 변경은:

> branch를 강제로 늘린 것이 아니라  
> 초기 accidental corridor가 너무 빨리 lock-in되는 압력을 낮춘 것

이다.

실제로 coverage / branching 개선은 seed마다 달랐다.

이 점은 오히려 바람직하다.

**현재 behavior는 여기서 동결한다.**

추가 튜닝으로 “더 많은 branch”를 만들려고 하지 않는다.

---

# 6. 현재 프로젝트의 개념적 중심

현재 ANT에는 사실상 두 개의 graph 개념이 생기고 있다.

## 6.1 Material graph

```text
trail skeleton
→ frozen Plate topology
→ stratigraphy
```

특성:

- slow
- spatial
- persistent
- history-derived
- 과거 행동이 환경에 굳어진 구조

## 6.2 Social graph

앞으로 추가:

```text
current/recent ant encounters
→ DynamicSocialGraph
```

특성:

- fast
- mobile
- ephemeral
- interaction-derived
- 현재 colony organization

## 6.3 가장 중요한 장기 질문

```text
transient social topology
        ↓ repeated traffic
chemical / mechanical trace
        ↓
trail skeleton
        ↓
persistent material topology
```

즉:

> 현재의 사회적 구조가 어떻게 환경의 물질적 역사로 변환되는가?

가 ANT의 강한 장기 개념축이 될 수 있다.

---

# 7. Social Graph Deep Review에서 정리된 기준

문헌 검토에서 가장 강하게 지지된 방향:

- movement / spatial fidelity만으로도 interaction topology가 생길 수 있음
- 처음부터 social role/memory를 만들 필요 없음
- static aggregate보다 temporal order가 중요
- generic proximity/contact는 undirected가 자연스러움
- 첫 모델은 weighted temporal graph가 적절
- edge lifetime / component / merge-split 같은 직접 관찰값을 우선
- bridge / pioneer는 retrospective event descriptor로만 해석
- repeated proximity를 genuine relationship memory로 바로 해석하면 안 됨
- density / geometry를 보존하는 null model이 중요
- λ₂ / eigenmodes는 수학적으로 유용하지만 biological evidence는 상대적으로 약함

따라서 초기 생각:

```text
dynamic graph
→ Laplacian
→ Plate
```

보다 현재 청사진은:

```text
dynamic graph
→ temporal observables
→ movement-constrained null validation
→ spectral only if it adds information
→ material comparison / coupling
```

으로 수정됐다.

---

# 8. 개정된 개발 청사진

## Phase A — 완료 / 현재 baseline

### A0. Agent foundation
- equal agents
- movement
- collision / occupancy
- turnover / recruitment

### A1. Gait / body / FOOT_CONTACT
- real travelled-distance gait
- six-leg tripod contacts
- body pose / gaster geometry

### A2. Chemical route memory
- PheromoneField
- adherence / reinforcement
- gaster deposition

### A3. Mechanical memory / materialization
- SurfaceField
- TrailPlateBirth
- MaterialStratigraphy
- buried material
- Z coupling
- Sphere/nodule

### A4. Sonic baseline
- finite 3 ms contact pulse
- 75 ms local recovery
- Plate T60 ≈ 3 s

### A5. Founder-effect refinement
- absolute evidence `E`
- low-evidence commitment −20%
- low-evidence baseline deposition 0.5 → 0.375
- mature trail behavior preserved

**여기까지 현재 production behavior baseline.**

---

## Phase B — 다음 본선: Social observation project

### S0. DynamicSocialGraph
행동 영향: 없음

- node = active ant
- edge = current/recent encounter
- raw event stream
- stable ant IDs
- weighted undirected temporal edges

목표:
현재 movement만으로 어떤 encounter topology가 나타나는지 읽는다.

### S1. Temporal topology
행동 영향: 없음

기본 관찰:

- active node count
- edge count / density
- component count
- largest component ratio
- weighted degree
- edge lifetime
- component merge / split
- bridge form / persist / break
- articulation persistence
- retrospective connector event

`pioneer`는 여기서도 role이 아니라:

> topology를 실제로 변화시킨 ant를 사후 검출한 event

로만 사용한다.

### Window sweep
처음부터 한 timescale을 정하지 않는다.

초기 후보:

```text
250 ms
1 s
5 s
20 s
```

질문:

> 어떤 시간척도에서 graph morphology가 안정적으로 읽히는가?

---

## Phase C — Null-model validation

Spectral보다 먼저 수행한다.

목적:

> social graph가 단순히 위치와 density를 다시 표현한 것 이상인가?

비교 후보:

- time-shuffled encounter
- synchrony breaking
- path-segment randomization
- movement tendency / density / geometry를 보존하는 comparator

피해야 할 것:

- 단순 Erdős–Rényi만으로 emergence를 주장
- density 차이를 social structure로 과해석

이 단계에서 graph layer가 의미 있는 추가 정보를 주는지 확인한다.

---

## Phase D — Spectral diagnostics (조건부)

Null validation을 통과한 뒤에만 진행.

후보:

- λ₂ algebraic connectivity
- low-order Laplacian modes
- Fiedler-like partition structure

주의:

```text
λ₂ high ≠ colony better / smarter
```

λ₂는 fitness가 아니라 **organization을 보는 좌표**다.

Spectral mode가 components / weighted degree보다 실제로 추가 정보를 줄 때만 유지한다.

---

## Phase E — Social ↔ Material comparison

아직 coupling하지 않고 두 graph를 비교한다.

예:

```text
social connectivity high
material connectivity low
```

→ colony organization이 환경에 굳기 전

```text
social connectivity low
material connectivity high
```

→ 과거의 구조는 남았지만 현재 colony는 해체

또는:

```text
social bridge event
→ repeated traffic
→ trail skeleton
→ Plate birth
```

같은 실제 시간 관계를 추적한다.

---

## Phase F — Weak one-way coupling

충분한 evidence가 생겼을 때만.

방향:

```text
social organization
→ weak material excitation / weighting
```

직접 scalar sonification:

```text
bridgeCount → pitch
```

보다 구조 자체를 공간 excitation으로 투영하는 방법을 우선 검토한다.

이 단계에서도 ant behavior에는 feedback하지 않는다.

---

## Phase G — Adaptive social memory

반복 관계가 실제 데이터에서 충분히 보일 때만.

가능한 구조:

```text
encounter
→ edge persistence / reinforcement
→ slow social memory
```

하지만 proximity persistence가 단순 spatial fidelity 때문인지 먼저 분리해야 한다.

---

## Phase H — Material → Ant sensing

이 시점부터 behavior 영향 시작.

```text
Plate vibration / stress
→ ant mechanosensing
```

substrate는 passive carrier가 아니라 material-dependent transmission medium으로 본다.

---

## Phase I — Closed social/material loop

최종적으로:

```text
LIVE SOCIAL GRAPH
        ↓
collective organization
        ↓
MATERIAL GRAPH
        ↓
physical vibration
        ↓
ant sensing
        ↓
LIVE SOCIAL GRAPH
```

의 폐루프 가능성을 검토한다.

원칙:

```text
observe
→ measure
→ validate
→ weak one-way mapping
→ memory
→ closed loop
```

---

# 9. 바로 다음 패스 — S0/S1

다음 구현 패스에서는 **behavior/audio/Plate를 모두 동결**한다.

해야 할 것:

1. 기존 ant body scale에 기반한 encounter definition 조사
2. body-scale threshold small sweep
3. raw encounter start/end/duration stream
4. weighted undirected temporal graph
5. stable ID / retirement 처리
6. 250 ms / 1 s / 5 s / 20 s window sweep
7. components / weighted degree / edge lifetime
8. merge / split
9. temporally persistent bridge / articulation
10. retrospective connector event
11. fixed-scale graph/trajectory evidence
12. graph instrumentation ON/OFF behavior invariance 검증

아직 하지 않을 것:

- λ₂
- eigenmodes
- PageRank / closeness / centrality zoo
- adaptive relation memory
- graph → Plate
- graph → behavior
- Plate birth tuning
- audio/runtime optimization

---

# 10. 다음 패스의 핵심 성공 기준

S0/S1 성공은 “멋진 graph screenshot이 생김”이 아니다.

성공 조건:

- graph instrumentation이 ANT behavior를 바꾸지 않음
- encounter definition이 물리적으로 설명 가능
- temporal order가 보존됨
- edge lifetime이 실제 시간 구조를 가짐
- component merge/split이 한 프레임 noise보다 안정적
- bridge/connector가 retrospective event로 추적 가능
- window별 morphology 차이가 측정됨
- density와 graph structure를 분리할 다음 null-model pass의 raw data가 준비됨

실패도 유효하다.

예:

- 모든 graph metric이 population density만 따라감
- bridge가 한 프레임 noise뿐임
- stable connector event가 없음

이 경우 behavior를 바꿔 structure를 만들지 않고 그대로 보고한다.

---

# 11. 현재 동결 / 보류 항목

## 동결
- movement / steering / speed
- gait
- collision
- population activation
- pheromone half-life / reinforcement gain
- founder refinement constants
- SurfaceField
- Plate birth thresholds
- stratigraphy semantics
- direct exposed-Plate routing
- 3 ms contact pulse
- 75 ms local recovery
- ×50 Plate damping

## 보류
- mature 20–30 Plate AudioWorklet realtime collapse
- Plate sleep/runtime optimization
- POD/Krylov ROM investigation
- Plate birth tuning
- social spectral analysis
- adaptive network
- material→ant feedback

---

# 12. 주요 결정 로그

| 결정 | 현재 상태 |
|---|---|
| Direct FOOT_CONTACT를 finite 3 ms pulse로 변경 | 채택 |
| Local contact recovery 75 ms | 채택 |
| Plate decay T60 ≈ 3 s | 채택 |
| Stateless wake gate | 기각 |
| Eigenmode dormant ROM | 기각 / 보류 |
| Mature AudioWorklet optimization | known issue로 보류 |
| Low-evidence commitment 20% 단축 | 채택 |
| Low-evidence baseline deposition 25% 감소 | 채택 |
| Plate birth threshold 추가 튜닝 | 현재 불필요 |
| Behavior 추가 튜닝 | 동결 |
| DynamicSocialGraph | 다음 단계 |
| Spectral graph analysis | null validation 이후 조건부 |

---

# 13. 최근 주요 커밋

## Sonic baseline
- `bdbe60f...` — finite pulse + local recovery
- `7f8ebf8...` — A/B evidence
- `9069a3e...` — Plate damping
- `51f5760...` — decay evidence

## Runtime diagnosis
- `3a41e6b...` — natural runtime re-check evidence
- `2d2d654...` — dormant Plate ROM feasibility harness
- `ecf09c7...` — ROM evidence

## Founder refinement
- `596555d...` — low-evidence ANT exploration refinement
- `f19681a...` — founder-effect evidence harnesses
- `e38450c...` — founder-effect evidence

현재 behavior baseline은 founder refinement까지 포함한 상태를 기준으로 한다.

---

# 14. 작업 원칙 / 의사결정 체크리스트

새 기능을 넣기 전에 항상 묻는다.

### 1. 이것은 관찰인가, 행동인가?
관찰이면 먼저 read-only로 만든다.

### 2. 결과를 직접 코딩하고 있지 않은가?
“더 많은 branch”, “pioneer”, “hub”를 목표 상태로 만들지 않는다.

### 3. 더 단순한 설명이 있는가?
density / geometry / movement만으로 설명되는지 먼저 본다.

### 4. 시간척도를 임의로 고정하고 있지 않은가?
window / memory / persistence를 sweep한다.

### 5. 환경 history와 vibration state를 혼동하고 있지 않은가?
material persistence와 acoustic persistence는 별개다.

### 6. production 최적화가 작품 질문을 집어삼키고 있지 않은가?
필요하면 known issue로 남기고 본선으로 복귀한다.

---

# 15. 현재 한 문장 청사진

> **동등한 ant들의 국소 이동이 chemical·mechanical memory를 만들고, 그 반복이 material history로 굳는 과정을 유지하면서, 이제 그 사이에 존재하는 현재 colony의 social topology를 read-only로 관찰한다. 이후 이 live social graph가 단순한 density의 부산물이 아니라는 것이 검증될 때만 spectral interpretation과 material coupling으로 확장한다.**