import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';

// Reconstruct columns from actual recorded immutable births. No ANT is run,
// no birth qualification is invoked, and no missing live field is invented.
const source = resolve(process.argv[2] || 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z/continuous-natural-0-600s.json');
const bytes = await readFile(source);
const evidence = JSON.parse(bytes);
const plates = evidence.events.filter(event => event.type === 'plate-birth').map(event => event.payload);
const nodules = evidence.events.filter(event => event.type === 'sphere-birth').map(event => event.payload);
const material = new MaterialStratigraphy();
for (const plate of plates) material.addPlate(plate);
const snapshot = material.getSnapshot(evidence.end.simulationEndMs);
const columns = material.columns;
let maximumCell = 0;
for (let cell = 1; cell < columns.length; cell++) {
  if ((columns[cell]?.length || 0) > (columns[maximumCell]?.length || 0)) maximumCell = cell;
}
const row = Math.floor(maximumCell / 96);
const input = {
  timeSeconds: evidence.end.simulationEndMs / 1000, plates: plates.length,
  counts: Array.from(snapshot.stratigraphy.layerCountByCell),
  top: Array.from(snapshot.stratigraphy.topLayerByCell), nodules,
  row, rowColumns: Array.from({ length: 96 }, (_, x) => columns[row * 96 + x] || []),
  thicknesses: material.plateThicknessMeters,
  maximumCell, maximumStack: columns[maximumCell]?.length || 0
};
const output = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/z-debug');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(data => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 900);
    ctx.fillStyle = '#181818'; ctx.font = '18px sans-serif';
    ctx.fillText(`Recorded ANT stratigraphy · ${data.timeSeconds.toFixed(2)} s · ${data.plates} Plates · ${data.nodules.length} nodules`, 24, 30);
    ctx.font = '13px sans-serif';
    ctx.fillText('Actual frozen birth masks; no reconstructed pheromone or SurfaceField heatmap', 24, 55);
    const panels = [{ x: 60, label: 'Local historical stack · fixed 0–48 grayscale', values: data.counts,
      shade: n => 255 - Math.round(Math.min(48, n) / 48 * 192) },
    { x: 660, label: 'Exposed top Plate · birth-order shade; nodule XY projections', values: data.top,
      shade: n => n < 0 ? 255 : Math.max(40, 225 - n * 4) }];
    for (const panel of panels) {
      ctx.fillStyle = '#181818'; ctx.fillText(panel.label, panel.x, 82);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const value = panel.shade(panel.values[y * 96 + x]);
        ctx.fillStyle = `rgb(${value},${value},${value})`; ctx.fillRect(panel.x + x * 4, 96 + y * 4, 4, 4);
      }
      ctx.strokeStyle = '#b4b4b4'; ctx.lineWidth = 1; ctx.strokeRect(panel.x, 96, 384, 384);
      ctx.strokeStyle = '#646464'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(panel.x, 96 + data.row * 4 + 2); ctx.lineTo(panel.x + 384, 96 + data.row * 4 + 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#282828';
    for (const nodule of data.nodules) {
      ctx.beginPath(); ctx.arc(660 + nodule.position.x * 384, 96 + nodule.position.y * 384, nodule.radius * 384, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.fillStyle = '#181818'; ctx.fillText(`Local Z section at recorded row ${data.row}/95 · maximum stack ${data.maximumStack}`, 60, 524);
    ctx.fillText('Thickness from frozen width; burial from actual later overlap. Age is not a Z coordinate.', 60, 548);
    const x0 = 90, floor = 820, plotWidth = 1020, scale = 240 / .075;
    for (let x = 0; x < 96; x++) {
      let height = 0;
      const column = data.rowColumns[x];
      for (let k = 0; k < column.length; k++) {
        const index = column[k], thickness = data.thicknesses[index], shade = Math.max(40, 225 - index * 4);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x0 + x * plotWidth / 96, floor - (height + thickness) * scale, plotWidth / 96, thickness * scale);
        if (k === column.length - 1) { ctx.strokeStyle = '#181818'; ctx.beginPath(); ctx.moveTo(x0 + x * plotWidth / 96, floor - (height + thickness) * scale); ctx.lineTo(x0 + (x + 1) * plotWidth / 96, floor - (height + thickness) * scale); ctx.stroke(); }
        height += thickness;
      }
    }
    ctx.font = '12px sans-serif'; ctx.strokeStyle = '#b4b4b4';
    for (let i = 0; i <= 3; i++) {
      const z = i * .025, y = floor - z * scale;
      ctx.beginPath(); ctx.moveTo(x0 - 5, y); ctx.lineTo(x0 + plotWidth, y); ctx.stroke();
      ctx.fillStyle = '#181818'; ctx.fillText(`${z.toFixed(3)} m`, 24, y + 4);
    }
    ctx.fillText('world x = 0', x0, 842); ctx.fillText('world x = 1', x0 + plotWidth - 72, 842);
    ctx.fillText('Black top edge = exposed surface. Plate bands remain distinct; nodule circles are XY extent only.', 60, 880);
    return canvas.toDataURL('image/png').split(',')[1];
  }, input);
  await writeFile(resolve(output, 'recorded-600s-local-z.png'), Buffer.from(png, 'base64'));
  await writeFile(resolve(output, 'recorded-600s-local-z.json'), JSON.stringify({ source,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    simulationTimeMs: evidence.end.simulationEndMs, plateIds: plates.map(plate => plate.id),
    plateBirths: plates.map(plate => ({ id: plate.id, timeMs: plate.bornAtSimulationTimeMs })),
    noduleDescriptors: nodules, maximumCell, maximumStack: input.maximumStack,
    sectionRow: row, rowColumns: input.rowColumns, thicknessesMeters: input.thicknesses,
    provenance: 'Columns rebuilt only from actual recorded immutable Plate births; no forced material and no reconstructed live fields. Nodule circles are frozen XY projections, not a calibrated 3D intersection.',
    fixedPlot: { width: 1200, height: 900, zMinimumMeters: 0, zMaximumMeters: .075,
      stackCountRange: [0, 48], grayscale: true }
  }, null, 2));
  console.log(`Recorded Z diagnostic: ${plates.length} Plates; local maximum ${input.maximumStack}; ${output}`);
} finally { await browser.close(); }
