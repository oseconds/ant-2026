import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-commit-slot-ambiguity-audit');
const DUAL = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow');
process.env.ANT_REVIEW_OUTPUT = OUT;
const review = await import('./ant-b-vs-c-author-review.js');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const objective = JSON.parse(await readFile(resolve(OUT, 'analysis/objective-slots.json'), 'utf8'));
const bySeed = new Map();
for (const item of objective.cases.filter(row => row.status === 'selected')) {
  const row = item.selected;
  if (!bySeed.has(row.seed)) bySeed.set(row.seed, new Map());
  if (!bySeed.get(row.seed).has(row.anchorIndex)) bySeed.get(row.seed).set(row.anchorIndex,
    { anchorIndex: row.anchorIndex, slotCaseIds: [] });
  bySeed.get(row.seed).get(row.anchorIndex).slotCaseIds.push(item.id);
}
const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
const thinning = review.productionThinning(sourceText);
const { server, browser, page, errors } = await review.makeBrowser();
const frameMeta = new Map(), replayRows = [];
try {
  for (const [seed, targetMap] of [...bySeed].sort(([a], [b]) => a.localeCompare(b))) {
    const targets = [...targetMap.values()].sort((a, b) => a.anchorIndex - b.anchorIndex);
    const replay = await review.replaySeed(seed, targets, thinning, page, frameMeta);
    assert.equal(replay.anchorsCompared, 599, `${seed}: all frozen world boundaries replayed and compared`);
    assert.equal(replay.selectedFrames, targets.length, `${seed}: only objective frames rendered`);
    replayRows.push({ ...replay, requestedAnchors: targets.map(row => ({ ...row,
      timeMs: frameMeta.get(`${seed}:${row.anchorIndex}`).timeMs })) });
  }
  assert.deepEqual(errors, [], 'native renderer has no browser errors');
} finally {
  await page.evaluate(() => window.__reviewRenderer?.destroy());
  await browser.close();
  await server.close();
}

const frames = [...frameMeta.values()].sort((a, b) => a.seed.localeCompare(b.seed) || a.anchorIndex - b.anchorIndex)
  .map(row => ({ seed: row.seed, anchorIndex: row.anchorIndex, timeMs: row.timeMs,
    file: row.worldFile, sha256: row.worldSha256, bytes: row.bytes, antCount: row.antCount,
    savedWorldAnchorSha256: row.savedWorldAnchorSha256, birthIds: row.birthIds }));
const exactOldFrame = frames.find(row => row.seed === '20261005' && row.anchorIndex === 42);
if (exactOldFrame) {
  const old = JSON.parse(await readFile(resolve(DUAL, 'analysis/objective-frame-receipts.json'), 'utf8'))
    .frames.find(row => row.seed === exactOldFrame.seed && row.anchorIndex === exactOldFrame.anchorIndex);
  assert.equal(exactOldFrame.sha256, old.worldSha256, 'replay reproduces the already-saved exact world-frame PNG');
  assert.equal(exactOldFrame.timeMs, old.timeMs);
}
await mkdir(resolve(OUT, 'analysis'), { recursive: true });
await writeFile(resolve(OUT, 'analysis/render-replay-validation.json'), JSON.stringify({
  schema: 'ant-bc-commit-slot-objective-frame-replay-v1',
  purpose: 'Render selected objective slot frames from the same frozen production histories; no new seed, parameter, or causal history.',
  method: 'Source-conformant 60 Hz deterministic replay; compare E/F/B/C/D, material layer/top/birth maps, birth IDs, and final RNG state against the existing 599-boundary frozen packet before accepting a frame.',
  productionAuthority: 'bc045dc3caa5954df633ecbee37fbabcb8224f30',
  newNaturalTrajectory: false, allSavedBoundariesCompared: true, observerRngCalls: 0,
  renderer: 'Native AntRenderer 720x720; material on; pheromone overlay off; debug overlays off.',
  replay: replayRows, frames,
  exactPreviousFrameReproduced: exactOldFrame ? { seed: exactOldFrame.seed, anchorIndex: exactOldFrame.anchorIndex,
    sha256: exactOldFrame.sha256 } : null,
  browserErrors: errors
}, null, 2) + '\n');
console.log(JSON.stringify({ complete: true, replay: replayRows.map(row => ({ seed: row.seed,
  anchorsCompared: row.anchorsCompared, frames: row.selectedFrames, rngCalls: row.rngCalls, rngState: row.rngState })),
frames: frames.map(({ seed, anchorIndex, timeMs, sha256, antCount }) => ({ seed, anchorIndex, timeMs, sha256, antCount })) }));
