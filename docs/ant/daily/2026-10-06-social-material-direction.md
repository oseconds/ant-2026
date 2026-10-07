# 2026-10-06 — Social / Material Two-Axis Direction

## 이날의 질문

ANT를 단순 “개미가 움직이고 흔적을 남기는 시뮬레이션”에서 더 흥미롭게 확장하려면 무엇을 관찰해야 하는가?

사용자 방향은 명확했다.

> 개별 ant 자체보다 연결, 군체 전체의 형태, 환경과의 관계가 시각·청각적으로 더 흥미롭다.

---

## 1. 단순 공생 / 자연 모사에서 벗어나기

자연·생태를 오디오에 붙이는 사례를 보면서 단순히:

```text
ant behavior → sound parameter
```

를 늘리는 것보다,

```text
collective organization
environmental accumulation
material transformation
```

을 작품의 핵심 축으로 보는 쪽이 더 적합하다고 정리했다.

---

## 2. 두 축의 발견

현재 ANT에는 이미 사실상 하나의 graph가 있다.

### Material graph

```text
trail skeleton
→ frozen Plate topology
→ stratigraphy
```

특성:

```text
slow
spatial
persistent
history-derived
```

그리고 새로 관찰할 수 있는 축:

### Social graph

```text
current/recent ant encounters
```

특성:

```text
fast
mobile
ephemeral
interaction-derived
```

이 두 축을 나란히 두는 방향이 장기적으로 가장 흥미로운 구조로 떠올랐다.

---

## 3. Pioneer 개념 수정

처음부터:

```text
ant.role = pioneer
```

같은 특별 상태를 만들지 않는다.

대신:

> topology를 실제로 변화시킨 ant를 사후적으로 검출한다.

예:

```text
component A      component B

       ant P enters

component A --- P --- component B
```

그 뒤:

```text
bridge lifetime
followers
reuse
route reinforcement
Plate birth
```

를 추적할 수 있다.

이때 pioneer는 **role이 아니라 event descriptor**다.

---

## 4. 왜 social graph가 지금 맞는가

현재 movement system만으로도:

- corridor
- fan
- local crowding
- repeated co-presence
- route convergence/divergence

가 생긴다.

따라서 새 social behavior를 코딩하기 전에:

```text
existing movement
→ encounter topology
```

가 자연스럽게 발생하는지 먼저 관찰하는 것이 맞다.

---

## 5. 연구 질문 정리

이날 이후 Deep Review 질문은 다음 중심으로 좁아졌다.

- ant/social insect interaction network는 실제로 어떻게 정의되는가
- proximity / contact / temporal edge 중 무엇이 첫 구현에 적합한가
- static aggregation과 temporal graph의 차이
- bridge / articulation / broker 해석의 한계
- spatial fidelity / density confound
- window width / radius / minimum duration 선택 문제
- null model은 무엇을 보존해야 하는가
- λ₂ / low-order modes는 어디까지 의미가 있는가
- social graph와 material graph를 어떻게 비교할 수 있는가
- vibration을 나중에 어떻게 두 network 사이에 넣을 수 있는가

---

## 6. 연구 근거와 예술적 확장의 경계

이날 이후 계속 유지되는 구분:

### 연구적으로 비교적 강한 부분

```text
movement / spatial fidelity
→ encounter structure

temporal order matters

weighted temporal graph
→ plausible first representation
```

### 연구적으로 더 약한 부분

```text
bridge individual
→ functional special individual

λ₂
→ biological quality

eigenmode
→ actual ant collective mode
```

### 예술적 / 모델링 확장

```text
social graph mode
→ Plate excitation
```

이건 직접적인 ant biology가 아니라:

> biologically grounded interaction graph
> + mathematical/artistic interpretation

으로 분리해서 설명해야 한다.

---

## 7. 장기 개념축

이날 정리된 가장 강한 장기 흐름:

```text
transient social topology
        ↓
repeated traffic
        ↓
chemical / mechanical trace
        ↓
trail skeleton
        ↓
persistent material topology
```

즉:

> 현재 사회 구조가 어떻게 환경의 물질적 역사로 변환되는가?

가 ANT의 중심 질문 후보가 됐다.

---

## 이날의 최종 방향

```text
behavior 더 추가
X

현재 behavior 관찰
→ social topology
→ material history와 비교
O
```

이 방향이 10/07의 Deep Review 반영 및 S0/S1 설계로 이어졌다.