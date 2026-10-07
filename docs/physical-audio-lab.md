# Physical Audio Lab — Library / Demo Notes

루트 README는 현재 ANT와 주요 결과를 빠르게 보여주는 entry point로 유지합니다. 이 문서는 ANT 바깥의 generic library/API, String/Plate/Sphere와 demo integration 정보를 보존합니다.

## Run

```bash
npm install
npm run dev
```

Node.js 20+와 Vite 6을 사용합니다. AudioWorklet은 localhost 또는 HTTPS가 필요하고 Sphere renderer는 WebGL을 사용합니다.

## Library shape

```text
src/lib/
  audio/
    AudioEngine.js
    AntAudioBridge.js
    AntEnvironmentAudioBridge.js
  agents/ant/
    AntController.js
    AntAgent.js
    PheromoneField.js
    LocalOccupancy.js
    GaitController.js
    BodyPoseController.js
    GasterDeposition.js
    ColonyActivation.js
    SurfaceField.js
    TrailPlateBirth.js
    MaterialStratigraphy.js
    DynamicSocialGraph.js
    TemporalSocialTopology.js
  models/
    BaseModel.js
    WorkletModel.js
    string/StringModel.js
    plate/PlateModel.js
    sphere/SphereModel.js
  renderers/
  lab/
  utils/

static/worklets/
tests/
scripts/
```

Model은 물리 설정과 오디오를 관리하고, Renderer는 snapshot만 그립니다. Lab은 model registry와 shared AudioEngine lifecycle을 관리합니다. DOM/canvas/RAF는 demo adapter와 renderer 책임입니다.

Browser resource는 module top-level에서 만들지 않습니다.

## Common model API

String / Plate / Sphere는 공통적으로:

- `init()`
- `configure()`
- `strike()`
- `setPickup()`
- `stop()`
- `getState()`
- `getSnapshot()`
- `subscribe()`
- `destroy()`

를 제공합니다.

예:

```js
import { SphereModel, SphereRenderer } from './src/lib/index.js';

const model = new SphereModel();
await model.init();

model.configure({
  physical: { diameter: 2, material: 'stainless304' }
});
model.setPickup({ x: 0.72, y: 0.12, z: 0.684 });

const renderer = new SphereRenderer(canvas);
const unsubscribe = model.subscribe(() => {
  renderer.render(model.getSnapshot());
});

await model.strike({
  position: { x: 0, y: 0, z: 1 },
  strength: 0.7
});

model.stop();
unsubscribe();
renderer.destroy();
await model.destroy();
```

`getState()`는 저장 가능한 복사본이고 AudioContext/Node, canvas, DOM, RAF id는 포함하지 않습니다. typed displacement/delay buffer는 visualization용 `getSnapshot()`에만 있습니다.

## Lab lifecycle

```js
import { Lab } from './src/lib/index.js';

const lab = new Lab({ workletBaseUrl: '/worklets/' });
await lab.setModel('plate');
await lab.strike({ position: { x: 0.1, y: -0.3 }, strength: 0.6 });
await lab.setModel('sphere');
await lab.destroy();
```

Lab 모델은 하나의 lazy AudioEngine을 공유합니다. 모델 전환 때 이전 재생, subscription, source, worklet을 정리한 뒤 새 모델을 연결합니다. 겹친 선택은 마지막 요청을 우선합니다.

단독 모델이 engine을 소유하면 `destroy()`에서 context를 닫고, 외부 engine을 주입하면 소유자가 최종 lifecycle을 책임집니다.

## Preserved physical models

### String

- Karplus–Strong delay feedback
- inspector / delay-buffer stepping
- up to three voices
- A2 Strange String preset
- 8-step pentatonic pattern

### Circular Plate

- finite-difference circular mask
- 13 / 17 / 21 grid quality
- stiffness / damping
- Gaussian strike
- independent pickup
- AudioWorklet output
- keyboard/pointer excitation

Strike는 excitation만 바꾸고 pickup은 `setPickup()`으로만 이동합니다.

### Solid Sphere

- WebGL sphere
- material presets
- P/S modal families
- spherical-harmonic excitation/pickup coefficients
- independent pickup
- AudioWorklet modal output

현재 sphere frequency model은 기존 alpha table과 P/S branch 근사이며 exact elastic-sphere boundary solution은 아닙니다.

## AudioWorklet protocol

모든 메시지는 `{ type, payload }` envelope를 사용합니다.

| 방향 | type | payload |
| --- | --- | --- |
| main → worklet | `configure` | model configuration |
| main → worklet | `strike` | `{ position, strength }` |
| main → worklet | `setPickup` | `{ position }` |
| main → worklet | `stop` / `destroy` | `{}` |
| worklet → main | `activity` | `{ active }` |
| Plate → main | `grid` / `frame` | visualization data |
| Sphere → main | `model` | mode/material analysis |

Worklet은 독립 script이므로 browser app entry에서 import하지 않습니다.

## SvelteKit integration

`src/lib/`와 `static/worklets/`를 옮겨 쓸 수 있습니다. Renderer 생성은 `onMount` 이후, audio start는 사용자 gesture 뒤에 수행합니다.

```svelte
<script>
  import { onMount } from 'svelte';
  import { SphereModel, SphereRenderer } from '$lib/index.js';
  import { base } from '$app/paths';

  let canvas;

  onMount(() => {
    const model = new SphereModel({
      workletBaseUrl: base + '/worklets/'
    });
    const renderer = new SphereRenderer(canvas);
    const unsubscribe = model.subscribe(() => {
      renderer.render(model.getSnapshot());
    });

    void model.init().then(() => renderer.render(model.getSnapshot()));

    return () => {
      unsubscribe();
      renderer.destroy();
      void model.destroy();
    };
  });
</script>

<canvas bind:this={canvas} width="480" height="480"></canvas>
```

Subpath 배포에서는 `workletBaseUrl`을 명시합니다.

## Validation

```bash
npm test
npm run build
npm run test:browser
CHECK_PRODUCTION=1 npm run test:browser
```

Node tests는 model contracts, lifecycle, SSR-safe import, DSP regression, sample-rate/quality finite output, pickup independence와 ANT contracts를 포함합니다.

Browser check는 실제 model controls, switching/cleanup, ANT motion/audio, console/processor errors와 development/production preview를 검사합니다.

## Known generic limitations

- String AudioBuffer excitation은 main thread에서 미리 생성합니다.
- Plate는 작은 정규 격자와 단순 boundary model입니다.
- Sphere는 approximate modal frequency model입니다.
- 기본 standalone Plate/Sphere는 mono single-pickup입니다.
- preset persistence, MIDI, general-purpose recording/analyser는 아직 generic API로 완성되지 않았습니다.
- ANT의 mature coupled-material AudioWorklet runtime 문제는 별도 [ANT hub](ant/README.md)를 참조합니다.
