공유해 주신 Google Drive 폴더에서 핵심 프로덕션 소스 코드(`src/**`, `static/worklets/**`, `tests/**`, `scripts/**`), 최신 G 채택 증거(`2026-10-25-g-production-adoption`), 오디오/모달/ERB/수면 차단 진단 증거(`022`~`028`), 그리고 별도 연구 브랜치 보고서(`W1`, `local-accretion`, `spatial-dynamics`, `pheromone-project-decision`, `material-formation-responsibility`) 원문을 추가로 열람하여 **코드 라인 단위의 대조를 마친 최종 독립 연구·작품 검토 보고서**입니다.

*(초기 1차 응답에서 원문 미열람으로 남아 있던 `surface-plate.worklet.js`의 `PLATE_PICKUP_MIX = 1` 스케일링, `TrailPlateBirth.js`의 물성 클램프 수식, `AntRenderer.js`의 깊이 알파 상한 `21`, `2026-10-07-dormant-plate-rom`의 모달 투영 병목, `2026-10-22-spatial-dynamics`의 2시간 포화 역설 등을 모두 실제 코드·수치로 반영 및 교정했습니다.)*

---

## 0. 검토 기준(Commit/Ref) 및 자료 구분

* **현재 문서 정본 (`current_documentation_ref`)**: `main@fbd9f92783f6477d22bdec92f9c82742511981ae` (2026-10-25, 웹 우선 감상 계약 및 관람객 질문 명확화 반영본)
* **현재 프로덕션 코드 기준선 (`original_production_source_ref`)**: `main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae` (`fe9618db21910393e464d8f619665f340d9599e9`에서 **Candidate G 316×316 페로몬 필드**가 non-force fast-forward로 통합된 상태; `fbd9f927`과 모든 코드·워크릿·테스트 블롭 동일)
* **G 채택 직전 프로덕션 기준선**: `main@8c60e4bba3bd5b476300e90a2936bfebd1f831c2`
* **분리 해석한 연구 브랜치 (`branch_research_ref` 및 개별 브랜치)**:
* 오디오 밀집 중첩·전시 런타임 브랜치: `aea6601f6fc5c4d241fae7376f0f6cd59d11101f` (`8c60e4bb` 기반에서 수행된 pre-G 연구)
* 공간 동역학 연구 브랜치: `codex/ant-spatial-dynamics-research-20261022` (`8c60e4bb` 기반)
* 페로몬 프로젝트 결정 브랜치: `codex/ant-pheromone-project-decision-20261025` (`b806f87b` / `8c60e4bb` 기반)
* 물질 형성 책임 브랜치: `codex/ant-material-formation-responsibility-20261013` (`f7c10483` / `d45823d4` 기반)
* W1 에피소드·형성 게이트 브랜치: `ant-w1-episodic-material-shadow` (`f543531d`, `1d36cc6e`, `1b783d49` 등)
* 국소 응착 그림자 브랜치: `ant-local-accretion-shadow` (`562919b8` / `cf8ee794` 기반)


* **제외 및 미접근 범위**: 지침에 따라 `docs/ant/archive/**`는 열람·인용에서 제외했으며, 번들에 포함되지 않은 원본 WAV/PCM 오디오, WebM 영상, PNG 이미지, 대용량 분석 바이너리(`16MB analysis.json`, `534KB benchmark.json`, `capture-inputs.v8.gz`) 및 별도 CLI 테스트 실행은 직접 수행하지 않은 것으로 명시합니다(보고서 말미에 열람한 전체 파트 및 파일 목록 수록).

---

## 1. 독립 시스템 검토: 코드·증거·인과 구조의 정밀 대조

실제 프로덕션 소스(`AntController.js`, `AntAgent.js`, `PheromoneField.js`, `SurfaceField.js`, `TrailPlateBirth.js`, `MaterialStratigraphy.js`, `compileSurfaceTopology.js`, `SurfaceAudioBridge.js`, `surface-plate.worklet.js`, `AntRenderer.js`)를 라인 단위로 추적하여 여섯 가지 층위를 구분하면 다음과 같습니다.

### 1.1. 여섯 가지 층위의 구분

1. **코드에 명시된 규칙 (Implemented Rules)**:
* **이동 및 조향 (`src/lib/agents/ant/AntController.js:304-370`)**: 개미는 5개 원거리 방향(`±0.92, ±0.47, 0 rad`, 거리 `0.042`)의 Hill 반응($c^3/(c^3+0.035^3)$)과 근거리 2개 깊이(`0.016, 0.028`) 프로파일로 `trailConfidence`와 `trailAdherence`(상승 시정수 `0.25 s`, 감쇠 `1.8 s`)를 갱신합니다. 이때 국소 조향 보정(`line 328-332`)은 다음과 같습니다.

$$\text{localTurn} = \text{clamp}\big(\text{steering} \cdot (0.35 + 0.65 A) - \text{clamp}(\omega_{\text{prev}}, -2.2, 2.2) \cdot 0.65 A,\; -0.45, 0.45\big)$$



주목할 점은 각속도 감쇠항에 **`dt`(`1/60`)가 곱해져 있지 않다**는 사실과, `AntAgent.js:17-25`에서 생성된 7개의 개성(`personality`) 필드 중 **`turnResponsiveness`, `acceleration`, `damping` 3개는 이동 코드 어디에서도 읽히지 않는다**(`AntAgent.js:41`은 고정 상수 `32 / 37`을 사용)는 점입니다.
* **페로몬 G 316×316 (`src/lib/agents/ant/PheromoneField.js:1-168`)**: `316×316` 격자 위에 반경 `0.0045`($\sigma=0.00225$) 가우시안 브러시로 점적하되, 기존 96×96 격자 대비 면적 스케일 인자 `sourceDoseScale = (315/95)² = 3969/361 ≈ 10.9945`를 곱해 저장함으로써 양선형 적분값(`reconstructedIntegral`)을 보존합니다.
* **Plate 탄생 및 물성 동결 (`src/lib/agents/ant/TrailPlateBirth.js:250-330`)**: 1초마다 화학 EMA($\ge 0.30$)와 기계적 지지($\ge 0.015$) 마스크를 Zhang–Suen 세선화하고, 둥지 환형(`(0.5, 0.72)`, 반경 `0.055–0.115`) 내 단 하나의 시작 시드(`sourceSeeds`, 반경 중간값 `0.085`에 가장 가까운 픽셀 1개)에서 가장 먼 경계(`≤ 0.05`)까지의 최단 경로(`≥ 0.30`)를 추출합니다. 리본 반폭은 `clamp(distance / 95, 0.012, 0.030)`이며, 물성은 다음 수식(`line 285-327`)으로 동결됩니다:

$$\text{supportNorm} = \text{clamp}(\text{meanSupport} / 0.08,\; 0, 1), \quad \text{chemicalNorm} = \text{clamp}(\text{meanChemical},\; 0, 1)$$


$$\text{stiffness} = 0.65 + 0.5 \cdot \text{chemicalNorm}, \quad \text{density} = 1.0 + 0.2 \cdot \text{supportNorm}, \quad \text{damping} = 0.25 + 0.2 \cdot \text{chemicalNorm}$$


* **층서 및 Nodule (`src/lib/agents/ant/MaterialStratigraphy.js:45-315`)**: 후속 판이 겹칠 때만 매몰 깊이가 증가하며, 중첩 판 $\ge 4$, 다짐도 $\ge 0.55$, 반경 `0.028` 내 발 하중 $\ge 200$, 30초 유지 시 Nodule이 탄생하여 최하단 기반 판(`column[0]`)의 단일 솔버 노드에 스프링(`weight * 0.000025`)으로 결합됩니다.
* **음향 워크릿 (`static/worklets/surface-plate.worklet.js:1-629`)**: 32×32 희소 격자에서 $6\text{ kHz}$로 쌍조화 굽힘($\Delta^2 u$), 장력($\Delta u$), $\times 50$ 감쇠, 인접 Z-스프링, 12-모드 구면조화 진동자를 적분합니다. 출력 믹스(`line 488-491`)는 **`mixL = outL * 1 + sphereOutL * (1 / Math.sqrt(12))`** 후 소프트 리미터 `x / (1 + |x|)`를 거칩니다.
* **시각 렌더러 (`src/lib/renderers/AntRenderer.js:186-210`)**: 프로덕션 기본 뷰에서 모든 층서(`materialImage`)는 RGB `(100, 100, 100)` 단일 회색에 알파 **`Math.min(21, 9 + depthCount * 1.25)`**(최대 불투명도 `21/255 ≈ 8.2%`)로만 그려지며, Nodule은 렌더링되지 않습니다.


2. **관찰된 실험 결과 vs 모델 내부 설명 vs 미검증 가정의 교차 대조**:
* **주장과 구현/증거가 어긋나는 지점**:
1. *“형성 이력이 물성(material character)을 결정한다”*는 설계 계약과 달리, `TrailPlateBirth.js:285`의 `meanSupport / 0.08` 정규화는 자연 탄생 시점의 지지도(`~0.37–0.55`)에서 **항상 1.0으로 포화되어 100개 모든 자연 Plate의 밀도가 `1.2`로 고정**됩니다(`2026-10-13-plate-sonic-individuality/README.md`). 또한 `stiffness`와 `damping`은 똑같이 `meanChemical` 하나에만 종속되어 $\text{damping} = 0.4 \cdot \text{stiffness} - 0.01$이라는 완전 공선성(collinearity)에 갇혀 있으며, 실제 ERB 분석(`2026-10-14-plate-erb-material-contribution/README.md`)에서도 자연 물성 변화의 영향은 **NEGATIVE**(통합 ERB 코사인 `0.999992`, RMS 변화 `0.0027 dB`)로 판정되었습니다.
2. `SurfaceAudioBridge.js:212`는 `SurfaceField` 다짐도에서 계산한 `hardness`를 매 타격 페이로드에 담아 보내지만, 정작 `surface-plate.worklet.js:559`(`applyStrike`)는 `p.hardness`를 아예 읽지 않는 죽은 배선(dead wire)입니다.


* **여러 설명이 가능하지만 하나로 단정하기 쉬운 결과**:
* 고립된 판의 청취 구별 성공(`6/6` 자연 쌍, `5/6` 합성 쌍)은 ‘물질 형성 법칙의 성공’이 아니라 **32×32 격자 양자화에 따른 노드 수(48~350개) 차이 및 타격점-픽업 간 고유공간 투영(`2026-10-15-plate-modal-participation/README.md`: p25/p50/p75 간 소스 투영 코사인 `0.109–0.410`)의 효과**입니다. 실제로 같은 판에서 타격 위치만 바꿨을 때의 ERB 거리(`0.5203`)가 서로 다른 판을 같은 위치에서 쳤을 때의 거리(`0.471`, `within-over-between dominance 47.2%`)보다 더 큽니다(`2026-10-14-plate-erb-position-identity/README.md`).


* **이미 충분히 해결·기각됐는데 계속 문제로 취급하거나 반복 위험이 있는 부분**:
* W1 브랜치(`w1-material-formation-design-gate.md`, `w1-formation-plate-deposit-reassessment.md`)는 이미 9개의 감사 패키지를 통해 "별도의 연속적 Material 필드나 독립된 Deposit 클래스를 추가하지 않아도 기존 Plate + Z-층서 구조만으로 물리적 보존과 응답 설명이 충분하다(`Existing-state sufficiency`)"는 결론을 명확히 내렸습니다.
* 또한 `2026-10-07-dormant-plate-rom/README.md`는 "기존 Z-스프링(판당 수백 개 노드 연결)을 매 스텝 모달 기저로 조밀하게 투영(`dense modal input projection`)하고 노드별 수면 에너지를 매 스텝 재구성하면, 모달 랭크 8에서도 연산량이 0.97×(재구성 포함 시 2.52×)가 되어 전혀 빨라지지 않는다"는 사실을 이미 수학적·실증적으로 증명했습니다.





---

## 2. 핵심 발견 (Core Findings — 4가지)

### 발견 1. [수식적 포화와 죽은 배선] `TrailPlateBirth`의 물성 변환식은 자연 코퍼스 100개 전체에서 밀도를 `1.2`로 포화시키고 강성과 감쇠를 단일 변수에 종속시키며(`ERB 효과 NEGATIVE`), 다짐도 기반 `hardness`는 워크릿에서 무시되고 있다.

* **근거 파일 및 커밋**:
* `src/lib/agents/ant/TrailPlateBirth.js:285-327` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `src/lib/audio/SurfaceAudioBridge.js:206-214` 및 `static/worklets/surface-plate.worklet.js:559-592` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-13-plate-sonic-individuality/README.md` (`ref=main@fbd9f92783f6477d22bdec92f9c82742511981ae`)
* `docs/ant/evidence/2026-10-14-plate-erb-material-contribution/README.md` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-14-plate-erb-position-identity/README.md` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)


* **왜 중요한가**:
ANT의 가장 중요한 설계 선언 중 하나는 *"물질의 성격은 임의의 프리셋이 아니라 형성 이력에서 도출되어야 한다"*(`world-model.md`)입니다. 그러나 실제 코드를 확인한 결과:
1. `supportNorm = clamp(candidate.meanSupport / 0.08, 0, 1)`에서 분모 `0.08`이 너무 작아, 20초 유지 관문을 통과한 모든 자연 후보(`meanSupport ≈ 0.37~0.55`)에서 `supportNorm = 1`이 되어 **자연 탄생한 100개 모든 Plate의 `density`가 `1.2`로 100% 동일**합니다.
2. `stiffness`와 `damping`은 모두 `chemicalNorm` 하나의 일차함수여서 $\text{damping} = 0.4 \times \text{stiffness} - 0.01$로 완벽히 묶여 있고, 자연 범위도 `stiffness ∈ [0.9046, 0.9208]`(±0.9%)에 불과하여 ERB 대역 기여도가 사실상 `0`(`cosine 0.999992`, **NEGATIVE**)입니다.
3. 심지어 리본의 폭(`widths`)조차 `2026-10-08-movement-material-morphology/README.md`에서 확인되듯 **전체 샘플의 78.6~79.3%가 하한선(`0.012`)에 클램핑**되어 있습니다.
4. `SurfaceField`가 계산한 국소 다짐도 `hardness`는 `SurfaceAudioBridge.js:212`에서 워크릿 메시지로 전송되지만, `surface-plate.worklet.js:559`의 `applyStrike`는 `p.footprintRadius`와 `p.strength`만 읽고 **`p.hardness`는 버립니다**(`CONTACT_PULSE_STEPS = 18` 고정).


* **대안 설명 및 반례**:
물성이 고정되어 있어도 기하학적 형태(노드 수 48~350개)와 픽업 위치 덕분에 고립된 단발 타격에서는 판마다 다른 주파수 응답이 나옵니다(`2026-10-13-plate-sonic-individuality`). 그러나 `2026-10-14-plate-erb-position-identity`가 증명했듯, 같은 판 내부에서 타격 위치를 바꿨을 때(p25 vs p50 vs p75)의 스펙트럼 변화(중앙값 코사인 `0.480`)가 서로 다른 판 사이의 변화(`0.529`)보다 더 크며, 8개 판이 동시에 울리는 자연 런(`2026-10-18-natural-dense-readout-overlap`, `ref=aea6601f`)에서는 **60.3%의 타격에서 타 판들의 잔향 합이 타격된 판보다 더 커서(`-5.38 dB`)** 기하학적 차이마저 중첩 속에 희석됩니다.
* **결론 범위와 작품적 함의**:
새로운 물질 온톨로지(W1)를 발명할 필요가 없습니다. **이미 코드에 존재하는 형성 이력 변수들(접촉 빈도 분산, 다짐도 `hardness`, 매몰 깊이)이 클램프와 죽은 배선에 막혀 소리까지 도달하지 못하고 있는 병목**만 풀어주어도, 판마다 전혀 다른 물리적 목소리와 어택(impulse duration)을 즉시 얻을 수 있습니다.

---

### 발견 2. [수면(Sleep)의 구조적 불가능성과 ROM의 함정] 성숙한 세계의 실시간 오디오 붕괴(`30-Plate Audio/wall = 0.113`)는 ‘부분 노출된 고대 판의 판내 전파’ 때문이며, 이를 해결하려면 매몰 판의 Z-결합을 ‘희소 앵커 결합(Sparse Anchor Coupling)’으로 전환해야 한다.

* **근거 파일 및 커밋**:
* `static/worklets/surface-plate.worklet.js:407-504` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-06-sleep-blockers/2026-10-06T11-08-56-558Z/README.md` 및 `depth-propagation/README.md` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-07-dormant-plate-rom/README.md` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-21-exhibition-audio-runtime/README.md` (`ref=aea6601f6fc5c4d241fae7376f0f6cd59d11101f`)


* **왜 중요한가**:
1. `2026-10-06-sleep-blockers`의 정밀 진단표를 보면, 30개 판이 쌓였을 때 가장 오래된 `trail-plate-1`(총 655개 소스 셀 중 **650개가 매몰되고 단 5개 셀만 노출**됨)은 94,094,482번의 노드 스텝 동안 **단 한 번도 잠들지 못했고(최대 정적 연속 기록이 12,000스텝 중 고작 4스텝)**, `localPlateForce >= 1e-8`이 99.95%, `quietEnergy >= 1e-10`이 99.51%의 스텝에서 수면을 막았습니다.
2. 왜 99.2%가 땅속에 묻힌 `trail-plate-1`이 영원히 깨어 있는가? 첫째, 아직 노출된 **단 5개의 가장자리 셀**을 개미가 밟을 때마다(`21,272회` 직접 타격) 판 내부의 쌍조화 파동 전파(`Intra-Plate propagation`, `286,497,492회`)가 매몰된 650개 셀(119개 노드) 전체를 깨우기 때문입니다. 둘째, Z-스프링이 `abs(linkForce) > 1e-8`일 때마다 인접 층 노드의 `energyQuiet` 카운터를 `0`으로 리셋(`surface-plate.worklet.js:433`)하기 때문입니다.
3. 그렇다면 왜 `2026-10-07-dormant-plate-rom`의 모달 축소 모델(ROM)은 실패했는가? 해당 보고서의 연산량 분석(`Operation estimate`)을 보면, Plate 29(310개 노드, **681개 Z-링크**)를 모달 기저로 돌릴 때 매 6 kHz 스텝마다 681개의 Z-링크 힘을 모달 좌표로 내적(dense modal input projection)하고 수면/각성 판정을 위해 310개 노드의 변위를 재구성(`N * r`)했기 때문에 랭크 16에서 오히려 원래 FDTD보다 **1.60배~2.52배 더 느려진 것**입니다.
4. 반면, `depth-propagation/README.md`는 놀라운 물리적 사실을 보여줍니다. 최상단 Plate 30을 한 번 쳤을 때, 바로 아래 층(depth 1, Plate 29)으로 전달되는 피크 에너지는 **`-36.5 dB`**, depth 2(Plate 28)는 **`-50.1 dB`**, depth 3 이하(Plate 27~1)는 `-75.3 dB ~ -120 dB`(사실상 완전한 무음)입니다! 즉, **깊이 3 이상 매몰된 판들의 32×32 격자와 수천 개의 Z-링크는 오디오 출력에는 `-75 dB` 이하의 아무런 기여도 하지 않으면서 CPU의 85% 이상을 소모해 오디오 클럭(`0.113x`)을 멈추게 하고 있는 것**입니다.


* **대안 설명 및 반례**:
`2026-10-21-exhibition-audio-runtime`에서 Z-스프링을 전부 끈 `Z-off` 프로토타입(`?antAudio=lite`)을 시험했으나, 30-Plate에서 여전히 `Audio/wall = 0.202`(오프라인 `0.289`)로 실패했습니다. 왜냐하면 `Z-off`를 해도 각 판의 5~10개 노출된 꼬리 셀로 들어오는 직접 타격이 30개 판 모두의 32×32 FDTD 격자 전체(`8,123 / 8,345` 노드)를 깨우기 때문입니다.
* **결론 범위와 작품적 함의**:
이 발견은 실시간 오디오 붕괴를 해결할 **유일하고도 정확한 물리적 해법**을 알려줍니다.
* `2026-10-07-dormant-plate-rom`처럼 '전체 노드 Z-투영 + FDTD 복귀(wake handoff)'를 해서는 안 됩니다.
* 대신, **① 노출된 셀에서는 상부 판이 하부 판을 덮는 순간 덮인(buried) 셀들을 FDTD 활성 격자에서 동결(또는 감쇠 가속)하여 '5개의 노출된 꼬리 셀이 650개의 매몰 셀 전체를 32×32 FDTD로 흔드는 현상'을 차단**하거나, ② 매몰된 지층은 Nodule처럼 단 2개의 픽업/앵커 노드에서만 상부 층과 결합되는 저차 모달 공명체(판당 4~6모드, 재구성 없음, $O(1)$ 결합)로 비가역 화석화(Lithification)시켜야 합니다.



---

### 발견 3. [G 316×316 채택 이후의 역설과 공간 포화] 고해상도 페로몬(G)과 각속도 보정(`dtFeedback`) 연구는 ‘경로의 선명화·매끄러움’이 오히려 ‘장기 공간 포화(99.2% 블롭화)와 오디오 붕괴의 가속’을 부른다는 구조적 역설을 드러냈다.

* **근거 파일 및 커밋**:
* `src/lib/agents/ant/PheromoneField.js:1-30` 및 `docs/ant/evidence/2026-10-25-g-production-adoption/README.md` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-25-pheromone-project-decision/README.md` (`ref=codex/ant-pheromone-project-decision-20261025`)
* `docs/ant/evidence/2026-10-22-spatial-dynamics/REPORT.md` 및 `AUDIT.md` (`ref=codex/ant-spatial-dynamics-research-20261022`)
* `docs/ant/evidence/2026-10-08-local-accretion-shadow/README.md` (`ref=ant-local-accretion-shadow`)


* **왜 중요한가**:
1. `AntController.js:330`의 지연 각속도 피드백(`-0.65 * A * omega`, `dt` 미적용) 때문에 프로덕션 개미들은 강한 페로몬 위에서 매 틱 좌우로 방향을 트는 지그재그 진동(인접 틱 각속도 상관계수 `-0.6230`, 회전 상한 도달률 `87.93%`)을 겪습니다(`2026-10-22-spatial-dynamics/REPORT.md`).
2. 그런데 `spatial-dynamics` 브랜치에서 여기에 `dt`를 곱해(`dtFeedback`) 궤적을 매끄럽게 만들었더니(상관계수 `+0.7832`), 초기 10분간은 Plate 수가 줄어들다가 **2시간(7,200초) 런에서는 오히려 캔버스 전체 면적의 `99.20%`(프로덕션은 `77.34%`)를 뒤덮는 거대한 단일 블롭**이 되어버렸습니다!
3. 마찬가지로 `local-accretion-shadow`에서도 경로 선택자(`selectCandidate`)를 제거하고 셀 단위 응착을 허용하자 최종 물질의 **99.43~99.72%가 하나의 거대한 팬(fan) 덩어리**로 뭉쳤습니다.
4. 한편, 현재 프로덕션에 채택된 Candidate G(316×316)는 기존 96×96(C)에서 브러시 반경(`0.0045`)이 격자 간격(`1/95 ≈ 0.0105`)보다 작아 발생하던 46.2%의 최근접 노드 폴백(위상 오차)을 해결했지만, 그 결과 로컬 센서 강도의 **63.3~64.9%가 최상위 포화 구간(`[0.975, 1.0]`)에 머물며 경로가 집중**되었고, 600초 기준 더 빠른 첫 탄생과 더 많은 Plate(브라우저 스크린에서 **35~39개 → 41~45개**)를 만들어냅니다(`2026-10-25-pheromone-project-decision/README.md`).


* **대안 설명 및 반례**:
`TrailPlateBirth.js`가 지지된 스켈레톤의 약 70%를 쳐내고(pruning) 둥지 환형에서 경계에 닿는 최단 경로만 남기는 현행 규칙은, 언뜻 보면 다양성을 억압하는 병목처럼 보이지만 실제로는 **추가적인 망각/풍화(erosion) 법칙이 없는 append-only 세계에서 캔버스가 99% 회색 덩어리로 메워지는 것을 막아주는 유일한 형태학적 방파제** 역할을 하고 있었습니다(`2026-10-13-material-formation-responsibility/README.md`).
* **결론 범위와 작품적 함의**:
append-only(추가 전용) 층서 구조에서 이동 법칙이나 선택자를 느슨하게 푸는 것만으로는 결코 ‘장기적 공간의 호흡과 갱신(turnover)’을 얻을 수 없습니다. 공간이 포화되지 않고 끊임없이 새로워지려면, **물질이 쌓인 곳이 지형적 장애물(융기/굴절)이 되어 개미의 흐름을 스스로 다른 곳으로 밀어내거나, 개미가 떠난 자리에서 지층이 풍화·화석화되는 순환 고리**가 반드시 필요합니다.

---

### 발견 4. [심층 구조의 시청각적 유령화] 가장 정교하게 구축된 3차원 지하 세계(32개 Nodule의 384개 구면조화 모드, 70층의 층서 깊이, 세대 간 유산)가 오디오 믹서(`-51~-75 dB`)와 렌더러(`alpha ≤ 21` 클램프, Nodule 미렌더링)에서 모두 지워져 있다.

* **근거 파일 및 커밋**:
* `src/lib/renderers/AntRenderer.js:186-210` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `src/lib/agents/ant/MaterialStratigraphy.js:263-315` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `static/worklets/surface-plate.worklet.js:184-225, 488-491, 522-550` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)
* `docs/ant/evidence/2026-10-14-plate-erb-z-coupling/README.md` (`ref=main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`)


* **왜 중요한가**:
코드를 직접 열람하여 확인한 **시청각적 병목의 정확한 수식**은 다음과 같습니다:
1. **시각적 클램핑 (`AntRenderer.js:201-202`)**:
```js
image.pixels[index * 4 + 3] = topology.topLayerByCell[index] >= 0
  ? Math.min(21, 9 + depthCount * 1.25) : 0;

```


층서 깊이(`depthCount`)가 1층일 때 알파는 `10`, **10층일 때 알파는 `21`에 도달하며, 그 이후 11층부터 70층까지는 모두 똑같이 알파 `21`로 클램핑**됩니다! 또한 30초간의 까다로운 자격 심사를 거쳐 탄생한 지하 구체(`nodules`, 최대 32개)는 `AntRenderer.js` 어디에서도 전혀 그려지지 않습니다.
2. **음향적 소멸 (`surface-plate.worklet.js:529` & `depth-propagation/README.md`)**:
Nodule은 최하단 기반 판(`foundation = column[0]`)에 연결되는데, 상부 타격 에너지가 Z-스프링 3개 층만 내려가도 `-75 dB` 이하로 감쇠합니다. 게다가 `advanceNodules()`에서 기반 판 변위가 구체의 질량 `sphereMass = density * radius³`(`~0.02`)으로 나뉘고 스프링 상수 `0.000025 * weight`가 곱해진 뒤, 최종 출력(`line 488`)에서 Plate는 `PLATE_PICKUP_MIX = 1`을 곱하는 반면 Sphere는 또다시 `MIX = 1 / Math.sqrt(12) ≈ 0.2887`로 줄어듭니다. 그 결과 Nodule의 구면조화 공명은 Plate보다 **`51.6 ~ 75.5 dB` 아래**에 잠겨 인간 귀에는 전혀 들리지 않습니다.
3. **Z-결합 자체의 미약함 (`2026-10-14-plate-erb-z-coupling/README.md`)**:
4개의 최상단 노출 판에서 Z-결합 유무(`world-z` vs `world-none`)를 비교한 결과, 통합 ERB 코사인은 `0.999960 ~ 0.999999`, RMS 변화는 `-0.0188 ~ +0.0049 dB`에 불과했습니다.


* **결론 범위와 작품적 함의**:
현재 ANT는 **"지하 세계(Stratigraphy & Nodules)를 계산하는 데 CPU의 대부분을 쓰면서, 정작 관객의 눈(`alpha ≤ 21`)과 귀(`-55 dB`)에는 지하 세계를 거의 숨겨버리는"** 역설적인 상태입니다.

---

## 3. 코드와 증거에 기반한 창의적 작품 방향 제안 (4가지)

위 4가지 핵심 발견과 코드의 실제 수식을 바탕으로, 기존에 기각된 접근(`dormant-plate-rom`의 조밀 Z-투영, `local-accretion`의 무제약 셀 응착, `1-hop Gaussian pickup aperture`)을 반복하지 않는 **4가지 구체적 작품 방향**을 제안합니다.

---

### 방향 1. 「지층의 석화와 심층 공명 (Lithification & Subterranean Chime)」 — 매몰 셀의 FDTD 동결과 Nodule-앵커 모달 지층화

* **도출 근거**: 발견 2(`sleep-blockers`에서 확인된 5개 노출 셀에 의한 650개 매몰 셀 각성 및 `dormant-plate-rom`의 $O(N\cdot r)$ 조밀 Z-투영 병목), 발견 4(`-51~-75 dB`로 묻힌 Nodule과 `-0.01 dB`에 불과한 Z-결합 가청성).
* **이전 실패(`2026-10-07-dormant-plate-rom`)와의 결정적 차이**:
과거 ROM 실험이 실패한 이유는 ① 매몰된 판의 **수백 개 Z-스프링 노드를 매 스텝 모달 기저로 전부 내적**했고, ② 깨어날 때 다시 32×32 FDTD로 복원(handoff)하려 했기 때문입니다.
반면 이 방향은 "한 번 매몰된 물질은 다공성 표토(FDTD)에서 결정질 암석(희소 앵커 모달 공명체)으로 비가역적 상전이(석화, Lithification)를 겪는다"는 물리 법칙을 세웁니다.
* **작품을 관통하는 생각과 물리 메커니즘**:
1. **셀 단위 매몰 각성 차단 (Buried-Cell Acoustic Clamping)**:
`compileSurfaceTopology.js`에서 Plate를 32×32 노드로 컴파일할 때, 상부 층에 의해 완전히 덮인(buried) 셀은 판내 파동 전파(`wakeNeighborhood`, `surface-plate.worklet.js:244`)를 전달하지 않는 감쇠 경계로 전환하고, 노출 비율(`exposedCellCount / totalCells`)이 **20% 이하로 떨어진 고대 Plate는 32×32 FDTD 격자에서 졸업시켜 ‘석화된 모달 지층(Lithified Stratum, 판당 단 4개의 고유모드)’으로 변환**합니다.
2. **조밀 Z-스프링 대신 ‘픽업/Nodule 앵커 직결’ ($O(1)$ 결합)**:
석화된 지층은 수백 개의 Z-스프링 대신, **자신의 두 픽업 노드 위치(`pickupNodeIndices`)와 자신에게 속한 Nodule의 기반 위치(`noduleCouplingNodeIndices`) 단 2~3개 지점에서만 상부 노출 판의 변위를 전달받아 4개의 저차 고유모드와 12개의 Nodule 구면조화 모드를 함께 울립니다.**
3. **심층 공명 게인 및 감쇠 재조정**:
석화된 지층과 Nodule은 땅속에서 에너지를 잃지 않고 길게 공명하는 결정체이므로, 감쇠 시간을 표토($\text{T60} \approx 3\text{ s}$)보다 긴 $6\sim 10\text{ s}$로 부여하고, Nodule의 스프링 전달 계수(`0.000025` → `0.0025`)와 출력 믹스(`MIX`)를 현실화하여 지하 공명을 `-55 dB`에서 `-12 ~ -18 dB` 영역으로 끌어올립니다.


* **관객이 웹에서 실제로 보고 듣게 될 장면과 시간의 흐름**:
* **초기 (1~5 Plate)**: 지표면에 갓 태어난 판들이 32×32 FDTD로 작동하며 개미 발걸음의 바스락거리는 나무/흙 마찰음과 위치별 스테레오 타격감을 생생하게 들려줍니다.
* **중기 이후 (6~40+ Plate)**: 새로운 판이 옛 판을 덮어 노출 면적이 20% 밑으로 떨어지는 순간, 화면에서 해당 판의 윤곽선이 옅은 회색 번짐에서 선명한 흑연색 지질 등고선(geological contour)으로 굳어지고, Nodule이 응결된 자리에는 작은 결정 핵(crystalline node)이 나타납니다.
* 동시에 소리에서는 30개 판이 똑같이 웅웅거리던 현상이 사라집니다. **위쪽(표층 5~6개 활성 FDTD 판)에서는 개미 발걸음의 건조하고 또렷한 어택이 선명하게 살아 있고, 그 아래(석화된 고대 판들과 Nodule)에서는 표층 타격이 앵커를 타고 내려가 깊고 서늘한 지하의 금속/광물성 배음(subterranean chime)으로 천천히 일렁입니다.**
* 무엇보다 FDTD 활성 노드가 영구히 1,500개 이하로 유지되므로 **40개 이상의 판이 쌓여도 `Audio / wall = 1.000`의 완벽한 실시간 웹·전시 재생**이 가능해집니다.


* **무엇을 얻고 무엇을 잃는가 / 반론과 한계**:
* **얻는 것**: 실시간 오디오 붕괴의 근본적 해결, 표층(과도음)과 심층(지속 공명)의 극적인 음향 대비, Nodule의 가청화.
* **잃는 것**: 매몰된 고대 판 내부의 32×32 격자 단위 국소 파동 전파(그러나 `depth-propagation` 증거에서 확인되었듯 이는 원래 `-75 dB` 이하로 소리에 기여하지 못하던 연산입니다).
* **반론과 실패 가능성**: 노출 비율 20% 경계에서 FDTD가 모달 지층으로 바뀔 때 기존 잔향이 갑자기 끊기면 어색할 수 있으므로, 전환 시점의 픽업 변위/속도를 4개 모드의 초기 상태로 투영(state handoff)하여 끊김 없는 전환을 보장해야 합니다.



---

### 방향 2. 「능선과 협곡의 물리학 (Ridge & Scarp Geomorphology)」 — 깨어나는 형성 물성과 지형 경사($\nabla H$)에 의한 경로 분기

* **도출 근거**: 발견 1(`TrailPlateBirth.js:285`의 `meanSupport / 0.08` 클램프 오류, `stiffness`/`damping` 공선성, `SurfaceAudioBridge`의 죽은 `hardness` 배선), 발견 3(`spatial-dynamics` 2시간 런에서 확인된 append-only 블롭 포화와 `AntController.js:330`의 지연 각속도 진동).
* **작품을 관통하는 생각과 코드 수준의 변화**:
현재 ANT에서 물질은 개미의 속력만 최대 10% 줄일 뿐(`m(L)`), 방향(조향)을 전혀 바꾸지 못합니다. 또한 모든 판이 똑같은 물성($\rho=1.2, K \approx 0.91$)과 똑같은 3 ms 타격 펄스로만 울립니다. 이 방향은 **이미 코드에 계산되어 있는 형성 이력과 층서 데이터를 실제 물리와 조향에 직결**합니다.
1. **`TrailPlateBirth.js:285-327` 물성 공식의 직교화(Orthogonalization)**:
* **밀도($\rho$)**: 100% 클램핑되던 `meanSupport / 0.08` 대신, 후보 회랑의 단위 면적당 누적 발 접촉 밀도(`footContacts / supportedCells`)로 매핑하여 성급히 만들어진 다공성 판($\rho = 0.6$)과 수만 번 다져진 고밀도 판($\rho = 2.4$)을 분리합니다.
* **강성($K$) vs 감쇠($\mu$)의 분리**: 둘 다 `meanChemical`에서 뽑던 공선성을 깨고, 강성($K \in [0.4, 1.8]$)은 화학적 집중도(`meanChemical`)에서, 감쇠($\mu \in [0.08, 0.80]$)는 리본의 평균 폭(`meanHalfWidth` 및 분기 복잡도)에서 도출합니다. 이렇게 하면 좁고 강하게 집중된 길은 팽팽하고 맑게 울리는 현(String-like Ridge)이 되고, 넓고 완만한 길은 낮고 빠르게 감쇠하는 흙판(Broad Slab)이 됩니다.


2. **죽은 배선 `p.hardness`의 부활 (`surface-plate.worklet.js:559`)**:
`SurfaceAudioBridge`가 이미 보내고 있는 국소 다짐도 `p.hardness ∈ [0, 1]`을 `applyStrike`에서 실제로 읽어, **다져지지 않은 무른 땅(`hardness ≈ 0`)을 밟을 때는 18스텝(`3 ms`)의 부드러운 반사인파 펄스**로, **오래 다져져 단단해진 지층(`hardness → 1`)을 밟을 때는 4~6스텝(`0.67~1 ms`)의 예리한 펄스**로 타격 시간폭을 줄입니다. 이는 `2026-10-14-base-born-causal-decomposition`에서 이미 증명된 `pulse-1ms` 효과(무게중심 주파수 `+12.5 ~ +49.4 Hz` 상승, `300–1000 Hz` 고역 모드 활성화)를 **환경의 실제 다짐 기억(`SurfaceField`)과 자연스럽게 결합**하는 것입니다!
3. **지층 단차 기울기($\nabla H$)에 의한 조향 굴절 (`AntController.js:333`)**:
`MaterialStratigraphy`의 `totalDepthByCellMeters`에서 개미 진행 방향 좌우 센서 위치의 높이 차($\Delta H = H_{\text{right}} - H_{\text{left}}$)를 읽어, 지층이 4층 이상 두껍게 쌓인 능선의 가파른 경사면(scarp)에서 개미가 등고선을 따라 미끄러지듯 조향이 미세하게 굴절되게 합니다(이와 함께 `AntController.js:330`의 각속도 감쇠항을 완화하고, `AntAgent.js`에서 방치되어 있던 개체별 `turnResponsiveness`와 `damping` 개성을 실제 조향에 연결합니다).


* **관객이 웹에서 실제로 보고 듣게 될 장면과 시간의 흐름**:
* 처음 만들어진 무른 판 위를 걸을 때는 낮고 부드러운 ‘툭, 툭’ 소리가 나지만, 개미들이 같은 판 위를 수천 번 밟아 `SurfaceField` 다짐도(`hardness`)가 올라갈수록 **같은 판의 소리가 점차 단단하고 또렷한 ‘틱, 톡’의 고역 배음으로 실시간 진화**합니다.
* 한 회랑에 판이 4~5겹 쌓여 높은 능선(ridge)을 이루면, 뒤따라오던 개미들이 그 능선의 가파른 양옆 사면을 타고 자연스럽게 좌우로 갈라지며 **하나의 고속도로가 삼각주(braided river delta)나 나뭇가지처럼 분기**합니다.
* 분기된 좁은 가지에서 태어난 판은 높은 강성($K$)과 낮은 감쇠($\mu$)를 가져 맑은 고음으로 울리고, 중심부의 넓은 판은 묵직한 저음으로 울려, **시각적 지형의 분화가 곧 음향적 성부(register)의 분화**로 직결됩니다.


* **무엇을 얻고 무엇을 잃는가 / 반론과 한계**:
* **얻는 것**: `world-model.md`가 추구하던 ‘형성 이력 → 물성 차이’와 ‘물질 → 후속 행동의 공간적 재조직’이 최초로 실질적 변별력을 갖게 되며, 이미 구현되어 있던 `hardness` 배선과 `1 ms` 펄스 연구가 하나로 꿰어집니다.
* **잃는 것**: 기존의 고정된 `m(L)` 단독 채택 궤적 해시 및 `damping = 0.4 * stiffness - 0.01` 코퍼스와의 하위 호환성.
* **반론과 실패 가능성**: 지형 굴절이 너무 강하면 개미가 기존 회랑을 20초간 유지하지 못해 Plate 탄생이 늦어질 수 있으므로, 굴절 항은 `layerCount >= 3` 이상인 성숙한 지층 경계에서만 작동하도록 게이팅해야 합니다.



---

### 방향 3. 「지층 단면 청음기 (Stratigraphic Horizon & Seismic Lens)」 — 시뮬레이션 비개입 원칙을 지키는 웹 고유의 시각·청각 탐색 경험

* **도출 근거**: 발견 1(`2026-10-18-natural-dense-readout-overlap`에서 확인된 8-Plate 평면 믹스의 `-5.38 dB` 잔향 마스킹), 발견 4(`AntRenderer.js:201`의 `alpha ≤ 21` 클램프 및 Nodule 비시각화/비가청화).
* **작품을 관통하는 생각**:
`README.md`(`fbd9f927`)는 "작품의 기본 매체는 웹(Web)이며, 전시는 그 확장 형태"라고 명시합니다. 또한 `world-model.md`는 관객이 먹이를 놓거나 개미의 길을 강제하는 게임적 개입을 엄격히 금지합니다. 그렇다면 웹에서 이 작품을 감상하는 관객에게 가장 어울리는 태도는 무엇인가? 바로 세계를 교란하지 않고 지층의 서로 다른 깊이와 시간대에 귀와 눈을 가져다 대는 ‘지질학적 청음(Geological Auscultation)’입니다.
* **관객이 웹에서 실제로 보고 듣게 될 장면과 시간의 흐름**:
1. **시각적 해방 (`AntRenderer.js` 개편)**:
* 모든 층을 `alpha 10~21`의 뿌연 회색 덩어리로 뭉개던 렌더링을 바꾸어, 각 Plate의 실제 외곽 등고선(contour line)을 나이/매몰 깊이에 따른 미세한 흑연 농담(graphite hatching)으로 그려 지층이 겹쳐진 단면의 결(palimpsest)이 한눈에 읽히게 합니다.
* 지하에 탄생한 Nodule(최대 32개)을 기반 판 아래에 박힌 묵직한 암석 결정 원환(crystalline rings)으로 시각화하고, 개미의 발걸음이 노출 판을 때릴 때 3 ms 펄스와 파동이 판의 픽업 노드로 퍼져 나가는 미세한 진동 리플(seismic ripple)을 등고선 위에 드리웁니다.


2. **3단계 청취 지평 (Acoustic Horizon Modes — 시뮬레이션 해시 100% 불변)**:
관객은 웹 화면 하단의 절제된 지층 단면 바(또는 90초 주기의 자율 호흡 모드)를 통해, 물리 시뮬레이션이나 RNG를 단 1비트도 건드리지 않고 오직 워크릿의 리드아웃 가중치(Readout Horizon)만 3가지 시점으로 전환하며 감상할 수 있습니다:
* **표층 시점 (Surface Crust)**: 현재 노출 비율이 높은 상위 판들과 방금 타격이 발생한 판(focal Plate)에 리드아웃 가중치를 집중합니다. `2026-10-18` 연구에서 `-5.38 dB`로 배경 잔향에 묻혔던 개별 판의 타격음과 기하학적 음색 차이가 즉시 전경으로 떠오릅니다.
* **전층 공명 시점 (Full Stratigraphy)**: 모든 지층의 합창을 듣습니다.
* **심층 암반 시점 (Deep Bedrock & Nodules)**: 지표면의 직접 타격음을 고역 감쇠(low-pass)시켜 멀리서 들리는 빗소리처럼 뒤로 물리고, 깊은 매몰 층의 Z-전달음과 **32개 Nodule의 12-모드 구면조화 공명을 전경(`0 dB` 기준)으로 끌어올려** 땅속 깊은 곳에서 울리는 지질학적 드론과 종소리를 듣습니다.




* **무엇을 얻고 무엇을 잃는가 / 반론과 한계**:
* **얻는 것**: 기존의 모든 시뮬레이션·물리 테스트(339/339)와 궤적 해시를 **단 하나도 깨뜨리지 않고**, `AntRenderer.js`의 디버그 자산과 `pickup-stem observer`(`2026-10-18` 브랜치)의 아이디어를 결합해 웹 감상의 몰입도와 가독성을 극적으로 끌어올립니다.
* **잃는 것**: 단일 고정 마스터 출력만 존재하던 단순성(단, 기본값을 자율 순환 또는 전층 시점으로 두면 비개입 감상도 그대로 유지됩니다).
* **반론과 실패 가능성**: 리드아웃 가중치만 바꾸는 것으로는 발견 2의 30-Plate CPU 병목을 해결할 수 없으므로, 성숙기 실시간 재생을 위해서는 반드시 방향 1(매몰 층의 석화/동결)이 뒷받침되어야 합니다.



---

### 방향 4. 「군집의 밀물과 썰물, 그리고 무개미 결정화 (Tidal Colony & Autonomous Crystallization)」 — 사장된 ‘Zero-Ant Continuity’와 ‘3초 감쇠 꼬리’를 작품의 중심 서사로 깨우기

* **도출 근거**: 발견 2(초당 128회 연속 타격으로 인해 영원히 관찰되지 않는 3초 감쇠 꼬리 `T60 ≈ 3 s` 및 2초 수면 규칙), 그리고 프로덕션 코드에 이미 완벽히 구현·검증되어 있으나 `ColonyActivation.js`의 `ACTIVATION_FLOOR = 8` 때문에 자연 런에서는 절대 일어나지 않는 **무개미 연속성(`2026-10-12-zero-ant-continuity`, `2026-10-13-trail-plate-zero-gap-lineage`, `2026-10-13-nodule-zero-gap-lineage`)**.
* **작품을 관통하는 생각**:
ANT 연구 프로그램 전체를 통틀어 가장 시적(poetic)이고 독창적인 발견은 `2026-10-12`~`10-13`의 일련의 실험들이 증명한 사실—**"개미가 모두 사라져도 세계의 시간은 흐르며, 개미들이 남기고 간 온기(잔류 화학·기계 기억)만으로 텅 빈 대지에서 새로운 지층(Plate)과 광물(Nodule)이 스스로 응결되어 탄생하고, 나중에 깨어난 다음 세대 개미들이 자신보다 오래된 그 유적 위를 걷는다"**—입니다.
그런데 정작 웹에 접속한 관객은 이 경이로운 장면을 **절대 볼 수 없습니다**. `ColonyActivation.js:5`가 `ACTIVATION_FLOOR = 8`을 강제하여 개미가 영원히 8~28마리 사이에서 북적거리게 만들어 놓았기 때문입니다. 이 방향은 **‘상시 과밀 상태’라는 전제를 버리고, 군집의 밀물(축적)과 썰물(전원 퇴장 및 풍화/결정화)을 작품의 거시적 시간 구조로 삼습니다.**
* **관객이 웹에서 실제로 보고 듣게 될 장면과 시간의 흐름**:
* **1장 — 밀물과 각인 (0~4분)**: 개미들이 출정하여 G 316×316 페로몬 길을 내고 8~12개의 Plate와 Nodule을 탄생시킵니다. 발걸음 소리가 겹치며 밀도 높은 리듬과 공명이 고조됩니다.
* **2장 — 지형 피로와 썰물 (4~5분)**: 지층이 쌓여 활성 회랑의 평균 층서 저항과 다짐도가 임계치에 이르면, `ColonyActivation`이 휴지기(Dormancy)에 들어가 신규 스폰을 멈춥니다. 개미들이 하나둘 영역 밖으로 퇴장할수록, 쏟아지던 발걸음 소리가 성글어지며 개별 발걸음이 특정 판의 p25/p50/p75 지점을 밟을 때 나는 섬세한 스테레오 음색과 3초의 긴 여운(`T60 ≈ 3 s`)이 마침내 허공에 또렷이 드러납니다.
* **3장 — 무개미의 시간과 자율 결정화 (5~6분, Zero-Ant Interval)**:
마지막 개미가 퇴장하고 캔버스에 **단 한 마리의 개미도 남지 않습니다.** 마지막 발자국의 3초 잔향이 서서히 사라지며 모든 판의 노드가 마침내 12,000스텝 정적 조건을 통과해 실제 물리적 수면(`sleep`)에 들어갑니다.
바로 그 깊은 적막 속에서, 개미들이 떠나기 전 임계치에 도달해 있던 지연 후보들이 1초 분석 주기를 따라 스스로 Plate와 Nodule로 응결되어 탄생(`POST-GAP / PRE-GAP autonomous birth`)합니다! 이때 지층이 스스로 맞물리며 내는 낮고 짧은 지각 안착음(tectonic settling pulse)이 정적을 가릅니다.
* **4장 — 유적 위로의 귀환 (6분~)**: 페로몬이 93.8% 증발해 깨끗해진 캔버스 위로 다음 세대(new cohort)의 첫 선발대 개미가 걸어 나옵니다. 그 개미는 백지가 아니라 **이전 세대가 남기고 간 고대 지층(`pre-cohort retained history`)의 등고선 위를 밟으며** 첫 발자국부터 이전 세대와는 다른 소리로 새로운 조수(tide)를 시작합니다.


* **무엇을 얻고 무엇을 잃는가 / 반론과 한계**:
* **얻는 것**: ① 그림자 실험 하니스(`ant-zero-ant-continuity-shadow.js`)에만 묻혀 있던 ANT의 핵심 철학(*"개미의 존재가 세계의 존재 조건이 아니다"*)이 실제 작품의 중심 경험으로 실현됩니다. ② 연속 타격에 가려져 있던 단일 판의 3초 감쇠 꼬리, 타격 위치별 음색, 그리고 물리적 수면(`sleep`)이 아무런 인위적 필터 없이 자연스럽게 작동합니다.
* **잃는 것**: 언제 접속해도 항상 20마리의 개미가 분주히 움직이고 있는 ‘균일한 벽지(wallpaper)형 시뮬레이션’의 성격을 버리고, 서사적 호흡(밀물과 썰물)을 택하게 됩니다.
* **반론과 실패 가능성**: 관람객이 우연히 60초간의 무개미 구간에 처음 접속하면 당황할 수 있으므로, 웹 페이지 최초 로드 시에는 항상 1장(밀물)에서 시작하고 첫 번째 무개미 썰물은 3~4분 뒤에 찾아오도록 내생적 피로도 적분기를 설계해야 합니다.



---

## 4. 최종 판단 및 권고 (Final Judgment)

### 4.1. 최우선 선택 방향: **「방향 1(지층의 석화와 심층 공명) + 방향 2(깨어나는 형성 물성과 지형 분기)」의 결합을 주축으로 삼고, 「방향 4(군집의 조수)」로 시간적 호흡을 완성할 것**

모든 소스 코드와 실험 증거를 종합할 때, 현재 상태를 그대로 유지하는 것은 적절하지 않습니다. 왜냐하면 현재 프로덕션(`main@fc5e81c7`)은 **G 316×316 채택으로 인해 Plate 생성 속도가 더 빨라진 반면, 성숙기(20~30 Plate) 실시간 오디오는 `Audio / wall = 0.113~0.209`로 붕괴하고, 탄생한 100개 판의 물성($\rho=1.2$)과 시각적 깊이(`alpha ≤ 21`)는 클램프에 막혀 있으며, 32개 Nodule은 `-55 dB` 아래에 잠겨 있기 때문**입니다.

가장 발전시킬 가치가 높은 핵심 경로는 **방향 1과 방향 2의 물리적 결합**입니다(여기에 방향 4의 조수 호흡을 더하되, 방향 3과 같은 별도 UI 컨트롤러 추가는 배제하여 `world-model.md`의 순수한 자율 세계 원칙을 지킵니다).

1. **내적 일관성과 ANT 고유성의 극대화**:
* 표층(노출 판 ≤ 6개)은 **방향 2**에 따라 다짐도(`hardness` → 펄스 폭 `3 ms → 1 ms`), 접촉 밀도($\rho$), 화학 집중도($K$), 리본 폭($\mu$)이 살아난 **32×32 FDTD 격자**로 울립니다. 개미들은 자신이 쌓은 지층의 단차($\nabla H$)에 의해 자연스럽게 삼각주처럼 길을 분기합니다.
* 심층(노출 면적 < 20%로 매몰된 고대 판 + Nodule)은 **방향 1**에 따라 32×32 FDTD 격자에서 졸업하여 **단 2~3개의 픽업/기반 앵커만으로 결합되는 4-모드 결정질 지층 + 12-모드 Nodule 공명망**으로 비가역 석화(Lithification)됩니다.
* 이 결합은 `2026-10-07-dormant-plate-rom`이 빠졌던 '전 노드 Z-투영 및 FDTD 복귀 비용'을 완전히 우회하면서도, 실시간 오디오 성능(`Audio / wall = 1.0`)과 층서적 음향 대비(표토의 입자감 있는 타격음 vs 심층 암반의 긴 배음)라는 두 마리 토끼를 동시에 잡는 가장 정교한 해법입니다.



---

### 4.2. 이번 검토로 유지하거나 수정해야 할 핵심 판단 요약

* **유지해야 할 판단 (Keep)**:
1. **W1 결론(`Existing-state sufficiency`) 유지**: 별도의 연속적 Material 필드나 독립 Deposit 클래스를 신설하지 않고, `TrailPlateBirth` + `MaterialStratigraphy`의 이산적 층서 구조를 유지한 판단은 완전히 타당합니다.
2. **페로몬 G(316×316) 채택 및 S0–S2c 사회 그래프 동결(`spectral SKIP`) 유지**: G는 서브셀 위상 정보 손실을 해결했으며, 사회 그래프는 관계 기억 도입 전까지 읽기 전용 베이스라인으로 두는 것이 옳습니다.


* **수정해야 할 판단 (Revise)**:
1. **`TrailPlateBirth.js:285-327`의 물성 수식 수정**: `meanSupport / 0.08` 클램프(100% $\rho=1.2$ 포화)와 `stiffness`/`damping`의 단일 변수 공선성($\text{damping} = 0.4 K - 0.01$)을 해체하여, 접촉 밀도·화학 집중도·리본 폭이 독립적으로 $\rho, K, \mu$를 넓게 변조하도록 수정해야 합니다.
2. **`surface-plate.worklet.js:559`의 죽은 `p.hardness` 배선 연결**: `SurfaceAudioBridge`가 이미 보내고 있는 국소 다짐도 `hardness`를 워크릿 `applyStrike`에서 읽어 접촉 펄스 길이(`18 steps → 6 steps`)에 반영해야 합니다.
3. **`AntRenderer.js:201`의 `Math.min(21, ...)` 알파 클램프 및 Nodule 미렌더링 수정**: 70층이 쌓여도 8% 불투명도로만 보이는 시각적 클램프를 풀고, 층별 등고선과 지하 Nodule을 정식 뷰에 드러내야 합니다.
4. **매몰 판의 영구 FDTD 적분 폐기**: `-75 dB` 이하의 에너지만 전달받으면서 99.95%의 스텝 동안 깨어 있어 오디오 클럭을 파괴하는 매몰 판들을 FDTD에서 분리해 앵커 결합형 모달 지층으로 석화시켜야 합니다.



---

### 4.3. 선택한 방향을 판단하는 데 가장 중요한 남은 질문 (Single Discriminating Question)

> **"30-Plate 자연 스냅샷(`2026-10-21-exhibition-audio-runtime`의 seed `20261005`, tick `36,992`)에서, 노출 셀 비율이 20% 이상인 상위 판들만 32×32 FDTD로 유지하고 나머지 매몰 판들은 각 판의 2개 픽업/기반 노드에서만 결합되는 4-모드 공명기(Nodule 게인 $\times 20$ 포함)로 치환했을 때, ① Chrome 라이브 `Audio / wall` 비율이 `0.113`에서 `1.000`으로 회복되는가? 그리고 ② 500 ms 포컬/배경(focal/rest) 스펙트럼에서 표층의 과도 타격음(300–1,000 Hz)과 심층의 저역 모달 지속음(30–250 Hz)이 명확한 대역 분리(spectral separation)를 이루는가?"**

---

### 4.4. 실제로 읽은 소스·증거, 실행한 검증, 확인하지 못한 자료의 범위

* **직접 원문을 읽고 라인/수식 단위로 검증한 파일 (총 26개 텍스트 파트 및 추가 증거 파일, 약 130개 개별 소스/문서 블록)**:
* **매니페스트 및 인덱스**: `00_ORIGINAL_PACK_MANIFEST.json`, `00_READ_ME_FIRST.md`, `00_REVIEW_INDEX.md`
* **7번째 배치 추가 증거 (`02_ADDITIONAL_EVIDENCE/`, 9개 전체)**:
* `docs/physical-audio-lab.md` (`fbd9f927`)
* `docs/ant/subjective-listening/2026-10-13-plate-sonic-individuality-subjective-listening.json` (`fbd9f927`)
* `docs/ant/subjective-listening/2026-10-18-synthetic-plate-shape-capability-subjective-listening.json` 및 `...-corrections.json` (`fbd9f927`)
* `docs/ant/evidence/2026-10-18-natural-dense-readout-overlap/README.md` 및 `validation.json` (`aea6601f`)
* `docs/ant/evidence/2026-10-21-exhibition-audio-runtime/README.md`, `capture-receipt.json`, `verification.txt` (`aea6601f`)


* **프로덕션 핵심 소스 및 워크릿 (`01_SOURCE_PARTS/` 내 `part_001`, `002`, `009`, `010`, `011`, `012`, `014`)**:
* `AGENTS.md`, `README.md`, `docs/ant/2026-10-06-*` (5개 문서), `docs/ant/2026-10-13-persistent-world-reassessment.md`
* `src/lib/agents/ant/AntAgent.js`, `AntController.js`, `BodyPoseController.js`, `ColonyActivation.js`, `DynamicSocialGraph.js`, `GaitController.js`, `GasterDeposition.js`, `LocalOccupancy.js`, `MaterialStratigraphy.js`, `PheromoneField.js`, `SurfaceField.js`, `TemporalSocialTopology.js`, `TrailPlateBirth.js`
* `src/lib/audio/AntAudioBridge.js`, `AntEnvironmentAudioBridge.js`, `AudioEngine.js`, `SurfaceAudioBridge.js`, `compileSurfaceTopology.js`, `src/lib/index.js`
* `src/lib/lab/Lab.js`, `modelRegistry.js`, `src/lib/models/**` (`BaseModel.js`, `WorkletModel.js`, `PlateModel.js`, `SphereModel.js`, `materials.js`, `StringModel.js`), `src/lib/renderers/**` (`AntRenderer.js`, `PlateRenderer.js`, `SphereRenderer.js`, `StringInspectorRenderer.js`, `StringRenderer.js`, `sphereMath.js`), `src/lib/utils/**`
* `static/worklets/surface-plate.worklet.js`, `tests/ant-audio-bridge.test.js`, `tests/ant-audio-integration.test.js`


* **주요 실험 증거 및 연구 브랜치 보고서 (`part_022`, `023`, `024`, `026`, `027`, `028`, `040`, `041`, `045`, `046`, `050`, `051`)**:
* 수면 차단 및 깊이 전파(`2026-10-06-sleep-blockers`, `depth-propagation`), 층서 런타임(`2026-10-06-stratigraphy-runtime`), Base Substrate 보정 및 픽업 개구부/거리 진단(`2026-10-07-base-substrate-debug/**`), 휴면 판 ROM(`2026-10-07-dormant-plate-rom`), 파운더 효과 정제(`2026-10-07-founder-effect-refinement`)
* 사회 그래프 및 널 모델(`2026-10-07-social-graph`, `2026-10-08-s2a-null`), 형태학 및 내부 끝점 그림자(`2026-10-08-movement-material-morphology`, `2026-10-08-interior-endpoint-shadow`), 무개미 연속성 및 Nodule/Plate 계보·검열(`2026-10-12-pre-cohort-retained-history`, `2026-10-12-retained-material-locomotion-adoption`, `2026-10-12-zero-ant-continuity`, `2026-10-13-natural-nodule-opportunity`, `2026-10-13-nodule-gap-censoring-instrumentation`, `2026-10-13-nodule-zero-gap-lineage`, `2026-10-13-trail-plate-zero-gap-lineage`)
* 음향 개성, ERB 분석 및 모달 참여도(`2026-10-13-plate-sonic-individuality`, `2026-10-14-base-born-causal-decomposition`, `2026-10-14-base-born-loss-distribution`, `2026-10-14-base-born-natural-event-erb`, `2026-10-14-plate-erb-material-contribution`, `2026-10-14-plate-erb-position-identity`, `2026-10-14-plate-erb-z-coupling`, `2026-10-15-erb-window-boundary`, `2026-10-15-plate-modal-participation`, `2026-10-18-synthetic-plate-shape-capability`)
* G 프로덕션 채택 및 검증(`2026-10-25-g-final-adoption-readiness`, `2026-10-25-g-production-adoption/README.md`, `INDEPENDENT-REVIEW.md`, `SOURCE-CONFORMANCE.json`, `VALIDATION.md`), W1 설계 게이트 및 재평가(`w1-endogenous-formation-contribution-spatial-extent-design.md`, `w1-formation-plate-deposit-reassessment.md`, `w1-material-formation-design-gate.md`, `w1-material-response-discrimination-design.md`, `w1-plate-native-formation-retention-response-contract.md`), 국소 응착(`2026-10-08-local-accretion-shadow`), 공간 동역학(`2026-10-22-spatial-dynamics/REPORT.md`, `AUDIT.md`), 페로몬 프로젝트 결정(`2026-10-25-pheromone-project-decision`), 물질 형성 책임(`2026-10-13-material-formation-responsibility`) 및 G 채택 전후 비교 코드(`part_051`).




* **확인하지 못한 자료 및 미실행 범위**:
* 번들에 미포함된 원본 오디오(WAV/WebM), 비디오(WebM), 이미지(PNG/SVG), 대용량 원시 JSON(`16MB analysis.json`, `534KB benchmark.json`, `.gz` 아카이브)은 직접 재생·시청하지 않았으며, 코드 실행 환경에서의 `npm test` / 브라우저 실행은 수행하지 않았습니다.
* `docs/ant/archive/**`는 지침에 따라 제외했으며, 위 열람 파트 외의 나머지 보조 테스트/일지 텍스트 파트는 본 보고서의 핵심 판단에 필요한 범위 밖이므로 생략했습니다.
