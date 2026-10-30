# ANT — Current Architecture, Evidence and Research Boundary

**Current repository state: 2026-10-30**

이 문서는 ANT의 **현재 verified state**를 위한 GitHub-side hub다. 과정은 [daily logs](daily/README.md), 실험별 원본과 재현 자료는 [evidence packages](evidence/)에 둔다.

## Current status

```text
movement / realized travel
├─→ pheromone → movement / recruitment + TrailPlate chemical memory
└─→ gait / FOOT_CONTACT → SurfaceField + retained contact counts
chemical memory + mechanical support / repeat gates
→ TrailPlateBirth (current authored corridor-to-Plate formation law)
→ MaterialStratigraphy
→ current-cell tick-entry local column layer count (`layerCountByCell`)
├─→ bounded desiredSpeed resistance
├─→ bounded native turn-rate ceiling
└─→ bounded same-flow comfortable-headway expansion
→ later ant movement / environmental history

MaterialStratigraphy
→ Plate / Z / buried Sphere
→ physical vibration / audio

current/recent proximity
→ DynamicSocialGraph
→ TemporalSocialTopology
(read-only)
```

Pheromone remains a live causal field but is hidden by default in the audience renderer. The diagnostic Pheromone overlay remains available as an explicit debug opt-in; material remains visible by default. This is presentation-only and does not change sensing, recruitment, TrailPlate qualification, or chemical state.

Founder-refined movement baseline is `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9`. Retained-history material feedback is a separately tested production layer: the previously adopted desired-speed resistance is now joined by adopted A turn-rate and D same-flow-headway conditions. These were not part of the founder baseline.

S0/S1 read-only social observation pass의 구현/evidence 흐름:

```text
8076de6  Add read-only ANT dynamic social graph
a6801d6  Add temporal social topology analysis
f4365b1  Add ANT social graph evidence harness
af9c417  Record ANT social graph baseline evidence
```

그 이후 커밋은 daily/documentation을 추가할 수 있으므로 **repository HEAD와 latest implementation baseline을 구분**한다.

## Review handoff — decisions, baselines, web experience, viewing evidence (2026-10-30)

이 절은 **독립 검토자가 먼저 읽을 현재 판정과 자료 범위**를 연결한다. 아래 verdict는 한정된 실험의 현재 판정이며, 실험 당시 작성된 README의 시점별 표현을 소급 변경하지 않는다. `docs/ant/README.md`와 현 `main` 구현이 현재 상태의 기준이고, branch-only 연구는 production 채택과 구분한다.

### A. Current decision register

| 질문 | 현재 판정 · 적용 범위 | 근거 | 다시 열 조건 |
| --- | --- | --- | --- |
| retained-material movement feedback은 production인가? | **ADOPTED.** Production은 tick-entry `L`을 한 번 읽어 기존 10% desired-speed resistance, A native turn-rate ceiling, D same-flow comfortable headway에 재사용한다. A/D는 600 s integration screen에서 slowdown 아래에서도 direct consumer 책임이 DISTINCT했고 등록된 invariant 위반은 없었다. blocked frames +13.17%는 열린 production cost로 유지한다. | [A/D adoption](evidence/2026-10-30-material-feedback-ad-production-adoption/README.md) · [candidate evidence](evidence/2026-10-30-material-feedback-ad-production-candidate/REPORT.md) | localized long-lived jam이 확인되거나, 후속 Residence/multi-feedback integration에서 movement/flow collapse가 나타나는 경우 |\n| G pheromone은 production인가? | **ADOPTED.** 316×316 Gaussian field. 고정 입력 parity 및 세 seed의 저장된 G 600 s 궤적 일치가 확인됐다. 자연 경로의 미학·장기 전시 성능까지 검증된 것은 아니다. | [G adoption](evidence/2026-10-25-g-production-adoption/README.md) · [validation](evidence/2026-10-25-g-production-adoption/VALIDATION.md) | 새로운 G production 결함; 별도로 natural route persistence/turnover에 관한 사전 정의된 관찰 |
| Plate의 형성은 자생적 물질 법칙인가? | `TrailPlateBirth`는 현재 **authored source→boundary corridor selection law**다. 행동의 흔적을 기록하지만 어떤 역사를 영구 물질로 선택할지는 저술되어 있다. | [movement/material morphology audit](evidence/2026-10-08-movement-material-morphology/README.md) · [production source](../../src/lib/agents/ant/TrailPlateBirth.js) | 현재 G history를 선택기 전후로 계량했을 때 작품에 중요한 구체적 정보 손실이 확인되는 경우 |
| 자연 Plate의 차이를 들을 수 있는가? | **2026-10-18 완료**: 자연 Plate 12개의 선택된 p50 비교 **6/6**에서 단일 청취자가 `different=yes`, 숨겨진 A/A는 `no`. Isolated/level-matched 조건이며 일반적 인식률이나 live mix 청취를 증명하지 않는다. | [original subjective export](subjective-listening/2026-10-13-plate-sonic-individuality-subjective-listening.json) · [as-of measurement](evidence/2026-10-13-plate-sonic-individuality/README.md) | 동일 Plate의 다른 접촉 위치 인식, 다른 청취자, 실제 dense mix에서 구분 가능성을 묻는 별도 질문 |
| Synthetic geometry의 차이를 들을 수 있는가? | **2026-10-18 완료**: 실제 비교 **5/6**에서 단일 청취자가 차이를 보고. A/A raw export는 `different=yes / confidence=5` 그대로, 별도 interpretation-only correction에서 의도한 응답을 `no / 5`로 기록한다. | [raw export](subjective-listening/2026-10-18-synthetic-plate-shape-capability-subjective-listening.json) · [correction](subjective-listening/2026-10-18-synthetic-plate-shape-capability-corrections.json) · [prepared experiment](evidence/2026-10-18-synthetic-plate-shape-capability/README.md) | 일반화·semantic shape 식별·실제 mixed-world 청취를 주장할 때 |
| 일반적인 Plate individuality 재설계가 필요한가? | 현재 역할에는 **supported enough for now**. 새로운 excitation, pickup, material range, selector를 자동으로 탐색하지 않는다. Native material→median 치환의 작은 broad ERB 변화는 Plate 전체의 지각 불가능을 뜻하지 않는다. | [current audio status](#physical-audio) · [material ERB](evidence/2026-10-14-plate-erb-material-contribution/README.md) | 명확한 production/artistic 청취 실패가 기존 geometry/contact/field 및 mix 조건으로 설명되지 않을 때 |
| Live dense mix는 개별 응답을 전달하는가? | **청각적 판단은 열림.** Pre-G 별도 연구 branch에서 8-Plate full-coupled focal/rest 분해 완료: 500 ms 구간 1,231개 중 742개(60.3%)에서 rest 합산 에너지가 focal보다 컸다. 이것만으로 perceptual masking을 확정하지 않는다. | [branch-only dense overlap](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-18-natural-dense-readout-overlap/README.md) · [main의 이전 계획](daily/2026-10-18-plate-audio-review-and-live-density-plan.md) | 청취/브라우저 출력 조건에서 구분 가능성을 확인하거나 G의 현재 자연 mix로 일반화할 때 |
| 성숙한 실시간 Audio On이 보장되는가? | **아직 아님.** 2026-10-06 pre-G Chrome 자연 30-Plate 구간에서 audio/wall=0.1304, 9,806/9,806 nodes awake. 2026-10-21 branch 전시 연구도 20/30-Plate Full/Z-off가 실시간 미달. **현재 G Audio-On 웹 신뢰성은 미검증**이다. | [natural runtime](evidence/2026-10-06-runtime-recheck/README.md) · [branch-only exhibition study](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-21-exhibition-audio-runtime/README.md) · [G adoption limit](evidence/2026-10-25-g-production-adoption/README.md) | 대상 웹 브라우저/기기와 Audio On 시점·world age를 명시한 실제 재검증 |
| 장기 축적/포화는 작품의 실패인가? | **작가 판단 미확정.** Append-only material, 256 Plate/32 Nodule ceiling은 구현 사실. 이전 96-grid의 세 seed 600 s에서 Nodule cap은 관측되었으나 현재 G의 장기 openness/turnover는 확정되지 않았다. 침묵·정체·포화는 자동 실패도 자동 성공도 아니다. | [Nodule opportunity, pre-G](evidence/2026-10-13-natural-nodule-opportunity/README.md) · [G adoption open question](evidence/2026-10-25-g-production-adoption/README.md) | 작가가 허용할 세계 수명/갱신 기준과 실제 G 장기 관찰이 준비됐을 때 |

S0–S2c 사회 관측은 read-only/parked이고, vitality/episodic formation은 현재 필수 roadmap이 아니다. 과거의 부정적 실험도 [현재 경계](#current-production-boundary-and-future-hypotheses)와 개별 evidence에 남긴다.

### B. Evidence baselines — never silently transfer natural outcomes

| 증거 묶음 / 기준 | 현재 G와의 관계 | 유효하게 재사용할 것 · 재확인할 것 |
| --- | --- | --- |
| **Current** `main@fc5e81c7`, [G adoption](evidence/2026-10-25-g-production-adoption/README.md) (2026-10-25) | 현재 production 316-grid. 채택 이전 연구 G의 저장된 세 seed 600 s와 exact conformance. | 구현/API·고정 cue·저장 궤적 일치가 확인됨. 경로의 시간적 지속/갱신, 장기 material 및 G Audio On 신뢰성은 별도 질문. |
| **Pre-G / 96-grid** `eb84b7c` [morphology audit](evidence/2026-10-08-movement-material-morphology/README.md), `d45823d` [sonic corpus](evidence/2026-10-13-plate-sonic-individuality/README.md) | 선택기의 구조와 물리 음향 law에 관한 많은 설명은 계속 참고 가능. 하지만 G는 chemical input의 공간 분포를 바꾸었다. | 선택기 저술 구조·frozen waveform·해당 corpus 청취 결과는 그대로. 600 s born counts/coverage, 해당 corpus가 G에서도 같은 비율로 생성된다는 주장 금지. |
| **Pre-G branch-only** [8-Plate dense readout](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-18-natural-dense-readout-overlap/README.md) 및 [2026-10-21 exhibition audio](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-21-exhibition-audio-runtime/README.md) (당시 `8c60e4b` source) | branch evidence는 main에 채택된 production 실험이 아니며, pre-G workload를 사용한다. | Full-coupled focal/rest 에너지 분해, 20/30 Plate latency/throughput 한계를 해당 조건에 귀속. 현재 G 결과 또는 perceptual masking 검증으로 자동 이월하지 않는다. |
| **Historical real Chrome viewing** `d281d34` [2026-10-06 recorded runtime](evidence/2026-10-06-stratigraphy-runtime/README.md) | Founder/G 도입 이전 웹 시청각 기록. 현재 G 대표 장면 아님. | 실제 화면, final stereo tap, world-age/audio-clock 불일치와 누락을 확인하는 역사적 감상 사례. |
| **Research counterfactual** [2 h spatial dynamics](https://github.com/oseconds/ant-2026/blob/9fcd96205ff8a5c671be26e2e024524c0e9345d1/docs/ant/evidence/2026-10-22-spatial-dynamics/REPORT.md) | pre-G 연구 후보; production movement change 아님. | 120 min material coverage의 반례는 해당 baseline에만 적용. G 2 h 성과로 인용 금지. |

규칙을 그대로 둬도 G에서 그 규칙이 **받는 입력의 분포와 자연 실행 결과**는 달라질 수 있다. 과거 evidence의 실행 SHA, seed, duration, audio state를 유지해서 인용하고, 현재 G와 동일 자연 결과라는 연결은 별도 conformance/측정 없이는 하지 않는다.

### C. Artwork / audience intent — web first (review frame, not added mechanism)

**기본 감상 매체와 검토 원칙 (웹 우선):**

> ANT의 기본 감상 매체는 웹이다. 전시는 이를 제시하는 확장 형태다. 검토는 웹에서 세계를 만나고, 머무르고, 소리를 듣고, 떠나는 경험을 중심으로 한다. 전시 전용 운영 요구를 기본 모델의 필수 조건으로 간주하지 않는다.

이 원칙은 **검토의 매체·경험 기준**이지 영구 서버 세계, 전시용 음향 시스템, 게임적 상호작용을 새로 구현하라는 뜻이 아니다.

| 웹 감상에 대한 질문 | 현재 구현에서 확인되는 경계 | 작품 의도로 정할 부분 |
| --- | --- | --- |
| **방문과 세계의 관계** — 새 방문은 새 세계인가, 같은 세계의 연속인가? | 현재 웹 앱 진입 시 새 로컬 `Lab/AntController` 세계가 초기화된다. 같은 세계를 재방문 시 복원·공유하는 구현은 없다. 같은 페이지 안에서 다른 실험 모델로 갔다 돌아와도 저장되는 것은 모델 설정이지 ANT 전체 역사가 아니다. | 방문마다 세계가 태어나는 경험을 의도할지, 이후 동일 세계 재접속이 작품에 필요한지. **후자는 미선택**. |
| **관객의 역할** — 지켜보는가, 관측 위치를 바꾸는가, 세계에 개입하는가? | 현재 앱에는 모델/실험 제어 UI가 있으나 ANT에서 `strike()`/`setPickup()`은 지원되지 않는다. 실험 UI 존재 자체를 관객이 ANT 물리 세계에 개입한다는 예술적 계약으로 해석하지 않는다. | 관찰만으로 충분한지, 관측 위치의 변화가 필요한지, 실제 개입을 허용할지. **웹이라는 이유로 조작·게임 목표를 추가하지 않는다**. |
| **시간의 취급** — 탭을 떠나거나 소리를 끈 동안 세계는 어떻게 이어지는가? | Audio Off 동안 ANT의 운동·물질 상태는 진행할 수 있다. 나중에 Audio On이면 현재 material topology에서 새 진동이 시작되고 과거 접촉을 재생하지 않는다. Page hide 때 앱을 정리하며, 백그라운드 RAF 지연은 frame-gap 100 ms clamp로 wall time과 world age가 어긋날 수 있다. | 방문 사이 지속성, 숨겨진 탭의 시간, Audio Off/On 시 청취의 연속성을 작품 경험으로 어떻게 받아들일지. **재접속·fast-forward·기존 진동의 복원은 미선택**. |

**평가할 경험:** 기능 수나 조작의 다양성보다, 방문·머무름·관찰·청취·떠남이 하나의 일관된 웹 감상 경험을 이루는지 확인한다. 관객이 세계를 바꾸지 않고 바라보는 방식도 유효하며, silence/slow formation을 engagement 실패로 미리 판정하지 않는다.

**주 감상 매체는 웹이며, 전시는 제시 방식의 확장이다.** 현재 앱은 페이지 진입 시 로컬 ANT 세계를 생성하고 페이지 종료 시 해제한다. 모델 내부에서 개미 없이도 material이 남는다는 지속성과, 탭/방문을 넘어 *같은 세계를 재접속*하는 웹 서비스는 다른 의미다. 후자는 현재 production 기능으로 주장하지 않는다. 또한 소리를 나중에 켜면 현재 topology에 새 AudioWorklet을 연결하며 과거 contact PCM이나 이전 vibration state를 이어 재생하지 않는다. [app lifecycle](../../src/main.js) · [ANT controller](../../src/lib/agents/ant/AntController.js) · [audio bridge](../../src/lib/audio/SurfaceAudioBridge.js).

**관객 경험을 점검할 질문 (Astra 후속 예술적 해석; 작가의 최종 acceptance criteria 아님):**
1. **현재와 남은 과거:** 자주 지나가는 곳, 지금 한산하지만 남은 흔적, 새 활동이 오래된 구조와 만나는 곳의 차이가 진단 overlay 없이도 일부 느껴지는가?
2. **세계의 소리:** 같은 종류의 접촉이 지금까지 남은 material state에 의해 다르게 반응한다는 연결이 실제 브라우저의 Audio On 청취에서 느껴지는가? Isolated Plate 청취와 full mix 청취를 구별한다.
3. **세계와 머무르는 시간:** 짧은 방문, 오래 켜둔 세션, 처음에는 Audio Off였다가 나중에 켜는 세션에서 의도된 속도·침묵·변화가 각각 성립하는가?

**허용 상태와 실패의 구분:** 첫 Plate 이전의 침묵, 느린 축적, 활동의 편중, 장기 포화는 작품의 가능한 상태이지 자동 품질 불량이 아니다. 하지만 의도된 침묵과 AudioWorklet underrun, 선택된 축적과 의도치 않은 cap 정지, 느린 세계와 RAF gap으로 누락된 wall time은 서로 구분하여 보고해야 한다. 전자들의 허용 수준·유한한 세계/갱신되는 세계의 선택은 **작가 결정 대기**이고, 작품을 '더 복잡하게' 만드는 것이 목표라고 미리 가정하지 않는다.

**웹 시간 경계:** `AntController.update()`는 RAF frame elapsed를 최대 100 ms로 제한하므로 백그라운드 탭에서 외부 경과 시간만큼 world age가 자동 진행한다고 보장할 수 없다. 화면·세계·AudioContext의 세 clock 대응 및 현재 G에서의 browser behavior는 아직 관측/정책을 분리해야 하는 질문이다. 새로운 analytic fast-forward나 persistent server를 이 문서에서 채택하지 않는다.

### D. Representative viewing evidence — existing assets and gaps

독립 예술 검토에는 좋은 장면만이 아니라 시작·형성·성숙과 **작가가 아쉽게 느낀 구간**을 함께 제시한다. **현재 G production을 대표하는 world-age/seed/실제 웹 화면/원본 소리 동기화 패킷은 이 정리에서 선정·검증되지 않았다.** 아래 기존 파일은 전부 pre-G 참고 기록이다. 영상과 오디오는 별도 파일이며, 원본 audio clock이 시뮬레이션 시간을 따라가지 못한 구간을 임의 스트레치·보간하지 않았다.

| 기존 브라우저 참고 구간 (모두 seed `20261005`, pre-G 2026-10-06) | 시각 및 실제 출력 자료 | 동기화/편집·해석 주의 |
| --- | --- | --- |
| **Opening** world age `0–20 s` | [Chrome motion 20 s](evidence/2026-10-06-stratigraphy-runtime/motion/opening-motion-20s.webm) · [mapped original stereo WAV](evidence/2026-10-06-stratigraphy-runtime/motion/opening-mapped-original-audio.wav) | 같은 구간의 native output 약 20.03 s. 독립 음원/영상 파일, 녹음 후 별도 대체 효과음 없음. |
| **First Plate** `119.0167–139.0167 s` | [Chrome motion 20 s](evidence/2026-10-06-stratigraphy-runtime/motion/first-plate-motion-20s.webm) · [mapped original stereo WAV](evidence/2026-10-06-stratigraphy-runtime/motion/first-plate-mapped-original-audio.wav) | 해당 interval native audio 20 s. 현재 G의 첫 Plate 생성 시점이라고 인용하지 않는다. |
| **Late stack** `580.2167–600.2167 s` | [Chrome motion 20 s](evidence/2026-10-06-stratigraphy-runtime/motion/late-stack-motion-20s.webm) · [mapped original stereo WAV](evidence/2026-10-06-stratigraphy-runtime/motion/late-stack-mapped-original-audio.wav) | **20 s 영상에 native audio 약 2.30 s만 대응**: mature realtime failure의 시각/청각 간극을 보존한 증거. 동기화된 20 s soundscape로 제시 금지. |

[2026-10-06 capture report](evidence/2026-10-06-stratigraphy-runtime/README.md) · [clock/provenance manifest](evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-curated-manifest.json). 이 오래된 시청각 자료만으로 **현재 G에서 관객에게 무엇이 전달되는지** 판단하지 않는다.

향후 현재 G 대표 구간을 선정할 때 최소 기록: **actual git SHA / seed / model-time interval / browser+device / Audio On 시각 / captured sim·wall·audio clock alignment / 실제 canvas와 native output / crop·편집·시간 보정 유무 / 해당 구간을 보는 열린 관람 질문**. 확보 전에는 `not captured`라고 적는다. 시각·청각 동시 기록이 불가능한 mature 구간은 그 불일치 자체를 보고하고, 임의로 정상화한 결과를 원본이라고 표시하지 않는다.

## Architecture

### Agent / movement

- 모든 ant는 동일한 `AntAgent`.
- leader, caste, pioneer role/state 없음.
- inertia / acceleration / braking / bounded turn.
- local occupancy와 swept collision constraint.
- 자연 퇴장 + gradual recruitment.
- behavior는 framework-independent model에 있고 renderer는 snapshot만 그린다.

### Chemical memory

`PheromoneField`는 shared environmental memory다.

- production field: normalized `[0,1]²` world에 놓인 316×316 Float32 nodal values
- compact Gaussian writer: `R=0.0045`, `σ=0.00225`; 15 s half-life; point-signal cap 8
- ordinary bilinear reads; point/segment requests and returns remain in authored source-dose units (`depositPoint()` / `depositSegment()` return the accepted in-domain request, not cap-surviving storage)
- field writer 내부에서만 `3969/361` reference-area coefficient conversion 적용
- `nodeSum`와 legacy `totalMass` / `analysis.pheromoneMass`는 resolution-dependent native coefficient sum; `reconstructedIntegral`은 edge-weighted bilinear reference integral이며 calibrated chemical mass가 아님
- gaster rear에서 실제 이동 거리 기반 deposition
- short-range evidence 기반 `trailAdherence`
- founder refinement는 low-evidence 새 commitment와 baseline deposition만 약하게 낮춤

Local/far sensor half-saturation (`0.018` / `0.035`), activation half-saturation (`0.04`), TrailPlateBirth chemical half-saturation/threshold (`0.04` / `0.30`), adherence, movement, recruitment, material, renderer absolute mapping, and audio contracts were not retuned for G. Boundary truncation and node saturation remain exceptions to the interior reference-integral convention. [G production adoption contract and receipts](evidence/2026-10-25-g-production-adoption/README.md).

The fixed-cue and three-seed 600 s evidence matched the production-shaped candidate before adoption. The refined representation preserves more spatial source-position/orientation information in the controlled assays; this is an engineering result, not biological validation. G's occupancy concentration and higher sensor-response operating range are observed characteristics, not established improvements. A short Audio-Off browser run was viable, while rare long RAF gaps remain unattributed. Audio-On and exhibition-duration reliability remain unverified. The previous 96×96 production is now historical comparison evidence, not a current production alternative.

Founder pass 이후 behavior를 더 튜닝해서 branch/procession을 만들지 않는다. G does not resolve movement angular-feedback limits, natural collective-route qualification, material saturation, or mature AudioWorklet realtime collapse.

### Mechanical memory

실제 six-leg tripod gait가 `FOOT_CONTACT`를 만들고, 이 이벤트가:

```text
gait
→ FOOT_CONTACT
→ SurfaceField
→ Plate qualification
→ material/audio excitation
```

의 공통 입력이 된다.

`SurfaceField`는 느린 mechanical compaction memory다. gait와 SurfaceField는 social observer 때문에 변경되지 않았다.

### Retained material history and production condition

`TrailPlateBirth`는 현재 authored corridor-to-Plate formation law로 유지되며, persistent chemical + mechanical corridor만 immutable Plate descriptor로 만든다.

`MaterialStratigraphy`가 이후 overlap에 따른 exposed/buried/depth를 관리한다.

핵심 invariant:

- birth 후 geometry/material은 frozen
- age ≠ depth
- later overlap만 burial을 만든다
- direct foot strike는 exposed top material 하나에만 전달
- buried material은 reciprocal coupling으로만 반응
- technical ceiling은 history eviction semantics가 아님

Production reads one public `layerCountByCell` value `L` per active ant at tick entry and reuses that same local-history coordinate across three adopted movement consumers:

```text
m(L)  = 1 - 0.10 * (1 - exp(-L / 4))
qA(L) = 1 - 0.50 * (1 - exp(-L / 4))
hD(L) = 1 + 0.50 * (1 - exp(-L / 4))
```

- **Desired-speed resistance:** `m(L)` multiplies the existing final `desiredSpeed` once, after steering/turning/crowding/following/hesitation and before `targetSpeed` / `accelerateToward`. Its asymptotic slowdown is 10%.
- **A — angular maneuverability:** the native requested heading is unchanged; only the native maximum turn-rate ceiling is conditioned to `4.5 rad/s × qA(L)`.
- **D — same-flow headway:** only the native `0.4 s` speed-based comfortable-headway term is multiplied by `hD(L)`. Same-flow classification, personal-space floor, following response, opposing/emergency handling, route intent and swept collision protection remain native.

For all three links `L=0` is exact native behavior. Later contacts, births and topology changes in the same tick therefore apply from the next tick. These are bounded authored world laws, not measured friction/traction values and not a claim that ants physically sense buried Plates. They add no material heading vector, attraction/avoidance target or explicit material mode switch.

The A/D production adoption followed the fixed 20261005 / 600 s integration candidate: the existing slowdown remained correctly applied once, A changed 427,177 / 442,962 material turn calls, D changed 21,694 / 40,418 material-exposed same-flow final targets after slowdown, and no registered finite/cap/collision/population/time/field invariant violation was observed. Blocked frames increased 9,468 → 10,715 (+13.17%); this remains an open production cost rather than a demonstrated pathology. [A/D production adoption](evidence/2026-10-30-material-feedback-ad-production-adoption/README.md) · [candidate evidence](evidence/2026-10-30-material-feedback-ad-production-candidate/REPORT.md).

The separate material-information audit remains **MULTI-AXIS**: `L` nearly compresses burial depth in the observed history, but not exposed Plate age/birth properties, current compaction or cumulative foot-load context. Thus `L` is the currently tested and adopted conditioning coordinate for these links, not an established final physical or artistic descriptor. [Material information axes](evidence/2026-10-30-material-information-axes/REPORT.md).

A three-seed, 600 s pre-cohort diagnostic found that layers born before every currently live ant remained in later ants' occupied columns and contributed through the same aggregate `L` law (46.07% of active ant-time overall; 42.38–50.21% by seed). This is a current-state cross-cohort observation, not attribution to a particular retired ant or evidence of buried-layer sensing. [Pre-cohort evidence](evidence/2026-10-12-pre-cohort-retained-history/README.md).

### Physical audio

현재 production sonic baseline:

```text
3 ms finite direct-contact pulse
75 ms local mechanical recovery
×50 Plate damping
```

Plate history는 장기 저장되지만 vibration memory는 짧게 둔다.

Optional audio-only base substrate tooling/evidence is now integrated on `main` via PR #1, but the feature default remains **Off**. Frozen P1 calibration compared B `.025`, C `.010`, and D `.015` with identical input, P1 descriptor, 63 accepted strikes, 44 matched parent groups and playback/analysis windows. D's first-birth 10 s all-event substrate RMS is **4.72 dB below** born-only P1 (C: −8.24 dB, B: −0.29 dB); pre-birth Off is exact silence and On is nonzero. Shared +18/+20 dB post-gain exports preserved the P1/substrate balance while making the stems directly audible and the fixed-scale plots easier to read.

The later listening judgment is **subjective/artistic, not a numeric acceptance rule**: at an audible absolute level Candidate D felt too dominant, and the current substrate character read as too metallic with too much resonant decay. Therefore `.015` is retained as calibration evidence, not an adopted production balance. **If Base is revisited**, isolate its timbre/material character before any final ratio calibration; this is no longer the automatic next Plate-audio pass. No biological claim is attached to that timbral direction. [Candidate D PCM·fixed-scale evidence](evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/README.md) · [Candidate C `.010`](evidence/2026-10-07-base-substrate-debug/audio/calibration-0.010/README.md) · [Candidate B `.025`](evidence/2026-10-07-base-substrate-debug/audio/calibration-0.025/README.md) · [shared +18/+20 dB evidence](evidence/2026-10-08-candidate-d-absolute-level/README.md).

Frozen P1 pickup-distance diagnosis found a clear midpoint drop but a far-branch counterexample; this supports pickup locality without establishing a monotonic distance law. No candidate topology was tested. [거리/RMS 상관과 동일 세기 위치별 PCM](evidence/2026-10-07-base-substrate-debug/audio/pickup-distance-readout/README.md).

The full 48-node P1 map found strong channel-matched distance response plus nearby low-output and similarly distant high-output regions. One fixed sigma-1 Gaussian 1-hop aperture was tested and rejected: pooled P10 fell 23–25% across 100–500 ms windows. Production point pickups remain unchanged. [fixed-scale node map](evidence/2026-10-07-base-substrate-debug/audio/p1-node-observability/README.md) · [aperture A/B](evidence/2026-10-07-base-substrate-debug/audio/p1-pickup-aperture-ab/README.md).

mature 20–30 Plate의 AudioWorklet realtime collapse는 unresolved known issue다. 이 runtime failure는 Plate individuality evidence와 별개이며 해결된 것으로 간주하지 않는다.

These 2026-10-13–18 research passes are diagnostic only: production `src/` and `static/` are unchanged, and the production sonic baseline above remains in force.

Isolated Plate response depends strongly on contact position. Across the observed natural material range, broad ERB/envelope changes are small, while narrower frequency shifts and accumulated phase effects remain measurable; Z coupling gives a weak, structured perturbation. Under the q=4-matched comparison, frequency-selective loss redistributes modal decay across low and high modes.

**P24 modal-participation result: SUPPORTED.** Frozen p25/p50/p75 cases share poles and eigenspaces, while contact changes mode participation. Pickup observability stays fixed; modal residue sums explain verified autonomous raw-pickup differences after the exact recurrence begins. This is one isolated seed-05 P24 result and does not cover the earlier active-set expansion or every Plate.

**Current Plate-sonic individuality status: supported enough for now, not physically/perceptually complete.** The completed natural blind session used **12 Plates in six selected p50 pairs**; this one listener judged all six real pairs different, while the hidden A/A catch was judged no-difference. Confidence is confidence in that categorical judgment, not a perceptual-distance score. The session does not establish all-pair discrimination, population-level repeatability, cross-position recognition, or native live-world audibility. [Natural subjective export](subjective-listening/2026-10-13-plate-sonic-individuality-subjective-listening.json).

The controlled synthetic geometry session is also complete. Five of six real geometry pairs were judged different by this listener under matched playback. The fixtures are engineering controls, not natural shape classes, and geometry intervention changes the complete geometry-conditioned transfer response rather than isolating a semantic “shape” variable. The raw A/A catch export remains unchanged; an interpretation-only [correction annotation](subjective-listening/2026-10-18-synthetic-plate-shape-capability-corrections.json) records the user's intended no-difference / confidence-5 response. [Synthetic shape capability evidence](evidence/2026-10-18-synthetic-plate-shape-capability/README.md) · [subjective export](subjective-listening/2026-10-18-synthetic-plate-shape-capability-subjective-listening.json).

A reusable static A/B audio evidence viewer and blind first-listen workflow now exist. The workflow supports anonymous A/B, a hidden A/A catch, first notes before reveal, and separate post-reveal notes. One exploratory single-listener Base/Born session was collected on 2026-10-15: the hidden Base/Base A/A catch was judged no-difference, while the q25 and q75 RMS-matched Base/Born pairs were judged different before reveal; the q50 fixed-gain comparison was level-limited and is not used as character evidence. This is not formal perceptual validation and does not establish preference; the measurement decisions above remain unchanged.

Generic Plate-individuality escalation is now parked: no automatic 1 ms pulse pass, pickup redesign, selector change, or further descriptor hunt follows from the current evidence. Same-Plate recognition across contact positions remains an open optional perceptual question, not a current production requirement.

The next audio question is instead the **live dense-world mix**. The implementation sums all active Plate point-pickup outputs before one shared soft limiter and does not normalize by layer count. Natural simultaneous contacts and overlapping resonant tails may therefore mask otherwise distinct isolated responses, but this masking is currently a hypothesis, not established evidence. The next bounded pass will replay one current-production natural window starting at the eight-Plate milestone offline, preserve the full coupled physics and event stream, and decompose only the readout into focal/rest Plate contributions. This separates dense overlap from realtime deadline failure before any mix or DSP redesign. [Plan](daily/2026-10-18-plate-audio-review-and-live-density-plan.md).

### Read-only social observation

`DynamicSocialGraph`:

- caller가 fixed tick 뒤 복사한 `id/x/y/radius`만 읽음
- undirected body-scale proximity episodes
- stable IDs, start/end, duration, min distance
- 60 Hz raw observation
- no RNG, no callback into behavior, no controller/renderer auto integration

`TemporalSocialTopology`:

- 20 Hz analysis
- windows: 0.25 / 1 / 5 / 20 s
- active isolates 포함
- weighted edge = window 안 cumulative proximity seconds
- component / merge / split / edge lifetime
- persistent bridge / articulation / retrospective connector events
- recent-edge tail과 current encounter를 분리

## Latest S0/S1 result

Encounter observable:

```text
q(A,B) = distance(A,B) / (radiusA + radiusB)
q ≤ k
k = 1, 1.25, 1.5, 2
```

기본 radius 0.006에서 center-distance threshold는 0.012 / 0.015 / 0.018 / 0.024다. 이는 collision/body-scale proximity proxy이며 literal antenna/head contact가 아니다.

세 matched seeds(20261005/06/07), 각 600 s에서 graph OFF/ON을 비교했다.

- 108,000 matched simulation ticks
- trajectory/RNG/pheromone/SurfaceField/FOOT_CONTACT/lifecycle/birth hashes match
- focused 120 s pass는 gait/body pose/gaster/activation/stratigraphy/audio command까지 매 tick deep-compare
- final full tests 261/261
- Chrome dev + production preview smoke pass

자연 topology는 sparse했다.

| Window | 해석 |
| --- | --- |
| 0.25 s | current transient를 가장 잘 드러냄 |
| 1 s | primary recent-proximity observation window |
| 5 s | accumulated recent context |
| 20 s | memory/turnover sensitivity case |

k=2 / 0.25 s connector는 총 11건, 0.30–0.65 s였다. 전부 recruitment origin `(0.5, 0.72)`에서 0.019 이내였고, 1 s 이상 window에서는 connector PERSIST가 0이었다.

또한 1 s component count와 population correlation은 seed별 0.953–0.959였다. 이는 기술통계이며 유의성이나 causal null test가 아니다.

**현재 해석:** persistent pioneer/social organization은 미입증이다. 관찰 결과는 proximity, recruitment density, movement geometry, window memory로 설명 가능한지 먼저 검증해야 한다.

전체 수치와 raw archive: [2026-10-07 social graph evidence](evidence/2026-10-07-social-graph/README.md).

## S2a first synchrony null — 2026-10-08

Replayed the existing three 600 s archives with 32 deterministic per-ant circular whole-tuple phase shifts per seed. At k=2 / 1 s, original mean edge counts (1.07–1.24) were below every within-seed null value (null means 2.69–3.02); original short connector counts overlapped null variation. Every rotation preserved the archived ID/lifecycle mask and individual tuple sequence, and all source archives remained byte-identical.

The comparator moves birth/recruitment-origin alignment and introduces discontinuous circular seams; approximately 54–57% of null raw episodes were seam-flagged. It does not preserve instantaneous colony density or collision exclusion. S2a is complete as a first synchrony test, while full movement-constrained validation and social organization remain unestablished. [Method, limitations and seed-level evidence](evidence/2026-10-08-s2a-null/README.md).

## S2b exact spatial movie and S2c predictive value — 2026-10-08

S2b completed eight deterministic five-second identity permutations per seed while preserving every instantaneous spatial configuration. Most simple recent-graph changes concentrated around intentional remaps and lifecycle repairs; this identity/data-stream null did not isolate social continuity from artificial boundaries. [S2b evidence and limitations](evidence/2026-10-08-s2b-null/README.md).

S2c used only the three natural archives to predict an existing k=2 / 1 s component merge in the next second. Leave-one-seed-out logistic models compared five current spatial/movement features with three additional causal graph summaries. Future-merge prevalence was 30–32%. Primary added-minus-baseline ROC AUC was +0.002855 / −0.025544 / −0.008080; average precision and Brier likewise improved seed 05 slightly and worsened seeds 06/07. A training alignment control also produced small gains. **Decision: spectral SKIP at this gate; no consistent held-out additional-value signal.** This concerns the selected features/model, not all possible temporal information or social organization. [S2c definitions, leakage audit, results and reproduction](evidence/2026-10-08-s2c-incremental-value/README.md).

## Social observation vs material generation

### Social observation

```text
fast
mobile
ephemeral
current/recent proximity-derived
read-only / parked baseline
```

S0–S2c 결과에서 현재 social topology를 독립적인 생성 원인이나 causal layer로 올릴 근거는 확인되지 않았다. 따라서 social graph는 버리지 않고 **현재 movement system을 읽는 frozen diagnostic baseline**으로 유지한다.

향후 explicit relationship / partner memory / social mechanism을 별도 가설로 도입할 경우, 이 no-relationship baseline과 matched seed / observer semantics로 다시 비교한다. 그때 차이가 재현될 때에만 social mechanism의 추가 효과를 논의한다.

### Material generation

```text
movement
→ chemical memory
→ FOOT_CONTACT / mechanical memory
→ frozen Plate / stratigraphy
→ physical vibration / sound
```

이 축은 현재 구현과 evidence가 직접 연결되는 생성계다. 현재 프로젝트의 중심 질문은 social topology를 material의 원인으로 가정하는 대신:

> 현재 행동이 사라진 뒤에도 반복 행동의 역사가 환경의 물질 구조와 소리로 남는가?

로 둔다.

## Persistent-world design target

The production chain above sits inside a **persistent circulating world**, rather than a one-way agent→material→sound pipeline.

```text
internal state
→ action
→ environmental memory
→ material
→ vibration
→ shared environmental condition
→ internal state / action
```

There is no prescribed destination or global reward in this design. Agent presence is not the existence condition of the world: zero-ant intervals are valid and slower world state may continue. Future state/feedback links should alter local possibilities and consequences rather than command routes. Internal state is not directly sonified; the world itself is the target sounding body; any future acoustic feedback must derive from pre-master physical vibration rather than speaker/master output. Exceptional entities may occur, but their influence must remain finite and bounded.

The full design contract and implemented-vs-proposed boundary are in [`world-model.md`](world-model.md). Any further causal link needs its own test and authorization.

The 2026-10-11 three-seed causal A/B supported the fixed local-column-count resistance candidate: travel and realized speed fell, exposed episodes lengthened, and later history changed without observed trapping or collapse. Plate-birth and coverage directions varied by seed, so no direction is claimed. The candidate was adopted on 2026-10-12 with production default On. [Paired evidence](evidence/2026-10-11-retained-material-locomotion-ab-final/README.md) · [adoption verification](evidence/2026-10-12-retained-material-locomotion-adoption/README.md).

## Future hypothesis — Material-mediated social dynamics

[**Material-mediated Social Dynamics (2026-10-09 concept note)**](material-mediated-social-dynamics.md) remains a **proposed, not implemented** pathway: richer episode/order-sensitive Plate character → temporary organism-state after-effect → possible encounter-mediated influence → later environmental consequences. It separates changing place conditions from immutable Plate character, and treats “ant paradise / ant hell” as retrospective observational metaphors, not built-in Plate types or success targets. The adopted local locomotion condition does not depend on this pathway; vitality is a separate future hypothesis only if an organism after-effect after leaving material becomes necessary. The S0–S2c social baseline remains read-only/parked. [Design discussion chronology](daily/2026-10-09-material-mediated-social-dynamics.md).

## Current research boundary

현재 **하지 않는 것**:

- social role / pioneer state
- adaptive partner memory
- graph → ant behavior
- graph → Plate excitation
- λ₂ / eigenmode를 biological entity로 해석
- Plate birth retuning
- mature audio runtime optimization
- naive Erdős–Rényi만으로 emergence 주장

Research evidence와 artistic/modeling interpretation을 구분한다. Graph spectral mode → material excitation은 향후 가능한 artistic/mathematical mapping이지 ant biology의 검증된 mechanism이 아니다.

## Current production boundary and future hypotheses

The first production causal link is retained local stratigraphy → bounded locomotion resistance → later movement and environmental history. It is the exact fixed candidate described above. `TrailPlateBirth` remains the current authored formation baseline. The adoption does not claim more Plate births or coverage.

Vitality is a separate future hypothesis only if an organism after-effect needs to persist after an ant leaves a Plate. Alternative formation laws, richer episode/order-sensitive material character, C2 and retained relations are not prerequisites for the adopted production link. Acoustic climate remains future work. There is no active W1→W2→W3 mandatory sequence.

The 2026-10-12 one-tick causal-tail pass found post-exit consequences carried by existing movement and environmental state, with no demonstrated need for a separate organism state: **SUFFICIENT CURRENTLY; temporary after-effect / vitality PARK**. This is a bounded current-world decision, not a hidden-memory claim. [Causal-tail evidence](evidence/2026-10-12-material-causal-tail/README.md).

The 2026-10-11 retained-material exposure shadow established that later ants encounter exposed stratigraphy in natural runs; it is descriptive evidence, not sensing evidence. [Exposure shadow](evidence/2026-10-11-retained-material-experience-shadow-final/README.md).

A 2026-10-12 research-only shadow imposed one 60 s zero-ant interval at 400 s. The unchanged world clocks advanced, pre-gap column placement persisted in all three seeds, and later entrants encountered pre-gap material on 81.76% of post-gap active ant-time; this does not establish that production lifecycle naturally reaches zero ants or test audio continuity. [Zero-ant continuity evidence](evidence/2026-10-12-zero-ant-continuity/README.md).

A 2026-10-13 TrailPlateBirth-only follow-up found mixed natural lineages: 4 of 8 gap births continued a pre-gap candidate in seed `20261006`, while 4 followed post-gap candidates. Clearing only the pending candidate still produced 7 post-gap Plate births across all three matched seeds. This supports regeneration by the retained input set during the forced shadow, not a natural zero-ant lifecycle or an individual-input necessity claim. [Candidate-lineage evidence](evidence/2026-10-13-trail-plate-zero-gap-lineage/README.md).

A 2026-10-13 Nodule-only follow-up found 14 natural gap births: 11 completed pre-gap persistence and 3 restarted after a gap-born Plate reset the cell timer. Clearing only Nodule timers still yielded 13 births from cells already qualified at gap entry. Gap Plates enabled qualification at 32 other cells, none of which birthed a Nodule during the interval. This is mixed lineage evidence from a forced shadow, not a natural zero-ant lifecycle. [Nodule lineage evidence](evidence/2026-10-13-nodule-zero-gap-lineage/README.md).

The fixed-window timer/blocker instrumentation resolved all 32 target cells per arm: 20 right-censored, 7 Plate-reset censored, and 5 compaction losses. Six earlier mature proximity rejections were followed by restarted sub-30 s timers, so they are secondary events rather than additional final failures. **WINDOW CENSORING DOMINANT** describes the 400–460 s forced shadow and does not predict later births. [Instrumentation](evidence/2026-10-13-nodule-gap-censoring-instrumentation/README.md).

The separate natural 600 s Nodule census found all three seeds reached `maxNodules=32` while spatially unblocked qualified cells remained: Q/A immediately before the cap birth were 765/21, 599/6, and 765/15. A persisted at every post-cap census and at the 600 s clock endpoint. At the same time, 93.2–93.4% of repeated Q cell-evaluation visits were spatially blocked. **MIXED:** both spatial exclusion and the global cap materially bound the observed runs. This does not imply post-cap births without the cap. A saved-data recheck also found all 27 active timers from the earlier fixed window were nearby at its cutoff, so they are not evidence of eventual births under a simple extension. Keep the fixed-window classification scoped to 400–460 s; no cap change or gap extension is selected. [Natural Nodule opportunity evidence](evidence/2026-10-13-natural-nodule-opportunity/README.md).

The [2026-10-13 architecture reassessment](2026-10-13-persistent-world-reassessment.md) found an existing bounded material-character path: Plate chemical/support aggregates and Nodule compaction/layer/load aggregates already set frozen solver properties. Richer episode/order-sensitive character remains unimplemented. The next proposed discriminator is the effective natural range and response contribution of those existing properties; no new causal link was selected. Vitality/social/natural-vacancy mechanisms remain PARK. The Nodule cap stays unchanged; cap removal, turnover, erosion, and another gap run remain unselected. [Branch/worktree hygiene inventory](2026-10-13-repo-hygiene-map.md).

### Research gate

S2a synchrony null, S2b exact-spatial identity null and S2c incremental predictive-value check are complete. S2a/S2b retain their recruitment/seam and remap/turnover limitations. S2c found no consistent held-out gain from the selected simple temporal graph summaries beyond the compact current-frame baseline.

The current decision is **spectral SKIP**. Keep social topology as a read-only derived observation layer and frozen no-relationship comparison baseline. Do not escalate automatically to another null, spectral diagnostics, roles, adaptive memory, feedback or material coupling. This bounded comparison does not prove that every temporal summary is redundant.

A future relationship/memory hypothesis may reopen social research, but it must be introduced as a new explicit mechanism and compared against the current frozen baseline under matched seeds, movement conditions and observer definitions.

### Material / sound direction

The optional Base Substrate implementation and B/C/D calibration evidence remain preserved, with the feature default Off. It is no longer the conceptual target of an always-present "base plate" that must sound on every step.

The target sound model is now:

```text
activity
→ changes environmental/material state
→ changes physical vibration
→ the current world becomes audible
```

Localized material may develop different resonant character, but **the world itself is the primary sounding body**.

Current production includes the adopted local locomotion condition. Further movement or acoustic links remain future hypotheses and need separate evidence and authorization. The S0–S2c social observer remains complete and parked; spectral diagnostics remain skipped.

## Evidence index

### Behavior / movement

- [Retained material experience shadow — three current-main 600 s runs; observer parity exact; supported as an opportunity for one separate local A/B](evidence/2026-10-11-retained-material-experience-shadow-final/README.md)
- [Retained-material locomotion causal A/B — fixed candidate supported across three seeds](evidence/2026-10-11-retained-material-locomotion-ab-final/README.md)
- [Retained-material locomotion production adoption — default-On and explicit-Off conformance](evidence/2026-10-12-retained-material-locomotion-adoption/README.md)
- [TrailPlateBirth zero-ant gap candidate lineage — mixed natural completion and retained-input regeneration](evidence/2026-10-13-trail-plate-zero-gap-lineage/README.md)
- [MaterialStratigraphy Nodule zero-ant gap lineage — latent timers, retained qualification and Plate-reset cases](evidence/2026-10-13-nodule-zero-gap-lineage/README.md)
- [Nodule censoring audit — prior saved-data limitation](evidence/2026-10-13-nodule-lineage-censoring/README.md)
- [Nodule timer/blocker instrumentation — 27 window-censored vs 5 compaction losses](evidence/2026-10-13-nodule-gap-censoring-instrumentation/README.md)
- [Natural 600 s Nodule opportunity census — MIXED spatial exclusion and cap censoring](evidence/2026-10-13-natural-nodule-opportunity/README.md)
- [Interior endpoint shadow selector — frozen three-seed diagnostic; production selector unchanged](evidence/2026-10-08-interior-endpoint-shadow/README.md)
- [Local-accretion shadow — branch-only mixed/negative morphology comparison](https://github.com/oseconds/ant-2026/tree/ant-local-accretion-shadow/docs/ant/evidence/2026-10-08-local-accretion-shadow)
- [Movement / material morphology diagnosis — frozen three-seed archive/replay, no production intervention](evidence/2026-10-08-movement-material-morphology/README.md)
- [Integrated refinement](evidence/2026-10-05-integrated-refinement/README.md)
- [Gait / FOOT_CONTACT](evidence/2026-10-05-gait/README.md)
- [Reinforcement](evidence/2026-10-05-reinforcement/README.md)
- [Turnover](evidence/2026-10-05-turnover/README.md)
- [Founder-effect refinement](evidence/2026-10-07-founder-effect-refinement/README.md)

### Material / audio

- [Reusable static A/B audio evidence viewer schema and usage](audio-evidence-viewer.md)
- [Plate sonic individuality](evidence/2026-10-13-plate-sonic-individuality/README.md)
- [Plate contact-position ERB identity](evidence/2026-10-14-plate-erb-position-identity/README.md)
- [Observed-range material contribution](evidence/2026-10-14-plate-erb-material-contribution/README.md)
- [Z-coupling ERB perturbation](evidence/2026-10-14-plate-erb-z-coupling/README.md)
- [Base/Born causal decomposition](evidence/2026-10-14-base-born-causal-decomposition/README.md)
- [q=4-matched loss distribution](evidence/2026-10-14-base-born-loss-distribution/README.md)
- [Natural Base/Born ERB events](evidence/2026-10-14-base-born-natural-event-erb/README.md)
- [Natural-event ERB boundary sensitivity — aggregate shape separation survives; individual windows remain context-sensitive](evidence/2026-10-15-erb-window-boundary/README.md)
- [P24 modal participation — SUPPORTED](evidence/2026-10-15-plate-modal-participation/README.md)
- [Blind first-listen viewer workflow](daily/2026-10-15-audio-evidence-viewer-blind-workflow.md)
- [Surface Plates](evidence/2026-10-05-surface-plates/README.md)
- [Contact sonic baseline](evidence/2026-10-06-contact-sonic-baseline/README.md)
- [Plate decay](evidence/2026-10-06-plate-decay/README.md)
- [Stratigraphy / runtime](evidence/2026-10-06-stratigraphy-runtime/README.md)
- [Runtime re-check](evidence/2026-10-06-runtime-recheck/README.md)
- [Base substrate / Plate Debug — Candidate D substrate is 4.72 dB below born P1](evidence/2026-10-07-base-substrate-debug/README.md)

### Social observation

- [S0/S1 DynamicSocialGraph evidence](evidence/2026-10-07-social-graph/README.md)
- [S2a trajectory synchrony null](evidence/2026-10-08-s2a-null/README.md)
- [S2b exact-spatial-movie identity null](evidence/2026-10-08-s2b-null/README.md)
- [S2c incremental predictive value](evidence/2026-10-08-s2c-incremental-value/README.md)

## Daily chronology

날짜별 실험의 출발 질문, negative result, 방향 전환은 [`docs/ant/daily/`](daily/README.md)에 기록한다.

Daily log는 현재 상태를 덮어쓰는 source가 아니라 chronology다. Current state가 필요하면 이 문서를 먼저 보고, 실험의 상세 claim은 해당 evidence README로 내려간다.
