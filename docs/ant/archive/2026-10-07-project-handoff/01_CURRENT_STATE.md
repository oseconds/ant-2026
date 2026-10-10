# ANT_2026 — Current Production State

**기준일:** 2026-10-07

---

## 1. 현재 production behavior baseline

### Agent / movement

- 모든 ant는 동등한 `AntAgent`.
- leader / caste / pioneer state 없음.
- inertia / acceleration / braking / bounded turning 유지.
- local occupancy / collision avoidance 유지.
- 자연 퇴장 + gradual recruitment 유지.
- gait는 실제 travelled distance 기반.
- 실제 six-leg tripod `FOOT_CONTACT`.
- articulated body pose와 gaster rear geometry를 환경 입력에 공유.

### Pheromone / trail

기본값:

```text
grid                    96 × 96
half-life               15 s
amountPerUnitDistance   4.5
radius                  0.0045
reinforcementGain       5
```

기존 강화:

```text
0.5 + reinforcementGain × trailAdherence²
```

최근 founder refinement 이후 baseline deposition의 `0.5` 부분만 absolute trail evidence `E`에 따라 약하게 조절된다.

---

## 2. Founder-effect refinement — 채택된 변경

### 확인된 문제

저증거/unknown field에서도 기존 시스템은:

- normal decision / commitment duration을 사용
- `trailAdherence = 0`이어도 baseline deposition `0.5`

를 유지했다.

즉 초반 accidental path가 빠르게 environmental evidence가 될 수 있었다.

### absolute evidence scalar

```text
H(c,h) = c³ / (c³ + h³)

E = H(sqrt(peak1 × peak2), 0.018)
```

- `peak1`, `peak2`: short-range 두 cross-section의 절대 농도 peak.
- `E`: 방향 contrast가 아니라 실제 trail evidence의 절대 존재 정도.

### 채택된 production 변경

```text
durationScale = 0.8 + 0.2 × E

new decision  = old decision  × durationScale
new committed = old committed × durationScale

depositionMultiplier =
    0.5 × (0.75 + 0.25 × E)
    + reinforcementGain × trailAdherence²
```

따라서:

```text
E = 0
→ decision/commitment duration 약 20% 감소
→ baseline deposition 0.5 → 0.375

E → 1
→ 기존 behavior로 연속 복귀
```

변경하지 않은 것:

- steering
- turn rate
- speed
- exploration probability/noise
- gait
- collision
- pheromone half-life
- reinforcement gain
- sensor geometry
- SurfaceField
- recruitment
- Plate birth rules

### matched-seed 결과

Seeds:

```text
20261005
20261006
20261007
```

각각 600 s.

세 seed 평균 pheromone mass:

```text
30 s   41.90 → 27.53   (-34.3%)
60 s   98.27 → 72.23   (-26.5%)
120 s  190.34 → 153.77 (-19.2%)
300 s  248.87 → 219.94 (-11.6%)
600 s  230.91 → 231.41 (+0.2%)
```

평균 Plate count:

```text
120 s  1.00 → 0.33
300 s  13.00 → 8.67
600 s  35.33 → 30.33
```

해석:

- 초기 흔적은 약해짐.
- mature trail mass는 회복.
- mature corridor / fan / branch는 계속 형성.
- branching 개선은 seed마다 다름.
- branch를 직접 프로그래밍한 결과가 아님.
- founder lock-in pressure만 낮춘 것으로 해석.

현재 결정:

> behavior는 여기서 동결한다.

---

## 3. Plate birth / material baseline

현재 Plate birth rule은 founder refinement 전후 동일.

핵심 기준:

```text
chemical threshold              0.30
surface support threshold       0.015
candidate persistence           20 s
minimum geodesic length         0.30
same-corridor refractory        90 s
required new foot contacts      30
global birth gap                10 s
```

Plate geometry:

```text
half-width 0.012–0.030
full width 약 0.024–0.060
minimum geodesic length 0.30
```

현재 판단:

- 행동 refinement 후에도 mature Plate formation은 지속.
- first birth time은 seed마다 앞/뒤로 이동.
- birth-side 독립 문제의 증거는 아직 없음.
- Plate birth threshold는 지금 손대지 않는다.

---

## 4. Material stratigraphy

현재 의미론:

- Plate는 frozen material history.
- later material은 실제 overlap에서만 이전 layer를 bury.
- age ≠ depth.
- direct `FOOT_CONTACT`는 top exposed Plate만 직접 strike.
- buried Plate는 Z / Sphere coupling으로만 excitation.
- technical history cap은 삭제/eviction semantics가 아니라 safety ceiling.

이 material graph는:

```text
slow
spatial
persistent
history-derived
```

과거 집단 행동이 환경에 고정된 구조로 본다.

---

## 5. Current audio production baseline

### direct-contact excitation

채택:

```text
3 ms finite pulse
75 ms local mechanical recovery
```

세부:

- 6 kHz physics에서 18-step half-sine pulse.
- pulse envelope sum = 1.
- signed impulse budget 보존.
- direct exposed-Plate routing 유지.
- no event dropping.
- no global debounce.
- local recovery는 같은 local region의 빠른 반복만 약간 줄임.

### Plate decay

기존 isolated Plate:

```text
T20 ≈ 49.7 s
T40 / T60 not reached in 60 s
```

현재:

```text
T20 ≈ 1.0 s
T40 ≈ 2.0 s
T60 ≈ 3.0 s
```

production 변경:

```text
effective Plate damping = 50 × previous velocity-loss coefficient
```

material-relative damping ordering은 유지.

현재 audio 개념:

```text
material memory = long-lived
vibration memory = short-lived
```

---

## 6. Known unresolved audio runtime issue

mature natural run에서:

```text
simulation/main ≈ realtime
AudioContext render progression << realtime
```

대표:

```text
~10 Plates  audio/wall ≈ 0.45
~20 Plates  audio/wall ≈ 0.19
~29 Plates  audio/wall ≈ 0.13
~30 Plates  audio/wall ≈ 0.13
```

30 Plates 근처:

```text
Plate nodes       ~9,806
active nodes      9,806 / 9,806
awake layers      30 / 30
sleeping layers   0
```

Plate decay를 짧게 만들어도 natural sleep은 발생하지 않음.

진단 결과:

- `wakeNode()` quiet reset semantics는 넓지만 주원인은 아님.
- old buried Plate도 실제 displacement / energy / local restoring force가 계속 active.
- Z coupling은 의미 있는 sleep blocker.
- Sphere force는 oldest layer sleep blocker로는 상대적으로 작음.
- coupled material network 자체가 계속 움직이는 것이 핵심.

현재 결정:

> runtime optimization은 known issue로 보류.

---

## 7. Production에서 건드리지 말아야 할 현재 baseline

다음 pass에서는 아래를 동결:

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

다음 본선은 social graph 관찰층이다.