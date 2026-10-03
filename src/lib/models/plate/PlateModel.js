import { WorkletModel } from '../WorkletModel.js';
import { boundedNumber, normalizePoint2 } from '../../utils/state.js';

const QUALITY = new Set(['low', 'normal', 'high']);

export class PlateModel extends WorkletModel {
  constructor(options = {}) {
    super({
      model: 'plate',
      physical: { stiffness: 0.92 },
      excitation: { strength: 0.36, position: { x: 0, y: 0 } },
      pickup: { position: { x: 0.28, y: -0.18 } },
      damping: 0.35,
      quality: 'normal'
    }, {
      ...options,
      processorName: 'plate-processor',
      workletFile: 'plate.worklet.js',
      output: { gain: 0.7 }
    });
  }

  validateState(state) {
    const quality = QUALITY.has(state.quality) ? state.quality : 'normal';
    return {
      ...state,
      model: 'plate',
      physical: {
        ...state.physical,
        stiffness: boundedNumber(state.physical?.stiffness, 0.65, 1.15, 0.92)
      },
      excitation: {
        ...state.excitation,
        strength: boundedNumber(state.excitation?.strength, 0, 1, 0.36),
        position: normalizePoint2(state.excitation?.position, { x: 0, y: 0 })
      },
      pickup: { ...state.pickup, position: normalizePoint2(state.pickup?.position, { x: 0.28, y: -0.18 }) },
      damping: boundedNumber(state.damping, 0, 1, 0.35),
      quality
    };
  }

  processorConfig() {
    return {
      resolution: this.state.quality,
      stiffness: this.state.physical.stiffness,
      damping: this.state.damping * 100,
      pickup: this.state.pickup.position
    };
  }

  async strike({ position = this.state.excitation.position, strength = this.state.excitation.strength } = {}) {
    if (Number(strength) <= 0) {
      this.configure({ excitation: { position, strength: 0 } });
      return false;
    }
    return super.strike({ position, strength });
  }
}

export default PlateModel;
