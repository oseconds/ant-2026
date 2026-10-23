const TAU = Math.PI * 2;

import { describeSnapshot } from './ant-recruitment-descriptors.js';

export { describeSnapshot };

export function describeMaterial(snapshot, previous = null) {
  const { stratigraphy, layers, plates = [] } = snapshot;
  const mask = new Uint8Array(stratigraphy.topLayerByCell.length);
  let area = 0, depthTotal = 0, maxColumn = 0;
  for (let i = 0; i < mask.length; i += 1) {
    const n = stratigraphy.layerCountByCell[i];
    if (n) { mask[i] = 1; area += 1; depthTotal += stratigraphy.totalDepthByCellMeters[i]; }
    if (n > maxColumn) maxColumn = n;
  }
  const ids = plates.map(plate => plate.id);
  const oldIds = previous?.plateIds || new Set();
  const births = ids.filter(id => !oldIds.has(id));
  let unionOverlap = 0, topChangedCells = null;
  if (previous?.mask?.length === mask.length) {
    for (let i = 0; i < mask.length; i += 1) unionOverlap += mask[i] && previous.mask[i] ? 1 : 0;
  }
  if (previous?.topLayerByCell?.length === stratigraphy.topLayerByCell.length) {
    topChangedCells = 0;
    for (let i = 0; i < stratigraphy.topLayerByCell.length; i += 1) {
      if (stratigraphy.topLayerByCell[i] !== previous.topLayerByCell[i]) topChangedCells += 1;
    }
  }
  return { descriptor: { plateCount: plates.length, noduleCount: snapshot.nodules?.length || 0,
    unionAreaFraction: area / Math.max(1, mask.length), unionAreaChangeCells: previous ? area - previous.area : area,
    plateBirthsSincePrevious: births.length,
    meanColumnLayers: area ? Array.from(stratigraphy.layerCountByCell).reduce((a, b) => a + b, 0) / area : 0,
    maxColumnLayers: maxColumn, meanDepthMeters: area ? depthTotal / area : 0,
    exposedTopAreaCells: layers?.exposedCellCount ?? 0,
    buriedLayerCells: layers?.buriedLayerCellCount ?? 0,
    unionMaskRetention: previous ? unionOverlap / Math.max(1, area) : null,
    topIdentityChangedCells: topChangedCells },
    next: { mask, area, plateIds: new Set(ids), topLayerByCell: new Int32Array(stratigraphy.topLayerByCell) } };
}
