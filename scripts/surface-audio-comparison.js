import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const directory = resolve(process.argv[2] || 'docs/ant/evidence/2026-10-05-surface-plates');
const rows = [];
for (const name of (await readdir(directory)).filter(name => name.endsWith('.json'))) {
  const metadata = JSON.parse(await readFile(resolve(directory, name), 'utf8'));
  if (!metadata.recording || !metadata.label || metadata.status === 'failed') continue;
  const png = await readFile(resolve(directory, `${metadata.label}-waveform-spectrogram.png`));
  rows.push({ label: metadata.label,
    start: metadata.recording.simulationStartMs / 1000,
    end: metadata.recording.simulationEndMs / 1000,
    ants: `${metadata.recording.activeAntMin}–${metadata.recording.activeAntMax}`,
    plates: `${metadata.platesAtStart.count}→${metadata.platesAtEnd.count}`,
    image: `data:image/png;base64,${png.toString('base64')}` });
}
rows.sort((a, b) => a.start - b.start || a.label.localeCompare(b.label));
if (!rows.length) throw new Error('No validated clip snapshots found.');
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
try {
  const page = await browser.newPage();
  const data = await page.evaluate(async rows => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 90 + rows.length * 648;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#222'; context.font = '22px sans-serif';
    context.fillText('ANT Surface Plate audio · 35% Volume · identical 10 s axes', 16, 28);
    context.font = '15px sans-serif';
    context.fillText('Waveform ±1 · mono average of L/R · FFT 1024 Hann / hop 256 · 0–8 kHz / −100..0 dBFS', 16, 54);
    context.fillText('Absolute shared scales; no clip peak normalization or image contrast normalization.', 16, 76);
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], top = 90 + index * 648;
      const image = new Image(); image.src = row.image; await image.decode();
      context.fillStyle = '#222'; context.font = '17px sans-serif';
      context.fillText(`${row.label} · simulation ${row.start.toFixed(2)}–${row.end.toFixed(2)} s · ants ${row.ants} · plates ${row.plates}`, 16, top + 26);
      context.drawImage(image, 0, top + 38, 1200, 600);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, rows);
  await writeFile(resolve(directory, 'audio-comparison.png'), Buffer.from(data, 'base64'));
  console.log(`Saved ${rows.length} fixed-scale rows to ${resolve(directory, 'audio-comparison.png')}`);
} finally { await browser.close(); }
