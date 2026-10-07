# 2026-10-07 — Founder Refinement / Social Graph Handoff

## 이날의 큰 흐름

1. founder-effect / early lock-in 가설을 작은 production pass로 검증
2. matched-seed evidence 확인
3. behavior를 동결
4. visual evidence에서 cumulative coverage의 한계 확인
5. Deep Review 결과를 반영해 social-graph roadmap 수정
6. 다음 본선을 S0/S1 read-only `DynamicSocialGraph`로 확정
7. project source / handoff / workflow policy 정리

---

# A. Founder-effect refinement

## 1. 출발점

기존 behavior audit에서 두 low-evidence asymmetry 확인.

### decision / commitment

absolute trail evidence가 거의 없어도 기존 duration을 그대로 사용.

### deposition

`trailAdherence = 0`이어도 baseline multiplier:

```text
0.5
```

유지.

즉 accidental early route도 충분히 trace를 남길 수 있었다.

---

## 2. 기존 scalar 분리

### Absolute evidence E

두 near cross-section의 peak를 사용.

```text
H(c,h) = c³ / (c³ + h³)

E = H(sqrt(peak1 × peak2), 0.018)
```

의미:

> 방향 contrast가 아니라 trail signal 자체가 실제로 존재하는 정도.

### Directional confidence F

far candidate direction들의 response contrast.

### Trail adherence A

기존 adherence dynamics 유지.

기존 decision confidence:

```text
K = max(F, A)
```

는 그대로 둠.

---

## 3. production 변경

`AntController.js`에 매우 작은 변경만 적용.

```text
durationScale = 0.8 + 0.2 * E

new decision  = old decision  * durationScale
new committed = old committed * durationScale

depositionMultiplier =
    0.5 * (0.75 + 0.25 * E)
    + reinforcementGain * A**2
```

### E = 0

```text
decision/commitment
→ 20% shorter

baseline deposition
0.5 → 0.375
```

### E → 1

기존 behavior로 연속 복귀.

변경하지 않음:

- exploration probability
- exploration noise
- steering
- max turn
- speed
- gait
- collision
- sensors
- pheromone half-life
- reinforcement gain
- SurfaceField
- recruitment
- Plate birth

---

## 4. matched-seed natural evidence

Seeds:

```text
20261005
20261006
20261007
```

각 600 s.

평균 pheromone mass:

```text
30 s   41.90 → 27.53   -34.3%
60 s   98.27 → 72.23   -26.5%
120 s  190.34 → 153.77 -19.2%
300 s  248.87 → 219.94 -11.6%
600 s  230.91 → 231.41 +0.2%
```

즉:

```text
early trace weaker
mature total mass recovers
```

평균 Plate count:

```text
120 s  1.00 → 0.33
300 s  13.00 → 8.67
600 s  35.33 → 30.33
```

mature material formation은 계속 유지.

---

## 5. FOOT_CONTACT / movement 해석

actual individual `FOOT_CONTACT`는 세 seed 모두 오히려 소폭 증가.

따라서 early pheromone 감소는:

```text
less movement
```

때문이 아니라:

```text
same / more movement
+
lower low-evidence deposition
```

으로 해석.

---

## 6. Route morphology

AFTER도 300–600 s에서 mature corridor / branch fan이 형성됐다.

다만 변화는 seed-dependent.

- 어떤 seed는 더 넓게 탐색.
- 어떤 seed는 더 좁고 선택적으로 consolidation.
- “분기가 항상 증가”하지 않음.

이 점을 긍정적으로 해석.

> branch를 프로그래밍한 것이 아니라 early lock-in pressure만 조정했기 때문.

---

## 7. initial corridor influence

600 s chemical mass 중 BEFORE 30 s corridor mask 안에 남은 fraction:

```text
seed05  3.705 → 2.765%
seed06  5.868 → 5.026%
seed07  4.781 → 3.007%
```

이는 초기 spatial trace의 장기 영향이 줄었다는 증거.

단:

> individual founder causality 자체를 증명한 것은 아님.

---

## 8. Plate birth side effect 확인

first Plate birth:

```text
seed05  149.02 → 103.02 s
seed06   95.02 → 220.02 s
seed07   81.02 → 145.02 s
```

600 s Plate count:

```text
34 → 32
36 → 28
36 → 31
```

same-corridor repeats:

```text
2 → 2
1 → 2
5 → 1
```

한 seed는 빨라지고 두 seed는 늦어짐.

따라서 별도 Plate birth retune 근거 없음.

---

## 9. validation

- baseline 237 / 237
- final 241 / 241
- focused new tests 4 / 4
- build green
- Chrome dev/prod smoke green
- six natural runs finite / collision / speed / field violation 없음
- source/worklet external region byte-identical
- measurement fix 후 checkpoint hashes 재검증

관련 commit:

```text
596555d47a4c27f8c6c5e0076bfeda95af512618
Refine low-evidence ANT exploration

f19681a5f86e620a1c3dd8cedad113806323d45d
Add founder-effect evidence harnesses

e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9
Record founder-effect refinement evidence
```

---

## 10. 남은 한계

두 변경은 따로 ablation하지 않음.

남은 risk:

- far-only cue + low E에서 첫 commitment가 짧아질 수 있음.
- residual `reinforcementGain × A²` 유지.
- natural seeds 3개.
- branch endpoint proxy가 moving branch를 과소계수 가능.
- Chrome / Node trajectory는 initial parity 이후 numerical 차이로 갈라질 수 있음.

최종 판정:

> behavior는 여기서 동결.

---

# B. Visual evidence review

최종 before/after sheet를 확인.

시각적으로:

- early AFTER pheromone이 더 약함.
- recent occupancy는 계속 존재.
- mature route는 다시 형성.
- morphology는 seed마다 다름.

중요한 시각화 교훈:

```text
cumulative coverage
```

는 300–600 s에서 거의 포화되어 morphology 차이를 읽기 어렵다.

향후:

```text
recent 30 s occupancy
recent 120 s occupancy
first-visit age
revisit count
```

중 하나 이상 병행.

---

# C. Deep Review 반영

문헌 검토에서 strongest recommendation:

```text
weighted temporal contact/proximity graph
+
preserve event order
+
window sweep
+
movement-constrained null
```

그리고 중요한 caution:

- repeated proximity ≠ persistent social relationship
- bridge ≠ leader/caste
- λ₂ / eigenmode는 biological evidence가 상대적으로 약함
- null model이 auxiliary가 아니라 central

따라서 오래된 roadmap:

```text
dynamic graph
→ Laplacian
→ Plate
```

을 수정.

현재 roadmap:

```text
dynamic graph
→ temporal observables
→ movement-constrained null validation
→ spectral only if useful
→ social/material comparison
→ weak coupling
```

---

# D. 다음 본선 확정 — S0/S1

## S0

```text
DynamicSocialGraph
```

- active ant = node
- current/recent encounter = edge
- undirected
- weighted
- temporal
- raw event stream 보존

## S1

- component count
- largest component ratio
- weighted degree
- edge lifetime
- merge / split
- persistent bridge / articulation
- retrospective connector event

window sweep 후보:

```text
250 ms
1 s
5 s
20 s
```

아직 하지 않음:

```text
λ₂
eigenmodes
adaptive social memory
graph → Plate
graph → behavior
```

---

# E. S0/S1 evidence design

graph가 단순 density를 다시 그린 것인지 1차 비교하기 위해 같이 기록:

```text
population size
local density
pairwise proximity count
occupancy concentration
```

controlled topology fixture:

```text
two disconnected pairs
→ bridge ant enters
→ merge
→ bridge leaves
→ split
```

read-only invariance:

```text
graph ON
vs
graph OFF

RNG
movement
pheromone
FOOT_CONTACT
SurfaceField
Plate birth
```

동일해야 함.

---

# F. Workflow / source handoff

이날 프로젝트 source를 정리.

canonical intent:

```text
blueprint
→ current state
→ decisions
→ next passes
→ repo/commits
→ daily logs
→ research review
```

task prompt policy도 확정:

> subagent model / reasoning / orchestration 지시는 개별 task prompt에 넣지 않고 global config / harness에서 관리.

task prompt는:

```text
task scope
constraints
success criteria
evidence requirements
commit policy
```

중심으로 작성.

---

## 이날의 최종 상태

```text
FOUNDER PASS
= complete / adopted / behavior frozen

AUDIO RUNTIME
= known issue / deferred

NEXT
= S0/S1 read-only DynamicSocialGraph

ROADMAP
= graph → temporal → null → spectral(if useful)
```