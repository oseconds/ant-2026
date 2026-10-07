# 2026-10-03 — Natural Sleep / Runtime Diagnosis

## 이날의 질문

mature Plate stack에서 왜 natural sleep이 사실상 일어나지 않는가?

초기 기대는 단순했다.

```text
old Plate
→ vibration decays
→ quiet streak accumulates
→ sleep
→ AudioWorklet cost drops
```

하지만 실제 natural run에서는 오래된 buried Plate도 계속 active였다.

---

## 1. Sleep 조건 확인

Plate sleep은 단순히 “소리가 작다”로 결정되지 않는다.

대략 다음 조건이 일정 시간 연속으로 모두 조용해야 했다.

```text
quiet energy
Plate restoring force
Z/link force
Sphere force
```

그리고 6 kHz physics 기준 약 2 s:

```text
12,000 consecutive steps
```

의 quiet streak가 필요했다.

어떤 조건이라도 실패하면 streak가 reset된다.

---

## 2. 가장 중요한 관찰

oldest layer의 longest quiet streak:

```text
4 / 12,000 steps
```

정도였다.

즉 threshold 근처에서 간신히 실패하는 문제가 아니라, natural coupled state에서는 거의 계속 active 평가가 나고 있었다.

oldest Plate는 source-mask 기준:

```text
650 / 655 cells buried
```

였는데도 solver node는:

```text
119 / 119 active
```

였다.

여기서 중요한 해석:

> burial은 direct strike source를 거의 제거하지만, Plate 자체의 solver state를 없애지는 않는다.

그리고 ongoing contacts가:

```text
top Plate direct excitation
→ intra-Plate propagation
→ adjacent-layer Z coupling
→ old buried Plate
```

로 전달될 수 있다.

---

## 3. No-new-strike replay

natural run에서 capture한 30-layer topology에 더 이상 새로운 strike를 넣지 않고 replay.

결과:

```text
full coupling
→ oldest 119 nodes sleep at ~6.05 s
```

Z + Sphere coupling을 disable한 비교:

```text
~5.99 s
```

차이는 작았다.

### 결론

- sleep mechanism 자체는 작동한다.
- Z/Sphere coupling을 단순히 제거한다고 큰 해결이 되는 것도 아니다.
- natural run에서는 계속 새 excitation이 들어오며 coupled material state가 살아 있는 것이 핵심이다.

---

## 4. 진단 과정에서 생긴 주의점

`asleepToAwake` 류 counter가 실제 “한번 잔 노드가 다시 깨어난 횟수”만 세는 것이 아니라 initial activation을 포함할 수 있어 오해를 만들었다.

따라서 이후에는:

```text
counter name
≠
실제 semantics
```

를 반드시 source-level로 확인해야 한다는 교훈이 생겼다.

---

## 5. 그날의 방향 전환

처음에는 sleep threshold / wake semantics를 고치면 runtime이 풀릴 수 있다고 봤지만, 진단 후 문제를 이렇게 다시 정의했다.

```text
persistent material history
+
continuous coupled vibration state
+
all historical nodes solved at full rate
→ mature AudioWorklet collapse
```

즉 단순 sleep bug보다 더 구조적인 문제.

---

## 6. 이후 연결된 실험

이 진단은 이후 두 후보 실험으로 이어졌다.

### Candidate A — target-energy wake gate
작은 coupling contribution을 threshold 아래에서 무시해 dormant target을 깨우지 않는 방식.

후속 결과:
- active work는 줄었음.
- weak signed Z accumulation이 사라짐.
- buried response가 의미 있게 손실됨.
- **기각**.

### Reduced-order eigenmode Plate
buried/dormant Plate를 low-rank modal state로 적분하는 방식.

후속 결과:
- low rank는 error 큼.
- useful fidelity rank는 full solver보다 비쌈.
- **tested path 기각**.

---

## 7. 남은 architecture-level 질문

runtime을 다시 열 때 바로 ROM으로 돌아가지 않는다.

더 단순한 후보:

> material history는 계속 보존하면서, deep buried material이 full-rate acoustic dynamics에 참여하는 깊이/범위를 제한할 수 있는가?

예:

```text
full material history
≠
full acoustic participation forever
```

아직 실험하지 않은 future hypothesis다.

---

## 이날의 최종 상태

```text
sleep bug hypothesis
→ 약화

coupled-material persistent activity
→ 핵심 문제로 승격

runtime optimization
→ 당장 해결하지 않고 known issue로 관리
```