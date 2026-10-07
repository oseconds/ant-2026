# ANT_2026 — Daily Experiment / Process Logs

**Canonical chronology: `docs/ant/daily/`**

이 디렉터리는 상태 요약이 아니라 **실험이 어떤 질문에서 출발했고, 무엇을 관찰한 뒤 어떤 판단으로 넘어갔는지**를 날짜별로 남긴다.

## Source roles

- 현재 verified architecture / research boundary: [`docs/ant/README.md`](../README.md)
- 실험별 수치·원본·재현 명령: [`docs/ant/evidence/`](../evidence/)
- 날짜별 과정/negative result/방향 전환: 이 디렉터리

Daily log는 현재 상태 문서를 덮어쓰지 않는다. 과거 날짜의 “NEXT”는 당시 판단일 수 있으므로 현재 작업을 시작할 때는 먼저 [ANT hub](../README.md)를 확인한다.

## Logs

### 2026-10-08 — S2b exact-spatial-movie identity null

[Chronology](./2026-10-08-s2b-identity-null.md) · [Evidence](../evidence/2026-10-08-s2b-null/README.md)

- Exact recorded spatial movie; eight deterministic five-second identity nulls per seed
- All frame-level geometry/active-ID invariants and full observer replay pass
- Recent graph differences concentrate around remaps and lifecycle identity repairs
- No social-organization claim; stop after verification, separate commits and branch push

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

### 2026-10-07 — Born-Plate pickup readout A/B

[`2026-10-07-born-plate-mix-ab.md`](./2026-10-07-born-plate-mix-ab.md)

- Frozen seed/input and all 63 accepted P1 strike frames matched exactly
- Plate-only mix gain raised pooled RMS +10.59 dB; no clipping/non-finite samples
- Candidate remained 18.60 dB below the unchanged substrate stem
- Stop this pass; pickup-distance/readout topology is the next hypothesis

### 2026-10-07 — Born-Plate pickup-distance diagnosis

[`2026-10-07-born-plate-pickup-distance.md`](./2026-10-07-born-plate-pickup-distance.md)

- Frozen P1 descriptor and 63 accepted strikes matched exactly
- Natural event-aligned correlations were moderately negative
- Equal-strength midpoint response was about 13 dB below direct-pickup controls; the far-branch counterexample prevents a monotonic distance-only claim
- Evidence recorded before testing any pickup-topology candidate

### 2026-10-07 — Full frozen P1 observability map

[Node-map evidence](../evidence/2026-10-07-base-substrate-debug/audio/p1-node-observability/README.md)

- One identical controlled strike measured at all 48 valid P1 solver nodes
- Channel-matched RMS tracks pickup distance; pooled output also varies strongly with location/topology
- Nearby low-output and similarly distant high-output regions support a small finite-area pickup-aperture hypothesis
- Candidate topology remains untested; production DSP and simulation unchanged

### 2026-10-07 — Frozen P1 pickup-aperture A/B

[`2026-10-07-born-plate-pickup-aperture.md`](./2026-10-07-born-plate-pickup-aperture.md) · [A/B evidence](../evidence/2026-10-07-base-substrate-debug/audio/p1-pickup-aperture-ab/README.md)

- One sigma-1 Gaussian aperture used only each compiled pickup and its direct same-layer 1-hop neighbors
- Pooled 100/250/500 ms P10 fell 23–25%; natural pooled 10 s RMS rose only +0.46 dB with an L/R tradeoff
- Spatial rank remained recognizable, but the weak tail worsened; reject and stop without tuning
- Production point pickup and all simulation/material/audio settings unchanged

### 2026-10-07 — Event-count matched substrate vs born P1

[2026-10-07-event-count-matched-substrate.md](./2026-10-07-event-count-matched-substrate.md) · [PCM evidence](../evidence/2026-10-07-base-substrate-debug/audio/event-count-matched-substrate/README.md)

- Frozen 63 P1 accepts map to 44 unique FOOT_CONTACT groups; production substrate emits one generic excitation per group
- Matched substrate pooled RMS is +21.44 dB over born P1 after configured gains; original all-events stem remains +29.19 dB
- Raw worklet and fixed-gain levels recorded separately; no clipping/non-finite samples or production changes
- Matched subset difference includes event selection, timing and position; no pure density or masking claim

### 2026-10-07 — Base substrate / born P1 output calibration

[2026-10-07-base-substrate-calibration-0.025.md](./2026-10-07-base-substrate-calibration-0.025.md) · [PCM and fixed-scale evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.025/README.md)

- Candidate B separates Plate ×1 from Sphere `1/sqrt(12)` and lowers the substrate output ratio to `.025`
- Frozen 63 P1 strikes and 44 matched substrate parent groups reused; no simulation or event schedule changes
- Pre-birth B is nonzero, but first-birth all-event substrate is only 0.29 dB below born-only P1 pooled RMS
- Quiet-bed / obvious-new-Plate gate fails; default stays Off and no further tuning is made

### 2026-10-07 — Base substrate / born P1 Candidate C

[2026-10-07-base-substrate-calibration-0.010.md](./2026-10-07-base-substrate-calibration-0.010.md) · [PCM and fixed-scale evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.010/README.md)

- Same frozen P1 setup as Candidate B; only ratio changed `.025 → .010`
- All-event substrate is 8.24 dB below P1 in the first 10 s, about 10 dB below at P1 event windows
- Comparative level gate clears; no intermediate setting tested; default remains Off
- Report margin first; no commit, merge or push

### 2026-10-07 — Base substrate / born P1 Candidate D

[2026-10-07-base-substrate-calibration-0.015.md](./2026-10-07-base-substrate-calibration-0.015.md) · [B/C/D PCM and listening evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/README.md)

- Same frozen seed/input/P1 descriptor, 63 accepted strikes and 44 matched parent groups; only ratio changed `.010 → .015`
- D all-event substrate is 4.72 dB below born-only P1: +3.52 dB vs C and −4.44 dB vs B
- Pre-birth Off remains exact silence; D On is nonzero; all stems finite and unclipped
- Native-level B/C/D comparison page and requested test/build/dev/prod checks pass; keep default Off and stop without commit/merge/push

### 2026-10-08 — Candidate D shared absolute gain

[`2026-10-08-candidate-d-absolute-level.md`](./2026-10-08-candidate-d-absolute-level.md) · [WAV, plots and measurements](../evidence/2026-10-08-candidate-d-absolute-level/README.md)

- Applied the same fixed +18 dB or +20 dB gain to frozen Candidate D P1-only, substrate-only and sum stems
- Candidate D settings and P1/substrate relative level stayed unchanged; six 10 s lossless WAVs and fixed-scale plots produced
- Both gains had zero clipping/non-finite samples; browser playback checks loaded and started all six files
- At the pass stop there was no threshold decision, commit, merge or push
- Subsequent direct listening judged D too dominant and the substrate timbre too metallic / long-tailed; next audio side-pass shifts timbre toward dull, sand-like and granular before re-calibrating level
- Calibration tooling/evidence was later committed and merged via PR #1; base substrate remains default Off

### 2026-10-08 — S2a trajectory synchrony null

[`2026-10-08-s2a-synchrony-null.md`](./2026-10-08-s2a-synchrony-null.md) · [Null evidence](../evidence/2026-10-08-s2a-null/README.md)

- Replayed the three committed 600 s archives; one whole-tuple in-lifetime phase-shift family, 32 replicates per seed
- Original 1 s topology is sparser than the null; short connector counts overlap null variation
- Large seam and birth-phase effects prevent social preference/organization inference
- All 96 rotation/hash invariants, observed archive replay, 270 tests and build pass; stronger movement-constrained validation remains pending

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
