# ANT — Material-mediated Social Dynamics

**Status:** future research hypothesis / concept note — **not implemented, not experimentally validated**  
**Date:** 2026-10-09  
**Scope:** ANT persistent-world design; material character, organism state, and social encounters  
**Source of implementation truth:** [ANT hub](./README.md) · [world-model contract](./world-model.md)  
**Process chronology:** [2026-10-09 design note](./daily/2026-10-09-material-mediated-social-dynamics.md)

## Central hypothesis

> A Plate retains its formation-derived character. Ants can carry *temporary consequences* of encountering that material beyond the Plate itself. Subsequent ant–ant encounters may mediate some of those consequences into new activity elsewhere, which can in turn change the environment.

이 가설은 **Plate가 개미에게 명령하거나 정보를 담아 전달한다**는 뜻이 아니다. 개체가 실제 물성을 경험하면서 자신의 다음 행동 조건이 달라지고, 다른 개체와의 조우가 그 결과에 다시 영향을 줄 가능성을 시험하자는 것이다.

~~~
past movement / FOOT_CONTACT history
    → material episode / Plate character (fixed after birth)
    → local physical/environmental consequence
    → Ant A internal state (temporarily retained)
    → encounter with Ant B (candidate coupling, not assumed)
    → B's subsequent state / movement
    → pheromone / FOOT_CONTACT / new environmental history
    → future material and conditions
~~~

이 경로의 모든 화살표가 이미 존재한다는 뜻은 아니다. 현재 검증된 인과 연결과 미래 가설은 아래에서 분리한다.

## Distinguish character, condition, and consequence

| Layer | Interpretation | Lifetime / status |
| --- | --- | --- |
| **Plate character** | 형성 당시의 사용 이력에서 유도된 bounded material properties. compactness, porosity/roughness, directionality/anisotropy, stiffness, damping, resonance tendency는 **후보 차원** | **Birth 후 고정**을 유지하는 설계 선택. history-derived variable character 자체는 아직 계획 |
| **Local condition** | 현재의 pheromone, 개체 밀도, 표면 노출·매몰, 주변 material, vibration 등 | 시간에 따라 변화. 물성이 고정돼도 장소의 상황은 달라진다 |
| **Organism state** | 해당 개체의 이전 상태 및 물질·접촉을 경험한 결과 | 잠시 유지되다가 변화·회복·감쇠할 수 있는 **미래 가설** |
| **Collective consequence** | 방문·체류·이탈·재방문·충돌·조우·흔적 축적 등의 관찰 가능한 결과 | 생기는 형태를 목표로 강제하지 않고 실험 후 해석 |

Plate의 immutable geometry/material history, overlap에 따른 stratigraphy, exposed/buried 상태를 혼동하지 않는다. **Plate character가 변하지 않아도 Plate가 환경의 일부가 되는 효과는 계속 변할 수 있다.** 이를 위해 물성 자체를 계속 갱신할 필요는 없다.

## Organism state: more than activity level

활동성 하나로 환원하지 않는다. 상태 후보는 서로 다른 의미를 가질 수 있다.

- **Vitality** — 이동 노력·환경 비용·회복의 누적 결과. 현재 W1의 첫 번째 shadow 대상.
- **Arousal / responsiveness** — 자극에 반응할 준비도. 높은 활동량과 반드시 같지 않다.
- **Sensitivity** — 동일한 외부 또는 사회적 자극에 대한 반응 차이.
- **Movement / directional persistence** — 방향·움직임의 지속 성향. 기존 관성·회전 제약과 중복되는지 분리 검토해야 한다.

이 목록은 **연구 후보 목록이지 동시에 도입할 상태 변수 목록이 아니다.** 첫 pass에서 vitality가 충분히 설명 가능하다면 나머지 변수를 추가하지 않아도 된다. 높은 vitality = 높은 arousal, 낮은 vitality = 높은 기피 같은 등식을 미리 부여하지 않는다.

### Portable after-effect

요청된 핵심 선택은 **개미가 Plate를 벗어난 후에도 경험의 결과가 잠시 남을 수 있다는 것**이다.

- Plate ID, 호감도, 혐오도, 경로 목표를 개체에 직접 기록하는 모델이 아니다.
- 내부 상태가 물질을 경험한 결과를 가지고 이동할 수 있다.
- 지속시간·회복·민감도의 부호와 크기는 미정이며, 실험에서 sweep해야 한다.
- 시간이 지나거나 새로운 조건을 만나면 변화할 수 있고, 무한한 영향/영구 전염은 허용하지 않는다.

## Ant–ant encounter as a second, independently testable link

~~~
Plate exposure → Ant A state
Ant A state → observable movement/contact pattern
A–B encounter + B's pre-existing condition
    → possible change in B's later state
~~~

두 개의 효과를 반드시 분리한다.

1. **Encounter opportunity effect:** A가 느려지거나 오래 머무르므로 B와 더 자주 만난다. 이는 state transmission 없이도 social-graph topology와 density를 바꿀 수 있다.
2. **Encounter-mediated effect:** 동일한 접촉 기회와 위치·밀도 조건을 비교해도, A의 material-conditioned state가 B의 이후 상태 변화에 추가적으로 기여한다.

현행 DynamicSocialGraph의 proximity edge는 실제 더듬이 접촉, 물리 신호 교환 또는 상태 전달을 증명하지 않는다. 초기에는 기존 stable IDs, trajectories, proximity/contact episode를 read-only 관찰 자료로 재사용하되 **관측된 조우와 가정한 전달 메커니즘을 분리**한다.

A의 임의 내부 scalar를 B에 그대로 복사하거나, 접촉하는 순간 Plate 특성값을 전송하는 식의 규칙은 피한다. 신호 후보를 만들더라도 접촉 지속·상대적 움직임·이미 정의된 물리적 국소 조건처럼 관찰 가능한 매개를 우선 검토한다. 해당 매개에 대한 생물학적 타당성은 별도로 검토한다.

## Emergent “ant paradise / ant hell” — observational metaphors only

**천국/지옥, trap, attraction/repulsion은 Plate 타입이나 목표 상태가 아니다.** 같은 고정된 Plate라도 다른 밀도·개체 구성·이력 아래 정반대처럼 보일 수 있다는 관찰 가설이다.

- 이동 비용이 낮아 유리했던 장소에 통행량이 쌓이면 혼잡·조우 증가로 실제 이동 결과가 나빠질 수 있다.
- 거친 표면에서 이동이 느려져 높은 점유율이 보일 수 있다. **많이 보인다 ≠ 선호한다**.
- 불리한 장소를 지나온 개체의 변화가 다른 영역에 잠시 영향을 미칠 수 있지만, 상대방이 그 Plate의 위치를 아는 것은 아니다.
- 한때 정체를 보이던 장소도 pheromone decay, population turnover, 주변 환경 변화 때문에 나중에는 평범한 통로가 될 수 있다.
- 겉으로 활발한 곳이 내부 상태에는 불리할 수도 있고, 조용히 체류하는 곳이 안정적일 수도 있다.

**공간적 선호·기피**를 주장하려면 국소 밀도나 속도 외에 해당 장소로의 **진입률, 체류시간, 이탈률, 재방문률, 이동 비용 및 상태 변화**를 분리해 측정해야 한다. 한 Plate의 효과만으로 다른 개미에게 그 Plate를 피할 **위치 정보**가 전달된다고 가정하지 않는다.

## What is supported vs speculative?

### Existing ANT evidence / implementation (as of this concept note)

- movement, collision/occupancy, pheromone, FOOT_CONTACT, SurfaceField, frozen Plate/stratigraphy, material vibration/audio가 production에 있다.
- S0–S2c temporal social observation은 **read-only / parked**이며 기존의 no-relationship baseline이다.
- 해당 baseline의 단순 graph summaries는 compact spatial/movement predictor 위에 일관된 held-out predictive gain을 보여주지 않았다. 이는 모든 가능한 사회적 상호작용을 부정하는 결과는 아니다.
- [ANT hub](./README.md), [social evidence](./evidence/2026-10-07-social-graph/README.md), [S2c evidence](./evidence/2026-10-08-s2c-incremental-value/README.md)를 구현/수치 판단의 기준으로 삼는다.

### Biological motivation, not validation of this full causal chain

개미 연구에서는 동료와의 조우·접촉이 활동 조절과 사회적 조직에 관여하고, 개체의 공간 사용이 조우 구조에 영향을 준다는 근거가 있다. 예를 들면 Mersch, Crespi & Keller (2013), *Science*, DOI: [10.1126/science.1234316](https://doi.org/10.1126/science.1234316). 그러나 **특정 Plate character를 경험한 개체가 그 결과를 다른 개체에게 전달해 같은 Plate에 대한 장기적 선호/기피를 만든다**는 전체 주장은 이 문서에서 **생물학적으로 검증된 사실로 취급하지 않는다**.

### Artistic / modeling interpretation

“환경의 기억이 개체를 통해 이동한다”, “개미천국/개미지옥”, “물질이 사회적 관계를 조절한다”는 이번 작품의 실험 질문과 관찰적 은유다. 실패하거나 역전되는 결과도 유효하다.

## Minimal research gates (not authorization to implement now)

기존 [world-model W0–W6](./world-model.md#planned-passes) 순서를 대체하지 않는다.

| Gate | Small, isolated experiment | Evidence / stop condition |
| --- | --- | --- |
| **W1** | 기존 frozen trajectory에서 단일 vitality shadow | 내부 상태가 비포화로 변하는지, 비용/회복의 근거가 있는지 확인. **행동 변경 없음** |
| **W2** | coherent episode 및 history-derived bounded Plate character shadow | character의 provenance를 재현 가능하게 설명. **production birth 변경 없음** |
| **W3** | 한 가지 material consequence만 organism에 약하게 연결하는 독립 A/B | 동일 seed에서 material-only effects와 movement 변화 측정. rollback 가능 |
| **Future M1** | Plate exposure 이후의 상태 잔류시간 shadow. 현재 조우/이동의 간접 효과만 우선 측정 | 전후 효과 및 decay, 제어군 비교; 임의 관계 기억 없음 |
| **Future M2** | 접촉 기회를 통제한 상태에서 **하나의** encounter-mediated response를 별도 ablation으로 검증 | no-relationship baseline / material-only / material+encounter 조건 비교 |
| **Future M3** | 검증된 단일 연결만 feedback, 이후 natural long-run 관찰 | 천국/지옥을 강제하지 않고 전환·고착·해소 여부를 사후 측정 |

미래 M-pass는 새로운 연구 제안이지 확정된 W-roadmap 항목이 아니다. W1/W2/W3 evidence가 부족하면 진행하지 않는다.

### Minimum observations for future comparisons

- **Movement/place:** visits, entries/exits, conditional residence/traversal time, revisits, local density, speed, collision/occupancy.
- **Individual:** pre/post Plate exposure state, time since exposure, recovery/decay, inter-individual variation; state floor/ceiling saturation.
- **Encounter:** timing, pair identities, proximity duration, spatial location, contact opportunity, recipient before/after state (if actually modeled).
- **Environment/material:** fixed Plate character provenance, exposed/buried status, pheromone, footprint/traffic, material age and overlap.
- **Causal comparisons:** matched-seed baseline vs material-only vs material+encounter; density/movement-constrained controls, contact-rate adjustment; repeated seeds and temporal windows.
- **Result interpretation:** occupancy ≠ attraction; slow traversal ≠ preference; frequent contact ≠ state transmission; Plate identity ≠ benefit/harm.

## Guardrails

1. Plate의 formation-derived character/geometry는 탄생 후 동결한다. 환경적 맥락만 계속 달라질 수 있다.
2. leader/raid/recruit/follow, goodPlate/badPlate/trapPlate, food objective, explicit attraction/avoidance vector를 목표 현상으로 코딩하지 않는다.
3. 내부 상태가 다음 행동의 **조건이나 비용**에 영향을 주도록 설계한다. 특정 Plate를 향하라고 명령하지 않는다.
4. 관계는 우선 episodic encounter로 다룬다. persistent affinity/partner memory는 추가 가설과 검증 없이는 넣지 않는다.
5. 모든 영향은 bounded, local, dissipative/recoverable 하며 전체 세계를 영구적으로 지배하지 않는다.
6. 내부 상태의 pitch/volume 직접 매핑, master audio output → world feedback는 허용하지 않는다.
7. 단계마다 한 가지 causal link만 추가한다. baseline/evidence를 보존하고 원하는 장면이 나올 때까지 튜닝하지 않는다.

## Open questions

- Plate character 중 어떤 차원이 실제 locomotion **cost**를 바꿀 물리적 근거가 있는가?
- 개체가 Plate를 떠난 후 지속되는 최소 내부 상태 하나는 무엇이며, 그 시간척도는 어떤 근거로 정할 수 있는가?
- 상태 변화는 조우 빈도만 바꾸는가, 아니면 접촉 기회를 맞춘 뒤에도 recipient의 상태 변화가 남는가?
- 같은 고정 Plate가 시간·밀도·개체 turnover에 따라 유리/불리한 **결과**를 바꾸는지 검출할 수 있는가?
- 현재 movement/pheromone/collision만으로 설명되는 현상 이상을 추가하는가?

**Decision at this date:** Save the hypothesis; do **not** modify production behavior, Plate semantics, social-graph feedback, audio, or the W1-first active roadmap.