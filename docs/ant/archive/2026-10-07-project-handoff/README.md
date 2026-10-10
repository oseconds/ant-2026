# ANT_2026 Session Handoff Index — 2026-10-07

이 폴더는 2026-10-07 세션 종료 시점의 ANT_2026 상태를 다음 세션/에이전트가 빠르게 이어받기 위한 source-friendly handoff다.

## Canonical source order

다음 순서로 읽고, 충돌 시 위 문서를 우선한다.

1. `ANT_2026_progress_blueprint_2026-10-07.md`
   - 장기 청사진 / 현재 source of truth
2. `01_CURRENT_STATE.md`
   - 현재 production baseline / 동결값 / known issue
3. `02_EXPERIMENTS_AND_DECISIONS.md`
   - 최근 실험과 채택·기각·보류 판정
4. `03_NEXT_PASSES.md`
   - 바로 다음 구현 순서
5. `04_REPO_AND_COMMITS.md`
   - repo / commit / untracked handoff
6. `ANT 시뮬레이션 딥리뷰.txt`
   - 연구·개념 배경
7. `I_am_developing_an_agent-based_ant_simulation_in_w.pdf`
   - read-only ant social network Deep Review

### 중요: 오래된 roadmap 표 주의

`ANT 시뮬레이션 딥리뷰.txt` 안에는 초기 버전의:

```text
S0 DynamicSocialGraph
→ S1 temporal metrics
→ S2 Laplacian
→ S3 Plate coupling
```

순서가 남아 있을 수 있다.

이 순서는 **현재 superseded 상태**다.

현재 채택된 순서는:

```text
DynamicSocialGraph
→ temporal observables
→ movement-constrained null validation
→ spectral only if useful
→ social/material comparison
→ weak coupling
```

이다.

즉 **null-model validation이 spectral보다 먼저**다.

---

## 읽는 순서

### `01_CURRENT_STATE.md`

- 지금 무엇이 production baseline인지
- 어떤 값과 동작을 동결해야 하는지
- 현재 알려진 문제

### `02_EXPERIMENTS_AND_DECISIONS.md`

- 이번 세션에서 무엇을 실험했고
- 무엇을 채택/기각/보류했는지
- 왜 그렇게 판단했는지

### `03_NEXT_PASSES.md`

- 바로 다음 본선
- S0/S1 DynamicSocialGraph 범위
- 이후 null-model → spectral → material coupling 청사진

### `04_REPO_AND_COMMITS.md`

- 최근 주요 commit
- untracked wake-gate diagnostic 주의
- 다음 작업 시작 전 Git 체크리스트

---

## 현재 한 줄 상태

ANT는 현재

```text
equal ants
→ pheromone
→ SurfaceField
→ TrailPlateBirth
→ MaterialStratigraphy
→ Plate / Z / Sphere audio
```

까지 연결돼 있고,

- founder-effect refinement 채택
- direct-contact sonic baseline 채택
- mature AudioWorklet runtime collapse는 known issue로 보류
- 다음 본선은 behavior를 건드리지 않는 read-only `DynamicSocialGraph` S0/S1

상태다.

---

## 현재 production에서 동결할 것

다음 S0/S1 pass에서는 아래를 변경하지 않는다.

```text
movement / steering / speed
gait
collision
population activation
pheromone half-life
reinforcement gain
founder-refinement constants
SurfaceField
Plate birth thresholds
MaterialStratigraphy semantics
direct exposed-Plate routing
3 ms direct-contact pulse
75 ms local recovery
×50 Plate damping
sleep/wake rules
```

Social graph는 반드시 read-only observation layer여야 한다.

---

## Runtime issue를 나중에 다시 열 때 기억할 핵심 증거

현재 handoff에서 runtime optimization은 본선이 아니지만, 재개 시 아래를 다시 확인하는 삽질을 반복하지 않는다.

- natural 30-Plate 상태에서 oldest layer의 longest quiet streak는 **4 / 12,000 steps** 수준이었다.
- oldest Plate는 source-mask 기준 거의 전부 buried였지만 solver node는 **119 / 119 active**였다.
- no-new-strike captured replay에서는 full coupling 상태에서도 oldest layer가 약 **6.05 s** 후 sleep했다.
- Z + Sphere coupling을 끈 replay도 약 **5.99 s** 수준이었다.
- 따라서 sleep API 자체가 근본적으로 broken인 것이 아니라, natural run의 ongoing excitation / Plate restoring state가 핵심이다.
- `asleepToAwake` diagnostic counter는 initial activation까지 포함해 misleading할 수 있었으므로 실제 re-wake proof로 쓰면 안 된다.
- stateless target-energy wake gate는 weak signed Z accumulation을 잘라서 **기각**.
- tested eigenmode ROM은 useful fidelity rank에서 full solver보다 비싸 **기각**.

향후 runtime을 다시 연다면 ROM을 바로 재개하기보다:

> material history는 유지하되 deep buried material의 acoustic participation / active acoustic depth를 제한할 수 있는가

같은 더 단순한 architecture hypothesis부터 검토할 가치가 있다.

이것은 아직 production decision이 아니라 **future candidate**다.

---

## Founder refinement를 과해석하지 말 것

현재 founder pass에서 확인된 것은:

> early low-evidence lock-in pressure를 줄이는 작은 수정이 유효했다.

이지:

> founder effect 전체 원인을 증명했다.

가 아니다.

남은 한계:

- commitment 단축과 baseline deposition 감소의 개별 기여는 ablation하지 않음.
- `E ≈ 0`인데 far-only directional cue가 있는 경우 첫 commitment도 단축될 수 있음.
- residual `trailAdherence`의 `reinforcementGain × A²`는 그대로 유지.
- natural validation은 3 seeds × 600 s.
- branch endpoint persistence proxy는 움직이는 branch를 과소계수할 수 있음.
- Chrome / Node는 initial condition 이후 floating/runtime 차이로 trajectory가 갈라질 수 있음.

따라서 이 pass 이후 behavior를 더 튜닝해 “branch를 늘리는 것”은 현재 목표가 아니다.

---

## Founder evidence에서 얻은 visualization note

`cumulative coverage`는 300–600 s에서 쉽게 포화되어 morphology 차이를 읽기 어려웠다.

향후 evidence에서는 cumulative map만 쓰지 말고 다음 중 하나 이상을 같이 보는 것이 좋다.

```text
recent 30 s occupancy
recent 120 s occupancy
first-visit age
revisit count
```

이 원칙은 social graph evidence에서도 유용하다.

---

## S0/S1에서 꼭 보존할 비교

S0/S1의 목적은 “그래프가 생겼다”가 아니라:

> graph topology가 단순 density / proximity count를 다시 그린 것 이상인가?

를 다음 pass에서 검증 가능하게 만드는 것이다.

S0/S1 자체에서도 최소 descriptive baseline으로 아래를 같이 기록한다.

```text
population size
local ant density
pairwise proximity count
occupancy concentration
```

그리고 graph 쪽은:

```text
edge count / density
component count
largest component ratio
weighted degree
edge lifetime
merge / split
persistent bridge / articulation
retrospective connector event
```

를 본다.

### controlled topology fixture 권장

작은 deterministic fixture:

```text
two disconnected pairs
→ bridge ant enters
→ component merge
→ bridge leaves
→ component split
```

에서 exact event ordering을 검증한다.

### visualization

production renderer를 불필요하게 복잡하게 만들지 말고 diagnostic/evidence layer를 우선한다.

추천:

```text
ant positions + encounter edges
component coloring
recent temporal graph
component-count timeline
merge/split/bridge timeline
selected connector snapshots
```

---

## 연구 근거와 예술적 해석 구분

### 비교적 강한 연구 근거

- movement / spatial fidelity만으로 interaction topology가 생길 수 있음
- temporal order가 중요함
- weighted temporal graph가 first-pass로 타당함
- component / edge lifetime / merge-split 같은 직접 관찰값이 해석 가능성이 높음
- spatial/movement-preserving null model이 중요함

### 연구 근거가 약하거나 조건부

- bridge individual의 기능적 중요성
- λ₂를 biological quality score처럼 해석
- low-order eigenmode를 ant biology의 실제 collective mode로 해석

### 예술적 / 모델링 확장

```text
social graph low-order mode
→ weak material excitation / weighting
```

같은 mapping은 가능하지만, biology가 직접 그렇게 작동한다는 주장은 하지 않는다.

---

## Prompt / agent workflow policy

Codex/agent task prompt에는 **subagent model, child role, reasoning level, orchestration 방식**을 직접 적지 않는다.

이 항목들은 전역 config / harness에서 관리한다.

즉 task prompt는 기본적으로:

```text
task scope
constraints
success criteria
evidence requirements
commit policy
```

만 명시한다.

특정 세션에서 별도 이유가 없는 한:

- “Use Luna subagents…”
- “Use Sol Ultra reasoning…”
- child model / effort 지정
- subagent count 지정

같은 문구를 task prompt에 넣지 않는다.

---

## 현재 운영 원칙

- 결과를 직접 코딩하지 않는다.
- pioneer / bridge / hub는 role이 아니라 사후 관찰 event로 다룬다.
- 새 관찰층은 behavior에 feedback하지 않는다.
- spectral은 null-model validation보다 뒤다.
- mature runtime optimization은 당분간 본선이 아니다.
- negative result를 구조 생성 실패로 보고 behavior를 억지로 튜닝하지 않는다.
- 작은 검증 가능한 pass로 진행한다.