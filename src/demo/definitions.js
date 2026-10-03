import { StringRenderer, PlateRenderer, SphereRenderer, SPHERE_MATERIALS } from '../lib/index.js';

const percent = (value) => `${Math.round(value * 100)}%`;
const strength = { path: 'excitation.strength', label: '타격 강도', min: 0, max: 1, step: .01, format: percent };
const damping = { path: 'damping', label: '감쇠', min: 0, max: 1, step: .01, format: percent };
const quality = { path: 'quality', label: '품질 / 해상도', options: [['low', 'LOW'], ['normal', 'NORMAL'], ['high', 'HIGH']] };

/** UI metadata is independent of the simulation registry and can be replaced in Svelte. */
export const demoDefinitions = {
  string: {
    label: 'STRING', title: '노이즈에서 태어난 하나의 현', subtitle: 'KARPLUS–STRONG / DELAY FEEDBACK', Renderer: StringRenderer,
    hint: '클릭 또는 Space로 현 튕기기 · 아래에서 샘플 단위로 내부 버퍼 탐색',
    controls: [
      { path: 'physical.frequency', label: '주파수', min: 55, max: 880, step: 1, format: (v) => `${v.toFixed(0)} Hz` },
      { path: 'feedback', label: '피드백', min: .9, max: .99996, step: .00001, format: (v) => v.toFixed(5) },
      strength,
      { path: 'duration', label: '재생 길이', min: .5, max: 8, step: .1, format: (v) => `${v.toFixed(1)} s` },
      { path: 'pattern.tempo', label: '패턴 템포', min: 60, max: 180, step: 1, format: (v) => `${v} BPM` }
    ]
  },
  plate: {
    label: 'PLATE', title: '원형 판의 진동', subtitle: '2D FINITE DIFFERENCE / AUDIOWORKLET', Renderer: PlateRenderer,
    hint: '클릭·드래그로 타격 · QWE / ASD / ZXC로 위치 선택 · Shift+드래그로 pickup 이동',
    controls: [
      { path: 'physical.stiffness', label: '강성', min: .65, max: 1.15, step: .01, format: (v) => v.toFixed(2) },
      damping, strength, quality
    ]
  },
  sphere: {
    label: 'SPHERE', title: '구의 표면에서 시작되는 공진', subtitle: 'SPHERICAL HARMONICS / MODAL SYNTHESIS', Renderer: SphereRenderer,
    hint: '드래그로 회전 · 클릭·Space로 타격 · Shift+클릭·드래그로 pickup 이동',
    controls: [
      { path: 'physical.material', label: '재질', options: Object.entries(SPHERE_MATERIALS).map(([id, material]) => [id, material.name]) },
      { path: 'physical.diameter', label: '지름', min: .25, max: 5, step: .25, format: (v) => `${v.toFixed(2)} m` },
      damping, strength, quality
    ]
  }
};

export const readPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
export const patchPath = (path, value) => path.split('.').reverse().reduce((result, key) => ({ [key]: result }), value);
