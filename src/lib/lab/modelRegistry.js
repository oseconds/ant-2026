import { StringModel } from '../models/string/StringModel.js';
import { PlateModel } from '../models/plate/PlateModel.js';
import { SphereModel } from '../models/sphere/SphereModel.js';

/** Supply a custom registry to Lab to add models without changing its controller. */
export const modelRegistry = {
  string: (options) => new StringModel(options),
  plate: (options) => new PlateModel(options),
  sphere: (options) => new SphereModel(options)
};
