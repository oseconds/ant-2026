import { WorkletModel } from '../WorkletModel.js';
import { boundedNumber, normalizePoint3 } from '../../utils/state.js';
import { SPHERE_MATERIALS, sphereMaterial } from './materials.js';

const DEFAULT_STATE = {
  model: 'sphere',
  physical: { diameter: 2, material: 'stainless304' },
  excitation: { strength: .62, position: { x: 0, y: 0, z: 1 } },
  pickup: { position: { x: .72, y: .12, z: .684 } },
  damping: .34,
  quality: 'normal'
};
const QUALITIES = new Set(['low', 'normal', 'high']);

/** Solid elastic sphere modal model. State contains only serializable parameters. */
export class SphereModel extends WorkletModel {
  constructor(options = {}) {
    super(DEFAULT_STATE, {
      ...options,
      processorName: 'sphere-processor',
      workletFile: 'sphere.worklet.js',
      output: { gain: .85 }
    });
  }

  validateState(state) {
    const material = Object.hasOwn(SPHERE_MATERIALS, state.physical?.material) ? state.physical.material : 'stainless304';
    return {
      ...state,
      model: 'sphere',
      physical: { ...state.physical, diameter: boundedNumber(state.physical?.diameter, .25, 5, 2), material },
      excitation: {
        ...state.excitation,
        strength: boundedNumber(state.excitation?.strength, 0, 1, .62),
        position: normalizePoint3(state.excitation?.position, { x: 0, y: 0, z: 1 })
      },
      pickup: { ...state.pickup, position: normalizePoint3(state.pickup?.position, DEFAULT_STATE.pickup.position) },
      damping: boundedNumber(state.damping, 0, 1, .34),
      quality: QUALITIES.has(state.quality) ? state.quality : 'normal'
    };
  }

  processorConfig() {
    const material = sphereMaterial(this.state.physical.material);
    return {
      quality: this.state.quality,
      diameter: this.state.physical.diameter,
      material: { name: material.name, density: material.density, youngModulus: material.youngModulus, poisson: material.poisson },
      damping: this.state.damping * 100,
      strength: this.state.excitation.strength * 100,
      pickup: this.state.pickup.position
    };
  }

  setPickup(position) { this.configure({ pickup: { position } }); }

}

export { SPHERE_MATERIALS } from './materials.js';
export default SphereModel;
