# ANT — Argon High × Astra High 독립 작품·연구 리뷰 비교 (2026-10-26)

> **Status:** archived review synthesis / interpretive record / **not an adopted roadmap**  
> **Scope:** 사용자가 제공한 Argon High의 단계별 독립 리뷰·반박 재검토 및 Astra High 독립 리뷰와 이에 대한 후속 비교 대화  
> **Source preservation:** 이 문서는 리뷰 전문이 아닌 **요지·대립·정정·열린 질문의 재구성**이다. [Argon High 4단계 및 Astra High 원문 전사](2026-10-26-independent-review-originals/README.md)는 별도 폴더에 보관했다. 사용자 채팅 붙여넣기 기반이며 서비스 원본 export와의 byte-exact 동일성은 검증하지 않았다. 리뷰어의 기술적 진술과 코드/evidence가 입증한 사실을 구분한다.  
> **Code changes / new experiments:** none. 이 문서 자체로 production, audio law, 관람 계약 또는 차기 pass를 채택하지 않는다.

현재 프로젝트 상태의 기준은 언제나 [`docs/ant/README.md`](../README.md), 현재 `main` 코드 및 [evidence](../evidence/)이고, [`world-model.md`](../world-model.md)는 별도 설계 계약이다. `archive/**`는 일반 구현·연구 검토의 기본 입력에서 제외한다. 이 문서는 **2026-10-26에 존재했던 논의의 역사적 기록**으로만 읽는다.

## 1. 검토 경계와 provenance

| 층위 | Ref / 조건 | 해석 경계 |
| --- | --- | --- |
| Current documentation | `main@fbd9f92783f6477d22bdec92f9c82742511981ae` | 2026-10-25 웹 우선 감상·최신 판정·evidence 구분을 포함하는 정본 |
| Production source | `main@fc5e81c7e22094fe3e6a6bb403df1194b3d541ae` | G 316×316 채택된 코드 기준선; 위 문서 ref와 코드·워크릿·테스트 blob 동일 |
| Pre-G main / corpus | `main@8c60e4bba3bd5b476300e90a2936bfebd1f831c2` 및 개별 기록의 이전 refs | 형태·청취·runtime 자연 결과를 현재 G의 자연 분포로 자동 이월하지 않음 |
| Dense overlap / exhibition audio | [`aea6601f6fc5c4d241fae7376f0f6cd59d11101f`](https://github.com/oseconds/ant-2026/tree/aea6601f6fc5c4d241fae7376f0f6cd59d11101f) | 별도 **pre-G branch-only** 연구; production에 병합된 기능이나 G Audio-On 검증 아님 |
| Spatial-dynamics 2h counterfactual | [`9fcd96205ff8a5c671be26e2e024524c0e9345d1`](https://github.com/oseconds/ant-2026/blob/9fcd96205ff8a5c671be26e2e024524c0e9345d1/docs/ant/evidence/2026-10-22-spatial-dynamics/REPORT.md) | pre-G 96-grid `dtFeedback` 별도 실험; G 장기 포화 결과 아님 |

- **Argon High:** 첫 검토에서 분할 55개 중 앞부분만 접근했다고 보고. 이후 Google Drive 자료에 다시 접근하면서 핵심 소스·오디오·모달·G·연구 브랜치 본문을 추가 열람하고 결론을 갱신. 두 차례 비판적 반박 뒤 수학·인과·성능 단정을 다시 고침. 실제 음원·영상 직접 감상 및 새 실험 실행은 보고되지 않았다.
- **Astra High:** 코드·evidence·일부 원자료를 선택적으로 읽고 독립 리뷰. 사용자에게 전달된 보고서에는 기존 핵심 테스트 64/64 실행 및 G 스크린샷 1장 확인이 명시돼 있으나, **이 아카이브 작성 과정에서 해당 테스트를 독립 재실행한 것은 아니다**. 실제 영상/음원 직접 감상은 하지 않았다고 명시.
- 두 리뷰는 사용자 제공 텍스트와 이전 대화의 후속 논평을 바탕으로 요약했다. 인용된 모든 수치·연구 경계를 이 문서 작성 중 전수 재실행·재계산한 것은 아니다.

## 2. 공통으로 남은 확실한 경계

1. **현재 생성계:** 행동/보행 → pheromone 및 실제 FOOT_CONTACT/SurfaceField → `TrailPlateBirth`의 저술된 source→boundary 선택 → immutable Plate와 append-only stratigraphy → 노출 Plate 직접 타격·매몰층 결합 → 물리 pickup 및 합산 오디오. 층수 `L`에 의한 최대 10% 속력 저항은 채택됐으나, 직접 진동→개미 조향 피드백은 없다.
2. **형성의 선택성:** 모든 활동이 물질이 되는 것이 아니다. 현재 selector는 무엇을 역사의 일부로 보존할지 강하게 선택한다. [local-accretion shadow](https://github.com/oseconds/ant-2026/blob/ant-local-accretion-shadow/docs/ant/evidence/2026-10-08-local-accretion-shadow/README.md)의 말기 최대 연결 성분 99.43–99.72%는 **생성 물질 내부 연결 성분 비율**이며 캔버스 면적 점유율 99%라는 의미가 아니다. 선택 규칙 제거는 개선이 자동 보장되지 않는다.
3. **Plate individuality는 현 역할에 충분한 증거:** 자연 6/6 선택 비교의 `different=yes`, 숨겨진 A/A `no`; synthetic 실제 쌍 5/6 구별. Synthetic A/A raw `yes/confidence=5`는 **raw 그대로**, 별도 해석 정정 `no/5`는 **별도 기록**. 단일 청취자, isolated/level-matched 범위로 한정된다. [`subjective-listening`](../subjective-listening/).
4. **자연 물성 분포의 병목은 구현 사실이나 작품 실패 판정이 아님:** 기존 pre-G 100-birth 코퍼스에서 `density=1.2` 포화, `stiffness`·`damping` 공선성 및 좁은 범위를 확인. Broad ERB 물성 치환 변화가 작아도 협대역/위상 기여가 없어졌다는 뜻은 아니다. 기하·경계·접촉·pickup도 형성 이력의 산물이다. [material ERB](../evidence/2026-10-14-plate-erb-material-contribution/README.md) · [sonic individuality](../evidence/2026-10-13-plate-sonic-individuality/README.md).
5. **Dense overlap은 masking 판정이 아님:** pre-G 8-Plate full-coupled 연구에서 500 ms 윈도 1,231개 중 742개(60.3%)는 rest stem energy가 focal보다 큼. 이는 실제 인간 귀의 가청성·독립 음색 인식을 확정하지 않는다. [branch report](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-18-natural-dense-readout-overlap/README.md).
6. **Live audio clock은 진짜 문제:** pre-G 연구의 8/20/30-Plate Chrome `audio/wall ≈ 0.914/0.209/0.113`과 다수의 awake node는 그 조건의 실시간 실패. `Z-off`, force-cache, 기존 dormant ROM이 자동 해법이 아니라는 부정 근거는 중요하다. 하지만 **현재 G Audio-On 자연 장기 성능은 아직 별도 검증 필요**. [branch report](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-21-exhibition-audio-runtime/README.md) · [current hub](../README.md).
7. **웹 세계의 지속성은 세 가지:** (a) 개체 세대가 바뀌어도 남는 material, (b) Audio Off/On에 따라 끊길 수 있는 vibration, (c) 재방문 사이 동일 세계의 저장·복원. 현재 (a)는 지지되지만 (c)는 구현되지 않았다. 페이지 재진입은 새 로컬 세계다. 작품의 기본 매체는 **웹**, 전시는 확장이다.

## 3. Argon High — 독립 탐색과 단계별 자기 교정

### 3.1 처음 발견한 가능성

Argon은 내부 물성·리드아웃·실시간 계산과 관객 경험 사이의 괴리를 출발점으로 아래 방향을 제시했다.

- **Lithification / metamorphic strata:** 매몰된 Plate의 FDTD 계산을 변화시켜 모달 공명 또는 감쇠/앵커 표현으로 전이. 과거 ROM의 exact-fidelity 재현과 달리 **의도적 물리 변성**을 작품 가설로 삼음.
- **Topographic feedback / ridge–scarp:** `∇H` 기반 조향 굴절, 더 독립적인 material mapping, 진동/화학 경로 피드백. 공간 분기 가능성은 있으나 현재 운동 계약과 baseline을 크게 변경.
- **Selective / stratigraphic listening:** 동일 full-coupled world에서 특정 지역·층·기반 Nodule을 다르게 듣는 관측 시점. solver 비용 자체는 줄지 않음.
- **Tidal colony / zero-ant:** 개체가 자발적으로 떠난 뒤 material이 남는 세계의 시간 구조. Forced zero-ant shadow는 **가능한 상태를 연구한 것**이지 자연 주기성·안착음 구현을 입증한 것이 아님.
- **Hardness → contact pulse:** bridge가 전달하지만 worklet `applyStrike`가 읽지 않는 `hardness`를 접촉 시간폭 등에 연결. 실제 미사용 필드는 확인되지만 **고정 3 ms baseline을 변경하는 새 법칙**이지 누락된 기능 복구로 보지 않는다.
- **Pre-aged entry:** 관객이 완전히 빈 세계가 아니라 이전에 형성된 흔적이 존재하는 시점에서 만남. **선행 로컬 fast-forward ≠ 재방문 간 동일 세계의 지속**.

### 3.2 리뷰 재검토에서 철회·수정된 주장

| 초기/중간 단계의 과도한 단정 | 후속 정정 및 유효한 잔여 질문 |
| --- | --- |
| 좁은 `density/K/μ` 때문에 형성 이력이 소리로 표현되지 않는다 | Scalar mapping의 제한은 사실이나 geometry/contact/pickup도 history의 물리적 결과. 넓은 ERB 변별성 부재를 음향 기여 전체 부재로 일반화하지 않음 |
| 저차 모달·희소 앵커·노출 판 5–6개만으로 `audio/wall=1.000` 보장 | **철회.** 노출 판 수·노드 비용·전환 손실·Chrome clock은 미검증. 이전 ROM 실패를 다른 의도로 우회할 수 있다는 것과 성공이 보장된다는 것은 별개 |
| G 채택과 `dtFeedback` pre-G 2h 포화를 한 인과 설명으로 합침 | **철회.** G 600 s 연구와 pre-G 7,200 s spatial-dynamics 실험은 별개 |
| Nodule은 1.5–2.6 kHz에 있고 수명이 짧아 어떤 환경에서도 청취 불가 | **계산 오류 인정·철회.** 실제 `E=0.3–1.2 MPa`, `ρ=1800–2200`, `ν=.25–.35`, `r=.018–.028 m`: 전단/종파 주요 모드 독립 경계 대략 **84–649 Hz**, `τ`는 `T60`이 아니므로 자유감쇠 `T60≈14–31 s`. 16-bit PCM -96 dBFS를 Web Audio float의 보편 가청 한계로 놓을 수 없음 |
| 10–20분 live 유지가 burial-weighted damping/sleep만으로 가능 | **철회.** Z link force, 파동 전달, 노출 plate 및 실시간 측정 조건 때문에 미검증 |
| Pre-aged world가 genesis보다 우월하며 스냅샷 즉시 복원이 가능 | **축소.** 관객의 두 경험은 서로 다른 작품 선택. `getSnapshot()`은 완전한 복원 API가 아니며 정확한 RNG/모델·필드·후보 타이머 복원은 새 구현 계약 |

**남는 유효한 추론:** 관측된 pre-G 믹스에서 Sphere stem은 Plate 합산 대비 **51.6–75.5 dB** 작았으므로 원래 출력에서 기여가 약할 가능성이 크다. 그러나 인간 가청성, 마스킹, 모든 기기에서의 '수학적 불가능'은 증명되지 않았다. 이후 제시된 `2.86–4.18 s` post-excitation 교차 계산도 **서로 다른 조건의 초기 RMS와 isolated Plate T60을 결합한 설명 모델**이지 coupled-world의 측정 교차 시간은 아니다. 실제 반경은 `consolidation` 외 층수·발 접촉량과도 연결되므로 단일 변수에 선형 종속된 Nodule 주파수 범위는 근사에 불과하다.

### 3.3 Argon에 남은 작품적 가치

- 단순 CPU 최적화가 아닌 **매몰에 따른 발음체 존재 양식 변화**.
- 형성 당시 동결된 Plate와 **현재 접촉 표면의 시간적 다짐**을 분리하는 소리.
- 세계를 건드리지 않고 **듣는 위치**를 바꾸는 관찰.
- 관객이 첫 형성을 목격하거나 **이미 역사가 있는 세계에 들어가는** 두 태도의 대비.

이것들은 **연구할 만한 가설**이지 채택된 roadmap은 아니다.

## 4. Astra High — 선택적 역사와 웹 감상 구조

Astra High는 현재 구현·완료된 부정 결과·웹 lifecycle을 보수적으로 구분했고, 다음 다섯 발견으로 정리했다.

1. **선택적으로 기억하는 세계:** `TrailPlateBirth`의 source→boundary selector가 영구 역사로 인정할 흔적을 저술한다. `local-accretion`의 말기 giant component는 selector 제거가 개방성을 보장하지 않는 반례. 선택기 자체도 작품의 규칙으로 검토 가능.
2. **역사의 인과 역할 vs 관객이 읽는 역사:** 채택된 `m(L) = 1 − 0.10(1 − exp(−L/4))`는 aggregate 층수를 속력에 반영한다. 오래된 Plate의 개별 identity를 감지하거나 heading을 직접 바꾸지 않는다. [material causal tail](../evidence/2026-10-12-material-causal-tail/README.md)에는 기존 상태를 통한 후속 영향과 검열·RNG 증폭 경계가 공존. 화면 alpha 상한은 깊이 감각의 의도적 절제일 수도 있다.
3. **청취 개성의 범위:** 고립된 natural/synthetic 선택 청취와 정정 raw를 구별. 좁은 scalar material range만으로 '형성 역사가 소리로 가지 않는다'고 말하지 않음. 그렇다고 live dense mix의 개별 음색 인식을 보증하지도 않음.
4. **같은 세계를 같은 시간에 듣는가:** 성숙한 pre-G `audio/wall` 붕괴는 전시 전용 문제가 아니라 웹의 시간적 일관성에도 영향을 줄 수 있음. Audio Off는 기술적 fallback이지 자동으로 작가가 선택한 침묵은 아님.
5. **세계의 수명과 관객의 수명:** 개체 교체를 건너 남는 material, Audio Off/On 진동의 비연속성, 페이지 재방문 간 영속성은 별개의 계약. 포화·정체·침묵을 자동 실패나 성공으로 간주하지 않음.

### Astra가 제시한 상호 배타적 작품 방향

| 방향 | 작품적 핵심 | 새로 요구되는 것 / 손실 |
| --- | --- | --- |
| **A. 닫아도 사라지지 않는 자리** *(Astra의 선택)* | 관객이 떠났다가 돌아오면 과거 세계가 현재의 개미/소리에 계속 조건으로 남음 | 완전 세계 저장·복원·시간 계약, 성숙한 오디오 문제; 매번 깨끗한 genesis 포기 |
| **B. 선택받지 못한 흔적** | 활동한 모든 것이 물질로 남지 않는다는 selector의 배제를 감각적으로 경험 | 흔적/물질의 시간차 표현; 진단 설명서가 되는 위험 |
| **C. 세계에 귀를 대는 위치** | full-coupled 세계 자체는 유지하고 지역/층 readout을 바꿔 청취 | 신규 readout·레벨 계약, 악기 브라우저화 위험; CPU 병목 미해결 |
| **D. 더 이상 새로운 땅이 없는 세계** | append-only 반복·포화 이후의 유한한 세계도 작품의 한 생애로 허용 | 세계 수명/종결 계약; 지루함을 철학으로 정당화할 위험 |

**Astra의 장점:** 구현·측정·작품 선택의 경계를 안정적으로 유지하고, 포화·침묵·시각적 은폐를 자동 결함이라 부르지 않음. 무리한 통합안을 피하고 한 방향만 선택.

**Astra의 한계:** 현행 체계가 설명 책임을 충분히 수행한다는 것은 새로운 물성/청취/행동 가설의 **예술적 탐색 가치가 낮다**는 뜻이 아님. A안 자체도 persistence·복원 계약과 live sound라는 큰 구현 부담을 가지며 감각적 성립이 미검증. 원래 구조 보존에 무게가 실릴수록 생성 가능한 다른 작품을 지나치게 일찍 파킹할 수 있음.

## 5. 비교 결론 — 어느 쪽을 채택할 것인가가 아니라 무엇을 남길 것인가

| 판단 축 | Argon High | Astra High |
| --- | --- | --- |
| 주요 장점 | 현재 코드에서 아직 안 쓰이거나 좁게 표현된 변수를 새 작품 법칙으로 연결; 기존 실패와 다른 재설계를 과감히 탐색 | 현재 무엇이 사실인지와 무엇을 성급하게 고치면 안 되는지를 구분; 관객의 시간과 선택적 보존에 집중 |
| 대표적 제안 | hardness 기반 접촉, depth selective readout, 비가역 lithification, pre-aged entry, topographic steering | 재방문 동일 세계, 남지 않은 흔적, 관측 위치, 유한한 포화 세계 |
| 주의할 오류 | **할 수 있다 → 된다 → 더 좋다**의 비약과 과도한 물리·성능 단정. 후속 자기 교정은 좋은 사례 | **현재 충분하다 → 유지하는 편이 낫다**로 관성화할 위험 |
| 공통 성과 | 내부 복잡성 증가만이 아닌 선택된 역사와 관객의 감각 관계를 질문함 | 같은 질문을 웹 감상 시간·세계의 수명·보존 범위의 구분으로 구체화함 |

두 리뷰 모두 실제 A/V 동시 관람을 완수하지 않았다. 원본 시각/청각 작품 평가와 코드·연구 기록에 기반한 구조 해석은 분리해서 보존한다. **이 기록은 모델 간 품질 순위나 최종 채택 판정이 아니다.**

### 독립적으로 수렴한 관측 기반 청취 — 지역과 지층 깊이의 차이

Argon의 **stratigraphic listening / acoustic horizon**과 Astra의 **C. 세계에 귀를 대는 위치**는 서로 다른 리뷰에서 도출됐지만, 공통으로 **같은 full-coupled 물리 상태를 유지한 채 관객이 듣는 readout만 선택**한다. 개미 행동·형성 법칙·FDTD 결합을 바꿔야만 성립하는 제안은 아니다. 그 점에서 새로운 소리를 만들어내는 `hardness → pulse`나 매몰 물리 자체를 바꾸는 `lithification`과 구별된다.

- **Argon의 출발 좌표는 수직적 깊이 / 층서(z):** 노출층, 매몰층, Nodule 등의 시대적·지질학적 관계가 청취 지평을 결정한다. 동일한 위치에서도 다른 깊이의 상태를 읽는다는 상상을 제안한다.
- **Astra의 출발 좌표는 수평적 지역 / 청취 위치(x, y):** 관객이 주의를 두는 지역에서 관련 pickup 응답이 전경으로 나오는 듣기 방식이다. 공간적 주의 이동이 중심이며 특정 깊이를 자동으로 분리해야 하는 것은 아니다.
- **공통 미해결 경계:** 분석용 `pickup-stem observer`는 연구 브랜치의 결과이지 현재 production의 웹 청취 제어가 아니다. Plate stem을 선택한다고 결합 세계에서 해당 판만 고립시키는 것도 아니며, 개별 stem의 에너지가 작다는 사실이 곧 가청성을 결정하지 않는다. **readout 선택만으로 AudioWorklet 적분 비용은 줄지 않는다.**

따라서 두 방향을 즉시 `(x, y, z)` 조작 UI로 합치는 것은 채택하지 않는다. 차후 승인된 청취 shadow가 있다면 **동일한 pre-G full-coupled 구간**에서 (a) 기존 전체 믹스, (b) 지역 선택, (c) 깊이 선택의 청취 대비를 분리해 비교할 수 있다. 선택 규칙, 스템 분리의 정합성, 절대 레벨/비교 게인, 관람객이 듣는 원인에 대한 해석을 명시해야 한다. **실제 지각적 차이와 작품적 우월성은 아직 검증되지 않았다.**

### 별도의 선택 가능한 read-only/shadow 검토 후보 (우선순위 미채택)

| 질문 | 실험/조사 형태 | 이미 존재하는 대조 및 주의 |
| --- | --- | --- |
| G 자연 접촉에서 `hardness`는 얼마나 분포하는가? | 현재 `p.hardness`의 분포·시간 변화·접촉 조건을 **코드 변경 없는 관측**으로 파악 | 분포가 좁으면 새 1–3 ms 매핑도 음색 차이가 작을 수 있음. 기존 3 ms baseline 유지 |
| Full mix vs 특정 층/지역 readout은 어떻게 달리 들리는가? | pre-G full-coupled stem을 같은 구간으로 분해·재합성한 offline **청취 shadow** | Branch stem observer를 production 기능으로 착각 금지; 신호 레벨/선택 방식을 고정한 A/B 필요 |
| 매몰 Plate의 실제 비용과 고유한 출력 기여의 관계는? | 노출 비율·Z links·awake nodes·개별 출력 에너지를 **같은 자연 상태에서** 비교 | ROM rank 시험의 negative, Z-off 실패, sleep blockers를 함께 사용; '4 modes → realtime' 보장 금지 |
| Genesis vs pre-aged entry의 감상 차이는? | 같은 seed의 시작/후행 구간을 **비개입적 시청각 비교** | pre-aging은 재방문 persistence가 아니고 현재 G의 검증된 오디오 패킷이 필요 |
| 두꺼운 지형의 조향·국소 분기에 작품적 필요가 있는가? | 먼저 현행 지형/재방문 정체의 조건을 읽기 전용 대조 | pre-G `dtFeedback` 2 h 포화를 G 인과 효과로 합치지 말 것 |

**후속 실행은 별도 승인과 구체적인 질문이 있어야 한다.** 후보라는 이유로 설계 계약이나 world-model을 수정하지 않는다.

## 6. 다시 열어볼 핵심 작품 질문

> **ANT는 어떤 활동을 영구적인 역사로 선택하고, 관객은 그 선택된 역사를 처음부터 목격할 것인가, 나중에 방문해 추론할 것인가, 아니면 반복과 포화까지 함께 살아볼 것인가?**

여기에 바로 답을 강제하지 않는다. 현실적인 웹 Audio-On clock, 보고 듣는 위치, 방문 간 world-state 수명, 의도된 침묵과 기술적 중단의 차이가 이후의 판단 조건이다.

## 7. 원본 경로 모음

- [ANT 최신 정본 및 리뷰 handoff](../README.md)
- [구현/설계 경계 `world-model.md`](../world-model.md)
- [현재 authored Plate selector](../../../src/lib/agents/ant/TrailPlateBirth.js)
- [재료·층서·Nodule](../../../src/lib/agents/ant/MaterialStratigraphy.js)
- [접촉 hardness bridge](../../../src/lib/audio/SurfaceAudioBridge.js) · [물리 AudioWorklet](../../../static/worklets/surface-plate.worklet.js)
- [모달 참여도](../evidence/2026-10-15-plate-modal-participation/README.md) · [Dormant ROM negative](../evidence/2026-10-07-dormant-plate-rom/README.md)
- [G production adoption](../evidence/2026-10-25-g-production-adoption/README.md)
- [pre-G dense mix branch](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-18-natural-dense-readout-overlap/README.md) · [pre-G exhibition audio branch](https://github.com/oseconds/ant-2026/blob/aea6601f6fc5c4d241fae7376f0f6cd59d11101f/docs/ant/evidence/2026-10-21-exhibition-audio-runtime/README.md)
- [G 후보/연구 결과와 production의 경계](../README.md#review-handoff--decisions-baselines-web-experience-viewing-evidence-2026-10-25)

**Do not use this archived interpretation to override newer source/evidence or to infer that any suggested feature was adopted.**

## Source-text originals (unmodified arguments, including later-retracted claims)

- [Argon High — initial bundle-limited review](2026-10-26-independent-review-originals/argon-high-01-initial-review-original.md)
- [Argon High — expanded code/evidence review](2026-10-26-independent-review-originals/argon-high-02-expanded-source-review-original.md)
- [Argon High — first rebuttal response](2026-10-26-independent-review-originals/argon-high-03-first-rebuttal-original.md)
- [Argon High — second rebuttal response](2026-10-26-independent-review-originals/argon-high-04-second-rebuttal-original.md)
- [Astra High — independent review](2026-10-26-independent-review-originals/astra-high-review-original.md)

These are preserved reviewer statements, **not** corrections applied to production. The separately interpreted and corrected synthesis above remains historical, not the project's current plan.
