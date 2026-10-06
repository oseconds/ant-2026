# Physical Audio Lab

독립적인 물리 오디오 라이브러리와 vanilla Vite 데모입니다. 첫 화면은 ANT이며 String, Circular Plate, Solid Sphere는 같은 페이지의 보조 실험으로 열 수 있습니다. ANT는 동등한 개체들이 환경에 흔적을 남기며 움직이는 실험입니다. 여섯 다리 tripod gait의 실제 발 접촉은 느린 SurfaceField를 갱신하고, 지속적인 화학·기계 경로에서 태어난 동결 Plate 층을 공간적으로 타격합니다. 첫 Plate 생성 전에는 Plate 공명이 없습니다. `src/lib`는 SvelteKit으로 옮겨 사용할 수 있습니다.

```bash
npm install
npm run dev
```

Node.js 20 이상이 필요합니다. 현재 저장소의 Node 20.9에서도 실행할 수 있도록 Vite 6을 사용합니다. 터미널에 표시된 localhost 주소를 여세요. ANT 오디오는 Audio On 버튼에서, 다른 모델은 첫 타격 또는 패턴 재생에서 시작합니다. AudioWorklet은 localhost 또는 HTTPS가 필요하고, Sphere는 WebGL을 사용합니다.

## 디렉터리

```text
src/
  lib/
    audio/AudioEngine.js          # 지연 초기화, 모듈 캐시, 연결 그래프와 정리
    audio/AntAudioBridge.js       # FOOT_CONTACT 중심점을 공유 Plate 타격으로 전달
    agents/ant/
      AntController.js            # 개체군, 명시적인 시간 진행과 시스템 연결
      AntAgent.js                 # 개체별 이동 상태, 관성, 지속적인 성향
      PheromoneField.js           # 거리 기반 침적·감쇠·공간 샘플링
      LocalOccupancy.js           # 몸체 점유 감지·회피·접촉 방지
      GaitController.js           # 실제 이동 거리, 여섯 다리 geometry, tripod 접촉
      BodyPoseController.js       # 평활화한 head/gaster/antenna pose와 후단 geometry
      GasterDeposition.js         # thorax 거리 dose를 gaster 후단 연속/dab 침적으로 변환
      ColonyActivation.js         # 입구 주변 경로 증거와 느린 모집 압력
      StepEventGenerator.js       # 이전 거리 기반 STEP 기준 구현
    models/
      BaseModel.js                # 설정, 구독, 공통 모델 계약
      WorkletModel.js             # Worklet 초기화·메시지·비동기 연주 취소
      string/StringModel.js       # Karplus–Strong, inspector, 패턴
      plate/PlateModel.js          # 판 설정과 독립 pickup
      sphere/SphereModel.js       # 구 설정과 모달 오디오
      sphere/materials.js         # 밀도 / Young's modulus / Poisson ratio
    renderers/                    # canvas 수동 render; 자체 RAF 없음
      AntRenderer.js              # p5 instance-mode로 snapshot만 시각화
    lab/Lab.js                    # 모델 전환, 공유 오디오, 구독 수명
    lab/modelRegistry.js          # 모델 생성 registry
    utils/state.js                # JSON 설정 병합·복사·좌표 검증
    utils/TrajectoryBuffer.js     # 일반적인 timestamp/x/y 링 버퍼
    utils/simulationTime.js       # 경과 simulation time 표시
    index.js                      # 공개 ESM 진입점
  demo/
    definitions.js                # 데모의 렌더러·컨트롤 metadata
    documentViews.js              # 모델별 semantic HTML 문서 구성
    CanvasInteraction.js          # DOM 이벤트와 좌표 변환 adapter
  main.js                         # DOM, RAF, resize, inspector UI 수명
  style.css
static/worklets/
  plate.worklet.js                # 2D finite-difference DSP
  sphere.worklet.js               # 구면조화함수 기반 modal DSP
tests/                            # Node native 회귀·계약 테스트
  fixtures/                      # 원본 processor의 DSP 비교용 사본
scripts/browser-check.js           # 실제 브라우저 검증
index.html
vite.config.js                    # publicDir: 'static'
```

기존 `html/` 실행 페이지는 통합 앱으로 대체했습니다. 재사용한 계산식은 새 모델·Worklet에 있고, 원본 두 processor만 회귀 테스트 fixture로 남깁니다.

데모 UI는 원본 HTML 페이지의 문서 구조를 참고해 밝은 배경, 기본 브라우저 컨트롤, fieldset/legend, table, details/summary로 구성합니다. String은 현 연주·지연 버퍼 검사·패턴 생성기를 각각 배치하고, Plate는 판과 격자 설정, Sphere는 회전 가능한 구와 물성 설정을 보여 줍니다. 공통 파라미터 사이드바는 사용하지 않습니다. 색은 지연 버퍼의 샘플 역할과 변위·표면 마커를 구분할 때 사용합니다.

## 책임과 API

Model은 물리 설정과 오디오를 관리합니다. Renderer는 canvas를 받아 snapshot을 그립니다. CanvasInteraction은 pointer 좌표를 모델 좌표로 바꾸는 교체 가능한 데모 adapter입니다. Lab은 모델 registry를 사용하고 canvas, DOM, RAF를 알지 못합니다. 라이브러리는 상대 경로 ESM import를 사용하며 Vite alias나 Svelte store에 의존하지 않습니다.

```js
import { SphereModel, SphereRenderer } from './src/lib/index.js';

const model = new SphereModel();
await model.init(); // 순수 초기 상태 준비; AudioContext를 만들지 않음
model.configure({ physical: { diameter: 2, material: 'stainless304' } });
model.setPickup({ x: 0.72, y: 0.12, z: 0.684 });

const renderer = new SphereRenderer(canvas); // browser mount 이후
const unsubscribe = model.subscribe(({ type, payload }) => {
  if (type === 'update') renderer.render(model.getSnapshot());
  if (type === 'error') console.error(payload.message);
});

// 클릭 / pointer / MIDI adapter 등에서 호출
await model.strike({ position: { x: 0, y: 0, z: 1 }, strength: 0.7 });
model.stop();
unsubscribe();
renderer.destroy();
await model.destroy();
```

세 모델은 `init`, `configure`, `strike`, `setPickup`, `stop`, `getState`, `getSnapshot`, `subscribe`, `destroy`를 제공합니다. `configure`는 nested partial patch를 병합하고 수치 범위를 제한합니다. `getState()`는 복사본이며 `strike()`도 위치와 강도를 설정에 기록합니다. 상태에서 모델을 복원하려면 `new SphereModel({ state: JSON.parse(savedJSON) })`를 사용하세요.

위치 표현은 String의 0–1 scalar, Plate의 단위 원 내부 `{ x, y }`, Sphere의 정규화된 구 표면 `{ x, y, z }`입니다. Plate·Sphere는 배열 입력도 object 좌표로 정규화합니다. 강도와 감쇠는 0–1 범위입니다. String은 `feedback`을 직접 제어하고 `damping = 1 - feedback`으로 함께 저장합니다. damping만 전달하면 feedback을 계산하며, 두 값이 함께 주어지면 feedback을 우선합니다.

`getState()`에는 AudioContext/Node, canvas/context, DOM, RAF id가 없습니다. typed displacement/delay buffer는 `getSnapshot()`에만 있습니다. snapshot은 시각화용이며 저장 대상이 아닙니다. renderer는 `render(snapshot, { time, view })`로 호출합니다. 시간은 호출자가 RAF에서 전달하며 Sphere의 `{ yaw, pitch }` 회전은 UI view state입니다.

## Lab과 수명 관리

```js
import { Lab } from './src/lib/index.js';

const lab = new Lab({ workletBaseUrl: '/worklets/' });
await lab.setModel('plate');
await lab.strike({ position: { x: 0.1, y: -0.3 }, strength: 0.6 });
await lab.setModel('sphere');
await lab.destroy();
```

Lab 모델들은 하나의 지연 초기화 AudioEngine을 공유합니다. 전환 요청 즉시 이전 연주를 정지하고 이전 구독·source·worklet을 정리한 뒤 새 모델을 연결합니다. 겹친 선택은 마지막 요청을 우선합니다. 정지·파괴 후에 로드가 완료된 Worklet은 소리를 시작하지 않고 정리됩니다. 단독 모델은 engine을 소유하며 `destroy()`에서 context도 닫습니다. 외부 engine을 주입하면 소유자가 마지막에 engine을 파괴해야 합니다.

canvas 교체, pointer listener, ResizeObserver, RAF, WebGL 자원은 UI adapter와 renderer가 정리합니다. main.js는 전환 때 이 자원들을 해제하고 새 canvas를 만듭니다. 2D/WebGL 전환 때 같은 canvas를 재사용하지 않습니다. HMR과 pagehide에서도 앱을 파괴합니다.

새 모델은 공통 API를 구현하고 modelRegistry에 factory를 추가하면 됩니다. 커스텀 registry를 `new Lab({ registry })`로 전달할 수도 있습니다. 데모에서 보이려면 `demo/definitions.js`에 renderer와 컨트롤 metadata를 추가하고 `demo/documentViews.js`에 실험에 맞는 문서 구조를 작성하세요. 컨트롤은 `data-control-slot`에 배치됩니다. MIDI, automation, sequencer adapter는 DOM 없이 공통 모델 API를 호출할 수 있습니다.

## 보존된 기능과 pickup 수정

- **String:** noise excitation, delay feedback, 주파수·피드백·재생 시간, Lorenz visualization, 최대 3개의 일반 voice, 8-step pentatonic 패턴. Inspector의 전체 버퍼·현재/이웃/갱신 샘플, noise reset, 1 sample·1 cycle stepping을 유지합니다. 연주에 사용한 초기 잡음은 inspector로 복제하며 inspector stepping은 재생 voice와 분리합니다. A2 · Strange String 버튼은 110 Hz와 기존 `.99996` feedback을 선택합니다.
- **Plate:** 원형 mask의 13/17/21 격자, Laplacian/biharmonic 계산, 강성·감쇠, Gaussian strike, 해상도 변경 시 변위 보간, AudioWorklet 출력, 30 Hz 변위 시각화, pointer 드래그와 3×3 키보드 타격.
- **Sphere:** WebGL sphere·격자·회전·3D hit testing, 재질 4종, 지름·강도·감쇠·품질, P/S 모드, 구면조화함수 excitation/pickup 계수, AudioWorklet 출력과 물성 분석.

Plate 원본의 applyStrike는 pickup을 strike 위치의 격자 index로 덮었고 UI도 센서를 움직였습니다. 정지 때는 UI만 센서를 되돌려 실제 출력과 어긋났습니다. 이제 strike는 excitation만 변경합니다. pickup은 `setPickup()` 또는 명시적 설정으로만 변경하며 해상도 변경·정지·타격 후에도 유지합니다. Sphere도 pickup을 별도 저장하고 이동 시 진동 상태를 보존하면서 modal 출력 계수만 갱신합니다.

Plate·Sphere에서는 **Pickup 이동** 버튼 또는 **Shift+클릭/드래그**로 위치를 바꿉니다. Sphere의 일반 드래그는 회전, 일반 클릭은 타격입니다. canvas에 focus가 있을 때 Space/Enter는 중앙 타격입니다. Plate의 QWE/ASD/ZXC는 위치별 타격입니다. 기존 오디오 gain과 DSP를 유지하며 별도의 필터나 compressor를 추가하지 않았습니다.

## ANT: 환경을 공유 기억으로 다루기

ANT의 기본 모집 상한은 28입니다. 시작할 때는 하단 중앙 부근의 작은 원 안에 일반 개체 하나만 놓입니다. 현재 모집 한도 아래에서는 시뮬레이션 시간이 400–900 ms씩 흐를 때마다 최대 한 개체를 추가하며, 생성 위치가 점유되어 있으면 약 120 ms 뒤 다시 시도합니다. 별도의 wall-clock timer는 사용하지 않으므로 시뮬레이션이 멈추면 생성도 멈춥니다. 모든 개체는 같은 `AntAgent` 모델을 사용하며, 지정된 리더·지연된 복사본·리더 선출은 없습니다. 개체마다 위치·속도·방향·관성과 지속적인 성향을 가지며, 선호 속도·흔적 감도·탐색 성향·회전 반응·가속·감쇠·개인 간격이 조금씩 다릅니다. 움직임은 가속과 감속, 짧은 머뭇거림, 방향 검사, 전진을 섞습니다. 좌표는 0–1이고 시간은 호출자가 전달합니다. 큰 프레임 간격은 100 ms까지만 반영합니다.

0–1 정사각형은 관측 영역입니다. 경계가 가깝다는 이유만으로 안쪽 조향·감속·이동 제한을 적용하지 않습니다. 접촉 제약을 적용한 이동이 영역 밖으로 나가면 그 개체를 퇴장시키며, 반사·순환·순간 이동은 없습니다. 마지막 이동은 최초 경계 교차점까지의 실제 관측 선분만 페로몬 침적과 locomotion/gait 접촉 계산에 반영합니다. 개체의 gait 위상·stride·접촉 편차 상태도 제거하지만 공유장은 유지합니다. 영역 밖 센서는 신호 0을 읽고, 침적 선분은 영역과 실제로 교차한 부분만 사용하므로 밖의 이동을 가장자리 흔적으로 바꾸지 않습니다.

`ColonyActivation`은 입구 중심 `(0.5, 0.72)`에서 반경 `[0.06, 0.09, 0.12]`의 16방향을 읽습니다. 각 값을 `v / (v + 0.04)`로 포화하고 반경 3개 평균을 구한 뒤 가장 강한 4방향의 평균을 local evidence로 사용합니다. 정확한 spawn pixel과 원격 global mass는 모집 입력이 아닙니다. `a += (evidence − a) × (1 − exp(−dt / 45))`로 45초 시간 상수의 연속 activation을 만들고, 원하는 개체 수는 `8 + (population.count − 8) × a`, 실제 모집 한도는 그 정수 내림입니다. 기본 floor 8·ceiling 28이며 기존 설정 ceiling 범위 8–100을 유지합니다. 이 floor는 즉시 8개를 유지하는 강제 보정이 아니라 점진 모집의 최소 목표입니다.

매 tick의 모집 압력과 자연 퇴장은 독립적입니다. 목표가 내려가도 개체를 강제 제거하지 않고, 목표 이상이면 새 모집만 멈춥니다. 한도 아래에서 기존 pending timer는 유지하고 없으면 생성 간격을 예약합니다. 한 due tick에는 최대 하나만 생성합니다. `population.activationFeedback: false`로 기존 고정 상한 모집을 비교할 수 있으며 기본은 true입니다. 새 개체는 계속 증가하는 고유 ID와 새 성향·행동 시계·adherence·gait 상태로 시작합니다. `getSnapshot().analysis.colonyActivation`에 evidence·activation·desiredPopulation·recruitmentLimit·enabled를 제공하지만 화면에 별도 지표는 추가하지 않습니다. `totalRetired`에는 명시적으로 설정 ceiling을 줄일 때 기존 방식으로 제거된 개체도 포함합니다.

개체들은 실제 이동 거리에 비례하는 페로몬을 articulated gaster 후단에서 남깁니다. 기본 dab은 거리 누적을 사용하고 정지·제자리 회전은 새 dose를 만들지 않습니다. 공유장은 기본 96×96 격자이며 기존 15초 반감기로 지수 감쇠합니다. 재방문 없는 흔적은 60초 뒤 약 6.25%만 남습니다. 이번 pass에서는 반감기·침적량·반경·강화 계수·감각 및 조향 계수를 유지했습니다. 침적 반경은 0.0045 정규화 좌표이고, 센서는 0.042 앞쪽에서 좌우 ±0.014 범위의 다섯 지점을 읽습니다.

원거리 농도 반응은 3차 Hill 곡선이며 0.035에서 절반입니다. 약하고 퍼진 신호는 거의 무시하고, 강해진 경로에는 반응이 급격히 커집니다. 방향별 신호 차이가 커지면 탐색·조향 잡음을 줄이되 명시적인 무작위 탐색 확률은 최소 4% 유지합니다. 방향 단서가 없으면 개체별 탐색 성향을 더 많이 적용합니다. 침적량은 이동 거리당 기준값 4.5에 `0.5 + reinforcementGain × trailAdherence²`를 곱합니다. 기본 강화 계수는 5이며 설정 범위는 0–5입니다. 탐색 중에도 0.5배의 흔적을 남기고, 이미 일관된 경로를 따라갈수록 연속적으로 최대 5.5배까지 강화합니다. 순간적인 농도나 별도 역할로 침적량을 정하지 않으며, 흔적의 강화·이탈·분기·합류는 이름 붙인 집단 상태 없이 국소 선택에서 나타납니다.

경로 발견용 원거리 센서와 별도로, 0.016·0.028 앞쪽에서 좌우 ±0.009의 좌·중앙·우 신호를 읽어 작은 연속 조향 보정을 적용합니다. 각 센서의 작은 대칭 표본은 격자 정렬의 영향을 줄이고, 단거리 농도 반응은 0.018에서 절반입니다. 두 단면의 뚜렷한 경로 신호는 개체별 `trailAdherence`(0–1)를 빠르게 높이며, 신호가 약해지면 점차 줄어듭니다. 상승·하강의 지수 평활화 시간 상수는 각각 0.25초·1.8초입니다. 이 값은 짧은 감각적 지속성으로, 높은 동안 전진 관성을 유지하고 무작위 조향을 줄입니다. 일시적인 공백을 지나도 즉시 경로를 잊지 않으며 탐색 확률은 계속 남습니다. 균일한 농도만으로는 adherence가 높아지지 않고, 가장 강한 한 점을 목표로 지정하지 않습니다. 이 값은 `getSnapshot()`에 포함됩니다.

페로몬 강화 후 기본 실행의 [선별 스크린샷과 측정 기록](docs/ant/evidence/2026-10-05-reinforcement/README.md)을 Git에 보존했습니다. 짧은 자연 행렬의 유지·해체와 120초의 분산 상태를 함께 보여줍니다.

[개체 교체와 환경 기억의 연속성 기록](docs/ant/evidence/2026-10-05-turnover/README.md)에는 당시 고정 상한 모집 설정의 600초 실행과 화면을 보존합니다. 현재의 느린 population feedback 전 단계 기록이며, 안정된 자연 행렬이 형성됐다는 판정은 별도 시각 증거가 필요합니다.

페로몬은 가고 싶은 방향의 유인이고, 몸체 점유는 이동 가능한 공간의 제약입니다. 가까운 이웃은 강한 분리력을 주고, 앞쪽 혼잡은 감속과 여유 있는 쪽으로의 조향을 유도합니다. 상대 접근 속도로 접촉까지의 시간을 추정해 미리 제동하며, 뒤쪽 이웃의 영향은 약합니다. 작은 시간 간격과 이동 선분 검사로 몸체의 통과를 막으며 rigid-body impulse나 위치 순간 이동을 사용하지 않습니다. 이 규칙들은 특정 교통 상태를 지시하지 않습니다.

책임은 다음처럼 분리합니다.

- `AntAgent`: 개체별 이동 상태, 관성, 지속적인 성향. snapshot은 실제 turn rate도 읽기 전용 값으로 전달합니다.
- `PheromoneField`: 공유 외부 기억. `depositSegment()`, `sample()`, `decay(dtSeconds)`, `clear()`, `getSnapshot()`을 독립적으로 제공합니다.
- `LocalOccupancy`: 주변 몸체 점유와 방향별 혼잡, 근거리 분리와 이동 선분의 접촉 제약. 페로몬을 알지 않습니다.
- `GaitController`: 실제 이동 거리만으로 ID 기반 stride/phase를 진행합니다. 여섯 leg의 root/knee/foot geometry snapshot과 교대하는 tripod FOOT_CONTACT를 같은 phase에서 만듭니다. heading·속도·trail·collision을 바꾸지 않고 behavior random도 읽지 않습니다.
- `BodyPoseController`: 기존 turn rate와 이미 계산한 L/C/R 농도에서 평활화한 head/gaster/antenna pose를 만듭니다. 같은 gaster pose가 renderer와 침적 후단 위치의 기준입니다.
- `GasterDeposition`: 실제 thorax 이동 거리에 해당하는 강화량을 gaster 후단 경로에 전달합니다. 기본 `depositionMode: 'dab'`은 거리 `0.006`마다 누적 dose를 방출하며, `'continuous'`로 동일 후단 경로의 연속 침적을 비교할 수 있습니다.
- `AntController`: 위 시스템들을 연결하고 명시적인 시간에 따라 개체군을 진행합니다. `getState()`는 JSON 설정, `getSnapshot()`은 개체와 gait geometry, 격자 복사본입니다. 접촉 제약 뒤의 관측 가능한 실제 이동 구간을 `GaitController`에 전달하고, 이벤트를 선택적으로 주입된 오디오 브리지에 넘깁니다. Web Audio·DOM·p5 코드는 포함하지 않습니다.
- `AntRenderer`: p5 instance-mode로 articulated head/thorax/petiole/gaster, 안테나, 6개의 2-segment leg를 snapshot에서 그립니다. 공유 pheromone field는 고정된 two-scale grayscale transfer로 표시합니다. p5는 `init()`에서만 동적으로 불러오고 `noLoop()`와 `redraw()`를 사용하며 main.js의 RAF가 update와 render를 호출합니다. sketch는 gait나 model을 갱신하지 않고 p5.sound도 포함하지 않습니다.

물리 collision body는 하나의 `AntAgent`와 기존 radius `0.006`으로 유지합니다. 화면에서는 heading을 기준으로 gaster `−1.35r`·`1.60r × 1.02r`, petiole `−0.90r`·`0.28r × 0.22r`, thorax `0`·`1.05r × 0.70r`, head `+1.09r`·`1.08r × 0.86r`를 그립니다. 여섯 leg의 root 앞뒤 위치는 `+0.45r / 0 / −0.45r`, lateral attachment는 `[0.30r, 0.34r, 0.32r]`입니다. Foot 앞뒤 오프셋 `+1.95r / 0 / −2.00r`, lateral reach `3.05r / 3.10r / 3.25r`, gait 왕복폭 `0.52r`은 유지합니다. Knee along은 `[0.32, 0.44, 0.54]`, outward는 `[0.50r, 0.56r, 0.52r]`, 앞뒤 편향은 `[+0.14r, 0, −0.14r]`입니다. 회색 65의 얇은 다리를 먼저 그리고 body를 위에 그려 root가 thorax 안으로 가려집니다.

`GaitController`의 한 cycle은 ID 해시로 지속 편차 ±8%를 정한 `0.036` 이동 단위이고, touchdown은 약 `0.018`마다 생깁니다. phase 시작값과 접촉 세기 편차 ±4%도 ant ID에서 해시합니다. AntController의 random source는 호출하지 않습니다. Tripod A는 FL/MR/RL, B는 FR/ML/RR이고 half-cycle씩 교대합니다. 각 leg의 stance 비율은 0.62이며 stance에서 발을 몸체 기준 뒤로 옮기고 swing은 smoothstep으로 앞쪽에 돌려놓으며 약간 안쪽으로 접습니다. Renderer가 계산을 다시 만들지 않고 이 snapshot geometry를 그립니다.

`BodyPoseController`가 시뮬레이션 시간으로 body kinematics를 진행하며 snapshot과 renderer가 같은 pose를 사용합니다. Raw turn rate를 ±4.5로 정규화하고 0.04의 연속 dead zone 뒤 0.30초 지수 평활화를 적용합니다. Head yaw는 그 신호 ×0.12를 0.12초로, 반대 방향 gaster yaw는 ×−0.08을 0.45초로 다시 평활화합니다. 순간적인 부호 변화가 관절을 바로 뒤집지 않고, 직진으로 돌아오면 자연스럽게 중립으로 수렴합니다. Head pivot은 `+0.54r`, gaster pivot은 petiole의 `−0.90r`입니다. 모델의 몸체 렌더 단위는 `r = 2 × bodyRadius`이며, 공유 geometry로 gaster 후단 위치도 제공합니다. Antenna는 같은 head transform을 사용합니다. Pose는 steering·충돌·센서·속도·gait phase에 입력하지 않습니다.

이동 tuning인 max turn rate `4.5 rad/s`, acceleration response `32`, braking response `37`, max speed `preferredSpeed × 1.35`, trail steering angular-velocity clamp `±2.2`는 유지했습니다. 기존 실패 4개 중 세 개는 현재 코드가 사용하지 않는 `personality.acceleration`의 프레임별 Δv 상한을 검사했고, 하나는 60 Hz 회전을 0.04 rad 미만으로 제한했습니다. 해당 검증을 현재의 지수 응답과 승인된 0.075 rad/tick 한도에 맞추며 주저·전진·경로 중심·미리 제동·충돌 검사도 유지합니다.

Antenna는 기존 L/R 값을 `v / (v + 0.018)`로 포화하고 좌우 차이에 0.04 dead zone을 적용한 뒤 0.40초로 평활화합니다. 높은 양측 신호는 약한 공통 engagement를 주고 우세한 쪽만 조금 더 벌어집니다. 이미 계산한 L/C/R 원값도 body pose snapshot에 복사하며 추가 센서 샘플·tip 기반 sensing·steering 되먹임은 없습니다.

Gaster 후단은 petiole pivot `−0.90r`에서 articulated gaster의 center `−0.45r`와 반길이 `0.80r`를 합친 local tip `−1.25r`를 yaw로 회전한 점입니다. 이를 thorax heading으로 world 변환합니다. Dose는 후단 이동 길이가 아니라 collision 뒤 실제 thorax 이동 × `4.5 × (0.5 + 5 × trailAdherence²)`로 계산합니다. Dab spacing `0.006`은 기본 stride `0.036`의 1/6입니다. 남은 거리·dose는 다음 tick에 보존하고 퇴장 시 최종 후단에 방출합니다. 제자리 회전은 새 dose를 만들지 않으며 영역 밖 후단은 clamp 없이 field에서 제외됩니다. 비정상 큰 입력은 최대 256개의 spaced dab 뒤 나머지 dose를 endpoint 한 점으로 모아 보존합니다. 같은 경로·강화량 비교에서 연속/dab 총량의 상대 차이는 약 `1.47e−8`이며, 자연 실행의 경로 변화에 따른 강화량 차이는 별도입니다.

`FOOT_CONTACT`는 `{ type, antId, contactGroup: 'A' | 'B', contacts, position, strength, simulationTimeMs }`입니다. `contacts`에는 실제 tripod의 각 `{ legId, position: { x, y } }`가 있으며, 영역 밖 발은 clamp 없이 제외되어 1–3개가 남을 수 있습니다. `position`은 남은 발의 centroid이고, 0개면 이벤트를 내지 않습니다. 큰 advance에서도 phase/remainder를 모두 전진시키면서 최대 4개 tripod event만 냅니다. 기본 bornSurface에서는 개별 발이 SurfaceField와 해당 위치의 Plate 층을 갱신·타격합니다. legacy 비교 모드에서는 group centroid로 기존 공유 Plate를 한 번 타격합니다.

Renderer는 기존 field 값을 frame별 max에 맞춰 재정규화하지 않습니다. `base = smoothstep(0.004, 0.050, value)`, `route = smoothstep(0.040, 0.180, value)`, `alpha = min(112, round(base × 22 + route × 90))`을 사용합니다. 기존 96×96 image를 확대할 때 canvas image smoothing과 high quality interpolation을 켭니다. 농도 배열·alpha transfer·field 해상도·행동 sampling은 바꾸지 않습니다.

이전 리더/복사본·지연 재생·LIVE/LOOP 상태와 LOOP/RELEASE 버튼·L/R 단축키는 제거했습니다. 일반적인 timestamp/x/y 링 버퍼인 `TrajectoryBuffer`와 그 테스트는 다른 실험에 재사용할 수 있도록 유지합니다.

```js
import { AntController, AntRenderer } from './src/lib/index.js';

const ants = new AntController();
await ants.init(); // browser 자원 없이 상태를 준비
const renderer = new AntRenderer(canvas); // browser mount 이후
await renderer.init({ width: 480, height: 480, pixelRatio: 1 });

// 호출자가 가진 animation callback에서:
ants.update(frameTimestamp);
renderer.render(ants.getSnapshot());

ants.stop();
await renderer.destroy(); // p5.remove()로 canvas와 내부 listener 정리
await ants.destroy();
```

ANT도 Lab registry로 전환하며, registry가 Lab의 기존 AudioEngine을 공유하는 `AntEnvironmentAudioBridge`를 controller에 주입합니다. 기본 Audio Off에서는 AudioContext나 Plate Worklet을 만들지 않습니다. 전환하면 기존 RAF·ResizeObserver·p5 instance와 ANT의 Plate 자원을 정리하고 controller를 파괴합니다. 공유 AudioEngine의 최종 파괴는 Lab이 담당합니다. SvelteKit에서 `AntRenderer`를 사용할 때는 `p5` dependency를 설치하고 onMount 이후 `init()`하세요. 개체와 공유장만 사용하는 환경에서는 p5를 import하거나 실행할 필요가 없습니다. 호르몬·먹이·둥지·장애물은 구현하지 않습니다. 몸체 회피는 soft local interaction이며 개미의 생물학이나 rigid-body physics를 재현하지 않습니다.

## 데모 표시

ANT diagnostics 앞에 `simulationTimeMs`의 경과 시간을 `mm:ss`로 표시하고, 한 시간부터 `hh:mm:ss`를 사용합니다. 벽시계 시간이 아니므로 pause 상태에서 진행하지 않습니다.

첫 로드는 ANT이며 내비게이션 순서는 ANT, String, Plate, Sphere입니다. 상단 제목은 작은 `Lab` 한 단어입니다. ANT에는 제목·캔버스·Audio On/Off·Volume·기존 개체 수/평균 속도/페로몬 총량을 한 줄로 표시합니다. 설명문·캡션·상호작용 안내·공유 기억 설명 details와 정상 실행 상태 문구는 보이는 ANT 화면에서 제거하고 canvas의 접근 가능한 설명은 유지합니다. `Loading…`·`Loading audio…`와 오류는 접근 가능한 status 영역에서 알립니다. 페이지의 중복 소개·footer 안내를 제거하고 JSON은 하단의 접힌 `State (JSON)` details로 남깁니다. String·Plate·Sphere의 기능 컨트롤·inspector·개별 모델 설명은 유지합니다.

## ANT SurfaceField와 동결 Plate 층

기본 연결은 `AntController → GaitController → SurfaceField / TrailPlateBirth → AntEnvironmentAudioBridge → SurfaceAudioBridge → surface-plate.worklet.js`입니다. `audioExperiment.mode`는 `bornSurface`가 기본이며 `legacy`로 기존 circular Plate를 비교할 수 있습니다. 이 선택은 환경이나 ANT 행동을 바꾸지 않습니다. 같은 기존 AudioEngine과 Volume을 사용하고 새로운 UI 패널은 없습니다. 일반 Plate 탭의 PlateModel과 plate.worklet.js는 변경하지 않습니다.

SurfaceField는 96×96의 compaction 한 채널입니다. 유효한 각 발 접촉의 실제 위치 주변 반경 0.012에서 `c += (1-c) × 0.025 × GaussianWeight`로 0–1에 포화합니다. Group centroid, body 위치, heading 회전, 접촉 없는 정지는 기계적 흔적을 만들지 않습니다. 시뮬레이션 시간의 `c *= exp(-ln(2) × dt / 1800)`으로 천천히 완화하며 기존 pheromone의 15 s 반감기는 유지합니다. 행동 RNG를 소비하지 않습니다. 접촉 직전 compaction이 높아질수록 impulse footprint 반경은 0.014에서 0.009로 좁아지고 strength transfer는 0.95에서 1.05로 바뀝니다. 피치·pan·필터를 직접 제어하지 않습니다.

Plate 분석은 매 1 simulated second 수행합니다. 절대 pheromone 농도 `v`를 `v/(v+0.04)`로 포화하고 20 s time constant로 누적한 chemical memory가 0.30 이상이며, 반경 0.025의 SurfaceField support가 0.015 이상인 cell을 후보로 선택합니다. 프레임 최대값으로 정규화하지 않습니다. 후보를 Zhang–Suen thinning으로 골격화하고 8-neighbor graph의 cardinal/diagonal 길이를 쓰는 deterministic Dijkstra로 연결 경로를 구합니다. Source는 `(0.5,0.72)` 주변 반경 0.055–0.115 고리이며 target은 열린 관측 경계 0.05 이내입니다. Source–target geodesic length가 0.30 이상이고 경로가 20 s 지속되어야 생성할 수 있습니다. Spawn-local blob이나 짧은 transient는 거부합니다.

Birth 시 centerline 주변의 chemical+traffic 지지 영역 경계까지의 distance로 half-width를 0.012–0.030에 제한하고 disk ribbon을 rasterize합니다. Geometry/mask/graph/width/material/birth time/provenance를 깊이 동결합니다. Chemical evidence `q∈[0,1]`와 support의 bounded consolidation `s=clamp(meanSupport/0.08,0,1)`로 stiffness `0.65+0.5q`, density `1+0.2s`, damping baseline `0.25+0.2q`를 정합니다. 두 pickup은 principal path geodesic의 25%와 75%를 넘는 segment의 시작 cell로 snap합니다. 오차는 경로 grid segment 하나 이내이고 둘 다 유효한 material 위에 동결됩니다. 이후 페로몬 변화가 기존 Plate를 변형하지 않습니다.

층은 최대 12개를 보존하며 조용히 제거하지 않습니다. 한도에 도달하면 `surfacePlates.limitReached`로 알립니다. 모든 생성 사이에는 10 s 간격이 있고, 비슷한 경로에는 90 s refractory와 추가 실제 발 접촉 30개가 함께 필요합니다. 새 층을 기존 mask와 union하지 않습니다. Renderer는 동결 mask를 한 번 cache하여 live pheromone 아래에 약한 회색 solid ribbon으로 그립니다. 겹친 층은 시각적으로 누적됩니다.

SurfaceAudioBridge는 Audio On 사용자 동작에서 ANT worklet 하나와 기존 GainNode 하나를 만듭니다. 발 위치가 포함된 각 동결 Plate에만 타격하고, Plate가 없으면 정확한 무음입니다. 최대 group strength 0.05를 유효한 발 수와 그 발 아래의 층 수의 제곱근으로 나누며 전체 squared impulse budget을 제한합니다. Plate가 없는 발의 에너지는 다른 발에 재분배하지 않습니다. Off에서 발생한 접촉을 나중에 재생하거나 queue하지 않습니다. Off/On은 vibration 자원을 재생성하되 같은 run의 동결 환경은 유지하고, ANT를 떠나면 controller와 환경을 함께 파괴합니다.

새 ANT processor는 96-grid 동결 mask를 32-grid sparse finite-difference bending layer로 계산합니다. 각 층에 Dirichlet graph Laplacian과 그 제곱을 적용하고 overlap cell에는 양방향 restoring spring을 연결합니다. 6 kHz physics phase를 audio quantum 사이에도 유지하고 output을 보간합니다. Mixing은 현재 층 수로 나누지 않고 최대 12층 기준의 고정 `1/sqrt(12)` headroom과 bounded output을 사용합니다. DSP 격자는 chemical/SurfaceField 해상도를 바꾸지 않습니다. 상수 재질의 선형 근사이며 실측 ground 모델은 아닙니다. 32-grid에서는 발 footprint 차이가 subcell이어서 실제 impulse 폭의 차이가 제한됩니다. 형상이 모드에 영향을 주고 per-ant voice·panner·musical pitch mapping은 없습니다. 수치식, 3 seeds ×600 s, 44.1/48/96 kHz 검증, 실제 Chrome 출력 9개와 CPU 측정 한계는 [Surface Plate evidence](docs/ant/evidence/2026-10-05-surface-plates/README.md)에 기록합니다.

## ANT AUDIO: legacy 공유 Plate 비교 기준

활성 연결은 `AntController → GaitController → AntAudioBridge.handleFootContact() → PlateModel → 기존 AudioEngine / plate.worklet.js`입니다. 동일한 gait phase가 renderer의 여섯 다리와 발 접촉 이벤트를 만듭니다. `AntAgent`와 p5 렌더러에는 오디오가 없고, Plate 진동이나 오디오 상태를 ANT 행동에 되먹임하지 않습니다. 기존 Plate DSP를 재사용하며 별도 엔진·합성기·오디오 framework를 추가하지 않습니다.

ANT 브리지는 각 tripod touchdown의 valid foot centroid를 Plate 하나에 한 번 타격합니다. 이 Plate의 고정 관측 위치는 좌 `(-0.32, -0.18)`, 우 `(+0.32, -0.18)`이며 생성 시 `stereoPickups` 옵션으로 전달합니다. displacement/current/previous 상태·strike queue·공명 이력은 하나입니다. 각 오디오 sample에서 원래의 finite-difference 계산을 한 번 진행한 뒤 같은 current field의 두 픽업을 채널 0과 1로 읽고 각각 기존 `sample / (1 + abs(sample))` 제한을 적용합니다. 접촉 centroid는 물리 타격점만 정하며 pan이나 출력 gain을 결정하지 않습니다. 픽업별 독립 Plate, stereo panner, per-ant voice를 만들지 않습니다.

`AudioEngine.createWorklet()`의 선택적 `output.channels`만 1 또는 2를 허용하도록 일반화했습니다. 기본값은 1이고, `WorkletModel`은 기존대로 output 설정을 전달합니다. `PlateModel({ stereoPickups: [left, right] })`는 두 채널을 요청하며 기본 `PlateModel`과 Sphere Worklet은 한 채널을 유지합니다. String의 기존 오디오 경로도 그대로입니다. ANT 스테레오는 기존 GainNode 하나를 통과하므로 Volume이 좌우에 같은 비율로 적용됩니다. 일반 Plate 데모의 single pickup API·UI·DSP 경로는 유지합니다.

`StepEventGenerator.advance(agent, travelledDistance, simulationTimeMs)`와 실제 이동거리 `0.018`당 생성되는 중심 STEP은 비교 기준용으로 보존합니다. 기본 controller runtime에서는 더 이상 사용하지 않습니다. `GaitController`가 post-collision 실제 이동거리로 phase를 전진시키며, 각 touchdown 시각은 해당 substep 안의 phase 교차 비율을 사용합니다. 정지·주저·혼잡은 실제 이동량에 따라 phase와 접촉을 줄입니다.

FOOT_CONTACT 생성은 Audio Off 동안에도 model에서 진행하지만 브리지는 Off 또는 초기화 중의 이벤트를 버립니다. 따라서 On에서 과거 발 접촉을 재생하지 않습니다. 별도 tempo·음계·grid·quantization은 없습니다. 브리지는 tripod contacts의 leg ID·영역 좌표와 centroid 일관성을 검증하고, centroid를 기존 plate disk mapping에 넣어 타격 세기만 기존 상한 0.05로 제한합니다. `GaitController.retain(ids)`와 `reset()`은 퇴장·파괴 시 개인 phase·traits를 정리합니다. `StepEventGenerator.retain(ids)`와 `reset()`은 기준 이벤트 생성기에 계속 남아 있습니다.

브리지는 단위 정사각형을 Plate의 반지름 0.92 원 안에 넣습니다. `plateX = (2x - 1) × 0.92 / √2`, `plateY = (2y - 1) × 0.92 / √2`이며 두 화면의 y축 방향을 유지합니다. 이 좌표로 기존 `PlateModel.strike()`를 호출합니다. 위치는 타격 지점만 바꾸고 pitch·filter·pickup은 바꾸지 않습니다.

데모에는 `Audio Off / Audio On` 버튼과 그 옆의 `Volume` 슬라이더가 있습니다. 볼륨은 0–100%이며 기본 100%는 기존 Plate 출력 gain 0.7입니다. `setAudioVolume(0–1)`은 ANT Plate의 기존 출력 GainNode만 조절하며 20 ms ramp로 급격한 음량 변화를 완화합니다. 타격 강도와 FOOT_CONTACT 타이밍은 그대로 유지합니다. Off에서도 볼륨을 바꿀 수 있고 같은 ANT 안에서 Off/On을 전환하면 선택한 볼륨을 유지하지만, 슬라이더 자체는 오디오를 초기화하지 않습니다. On 클릭에서 기존 engine의 초기화·resume와 Plate Worklet 로드를 시작하므로 브라우저 autoplay 제한을 따릅니다. Off는 즉시 추가 타격을 차단하고 Plate를 정지·파괴합니다. 다시 On하면 같은 engine에서 Plate를 다시 준비합니다. ANT를 떠나거나 앱을 파괴할 때도 진행 중인 타격과 늦게 끝나는 초기화가 취소됩니다. 오디오 상태와 볼륨은 저장 가능한 ANT 행동 설정에 포함하지 않아 모델을 다시 선택해도 자동으로 소리를 시작하지 않습니다.

새 보호 한도는 비정상적인 긴 이동 입력에 대한 개체당 `advance()`당 최대 4 tripod contact group과 브리지 타격 강도 상한 0.05입니다. 정상적인 작은 시간 간격의 이동에서는 phase 경계 이벤트를 모두 전달합니다. 한도를 넘는 전체 접촉 그룹은 버리고 최종 phase를 보존하므로 이후 프레임으로 폭주를 미루지 않습니다. 기존 Plate의 타격 큐 24개 제한과 `sample / (1 + abs(sample))` 출력 제한은 변경하지 않았고, ANT 볼륨의 최대 출력 gain은 기존 0.7입니다.

[AUDIO v0의 선별 화면과 검증 기록](docs/ant/evidence/2026-10-05-audio-v0/README.md)에는 production 실행의 PCM·자원 수명 측정과 변경 전 controller에 대한 세 시드·120초 동작 일치 비교를 보존했습니다.

[볼륨 UI 화면과 검증 기록](docs/ant/evidence/2026-10-05-audio-volume/README.md)에는 On/Off 옆의 슬라이더, 실제 GainNode 음소거·음량 변경·Off/On 유지 검증을 보존했습니다.

[최소 UI와 공유 Plate 스테레오 검증 기록](docs/ant/evidence/2026-10-05-shared-plate-stereo/README.md)에는 최신 진행 화면, 실제 두 채널·두 픽업·공통 gain·전환 정리 측정을 보존했습니다.

[Tripod gait·FOOT_CONTACT 구현과 실제 화면](docs/ant/evidence/2026-10-05-gait/README.md)에는 테스트 이후 진행된 ANT 브라우저 화면 두 장, 실제 접촉 그룹/Plate 측정, 장시간 개체 교체·비중첩·속도 검사 기록을 보존했습니다.

단독 사용에서는 브리지에 기존 engine을 명시적으로 주입합니다. 데모의 Lab registry는 이 연결을 준비합니다.

```js
import { AntController, GaitController, AntAudioBridge } from './src/lib/index.js';

const ants = new AntController({
  state: { audioExperiment: { mode: 'legacy' } },
  gaitController: new GaitController(),
  audioBridge: new AntAudioBridge({ audioEngine: existingAudioEngine })
});
await ants.init();
// 사용자 버튼 handler 안에서 호출:
await ants.setAudioEnabled(true);
ants.setAudioVolume(0.5); // 기존 출력 gain의 50%; FOOT_CONTACT는 변경하지 않음.
// 호출자의 animation callback에서 ants.update(timestamp)를 계속 호출.
await ants.setAudioEnabled(false);
await ants.destroy(); // 주입한 engine은 소유자가 별도로 정리.
```

## ANT 실험 기록: 방향 인지형 교통

기준 상태는 2026-10-05의 `a023984cf8234b77307aa350444a18c02d75a6cd`입니다. 사용자는 페로몬 경로는 보이지만 개미들이 흩어져 행렬/행진이 아직 포착되지 않는다고 보고했습니다. 이는 사용자 관찰 기록이며, 아래 원인 설명은 코드에서 확인한 다음 검토 가설입니다.

해당 기준 상태의 `AntController`는 이동 방향 후보마다 점유 혼잡에 `3.2` 가중치의 페널티를 주고, 앞 혼잡이 `0.12`를 넘으며 좌우 혼잡 차이가 있으면 빈 쪽으로 조향했습니다. 속도도 앞 혼잡도에 따라 줄였습니다. 같은 경로에서 같은 방향으로 걷는 개미까지 장애물처럼 처리할 수 있는지 검토하는 것이 당시 다음 한 단계였습니다.

당시 방향 인지형 교통 변경은 근거리 교통 규칙만 다뤘습니다.

- 앞의 이웃이 나와 비슷한 방향으로 움직이면 같은 흐름의 참여자로 보고, 즉시 옆으로 빠지기보다 편안한 간격을 유지하도록 속도를 조절합니다.
- 마주 오거나 횡단하거나 경로 안에서 거의 정지한 이웃, 또는 위험할 만큼 가까운 이웃에는 기존 제동·회피·분리 동작을 유지합니다. 접촉 선분 검사는 개체가 겹치거나 서로 통과하지 못하도록 계속 작동해야 합니다.
- 리더/팔로워 역할이나 일반적인 Boids 정렬은 추가하지 않습니다. 선택적인 방향 안정화는 강한 경로를 이미 따라가며 앞 이웃과 방향이 비슷할 때만 매우 약하게 허용합니다.

이 단계에서는 페로몬 반감기·침적량, 개체 수, 격자 해상도, `trailAdherence`, 생성, 오디오, encounter rate, quorum, raid, UI를 바꾸지 않습니다. 성공 기준은 여러 개미가 같은 경로 위에 간격을 두고 이어서 이동하는 장면이 실제 화면에서 보이고, 접촉/통과가 발생하지 않는 것입니다. 자동 검증 결과만으로 이 시각 기준이 충족됐다고 판단하지 않습니다.

현재 ANT는 방향 인지형 교통·adherence 강화·tripod FOOT_CONTACT 위에 body pose, 기존 L/R 감각의 antenna 시각화, gaster 후단 dab, 표시 보간과 elapsed time, 느린 local colony activation을 유지합니다. 새 환경 실험은 개별 `FOOT_CONTACT → SurfaceField → frozen Plate births → shared layered audio`입니다. 기존 circular Plate는 legacy 오디오 비교 기준으로 보존합니다. Encounter/social pressure는 후속 실험입니다. `StepEventGenerator`는 거리 STEP 비교 기준으로, `TrajectoryBuffer`는 일반 유틸리티로 남깁니다.

[Head/gaster articulation 실험 기록과 straight·turning 자연 상태 스크린샷](docs/ant/evidence/2026-10-05-articulation/README.md)을 보존했습니다.

[현재 integrated refinement 기록](docs/ant/evidence/2026-10-05-integrated-refinement/README.md)에는 최초 4개 실패와 최종 155개 통과, body pose / gaster dab / local activation 규칙, 실제 motion·자연 오디오, 세 시드의 10분 검증과 수치 접촉 오차·청감 검증 한계를 보존했습니다.

## AudioWorklet protocol

모든 메시지는 `{ type, payload }` envelope를 사용합니다.

| 방향 | type | payload |
| --- | --- | --- |
| main → worklet | `configure` | Plate: resolution/stiffness/damping/pickup; Sphere: quality/diameter/material/damping/strength/pickup |
| main → worklet | `strike` | `{ position, strength }`; strength는 0–1 |
| main → worklet | `setPickup` | `{ position }` |
| main → worklet | `stop`, `destroy` | `{}` |
| worklet → main | `activity` | `{ active }` |
| Plate → main | `grid` | `{ size, nodes }` |
| Plate → main | `frame` | `{ size, radius, values: Float32Array }` |
| Sphere → main | `model` | modes/families/P·S wave speeds/mass |

Worklet 경계에서는 기존 DSP 단위에 맞게 damping을 0–100으로 변환합니다. Sphere configure의 strength는 기존 percent 단위이고 strike strength는 normalized 단위입니다. 모델 API에는 항상 0–1을 노출합니다. destroy 뒤에는 processor의 `process()`가 false를 반환합니다. Worklet은 독립 스크립트이므로 브라우저 앱 entry에서 import하지 않습니다.

모델의 `setPickup()`은 현재 전체 configure 메시지에 새 위치를 담아 전송합니다. `setPickup` 메시지는 Worklet을 직접 연결하는 adapter에서도 사용할 수 있도록 지원합니다.

ANT의 `stereoPickups`는 Worklet 생성 시의 processor option입니다. 이후 타격·single pickup 설정은 고정된 두 관측 위치를 바꾸지 않으며, 해상도를 바꾸면 같은 물리 좌표의 두 격자 index를 다시 구합니다.

## SvelteKit으로 이동

`src/lib/` 전체와 `static/worklets/`를 그대로 복사하세요. UI는 main.js와 demo/를 참고해 Svelte component로 작성합니다. 모듈 import와 모델 생성·init은 SSR에서 browser resource를 생성하지 않습니다. renderer는 반드시 onMount 이후 만들고 오디오는 사용자 gesture에서 시작하세요.

```svelte
<script>
  import { onMount } from 'svelte';
  import { SphereModel, SphereRenderer } from '$lib/index.js';
  import { base } from '$app/paths';

  let canvas;
  let model;
  onMount(() => {
    model = new SphereModel({ workletBaseUrl: `${base}/worklets/` });
    const renderer = new SphereRenderer(canvas);
    const unsubscribe = model.subscribe(() => renderer.render(model.getSnapshot()));
    void model.init().then(() => renderer.render(model.getSnapshot()));
    return () => { unsubscribe(); renderer.destroy(); void model.destroy(); };
  });
</script>

<canvas bind:this={canvas} width="480" height="480"></canvas>
<button onclick={() => model.strike()}>Strike</button>
```

실제 component에서는 canvas sizing과 필요한 RAF/pointer adapter도 mount/unmount에 맞춰 관리하세요. subpath 배포에서는 위처럼 workletBaseUrl을 지정합니다. Vite 데모는 import.meta.env.BASE_URL을 사용합니다.

## 검증

```bash
npm test
npm run build
npm run test:browser
# build 결과를 대상으로 브라우저 검증
CHECK_PRODUCTION=1 npm run test:browser
```

Node native 테스트는 SSR import, JSON 복사·부분 병합, delay stepping, 공유 AudioEngine, 초기화/정지/전환 경합, Worklet protocol, sample rate/quality별 유한 출력, 독립 pickup, 원본 DSP 회귀를 확인합니다. ANT는 거리 기반 침적·감쇠, 확률적인 흔적 선택, 지속적인 개체 성향, 몸체 회피·접촉 안정성·장시간 유한 상태와 분산, p5 adapter 초기화·파괴를 검사합니다. Gait 검사는 고정 ID 기반 편차와 phase, 여섯 다리 geometry, A/B tripod 교대, 영역 밖 접촉 제외, 이벤트 상한, turnover 정리, 행동 난수·이동·페로몬과의 분리를 확인합니다. FOOT_CONTACT 브리지의 centroid·strike 좌표와 세기, Audio On/Off와 전환 정리를 검사합니다. 스테레오는 중앙 타격의 균형, 비대칭 타격의 좌우 신호 차이, 같은 field/history와 단일 타격 소비, 해상도 변경·stop, 44.1/48/96 kHz와 세 품질의 유한·제한 출력을 검사합니다. 일반 링 버퍼의 wrapping/지연 보간 테스트도 유지합니다. fixture는 앱 bundle에 포함되지 않습니다.

브라우저 스크립트는 Vite를 임시 포트로 띄우고 세 모델의 연주·컨트롤·전환·정리와 console/processor 오류를 확인합니다. ANT의 독립적인 움직임·공유 흔적·기본 무음 실행, 사용자 Audio On 이후 기존 Plate의 실제 PCM 출력, Off/재활성화/전환 시 정리도 검사합니다. 모델별 문서 구조, native control의 label 연결, 밝은 배경과 모바일 가로 넘침도 검사합니다. macOS의 설치된 Google Chrome을 자동 사용하며 다른 환경은 `BROWSER_EXECUTABLE_PATH`로 실행 파일을 지정하거나 `npx playwright install chromium`으로 검증용 브라우저를 설치하세요. 스크린샷은 test-results/에 저장합니다. 자동 테스트는 출력 데이터와 lifecycle을 확인하며 청감 비교는 별도입니다.

## 남은 기술 부채와 다음 작업

- String은 기존 방식대로 AudioBuffer를 main thread에서 미리 생성합니다. feedback 변경은 다음 voice에 적용됩니다. String의 strike/pickup 위치는 저장 가능한 API를 제공하지만 아직 음색에 영향을 주지 않습니다. 두 원본 String 페이지의 attack/tail envelope는 하나의 Karplus–Strong 출력 경로로 통합했습니다.
- Plate는 작은 정규 격자와 단순 고정 경계 모델입니다. resolution 변경은 음색도 바꿀 수 있고 고해상도 실시간 CPU 비용을 따로 측정해야 합니다.
- Sphere의 주파수는 기존 alpha table과 P/S branch 근사식입니다. 정확한 elastic-sphere 경계조건 해법은 아니며 현재 WebGL 구는 실제 modal displacement를 그리지 않습니다.
- 기본 Plate와 Sphere output은 mono·pickup 하나입니다. ANT 기본은 각 동결 층의 두 물리 pickup을 shared surface processor에서 읽고, legacy 비교는 기존 Plate processor의 두 pickup을 사용합니다. preset persistence, MIDI, automation, 사용자용 recording/spectrum analyzer는 아직 구현하지 않았습니다. Chrome recording과 고정 scale 분석은 evidence script에만 있습니다. Inspector는 String에 먼저 마련했습니다.
- ANT의 이웃 감지와 접촉 검사는 현재 O(N²)이며 기본 28개에 맞추었습니다. 더 큰 개체군에는 spatial index와 CPU profiling이 필요합니다. 페로몬 감도·감쇠·회피 거리의 조정은 여전히 실험 과제이며 특정 분기나 교통 패턴을 보장하지 않습니다.
- 다음 실험 후보는 장시간 CPU/audio dropout profiling, String의 Worklet 전환과 위치 반영, preset save/load, 공통 analyser·WAV recording, Sphere modal visualization입니다. 다중 pickup·stereo는 ANT Plate에서 이미 검증한 별도 기능입니다.
