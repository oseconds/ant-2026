# ANT_2026 — Next Passes

**기준일:** 2026-10-07

---

# 1. 바로 다음 본선: S0/S1 Read-Only Social Graph

현재 behavior/audio/material baseline을 동결하고, live colony organization을 읽는 관찰층을 추가한다.

방향:

```text
Ant movement / encounter
        ↓
DynamicSocialGraph
```

반대 방향은 아직 없음:

```text
DynamicSocialGraph
    X
    ↓
ant behavior
```

---

## S0 — DynamicSocialGraph

행동 영향: **없음**

### 최소 구조

```text
node = active ant
edge = current/recent encounter
```

초기 edge는:

- undirected
- weighted
- temporal

로 간다.

generic proximity에 direction을 붙이지 않는다.

### 반드시 보존

raw encounter stream:

```text
simulation time
ant A stable ID
ant B stable ID
encounter start
encounter end
duration
minimum / representative distance if justified
```

frame-by-frame duplicate spam보다 start/update/end event semantics 우선.

### encounter definition

임의의 social radius 하나를 바로 고정하지 않는다.

기존 ant body / collision scale에 기반해 작은 threshold sweep 수행.

필요하면:

```text
near-contact
short-range proximity
```

정도의 physically interpretable 후보를 비교.

---

## S1 — Temporal topology

여기까지도 behavior 영향 없음.

### 처음 측정할 것

```text
active node count
edge count
edge density
component count
largest component ratio
weighted degree
edge lifetime
```

### event layer

```text
EDGE_FORM
EDGE_END

COMPONENT_MERGE
COMPONENT_SPLIT

BRIDGE_FORM
BRIDGE_PERSIST
BRIDGE_BREAK
```

bridge / articulation은 one-frame event로 확정하지 않는다.

temporal persistence 또는 hysteresis 필요.

### retrospective connector / pioneer-like event

가능한 정의:

> ant의 encounter가 이전에 분리돼 있던 component를 연결하고, 그 연결이 일정 시간 유지됨.

기록 후보:

```text
ant ID
event time
components connected
component size change
connection lifetime
persistence status
```

이 event는 ant의 behavior를 바꾸지 않는다.

---

# 2. Temporal window sweep

한 timescale을 biological truth처럼 고정하지 않는다.

초기 분석 후보:

```text
250 ms
1 s
5 s
20 s
```

질문:

> 어떤 scale에서 graph morphology가 안정적으로 읽히는가?

각 window에서 최소:

```text
edge count
edge density
component count
largest component ratio
weighted degree distribution
edge lifetime distribution
```

를 비교.

---

# 3. S0/S1의 가장 중요한 검증

graph overlay가 예뻐 보이는 것이 성공 기준이 아니다.

반드시 확인:

```text
graph instrumentation ON
vs
graph instrumentation OFF
```

에서:

- RNG behavior
- movement
- pheromone
- FOOT_CONTACT
- SurfaceField
- Plate birth

가 동일해야 한다.

관찰층은 side-effect free여야 한다.

---

## S0/S1에서 같이 기록할 단순 spatial baseline

full null-model validation은 다음 pass지만, S0/S1에서도 최소 descriptive comparison은 같이 남긴다.

```text
population size
local ant density
pairwise proximity count
occupancy concentration
```

목적:

> component / bridge / connector 변화가 단순 crowding이나 population size만 따라가는지 1차적으로 확인.

이 단계에서 causal/null-model 결론을 내리지는 않는다.

## Controlled topology fixture

temporal event semantics는 자연 실행만으로 검증하지 않는다.

작은 deterministic fixture를 둔다.

```text
two disconnected pairs
→ bridge ant enters
→ component merge
→ bridge leaves
→ component split
```

검증:

- exact event ordering
- stable ant IDs
- edge start/end duration
- component identities
- bridge persistence
- retirement / disappearance handling

## Evidence visualization

production renderer를 불필요하게 복잡하게 만들지 않는다.

diagnostic/evidence layer를 우선한다.

추천:

```text
ant positions + encounter edges
component coloring
recent temporal graph
component-count / largest-component timeline
merge / split / bridge event timeline
selected connector snapshots
```

장기 occupancy visualization은 cumulative coverage만 쓰지 않는다.

가능하면 다음 중 하나 이상을 병행:

```text
recent 30 s occupancy
recent 120 s occupancy
first-visit age
revisit count
```

cumulative coverage는 300–600 s에서 쉽게 포화되어 morphology 차이를 숨길 수 있다.

---

# 4. 다음: movement-constrained null validation

S0/S1 다음에는 spectral이 아니라 null model.

질문:

> 이 social graph가 raw position / density를 다시 표현한 것 이상인가?

준비할 raw data:

- ant trajectories
- encounter event order
- stable IDs
- population timeline
- occupancy / density summaries

후보 comparator:

```text
time-shuffled encounters
synchrony-breaking
path-segment randomization
movement tendency / density / geometry preserving randomization
```

피해야 할 것:

```text
naive Erdős–Rényi
→ "real graph와 다르므로 emergence"
```

---

# 5. 조건부 spectral pass

null validation 이후에만.

후보:

```text
λ₂
spectral gap
low-order Laplacian modes
Fiedler-like partitions
```

주의:

```text
λ₂ high
≠
better / smarter / healthier colony
```

spectral은 interpretation coordinate이지 biological quality score가 아니다.

component / degree / lifetime보다 추가 설명력이 있을 때만 유지.

---

# 6. Social ↔ Material comparison

처음에는 coupling 없이 분석.

두 graph:

```text
SOCIAL GRAPH
fast / mobile / ephemeral

MATERIAL GRAPH
slow / spatial / persistent
```

흥미로운 비교:

```text
social connectivity high
material connectivity low
```

현재 colony가 환경보다 먼저 조직되는 상태.

```text
social connectivity low
material connectivity high
```

현재 colony는 흩어졌지만 과거 구조는 material history로 남은 상태.

또:

```text
social connector
→ repeated traffic
→ pheromone / compaction
→ trail skeleton
→ Plate birth
```

의 시간 관계를 추적.

---

# 7. 그 이후의 장기 순서

현재 개정 청사진:

```text
S0  DynamicSocialGraph
S1  temporal topology / events
S2  movement-constrained null validation
S3  spectral diagnostics if justified
S4  social ↔ material comparison
S5  weak social → material one-way mapping
S6  slow adaptive social memory if justified
S7  material vibration → ant sensing
S8  full social ↔ material closed loop
```

중요:

이 순서는 고정 교리가 아니라 evidence gate다.

앞 단계가 의미 없으면 다음 단계로 자동 진행하지 않는다.

---

# 8. 현재 하지 않을 것

다음 pass에서 금지/보류:

```text
λ₂
eigenmodes
PageRank
closeness
centrality zoo
adaptive partner memory
social role
pioneer state
graph → Plate
graph → behavior
Plate birth tuning
audio/runtime optimization
```

---

# 9. S0/S1 성공 기준

성공:

- encounter definition이 physical scale에 설명 가능.
- raw temporal order 보존.
- weighted edge의 의미가 명확.
- component merge/split이 reproducible.
- bridge/connector event가 one-frame noise보다 안정적.
- useful temporal window를 고를 근거가 생김.
- graph가 behavior를 전혀 바꾸지 않음.
- 다음 null-model pass에 필요한 raw data가 준비됨.

유효한 negative result:

- graph가 대부분 density만 따라감.
- persistent bridge가 없음.
- connector event가 매우 희박.
- 모든 window가 unstable.

이 경우 behavior를 튜닝해 구조를 만들지 않는다.

---

# 10. 다음 pass 이후 판단 트리

```text
S0/S1에서 stable temporal topology 있음
        ↓
null-model validation

stable topology 거의 없음
        ↓
encounter/window semantics 재검토
        ↓
그래도 없음
        ↓
social graph는 관찰 결과 자체로 유지하거나 축소

null validation 통과
        ↓
spectral / social-material comparison 검토

null validation 실패
        ↓
density/movement explanation을 우선
        ↓
graph-based artistic mapping 보류
```