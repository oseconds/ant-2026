import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const base = resolve('docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const input = await readFile(resolve(base, 'omitted-history.json'), 'utf8');
const result = JSON.parse(input), cells = result.firstBirthOCells, birthAt = result.summary.firstBirthAt;
const dist = values => {
  const a = [...values].sort((a, b) => a - b);
  return { n: a.length, min: a[0] ?? null, p25: a[Math.floor((a.length - 1) * .25)] ?? null,
    median: a[Math.floor((a.length - 1) * .5)] ?? null, p75: a[Math.floor((a.length - 1) * .75)] ?? null, max: a.at(-1) ?? null };
};
const containing = (cell, key) => cell[key].runs.find(run => run.startAt <= birthAt && run.endAt >= birthAt);
const gaps = [];
for (const cell of cells) {
  const runs = cell.E.runs;
  for (let i = 1; i < runs.length; i++) {
    const from = runs[i - 1].endAt, to = runs[i].startAt;
    const samples = cell.birth.fields.filter(row => row.time > from && row.time < to);
    gaps.push({ cell: cell.cell, from, to, absentSamples: samples.length,
      absentSampleSpanSeconds: samples.length > 1 ? (samples.at(-1).time - samples[0].time) / 1000 : 0,
      memoryMin: Math.min(...samples.map(row => row.B_memory)),
      supportMin: Math.min(...samples.map(row => row.D_support)),
      exactContactEventsBetweenBrackets: cell.birth.exactContacts.timesMs.filter(time => time > from && time <= to).length });
  }
}
const frame = result.componentTimeline.find(row => row.tick === result.summary.firstBirthTick);
const summary = { schema: 'ant-omitted-cohort-summary-v1',
  analysisSha256: createHash('sha256').update(input).digest('hex'), firstBirth: result.summary.firstBirthAt,
  scope: '506 exact first-birth O cells; no added persistence threshold; sampled observations, not continuous proof',
  coverageAtBirth: result.summary.firstBirthCoverage,
  longestHRunSeconds: dist(cells.map(cell => Math.max(...cell.H.runs.map(run => run.sampledDurationMs)) / 1000)),
  longestERunSeconds: dist(cells.map(cell => Math.max(...cell.E.runs.map(run => run.sampledDurationMs)) / 1000)),
  preBirthHRunSeconds: dist(cells.map(cell => (birthAt - containing(cell, 'H').startAt) / 1000)),
  preBirthERunSeconds: dist(cells.map(cell => (birthAt - containing(cell, 'E').startAt) / 1000)),
  preBirthExactFootCount: dist(cells.map(cell => cell.birth.exactContacts.preBirth)),
  preBirthNeighborhoodFootCount: dist(cells.map(cell => cell.birth.neighborhoodContacts.preBirth)),
  exactPreBirthZero: cells.filter(cell => cell.birth.exactContacts.preBirth === 0).length,
  HReturnCells: cells.filter(cell => cell.H.absenceReturnCount > 0).length,
  EReturnCells: cells.filter(cell => cell.E.absenceReturnCount > 0).length,
  EReturnGaps: gaps,
  newLaterI: cells.filter(cell => cell.birth.laterIFirstAt !== null).length,
  alreadyFrozenAtBirth: cells.filter(cell => cell.birth.alreadyInFrozenBirthUnionAtBirth).length,
  newLaterFrozen: cells.filter(cell => cell.birth.laterNewFrozenCoverageFirstAt !== null).length,
  neverFrozenByLastAnalysis: cells.filter(cell => !cell.birth.alreadyInFrozenBirthUnionAtBirth && cell.birth.laterNewFrozenCoverageFirstAt === null).length,
  componentSummary: Object.fromEntries(['production8', 'diagonalGuard'].map(key => [key, frame[key].map(c => ({
    size: c.size, bbox: c.bbox, attachmentsToI: c.attachmentsToI,
    attachmentGroupsOnI: c.attachmentGroupsOnI, HEndpoints: c.fullHDegree1Endpoints,
    cycleRank: c.cycleRank }))])) };
assert.equal(summary.alreadyFrozenAtBirth + summary.newLaterFrozen + summary.neverFrozenByLastAnalysis, 506);
await writeFile(resolve(base, 'omitted-cohort-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const { EReturnGaps, componentSummary, ...brief } = summary;
console.log(JSON.stringify({ ...brief, EReturnGaps: { count: gaps.length,
  absentSpan: dist(gaps.map(g => g.absentSampleSpanSeconds)),
  memoryMinimum: dist(gaps.map(g => g.memoryMin)), contactsInGaps: gaps.reduce((n, g) => n + g.exactContactEventsBetweenBrackets, 0) } }, null, 2));
