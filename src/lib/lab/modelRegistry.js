import { StringModel } from '../models/string/StringModel.js';
import { PlateModel } from '../models/plate/PlateModel.js';
import { SphereModel } from '../models/sphere/SphereModel.js';
import { AntController } from '../agents/ant/AntController.js';

/** Supply a custom registry to Lab to add models without changing its controller. */
export const modelRegistry = {
  string: (options) => new StringModel(options),
  plate: (options) => new PlateModel(options),
  sphere: (options) => new SphereModel(options),
  // Visual-only controller: deliberately receives no AudioEngine.
  ant: ({ state } = {}) => new AntController({ state })
};
