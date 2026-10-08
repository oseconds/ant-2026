# 2026-10-09 — Material-mediated social dynamics hypothesis

**Type:** conceptual design/process log; **no experiment executed / no production change**  
**Canonical hypothesis:** [Material-mediated Social Dynamics](../material-mediated-social-dynamics.md)  
**Current implementation truth:** [ANT hub](../README.md) · [world-model contract](../world-model.md)

## Starting question

현재의 사회성 부족을 기존 social graph의 centrality/role 추가로 해결하는 대신, **Plate character를 경험한 개체의 상태가 이후 다른 개체와의 상호작용에 영향을 줄 수 있는가?** 라는 가설로 옮겼다.

## Discussion → design choices

1. Plate는 형성 당시의 history-derived character를 가진다. Birth 이후 Plate character 자체는 **고정**하고, pheromone·density·stratigraphy·접촉 상황 등 주변 **condition**은 변하게 둔다.
2. 개체는 Plate를 떠나더라도 물성 경험의 결과를 한동안 내부 상태로 보존할 수 있다. 직접적인 Plate 호감도/혐오도/ID 기억은 전제하지 않는다.
3. 상태는 활동성만이 아니다. vitality 외 arousal, responsiveness, sensitivity 등은 미래 후보이지만 W1에 한꺼번에 추가하지 않는다.
4. Ant A가 Ant B를 만나기 전에 Plate를 경험했더라도, 단순히 조우율만 바뀐 것과 실제 encounter-mediated effect를 구분해야 한다.
5. 겉보기 “개미천국/개미지옥”은 같은 고정 Plate에서도 조건에 따라 역전될 수 있는 **사후 은유**다. 좋고 나쁜 Plate, trap, attraction/avoidance를 구현 목표로 두지 않는다.
6. Plate는 계속 재작성하지 않아도 그 자체로 환경이 될 수 있다. **character / current condition / organism consequence**를 분리한다.

## Evidence boundary and decision

- 생물학: social encounters 및 spatial behavior가 개미의 활동/사회구조에 영향을 준다는 일반적 연구 근거는 있다.
- 미검증: fixed Plate character → portable internal state → encounter-mediated transfer → collective attraction/trap 형태의 완전한 인과 사슬.
- Repo S0–S2c social graph는 **read-only / parked**; 이전 negative/mixed evidence를 baseline으로 유지.
- **Decision:** document as future hypothesis only; do not change production, W1→W2→W3 ordering, or social read-only policy.

## Next, if reopened

W1 vitality shadow와 W2 material character 근거가 먼저 필요하다. 이후 W3 material-only link와 encounter-mediated link를 **별도 pass**, matched-seed/ablation, density/contact controls로 나눠 검증한다.