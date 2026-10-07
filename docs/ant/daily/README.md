# ANT_2026 — Daily Experiment / Process Log Index

**기준일:** 2026-10-07

이 디렉터리는 ANT 저장소에서 관리하는 날짜별 실험 로그다. 상태 요약이 아니라 **실험이 어떤 순서로 진행됐고, 무엇을 관찰한 뒤 다음 판단으로 넘어갔는지**를 날짜별로 남긴다.

## 기록 원칙

- 확정된 production state는 `01_CURRENT_STATE.md`가 우선.
- 실험의 최종 판정은 `02_EXPERIMENTS_AND_DECISIONS.md`가 우선.
- 다음 작업 순서는 `03_NEXT_PASSES.md`가 우선.
- 이 daily log는 **과정과 맥락을 복구하는 용도**다.
- 날짜가 확실한 대화/실험만 날짜별로 배치한다.
- commit의 정확한 wall-clock timestamp를 이 문서에서 별도 검증하지 않은 경우 `관련 commit`으로 표기하며, “그날 커밋됨”이라고 단정하지 않는다.
- 연구 근거와 프로젝트 해석/예술적 확장은 구분한다.

## 로그

### 2026-10-03
[`./2026-10-03_runtime-sleep-diagnosis.md`](./2026-10-03_runtime-sleep-diagnosis.md)

핵심:
- natural Plate sleep failure 원인 추적
- old buried Plate가 왜 계속 active인지 확인
- no-new-strike replay로 sleep mechanism 자체는 살아 있음을 확인
- runtime optimization이 단순 wake-rule 문제보다 coupled material problem임을 인식

### 2026-10-05
[`./2026-10-05_audio-evidence-and-plate.md`](./2026-10-05_audio-evidence-and-plate.md)

핵심:
- waveform / grayscale spectrogram evidence 형식 점검
- FOOT_CONTACT / RMS / Peak marker 계획
- 10 s보다 긴 시간창 필요성 확인
- direct-contact excitation과 Plate decay를 분리해서 해석
- sonic baseline을 `3 ms pulse / 75 ms recovery / ×50 damping`으로 정리

### 2026-10-06
[`./2026-10-06_social-material-direction.md`](./2026-10-06_social-material-direction.md)

핵심:
- “ant 개체 자체”보다 연결 / 군체 / 환경 구조에 초점 이동
- social graph와 material graph의 두 축 정리
- pioneer를 role이 아닌 retrospective topology event로 보기 시작
- 다음 연구 질문을 social topology / temporal graph / null model 방향으로 좁힘

### 2026-10-07
[`./2026-10-07_founder-refinement-and-handoff.md`](./2026-10-07_founder-refinement-and-handoff.md)

핵심:
- founder-effect / low-evidence pass 완료
- matched-seed evidence로 early lock-in 감소 + mature trail 보존 확인
- behavior 동결 결정
- Deep Review 반영해 roadmap을 `graph → temporal → null → spectral`로 수정
- S0/S1 read-only DynamicSocialGraph를 다음 본선으로 확정
- source / handoff / workflow policy 정리