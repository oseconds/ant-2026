import { StringModel } from '../models/string/StringModel.js';
import { PlateModel } from '../models/plate/PlateModel.js';
import { SphereModel } from '../models/sphere/SphereModel.js';
import { AntController } from '../agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../audio/AntEnvironmentAudioBridge.js';

/** Supply a custom registry to Lab to add models without changing its controller. */
export const modelRegistry = {
  string: (options) => new StringModel(options),
  plate: (options) => new PlateModel(options),
  sphere: (options) => new SphereModel(options),
  // ANT observes movement; its optional transport shares the existing engine.
  ant: ({ state, audioEngine, workletBaseUrl, zCouplingEnabled = true, residentPlateLimit = null } = {}) => new AntController({ state,
    audioBridge: audioEngine ? new AntEnvironmentAudioBridge({ audioEngine, workletBaseUrl, zCouplingEnabled, residentPlateLimit }) : null })
};
