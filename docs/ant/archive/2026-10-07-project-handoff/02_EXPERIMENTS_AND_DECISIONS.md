# ANT_2026 — Experiments and Decisions

**기준일:** 2026-10-07

이 문서는 최근 세션에서 실제로 시험한 가설과 최종 판정을 모은다.

---

## 1. Sonic baseline pass 1

### 가설

dense `FOOT_CONTACT`가 너무 많은 instantaneous excitation을 만들어 wind/noise-like wash를 만든다.

### 변경

- 3 ms finite pulse
- 75 ms local mechanical recovery

### 결과

- peak 감소
- amplitude variation 소폭 증가
- dense event salience는 결정적으로 개선되지 않음
- local recovery가 dense injected-energy proxy를 약 6% 정도만 줄임

### 판정

**부분 채택.**

입력 smoothing으로는 타당하지만 wash의 주원인은 아니었다.

---

## 2. Plate decay pass

### 가설

Plate vibration이 너무 오래 남아 event 사이 valley를 없앤다.

### 측정

변경 전:

```text
T20 ≈ 49.7 s
T40 / T60 > 60 s
```

변경 후:

```text
T20 ≈ 1 s
T40 ≈ 2 s
T60 ≈ 3 s
```

### 변경

Plate velocity-loss coefficient 공통 ×50.

### 결과

dense input에서:

- RMS 감소
- crest factor 증가
- quiet-window P10 크게 감소
- 50 ms RMS variation 증가

### 판정

**채택.**

wash 원인의 큰 부분이 vibration lifetime이었음.

---

## 3. Natural sleep/runtime re-check

### 기대

짧은 Plate decay가 old material을 sleep시키고 AudioWorklet realtime을 회복시킬 수 있음.

### 결과

실패.

```text
10 Plates  audio/wall ~0.45
20 Plates  ~0.19
29–30 Plates ~0.13
```

자연 실행에서:

```text
sleeping layers = 0
active Plate nodes ≈ all historical nodes
```

### 판정

**decay fix는 sonic fix였지 runtime fix는 아님.**

### 재개 시 보존해야 할 정밀 진단

runtime 문제를 다시 열 때 아래는 이미 확인된 사실로 취급한다.

```text
oldest-layer longest quiet streak
= 4 / 12,000 solver steps

oldest Plate source mask
= 650 / 655 cells buried

oldest Plate solver nodes
= 119 / 119 active
```

saved no-new-strike replay:

```text
full coupling
→ oldest 119 nodes sleep at ~6.05 s

Z + Sphere coupling disabled
→ ~5.99 s
```

따라서:

- sleep mechanism 자체가 작동하지 않는 것은 아님.
- coupling 제거만으로 natural-run 문제를 설명할 수도 없음.
- natural ongoing excitation + Plate restoring state가 핵심.
- `asleepToAwake` diagnostic counter는 initial activation까지 포함할 수 있어 실제 re-wake 증거로 단독 사용하면 안 됨.

향후 runtime을 다시 열면 modal ROM을 바로 반복하기보다:

> material history는 보존하면서 deep buried material의 acoustic participation / active acoustic depth를 제한할 수 있는가

같은 단순 architecture hypothesis를 먼저 검토할 가치가 있다.

이것은 아직 production decision이 아니라 future candidate다.

---

## 4. Sleep-blocker diagnosis

oldest buried layer에서 가장 큰 blocker:

```text
quiet energy / Plate state       ~99.5%
local Plate restoring force      ~99.95%
Z/link force                     substantial
Sphere force                     small for oldest layer
wake-attempt quiet resets        too rare to explain failure
```

saved no-new-strike replay에서는 vibration이 decay한 뒤 실제 sleep이 발생.

### 판정

sleep mechanism 자체가 broken인 것이 아니라:

> natural coupled network가 계속 실제 excitation을 유지한다.

---

## 5. Candidate A — stateless target-energy wake gate

### 아이디어

sleeping Plate target에 들어오는 작은 coupling contribution이 threshold 아래면 wake시키지 않는다.

### 문제

실제 weak Z transfer는 작은 signed contribution의 시간 누적으로 의미 있는 response를 만든다.

실제 replay:

```text
baseline buried response ≈ -36.49 dB
Candidate A               ≈ floor / no response
```

Candidate A는 active node-step을 크게 줄였지만 meaningful weak response도 제거했다.

### 판정

**기각.**

성능 때문에 실제 물리 response를 버림.

---

## 6. Dormant eigenmode reduced-order Plate

### 아이디어

full Plate solver 대신 dormant 상태에서 저차 modal state만 적분.

### 테스트

실제 frozen Plate geometry와 recorded force traces에 대해 rank sweep.

대표 Plate 29:

```text
rank 8
natural output error ~50%
state error ~48%

rank 64
output error ~2%
state error ~3%

rank 128
output error <1%
state error <1%
```

그러나 deterministic arithmetic cost:

```text
rank 8    ~ full solver cost
rank 64   >5× full solver
rank 128  >10× full solver
```

정확한 local wake monitoring까지 넣으면 low rank도 full보다 비싸짐.

### 판정

**tested eigenmode ROM path 기각.**

POD/Krylov 전체를 이론적으로 부정한 것은 아니지만 당분간 보류.

---

## 7. Founder-effect refinement

### 가설

unknown/low-evidence 상태에서:

- directional commitment가 너무 정상적으로 유지되고
- baseline pheromone deposition이 너무 높아

초기 accidental route가 과도하게 자기강화될 수 있음.

### 채택된 최소 변경

```text
durationScale = 0.8 + 0.2 × E

decision, committed
→ low E에서 최대 20% 짧아짐

baseline deposition
0.5 → low E에서 0.375
```

mature evidence가 있으면 기존 behavior로 복귀.

### 결과

- early pheromone mass 크게 감소
- 600 s mature mass는 거의 동일
- FOOT_CONTACT 감소 아님
- mature trail following 유지
- Plate formation 유지
- branching/coverage 변화는 seed-dependent

### 판정

**채택.**

단:

> founder-effect 전체 원인 확정이 아니라, early lock-in pressure를 낮춘 최소 correction.

추가 behavior tuning은 중단.

### 남은 한계 / 해석 경계

이번 pass는 두 production 변경의 combined effect를 검증했다.

아직 분리하지 않은 것:

- decision/commitment 단축의 독립 기여
- baseline deposition 감소의 독립 기여

추가 한계:

- `E ≈ 0`이지만 far-only directional cue가 있는 경우 첫 commitment도 짧아질 수 있음.
- residual `trailAdherence`에 의한 `reinforcementGain × A²`는 그대로 유지.
- 자연 검증은 3 seeds × 600 s.
- branch endpoint persistence proxy는 움직이는 branch를 과소계수할 수 있음.
- Chrome / Node는 initial condition 이후 floating/runtime 차이로 trajectory가 갈라질 수 있음.

따라서 현재 결론은:

> founder effect 전체 원인을 확정한 것이 아니라, early low-evidence lock-in pressure를 줄이는 작은 correction이 유효했다.

이다.

---

# 8. 채택 / 기각 / 보류 요약

| 항목 | 판정 |
|---|---|
| 3 ms finite pulse | 채택 |
| 75 ms local recovery | 채택 |
| Plate damping ×50 | 채택 |
| Stateless wake gate | 기각 |
| Eigenmode dormant ROM | 기각 |
| POD/Krylov ROM | 보류 |
| Mature AudioWorklet optimization | 보류 |
| Low-evidence duration scale | 채택 |
| Low-evidence baseline deposition reduction | 채택 |
| Plate birth threshold tuning | 현재 불필요 |
| 추가 founder/branch tuning | 동결 |
| DynamicSocialGraph | 다음 본선 |

---

# 9. 중요 해석

## 오디오

```text
Plate가 오래 존재한다
≠
Plate vibration이 오래 지속돼야 한다
```

## material runtime

```text
material history를 보존한다
≠
모든 historical material을 full-rate acoustic solver로 영원히 적분해야 한다
```

하지만 이 구조 최적화는 당분간 본선이 아니다.

## founder behavior

```text
branch가 많아져야 성공
```

이 아니라:

```text
초기 accidental path가 너무 빨리 lock-in되지 않아야 함
```

이 성공 기준이다.

## pioneer

현재 behavior에서 pioneer role을 만들지 않는다.

future social graph에서만:

> 실제 topology를 변화시킨 ant를 retrospective connector event로 검출

한다.