import { StringRenderer, PlateRenderer, SphereRenderer, AntRenderer, SPHERE_MATERIALS } from '../lib/index.js';

const percent = (value) => `${Math.round(value * 100)}%`;
const strength = { path: 'excitation.strength', label: '타격 강도', min: 0, max: 1, step: .01, format: percent };
const damping = { path: 'damping', label: '감쇠', min: 0, max: 1, step: .01, format: percent };
const quality = { path: 'quality', label: '계산 해상도', options: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']] };

/** UI metadata is independent of the simulation registry and can be replaced in Svelte. */
export const demoDefinitions = {
  string: {
    label: 'String', title: 'Karplus–Strong 현 시뮬레이션', Renderer: StringRenderer,
    description: '짧은 잡음을 순환 지연선에 넣어 현의 울림을 만듭니다. 소리를 듣고, 지연 버퍼를 한 샘플씩 진행하며 되먹임을 살펴보세요.',
    hint: '그림을 클릭해 현을 튕기세요. 그림에 포커스가 있을 때 Space 또는 Enter로도 연주할 수 있습니다.',
    controls: [
      { path: 'physical.frequency', label: '주파수', type: 'number', min: 55, max: 880, step: 1, format: (v) => `${v.toFixed(0)} Hz`, help: '55–880 Hz. 버퍼 길이가 달라지므로 실제 음높이는 아래 예상 값과 조금 다를 수 있습니다.' },
      { path: 'feedback', label: '피드백', min: .9, max: .99996, step: .00001, format: (v) => v.toFixed(5), help: '1에 가까울수록 울림이 오래 유지됩니다.' },
      strength,
      { path: 'duration', label: '재생 길이', min: .5, max: 8, step: .1, format: (v) => `${v.toFixed(1)} s` },
      { path: 'pattern.tempo', label: '패턴 템포', min: 60, max: 180, step: 1, format: (v) => `${v} BPM` }
    ]
  },
  plate: {
    label: 'Plate', title: '원형 판 · 2D 물리 모델', Renderer: PlateRenderer,
    description: '원형 격자의 진동을 AudioWorklet에서 계산합니다. 원하는 곳을 두드리면 위치에 따른 울림과 변위를 확인할 수 있습니다.',
    hint: '원 안을 클릭하거나 드래그해 타격하세요. 그림에 포커스가 있을 때 Q W E / A S D / Z X C로 위치를 선택하고, Space 또는 Enter로 중앙을 두드릴 수 있습니다.',
    controls: [
      { path: 'physical.stiffness', label: '강성', min: .65, max: 1.15, step: .01, format: (v) => v.toFixed(2) },
      damping, strength, quality
    ]
  },
  sphere: {
    label: 'Sphere', title: '3D 구체 물리 모델', Renderer: SphereRenderer,
    description: '구를 드래그해 회전하고 표면을 눌러 타격하세요. 회전된 표면 좌표를 3D 타격 위치로 변환하여 모달 합성으로 소리를 만듭니다.',
    hint: '드래그하면 회전하고, 클릭 또는 탭하면 타격합니다. 그림에 포커스가 있을 때 Space 또는 Enter로 중앙을 타격할 수 있습니다.',
    controls: [
      { path: 'physical.material', label: '재질', options: Object.entries(SPHERE_MATERIALS).map(([id, material]) => [id, material.name]) },
      { path: 'physical.diameter', label: '지름', min: .25, max: 5, step: .25, format: (v) => `${v.toFixed(2)} m` },
      damping, strength, quality
    ]
  },
  ant: {
    label: 'ANT', title: 'ANT · 움직임을 기억하는 버퍼', Renderer: AntRenderer,
    description: '한 리더의 최근 움직임을 기억하고, 일곱 개의 점이 같은 기억을 조금씩 늦게 따라갑니다. 미세한 차이를 더해 같은 경로의 불완전한 복사본을 만듭니다.',
    hint: 'LOOP로 현재 기억을 고정해 반복하고, RELEASE로 새 움직임을 기록하세요. 그림에 포커스가 있을 때 L / R 키로도 조작할 수 있습니다.',
    canvasDescription: '리더 한 개와 지연된 움직임을 따라가는 일곱 개의 점, 그리고 최근 이동 경로를 표시합니다.',
    audio: false,
    interaction: false, // The p5 instance forwards ANT's keyboard actions.
    update: (controller, time) => controller.update(time),
    controls: []
  }
};

export const readPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
export const patchPath = (path, value) => path.split('.').reverse().reduce((result, key) => ({ [key]: result }), value);
