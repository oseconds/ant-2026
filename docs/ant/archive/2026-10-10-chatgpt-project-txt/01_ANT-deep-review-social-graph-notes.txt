좋아. 이번엔 **현재 ANT 구현 상태와 우리가 방금 복원한 social-graph 청사진을 전제로 Consensus를 다시 돌렸어.** 이전 Deep Review보다 질문을 훨씬 좁혀서, “ant biology를 더 붙일까?”가 아니라 **live social graph를 어떤 관찰·동역학 층으로 만들어야 기존 material/history graph와 나중에 의미 있게 만나는가**를 중심으로 봤다.

### 이번 리뷰의 출발점

현재 ANT에는 이미 서로 다른 시간척도의 환경 기억이 있다.

```text id="zf2tiu"
FAST
ant position / motion / local encounters

↓ repeated behavior

MEDIUM
PheromoneField
chemical route memory

↓

SLOW
SurfaceField
mechanical compaction

↓

VERY SLOW / FROZEN
trail skeleton → spatial graph → Plate birth
→ stratigraphy → physical vibration
```

여기에 추가하려는 것은 새로운 behavior가 아니라:

```text id="ond4zz"
LIVE SOCIAL GRAPH
ants = nodes
current/recent interaction = edges
```

다. 기존 trail graph가 **과거 행동이 환경에 굳은 graph**라면 social graph는 **현재 colony organization의 graph**가 된다. memcite

---

## Consensus에서 가장 강하게 나온 결론

### 1. 단순 proximity graph부터 시작하는 게 오히려 문헌적으로 맞다

Camponotus를 41일간 추적한 Mersch et al. 연구에서는 900만 회 이상의 interaction으로부터 functional group이 나타났고, 그 network 구조의 상당 부분이 **개체가 공간에서 어디에 머무는가(spatial fidelity)**로 설명됐다.

즉:

```text id="bbi0e8"
spatial behavior
    ↓
encounter probability
    ↓
interaction network
    ↓
functional organization
```

이 순서다.

이건 ANT 입장에서 아주 좋다. 처음부터 “친밀도”, “역할”, “사회성” 같은 숨은 변수를 만들 필요가 없다.

**현재 위치와 이동만으로 graph를 만들고 그 구조가 생기는지 먼저 보는 것 자체가 타당한 실험**이다.

Mersch, Crespi & Keller (2013), *Tracking Individuals Shows Spatial Fidelity Is a Key Regulator of Ant Social Organization*.

---

## 2. 그런데 static graph로 뭉개면 중요한 걸 잃는다

Blonder & Dornhaus의 ant 연구가 이 부분에서 상당히 직접적이다.

시간순서를 무시하고 누적 interaction graph만 보면 실제 가능한 정보 전달보다 훨씬 과장할 수 있었다. **누가 누구를 만났는가뿐 아니라 그 만남의 순서와 시간이 정보흐름의 upper bound를 결정**했다.

그래서 ANT에서도:

```text id="tslq6b"
300 s 동안 A-B가 연결됐다
```

라는 aggregate edge보다,

```text id="phg1cc"
t1 A—B
t2 B—C
t3 C—D
```

와

```text id="868bqg"
t1 C—D
t2 A—B
t3 B—C
```

는 기능적으로 다른 network라는 뜻이다.

따라서 첫 구현부터 전체 history를 복잡하게 보존할 필요는 없지만 **graph snapshot의 timestamp는 반드시 남기는 게 좋다.**

Blonder & Dornhaus (2011), *Time-Ordered Networks Reveal Limitations to Information Flow in Ant Colonies*.

---

## 3. 그래서 우리가 말했던 `DynamicSocialGraph`가 맞다

문헌을 합치면 첫 구조는 이런 정도가 가장 좋다.

```text id="ix8ni6"
AntController
    │
    ├── existing behavior
    │
    └── position snapshot
              ↓
       DynamicSocialGraph
              ↓
      G(t) = {V, E, W}
              ↓
      read-only analysis
```

중요한 건 **behavior subsystem이 graph를 읽지 않는다.**

처음에는:

```text id="q9tdhq"
Ant → Graph

NOT

Ant ↔ Graph
```

이다.

이렇게 해야 이후 emergent structure와 programmed structure를 구분할 수 있다.

---

# 4. edge는 binary보다 weighted가 결국 더 유용하다

다만 처음부터 adaptive memory를 넣으라는 뜻은 아니다.

Jeanson의 ant proximity-network 연구에서는 장기간 반복되는 association이 실제로 존재했고, 이동성이 낮은 개체는 소수의 nestmate와 지속적 관계를 가지는 반면 mobile worker는 더 균등하게 여러 개체를 만났다.

즉 향후에는

```text id="xb97iz"
edge = yes/no
```

보다는

```text id="g51oh9"
w_ij(t)
```

가 자연스럽다.

다만 첫 버전에서는 adaptive relation을 만들지 않고:

```text id="r2tv1n"
instantaneous weight
= f(distance)
```

또는

```text id="sibxw4"
short-window weight
= recent proximity/contact duration
```

정도만 기록하는 게 좋다.

그다음 정말 반복 관계가 보일 때:

```text id="hic9ft"
dw_ij/dt =
interaction reinforcement
-
decay
```

같은 slow memory를 추가한다.

이게 우리가 전에 말했던 **Adaptive Network** 단계다.

---

# 5. 중요한 발견: spatial organization 자체가 social computation일 수 있다

이건 ANT와 상당히 잘 맞는다.

Pinter-Wollman et al.의 harvester ant 연구에서는 highly connected ant가 미리 지정된 특별한 caste여서 central한 게 아니었다.

개체의 **경로 형태와 공간 위치**가 interaction frequency를 만들었고, 그 결과 heterogeneous connectivity와 interaction hotspot이 만들어졌다. 그리고 그 heterogeneity가 정보 전달을 빠르게 했다.

즉:

```text id="nx050m"
special individual
→ network hub
```

만 있는 것이 아니라,

```text id="9qjm9d"
movement geometry
→ encounter asymmetry
→ hub-like individual
```

도 가능하다.

그래서 우리가 이야기한 **pioneer를 role로 미리 지정하지 않는 접근**과 굉장히 잘 맞는다.

ANT에서는 pioneer를:

> 새로운 영역으로 먼저 간 ant

라고 hard-code하는 대신,

> graph topology를 실제로 변화시킨 ant

로 사후 검출하는 편이 더 흥미롭다.

예를 들면:

```text id="etwr02"
component A      component B

      pioneer enters

component A ─ p ─ component B
```

그리고 이후에:

```text id="719eji"
bridge lifetime
followers
reuse
route reinforcement
Plate birth
```

를 추적한다.

---

# 6. `bridge` / articulation은 실제로 좋은 관찰 변수다

하지만 여기서 한 가지 수정할 게 있다.

단순히:

```text id="ghibk1"
bridgeCount
articulationCount
```

만 기록하면 network 크기와 density에 너무 쉽게 영향을 받는다.

그래서 raw count와 함께 최소한 normalization 또는 context를 같이 보존하는 게 좋다.

예:

```text id="umrstz"
bridge fraction
= bridges / edges

articulation fraction
= articulation nodes / active nodes
```

그리고 더 중요한 것은 **event 형태**다.

```text id="27k5xu"
BRIDGE_FORM
BRIDGE_PERSIST
BRIDGE_BREAK

COMPONENT_MERGE
COMPONENT_SPLIT
```

이게 단순 scalar보다 ANT에서는 훨씬 유용하다.

Plate birth와도 이벤트 단위로 시간 상관을 볼 수 있기 때문.

---

# 7. λ₂는 여전히 좋은데, “사회성 숫자”로 해석하면 안 된다

우리가 전에 이야기했던 graph Laplacian은 이번 리뷰에서도 꽤 타당해 보인다.

```text id="nbbqz6"
L = D - A
```

의 spectrum에서:

```text id="0eo64q"
λ1 = 0

λ2
= algebraic connectivity
```

는 network가 구조적으로 얼마나 잘 연결됐는지 보는 좋은 값이다.

예를 들어:

```text id="josbx4"
one dense component
λ₂ relatively high

two clusters + thin bridge
λ₂ low

bridge breaks
λ₂ → 0
```

따라서 ANT의

```text id="4t925z"
cluster ↔ bridge ↔ merge ↔ split
```

변화를 한 축으로 읽는 데 굉장히 편하다.

하지만 중요한 주의점이 있다.

**λ₂가 높다 = colony가 더 잘 조직됐다**

라고 하면 안 된다.

실제 동물 network 문헌에서는 특정 network metric 변화가 collective performance 변화와 직접 대응하지 않는 사례가 있다.

Fisher & Pinter-Wollman의 temporal multilayer 연구에서도 network stability와 collective prey-attack performance가 단순 대응하지 않았다.

그러니 λ₂는 우선:

> collective organization의 관찰 좌표

이지

> fitness / intelligence / social quality

가 아니다.

이 구분은 꽤 중요하다.

---

# 8. 오히려 Laplacian에서 더 재미있는 건 eigenvector다

여기서 우리가 전에 잡은 청사진이 다시 중요해진다.

λ₂ 하나보다 ANT/Plate와 연결하기 좋은 건 **저차 graph eigenmodes**다.

예를 들어 두 cluster가 한 bridge로 연결돼 있다면 Fiedler vector는 대략:

```text id="uausxg"
cluster A      bridge       cluster B

+++++++           |        -------
+++++++           |        -------
```

처럼 network의 느린 collective separation mode를 나타낼 수 있다.

이걸 나중에 Plate에 연결하면:

```text id="cc09f3"
social graph

eigenmode φ₂
eigenmode φ₃
eigenmode φ₄
       ↓
weak projection
       ↓
spatial Plate excitation
```

처럼 갈 수 있다.

이건

```text id="yeuggt"
bridgeCount → pitch
```

보다 훨씬 ANT답다.

사회구조의 **형태 자체가 excitation pattern**이 되는 거니까.

다만 graph-Laplacian eigenmode를 ant biology가 직접 사용하는 것은 아니다.

여기는 명확하게:

> biologically grounded interaction network  
> + mathematically/artistic spectral interpretation

이라고 구분해야 한다.

---

# 9. 더 재미있는 부분: topology가 정보 자체를 encode할 수 있다

fish collective literature이긴 하지만 꽤 중요한 결과가 있었다.

Sosna et al. 연구에서는 위험상황에 대한 collective sensitivity 변화가 개별 fish의 social-response rule 변화보다 **집단의 공간구조가 바뀌면서 interaction-network topology가 달라지는 것**으로 크게 설명됐다.

즉:

```text id="293w6z"
information stored in nodes
```

만이 아니라

```text id="kw6opq"
information encoded in edges/topology
```

가 가능하다.

이게 ANT에서 adaptive network를 나중에 넣을 명확한 근거가 된다.

사회적 기억을 굳이:

```text id="stc1xt"
ant.memory = ...
```

로 만들 필요 없이,

```text id="ppqfqu"
edge persistence
network topology
```

에 둘 수 있다는 것.

---

# 10. adaptive network는 실제 ant에서도 완전히 뜬구름은 아님

Lasius niger의 pathogen experiment에서는 병원체 노출 후 ants와 nestmates가 행동을 바꿔 **contact-network topology 자체를 재구성**했고, 그 결과 disease transmission이 제한됐다.

즉 social network plasticity가 실제 사회성 곤충에서도 관찰된다.

따라서 후반의:

```text id="lafimj"
current encounter
       ↓
edge reinforcement
       ↓
persistent relation
       ↓
network restructuring
```

은 예술적으로만 가능한 발상이 아니다.

하지만 현재 ANT에는 disease/task/caste가 없으므로 그 biological mechanism을 그대로 흉내낼 이유는 없다.

우리는 **network plasticity라는 원리만 차용**하면 된다.

---

# 11. 여기서 기존 material graph와 굉장히 좋은 대조가 생긴다

이건 Consensus 결과와 현재 ANT를 합치면서 더 확실해졌다.

우리에겐 이미:

```text id="vxjaxk"
MATERIAL GRAPH
trail skeleton / frozen Plate topology
```

가 있다.

이것은:

```text id="hr6gjg"
slow
spatial
persistent
history-derived
```

다.

새 social graph는:

```text id="v3uzqd"
SOCIAL GRAPH
current/recent ant relations
```

이고:

```text id="92hsqu"
fast
mobile
ephemeral
interaction-derived
```

다.

그래서 앞으로 중요한 변수는 각각의 graph 내부 metric만이 아니라 **두 graph의 관계**가 될 수 있다.

예:

```text id="86szbx"
social connectivity high
material connectivity low
```

→ colony가 아직 환경보다 먼저 조직되고 있음.

반대로:

```text id="66hyh9"
social connectivity low
material connectivity high
```

→ 과거 집단구조가 물질로 남아 있지만 현재 colony는 해체됨.

또는:

```text id="9g30mu"
social bridge
→ repeated traffic
→ trail skeleton
→ Plate
```

가 반복된다면:

> transient social topology가 persistent material topology로 변환되는 과정

을 실제로 볼 수 있게 된다.

이건 지금 ANT에서 꽤 강한 개념축이 될 수 있어.

---

# 12. vibration은 더 나중에 이 두 network를 잇는 제3의 동역학층이 될 수 있음

Consensus에서 vibration 쪽도 다시 확인했다.

곤충의 substrate-borne signaling에서는 **substrate가 passive carrier가 아니다.** 재질의 이질성 자체가 transmission을 크게 바꾸며, Atta에서는 진동 도달 시간차를 이용해 source 방향을 찾는 것도 확인되어 있다.

따라서 먼 훗날 구조는:

```text id="93zltg"
LIVE SOCIAL GRAPH
        ↓
collective mode
        ↓
PLATE / MATERIAL GRAPH
        ↓
physical vibration field
        ↓
ant mechanosensing
        ↓
LIVE SOCIAL GRAPH
```

로 닫을 수 있다.

그러나 지금 이것을 닫으면 원인을 잃는다.

그래서 네가 잡은:

```text id="zk6zss"
observe
→ measure
→ weak one-way mapping
→ memory
→ closed loop
```

순서가 연구적으로도 꽤 설득력이 있다.

---

## 이번 리뷰를 반영한 실제 단계

나는 이제 이렇게 가는 게 제일 좋다고 봐.

| Pass | 추가되는 것 | 행동 영향 |
|---|---|---:|
| **S0** | `DynamicSocialGraph` | 없음 |
| **S1** | temporal metrics + merge/split/bridge events | 없음 |
| **S2** | Laplacian spectrum + low modes | 없음 |
| **S3** | graph mode → Plate weak one-way coupling | Plate만 |
| **S4** | slow edge/adaptive memory | social graph 구조 변화 |
| **S5** | social graph ↔ material graph comparison | 분석 |
| **S6** | Plate vibration → ant sensing | 행동 영향 시작 |
| **S7** | full social↔material feedback | 폐루프 |

특히 **S0–S2를 하나의 관찰 프로젝트**로 보는 게 좋아.

S2까지 해도 기존 ANT behavior는 단 한 줄도 바뀌지 않는다.

---

## S0에서 처음부터 저장하면 좋은 데이터

너무 많은 centrality를 만들 필요는 없다. Consensus 문헌까지 본 뒤에는 오히려 아래 세 층으로 나누는 게 깔끔해 보여.

```text id="88bixt"
TOPOLOGY
componentCount
largestComponentRatio
edgeDensity
bridgeFraction
articulationFraction
λ₂

TEMPORAL EVENTS
componentMerge
componentSplit
bridgeForm
bridgeBreak
edgeLifetime

NODE EVENTS
degree
weightedDegree
bridgeCreator
componentJoiner
```

그리고 spectral pass에서만:

```text id="xewszp"
λ₁ ... λₖ
φ₂ ... φₖ
```

를 붙인다.

`betweenness`, `closeness`, `PageRank`, 여러 community algorithm 같은 건 처음부터 넣을 필요 없다.

---

## 중요한 실험 설계 하나

Consensus 문헌에서 계속 반복되는 문제가 **network를 어떤 시간창으로 만들었느냐에 따라 구조가 달라진다**는 거였다.

그래서 social radius보다 오히려 먼저 신경 쓸 게:

```text id="qzf447"
instant graph
short temporal graph
long aggregate graph
```

의 구분이다.

ANT라면 처음부터 세 graph를 만들 필요는 없고, raw encounter stream을 보존해두고 분석에서:

```text id="pq4oyg"
250 ms
1 s
5 s
20 s
```

같은 window를 sweep해 보는 게 좋다.

그러면 나중에 우리가 마음대로 “1초가 social interaction time”이라고 정하지 않고,

> 어떤 scale에서 graph morphology가 안정적으로 나타나는가

를 데이터에서 찾을 수 있다.

이건 꽤 중요해 보여.

---

# Consensus에 준 딥리뷰 질문의 최종 형태

이번 연구는 사실상 아래 질문으로 걸었다.

:::writing{variant="standard" id="58314" title="ANT Social Graph Deep Review Brief"}
ANT 시뮬레이션 프로젝트의 다음 단계로, 기존 material/history system은 그대로 유지하면서 live social interaction을 독립적인 dynamic graph layer로 추가하려고 한다.

현재 ANT에는 이미 다음 구조가 구현되어 있다.

- 동등한 ant agent들의 개별 이동과 지속적 성향
- local occupancy / contact avoidance
- 실제 6-leg gait와 FOOT_CONTACT
- PheromoneField라는 비교적 빠른 chemical shared memory
- SurfaceField라는 느린 mechanical compaction memory
- 반복된 chemical + mechanical route를 skeletonize하고 graph로 변환하는 TrailPlateBirth
- frozen Plate geometry와 material stratigraphy
- Plate 간 Z coupling, buried material, physical vibration/audio

즉 현재 존재하는 trail/material graph는 “과거의 반복된 집단 행동이 환경에 동결된 spatial/history graph”이다.

새로 추가하려는 것은 이것과 별개의 live social graph다.

- node = 현재 ant
- edge = 현재 또는 최근의 proximity / encounter / interaction
- graph는 처음에는 read-only이며 ant behavior에 feedback하지 않는다.
- 목적은 새로운 사회적 행동을 프로그래밍하는 것이 아니라 현재 움직임에서 collective topology가 자연스럽게 발생하는지 관찰하는 것이다.

관심 있는 초기 변수는 다음과 같다.

- connected components
- cluster structure
- component merge / split
- graph-theoretic bridges
- articulation nodes
- edge lifetime
- weighted degree
- algebraic connectivity λ₂
- low-order graph Laplacian eigenmodes
- 특정 개체가 새로운 component connection을 만드는 pioneer-like event

“pioneer”는 미리 지정된 caste나 role이 아니라, topology를 변화시킨 개체를 사후적으로 검출하는 개념으로 본다.

장기적으로는 다음 순서를 고려한다.

1. 현재 ant positions / encounters → dynamic social graph 시각화
2. graph topology와 temporal events만 기록
3. Laplacian spectrum / collective graph modes 분석
4. 그중 일부를 기존 Plate excitation 또는 mode weighting에 매우 약한 one-way coupling으로 연결
5. 구조가 충분히 읽힐 경우에만 repeated co-presence / interaction history를 이용한 adaptive edge memory 추가
6. live social graph와 기존 frozen material/history graph 사이의 관계 분석
7. 이후에야 material vibration/stress → ant sensing을 추가해 social↔material feedback loop를 닫는다

다음 질문을 peer-reviewed literature 전체의 개념적 지형으로 Deep Review해 달라.

1. ant/social insect 연구에서 interaction network, proximity network, contact network가 실제로 어떻게 정의되고 측정되는가?
2. spatial fidelity, encounter rate, interaction heterogeneity가 colony-level organization과 어떻게 연결되는가?
3. static aggregated graph와 temporal/time-ordered graph는 어떤 점에서 다른 결론을 주는가?
4. interaction network에서 cluster, modularity, bridge/broker-like individuals, connectivity가 실제 collective function이나 information flow와 연결된 근거는 얼마나 강한가?
5. dynamic animal social network에서 어떤 metric들이 비교적 해석 가능하고, 어떤 metric들은 과해석 위험이 큰가?
6. graph construction에서 interaction radius, contact duration, hysteresis, temporal aggregation window를 선택할 때 알려진 methodological pitfalls는 무엇인가?
7. weighted/directed/temporal/multilayer graph 중 ANT의 첫 read-only implementation에 가장 타당한 최소 모델은 무엇인가?
8. graph Laplacian, algebraic connectivity λ₂, spectral gap, low-order eigenvectors를 animal collective behavior에 사용하는 데 어떤 근거와 한계가 있는가?
9. time-varying graph에서 eigenmodes나 community structure를 추적할 때 mode switching / eigenvector sign / near-degenerate eigenvalues 같은 기술적 문제를 어떻게 다루는 것이 좋은가?
10. adaptive social networks 또는 edge memory를 뒷받침하는 animal/social-insect evidence는 무엇인가? 단순 proximity accumulation과 genuine relationship memory를 어떻게 구분해야 하는가?
11. 특정 개체가 일시적으로 두 component를 연결하는 “pioneer / broker / bridge creator” 현상을 role을 미리 지정하지 않고 검출하는 데 적합한 방법이 있는가?
12. network topology 자체가 information 또는 collective state를 encode한다고 볼 수 있는 연구 근거는 무엇인가?
13. 현재의 transient social graph와 과거 행동이 고정된 environmental/material graph를 서로 비교하는 것과 유사한 multilayer / coupled-network 연구가 있는가?
14. substrate-borne vibration이나 environmental coupling을 network-mediated collective dynamics와 연결한 실증 또는 모델 연구가 있는가?
15. 향후 social graph mode → physical material excitation 같은 매핑을 만들 경우, 어떤 부분까지 biological analogy로 볼 수 있고 어디부터 artistic/modeling interpretation이라고 명시해야 하는가?

결과는 단순 논문 나열보다 다음 기준으로 정리한다.

- 반복적으로 확인되는 강한 실증 결과
- ant/social-insect specific evidence
- broader animal collective evidence
- network science / mathematical extension
- 아직 직접적 근거가 약한 artistic interpretation
- 서로 충돌하거나 연구가 부족한 부분
- ANT에서 바로 측정 가능한 변수
- 처음 구현하면 안 되는 과도한 변수
- null model / ablation / parameter sweep 제안
- social graph와 material graph를 나중에 연결하기 전에 확인해야 할 emergence criterion

마지막에는 ANT 현재 구조를 최대한 보존한다는 조건으로,

- first-pass graph definition
- temporal representation
- 최소 metric set
- pioneer-event detection
- Laplacian analysis
- adaptive-memory 도입 조건
- Plate와 처음 연결할 가장 약한 coupling

을 구체적인 구현 우선순위로 추천해 달라.
:::

이번 Consensus 결과를 보면 **이 방향은 꽤 괜찮다.** 특히 “social graph를 그냥 예쁜 연결선이나 centrality dashboard로 추가하는 것”보다, **현재 colony의 빠른 topology와 이미 존재하는 느린 material topology 사이에 시간차가 있는 두 개의 network를 놓는 것**이 ANT의 기존 개념을 훨씬 자연스럽게 확장한다.

다음은 이걸 바탕으로 **S0/S1 구현 명세를 Codex에 줄 수 있을 정도로 구체화**하면 될 것 같아. memcite