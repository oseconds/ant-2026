import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const directory = resolve('docs/ant/evidence/2026-10-05-surface-plates');
const source = await readFile('static/worklets/surface-plate.worklet.js', 'utf8');
const natural = JSON.parse(await readFile(resolve(directory, 'long-run-evidence.json'), 'utf8'));
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
try {
  const page = await browser.newPage();
  const report = { timestamp: new Date().toISOString(), sourceSha256: createHash('sha256').update(source).digest('hex'),
    browserVersion: browser.version(),
    method: 'Final processor code in native Chrome JavaScript, fake message port, 12 natural masks; 100 warmup + 400 measured 128-frame calls.',
    limitation: 'Main-thread JS CPU proxy, not AudioWorklet scheduling or measured hardware underruns. Real final-output recording is separate.',
    cases: [] };
  for (const scenario of natural.scenarios) {
    for (const rate of [44100, 48000, 96000]) {
      const result = await page.evaluate(({ source, plates, rate }) => {
        let Processor;
        class Base { constructor() { this.port = { postMessage() {}, onmessage: null }; } }
        new Function('AudioWorkletProcessor', 'sampleRate', 'registerProcessor', source)(Base, rate,
          (_name, implementation) => { Processor = implementation; });
        const processor = new Processor({ processorOptions: { maxPlates: 12 } });
        for (const plate of plates) processor.handleMessage({ type: 'birth', payload: { plate } });
        for (const layer of processor.layerList) layer.previous[0] = -0.015;
        const output = [[new Float32Array(128), new Float32Array(128)]];
        for (let index = 0; index < 100; index++) processor.process([], output);
        const times = [];
        for (let index = 0; index < 400; index++) {
          const start = performance.now(); processor.process([], output); times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        const percentile = p => times[Math.floor((times.length - 1) * p)];
        return { sampleRate: rate, plateCount: processor.layerList.length,
          activeNodes: processor.layerList.reduce((sum, layer) => sum + layer.current.length, 0),
          quantumBudgetMs: 128000 / rate, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: times.at(-1),
          nonFinite: processor.telemetry.nonFinite, preLimiterPeak: processor.telemetry.maxOutputAbs,
          budgetRatioP95: percentile(0.95) / (128000 / rate) };
      }, { source, plates: scenario.plates, rate });
      report.cases.push({ seed: scenario.seed, ...result });
    }
  }
  await writeFile(resolve(directory, 'audio-chrome-cpu-proxy.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.cases.map(item => ({ seed: item.seed, rate: item.sampleRate,
    p95Ms: item.p95Ms, budgetMs: item.quantumBudgetMs, ratio: item.budgetRatioP95 })), null, 2));
} finally { await browser.close(); }
