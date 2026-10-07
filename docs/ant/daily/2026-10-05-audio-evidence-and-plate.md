# 2026-10-05 — Audio Evidence / Plate Sonic Baseline

## 이날의 질문

현재 Plate audio가 초기 계획처럼 “접촉 사건과 물질 반응”으로 읽히는가?

그리고 waveform / spectrogram evidence가 system behavior를 읽는 데 충분한가?

---

## 1. Evidence sheet 점검

당시 확인한 형태:

```text
simulation 03:00 / 19 ants / activation .71

L  ───────── waveform ─────────
R  ───────── waveform ─────────

   spectrogram

FOOT_CONTACT: ...
RMS L/R: ...
Peak L/R: ...
```

방향 자체는 적절하다고 판단.

특히 waveform만이 아니라:

```text
audio
+
FOOT_CONTACT event marker
+
simulation state
```

를 같은 시간축에 놓아야 “시뮬레이션 사건 ↔ 소리”를 읽을 수 있다고 정리했다.

---

## 2. Spectrogram 색상

일반적인 컬러 spectrogram의 red/blue는 별도 물리량이 아니라 magnitude/intensity를 colormap으로 표현한 것.

따라서 ANT에서는:

> grayscale을 유지해도 정보 손실의 본질적 문제는 없다.

오히려 현재 visual language와 맞고, 구조 비교에 충분하다고 판단.

---

## 3. 시간창 문제

10 s spectrogram만 보면:

- local burst
- short resonance
- dense contact texture

는 볼 수 있지만,

- route maturation
- recruitment 변화
- Plate accumulation
- colony-level density 변화

같은 느린 pattern과 연결하기 어렵다.

따라서 이후 evidence는:

```text
short window
+ longer overview window
```

를 같이 두는 것이 좋다고 정리.

추천 marker:

```text
FOOT_CONTACT
Plate birth
population / activation
possibly route / material events
```

---

## 4. Sonic problem decomposition

당시 Plate audio의 지속적인 wash를 두 층으로 분리했다.

### input problem

많은 FOOT_CONTACT가 instantaneous impulse처럼 연속 주입됨.

### resonator problem

각 Plate vibration이 너무 오래 남음.

이 분리가 이후 실험 순서를 명확하게 만들었다.

---

## 5. Direct-contact excitation pass

채택된 input-side 수정:

```text
3 ms finite pulse
75 ms local mechanical recovery
```

3 ms pulse:

- 6 kHz physics에서 18 step
- half-sine
- envelope sum = 1
- signed impulse budget 보존

75 ms recovery:

- 같은 local area의 빠른 반복 접촉만 약하게 감쇠
- 최대 약 25% reduction
- 새로운 위치/독립 사건은 유지
- global debounce 아님

### 결과

입력은 부드러워졌지만 event salience의 결정적 개선은 아니었다.

즉:

> input shape만으로 wash를 설명할 수 없었다.

---

## 6. Plate decay pass

isolated Plate impulse response 측정.

변경 전:

```text
T20 ≈ 49.7 s
T40 / T60 > 60 s
```

이 정도면 수많은 contact가 겹쳐 “항상 켜진 공명 바닥”이 되는 게 자연스러웠다.

공통 damping multiplier:

```text
×50
```

적용 후:

```text
T20 ≈ 1 s
T40 ≈ 2 s
T60 ≈ 3 s
```

재질별 상대 damping ordering은 유지.

### Dense evidence

- RMS 크게 감소
- crest factor 증가
- quiet valley 증가
- short-window RMS variation 증가

### 판정

**sonic success.**

---

## 7. 중요한 개념 분리

이날 audio 쪽에서 가장 중요한 문장:

```text
material memory = 오래 남아도 됨
vibration memory = 오래 남을 필요 없음
```

Plate geometry/history가 장기 기억인 것과, 물리 진동이 장기간 유지되는 것은 별개다.

---

## 8. Runtime과의 분리

Plate decay를 줄인 뒤에도 mature natural run에서 sleep/runtime 문제는 해결되지 않았다.

따라서:

```text
sonic decay problem
≠
runtime active-node problem
```

으로 분리했다.

이후 production audio baseline:

```text
3 ms pulse
75 ms local recovery
×50 Plate damping
```

은 유지하고, runtime optimization은 별도 known issue로 넘겼다.

---

## 9. 이후 evidence 방향

audio를 다시 평가할 때는:

```text
short waveform / spectrogram
+
longer temporal overview
+
FOOT_CONTACT markers
+
Plate/material events
```

를 함께 본다.

grayscale spectrogram 유지 가능.

현재는 audio retune보다 social/behavior 구조가 우선이다.