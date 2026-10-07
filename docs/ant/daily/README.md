# ANT_2026 — Daily Experiment / Process Logs

**Canonical chronology: `docs/ant/daily/`**

이 디렉터리는 상태 요약이 아니라 **실험이 어떤 질문에서 출발했고, 무엇을 관찰한 뒤 어떤 판단으로 넘어갔는지**를 날짜별로 남긴다.

## Source roles

- 현재 verified architecture / research boundary: [`docs/ant/README.md`](../README.md)
- 실험별 수치·원본·재현 명령: [`docs/ant/evidence/`](../evidence/)
- 날짜별 과정/negative result/방향 전환: 이 디렉터리

Daily log는 현재 상태 문서를 덮어쓰지 않는다. 과거 날짜의 “NEXT”는 당시 판단일 수 있으므로 현재 작업을 시작할 때는 먼저 [ANT hub](../README.md)를 확인한다.

## Logs

### 2026-10-03 — Runtime / natural sleep diagnosis

[`2026-10-03-runtime-sleep-diagnosis.md`](./2026-10-03-runtime-sleep-diagnosis.md)

- old buried Plate가 왜 natural run에서 계속 active인지 추적
- no-new-strike replay에서 sleep mechanism 자체는 작동함을 확인
- 단순 wake-rule bug보다 coupled-material ongoing excitation 문제로 재정의
- runtime optimization을 별도 known issue로 분리

### 2026-10-05 — Audio evidence / Plate sonic baseline

[`2026-10-05-audio-evidence-and-plate.md`](./2026-10-05-audio-evidence-and-plate.md)

- waveform / grayscale spectrogram evidence 형식 정리
- direct-contact input과 resonator decay를 분리
- 3 ms finite pulse / 75 ms local recovery 채택
- Plate damping ×50로 vibration lifetime 단축
- sonic fix와 runtime fix를 분리

### 2026-10-06 — Social / material two-axis direction

[`2026-10-06-social-material-direction.md`](./2026-10-06-social-material-direction.md)

- 개별 ant보다 연결 / 군체 / 환경 구조로 초점 이동
- fast social graph vs slow material graph 개념 정리
- pioneer를 role이 아니라 retrospective topology event로 정의
- temporal graph / density confound / null-model 질문 구체화

### 2026-10-07 — Founder refinement → S0/S1 completion

[`2026-10-07-founder-refinement-and-handoff.md`](./2026-10-07-founder-refinement-and-handoff.md)

- low-evidence founder-lock-in refinement 채택, behavior 동결
- matched-seed natural evidence와 visual review
- roadmap을 graph → temporal → null → spectral(if useful)로 수정
- S0/S1 `DynamicSocialGraph` / `TemporalSocialTopology` 구현 완료
- graph OFF/ON behavior invariance 확인
- 250 ms connector는 짧고 recruitment-center-local, 1 s+ persistent connector는 0
- 현재 persistent pioneer/social organization은 미입증
- 다음 gate는 movement-constrained null validation

## Logging rule

새 과정 로그는 `YYYY-MM-DD-topic.md` 형식으로 추가한다.

가능하면 다음을 남긴다:

- 출발 질문 / hypothesis
- baseline
- 실제 변경
- evidence / negative result
- 판정
- 남은 한계
- 다음 pass로 넘어간 이유

commit timestamp와 실험 날짜가 다를 수 있으므로, 별도 검증하지 않은 wall-clock chronology를 추정해서 쓰지 않는다.
