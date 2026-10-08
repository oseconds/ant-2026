import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative as pathRelative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { analyzeSeed, W1_PACKAGE, W1_CHARACTER_PACKAGE } from './ant-w1-analysis.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const DEFAULT_OUTPUT = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic/results';
const SEEDS = [20261005, 20261006, 20261007];
const WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const byId = (a, b) => a.id - b.id;

function components8(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1), components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] >= 0) continue;
    const cells = [start], label = components.length;
    labels[start] = label;
    for (let head = 0; head < cells.length; head += 1) {
      const cell = cells[head], x = cell % width, y = Math.floor(cell / width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && labels[next] < 0) { labels[next] = label; cells.push(next); }
      }
    }
    components.push({ cells });
  }
  return { labels, components };
}

function sortedNumbers(values) { return [...values].sort((a, b) => a - b); }
function episodeView(episode) {
  return { id: episode.id, parentIds: sortedNumbers(episode.parentIds), ancestryIds: sortedNumbers(episode.ancestryIds),
    mergeCount: episode.mergeCount, splitCount: episode.splitCount, birthTimeSeconds: episode.birthTimeSeconds,
    birthFrameIndex: episode.birthFrameIndex, lastActiveTimeSeconds: episode.lastActiveTimeSeconds,
    lastActiveFrameIndex: episode.lastActiveFrameIndex, activeFrameCount: episode.activeFrames.size,
    status: 'right-censored', cellIndices: sortedNumbers(episode.cells.keys()),
    firstAdmissionTimeSecondsByCell: sortedNumbers(episode.cells.keys()).map(cell => episode.cells.get(cell).timeSeconds),
    firstAdmissionFrameByCell: sortedNumbers(episode.cells.keys()).map(cell => episode.cells.get(cell).frameIndex) };
}

function makeEpisode(timeSeconds, frameIndex, records) {
  const e = { id: records.nextId++, parentIds: new Set(), ancestryIds: new Set(), mergeCount: 0, splitCount: 0,
    birthTimeSeconds: timeSeconds, birthFrameIndex: frameIndex, lastActiveTimeSeconds: timeSeconds,
    lastActiveFrameIndex: frameIndex, activeFrames: new Set(), cells: new Map(), redirect: null };
  e.ancestryIds.add(e.id); records.open.set(e.id, e); records.all.set(e.id, e);
  return e;
}
function canonical(episode) { while (episode.redirect) episode = episode.redirect; return episode; }
export function canonicalComponentEpisodeIds(components) { return components.map(component => canonical(component.episode).id); }
export function summarizeComponentLinkage(previousComponentIds, canonicalParents) {
  const ids = canonicalParents.map(parent => parent.id);
  return { previousComponentCount: previousComponentIds.length, distinctCanonicalParentEpisodeIds: sortedNumbers(new Set(ids)),
    distinctCanonicalParentCount: new Set(ids).size };
}
function mergeInto(target, source, open) {
  target = canonical(target); source = canonical(source);
  if (target === source || !open.has(source.id)) return false;
  target.ancestryIds = new Set([...target.ancestryIds, ...source.ancestryIds, target.id, source.id]);
  target.parentIds = new Set([...target.parentIds, ...source.parentIds, target.id, source.id]);
  target.parentIds.delete(target.id);
  target.mergeCount += source.mergeCount; target.splitCount += source.splitCount;
  for (const frame of source.activeFrames) target.activeFrames.add(frame);
  target.birthTimeSeconds = Math.min(target.birthTimeSeconds, source.birthTimeSeconds);
  target.birthFrameIndex = Math.min(target.birthFrameIndex, source.birthFrameIndex);
  for (const [cell, admission] of source.cells) {
    const previous = target.cells.get(cell);
    if (!previous || admission.timeSeconds < previous.timeSeconds) target.cells.set(cell, admission);
  }
  source.redirect = target; open.delete(source.id);
  return true;
}
function finishEpisode(episode, closeTimeSeconds) {
  const durationSeconds = episode.lastActiveTimeSeconds - episode.birthTimeSeconds;
  const status = durationSeconds >= 20 ? 'frozen' : 'discarded';
  const cellIndices = sortedNumbers(episode.cells.keys());
  return { id: episode.id, parentIds: sortedNumbers(episode.parentIds), ancestryIds: sortedNumbers(episode.ancestryIds),
    mergeCount: episode.mergeCount, splitCount: episode.splitCount, birthTimeSeconds: episode.birthTimeSeconds,
    birthFrameIndex: episode.birthFrameIndex, lastActiveTimeSeconds: episode.lastActiveTimeSeconds,
    lastActiveFrameIndex: episode.lastActiveFrameIndex, closeTimeSeconds, persistenceSeconds: durationSeconds,
    activeFrameCount: episode.activeFrames.size, status,
    discardReason: status === 'discarded' ? 'persistence-under-20-seconds' : null, cellIndices,
    firstAdmissionTimeSecondsByCell: cellIndices.map(cell => episode.cells.get(cell).timeSeconds),
    firstAdmissionFrameByCell: cellIndices.map(cell => episode.cells.get(cell).frameIndex) };
}

function actualContactsByCell(feet) {
  assert.ok(Array.isArray(feet), 'foot records must be an array');
  const index = new Map();
  for (const foot of feet) {
    assert.ok(Number.isFinite(foot.timeSeconds) && foot.timeSeconds >= 0, 'finite nonnegative actual-foot time');
    assert.ok(Number.isSafeInteger(foot.cellIndex) && foot.cellIndex >= 0, 'valid actual-foot grid cell');
    assert.ok(Number.isSafeInteger(foot.contactIndex) && foot.contactIndex >= 0, 'valid actual-foot record index');
    assert.equal(typeof foot.antId, 'string', 'stable ant ID');
    if (!index.has(foot.cellIndex)) index.set(foot.cellIndex, []);
    index.get(foot.cellIndex).push({ timeSeconds: foot.timeSeconds, antId: foot.antId, contactIndex: foot.contactIndex });
  }
  for (const events of index.values()) events.sort((a, b) => a.timeSeconds - b.timeSeconds || a.contactIndex - b.contactIndex);
  return index;
}

export function replayContinuity({ frames, flags, feet = [], width = WIDTH, height = HEIGHT }) {
  const cellCount = width * height;
  assert.ok(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0, 'positive safe grid dimensions');
  assert.ok(Array.isArray(frames) && frames.length > 0, 'at least one frame is required');
  assert.equal(flags.length, frames.length * cellCount);
  let previousTime = null;
  for (const [frameIndex, frame] of frames.entries()) {
    assert.ok(Number.isFinite(frame.timeSeconds) && frame.timeSeconds >= 0, `valid time at frame ${frameIndex}`);
    if (previousTime !== null) assert.ok(frame.timeSeconds > previousTime && frame.timeSeconds - previousTime <= 1 + 1 / 60 + 1e-9,
      `valid source interval at frame ${frameIndex}`);
    previousTime = frame.timeSeconds;
  }
  for (const [index, value] of flags.entries()) assert.ok(Number.isInteger(value) && value >= 0 && value <= 7, `valid flags at cell sample ${index}`);
  const original = createW1Crystallizer({ width, height });
  const state = { open: new Map(), all: new Map(), closed: [], discarded: [], nextId: 0 };
  let previousLabels = new Int32Array(cellCount).fill(-1), previousComponents = [];
  let previousActive = new Uint8Array(cellCount), cumulativeGlobalQ = 0, cumulativeGlobalCM = 0;
  const fast = new Float64Array(cellCount), slow = new Float64Array(cellCount);
  let lastTime = null;
  const cumulativeLocalQ = new Uint32Array(cellCount), cumulativeLocalCM = new Uint32Array(cellCount);
  for (const foot of feet) assert.ok(foot.cellIndex < cellCount, 'actual-foot grid cell is inside dimensions');
  const contactIndex = actualContactsByCell(feet), events = [], admissions = [], frameRows = [], frameDetails = [];
  const cellSpells = Array.from({ length: cellCount }, () => ({ start: null, last: null, duration: 0, returns: 0 }));
  let firstHalfShare = null;

  for (const [frameIndex, frame] of frames.entries()) {
    const priorCanonicalIds = previousComponents.map(component => canonical(component.episode).id);
    const frameFlags = flags.subarray(frameIndex * cellCount, (frameIndex + 1) * cellCount);
    const dt = lastTime === null ? 0 : frame.timeSeconds - lastTime;
    const alpha = 1 - Math.exp(-dt / 20), beta = 1 - Math.exp(-dt / 90);
    let qCellCount = 0, cmCellCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      const q = Number((frameFlags[cell] & 7) === 7), cm = Number((frameFlags[cell] & 3) === 3);
      fast[cell] += alpha * (q - fast[cell]); slow[cell] += beta * (q - slow[cell]);
      qCellCount += q; cmCellCount += cm; cumulativeLocalQ[cell] += q; cumulativeLocalCM[cell] += cm;
    }
    cumulativeGlobalQ += qCellCount; cumulativeGlobalCM += cmCellCount;
    const step = original.advance({ timeSeconds: frame.timeSeconds, flags: frameFlags });
    const snapshot = original.getSnapshot();
    const found = components8(snapshot.activeMask, width, height);
    const parentLabelsByComponent = found.components.map(component => {
      const labels = new Set();
      for (const cell of component.cells) if (previousLabels[cell] >= 0) labels.add(previousLabels[cell]);
      return sortedNumbers(labels);
    });
    const descendants = new Map();
    parentLabelsByComponent.forEach((labels, currentLabel) => labels.forEach(label => {
      if (!descendants.has(label)) descendants.set(label, new Set());
      descendants.get(label).add(currentLabel);
    }));
    const splitEvents = [];
    for (const [label, children] of descendants) if (children.size > 1) {
      const episode = canonical(previousComponents[label].episode);
      episode.splitCount += 1;
      splitEvents.push({ frameIndex, timeSeconds: frame.timeSeconds, type: 'split', episodeId: episode.id,
        previousComponentId: label, descendantComponentIds: sortedNumbers(children) });
    }
    events.push(...splitEvents);

    const currentComponents = found.components.map((component, currentComponentId) => {
      const labels = parentLabelsByComponent[currentComponentId];
      const parents = [...new Set(labels.map(label => canonical(previousComponents[label].episode)))].sort(byId);
      let episode = parents[0] ?? makeEpisode(frame.timeSeconds, frameIndex, state);
      if (!parents.length) events.push({ frameIndex, timeSeconds: frame.timeSeconds, type: 'episode_birth', episodeId: episode.id,
        componentId: currentComponentId, cellCount: component.cells.length });
      if (parents.length > 1) for (const other of parents.slice(1)) {
        const absorbed = other.id;
        if (mergeInto(episode, other, state.open)) events.push({ frameIndex, timeSeconds: frame.timeSeconds,
          type: 'merge_absorption', episodeId: episode.id, absorbedEpisodeId: absorbed, componentId: currentComponentId });
      }
      if (labels.length > 1) {
        episode.mergeCount += 1;
        const linkage = summarizeComponentLinkage(labels, parents);
        events.push({ frameIndex, timeSeconds: frame.timeSeconds, type: 'merge', episodeId: episode.id,
          componentId: currentComponentId, previousComponentIds: labels, ...linkage });
      }
      const newCells = [], survivingCells = [];
      for (const cell of component.cells) {
        if (episode.cells.has(cell)) survivingCells.push(cell);
        else {
          episode.cells.set(cell, { timeSeconds: frame.timeSeconds, frameIndex }); newCells.push(cell);
          const past = contactIndex.get(cell) ?? [];
          let lastContact = null;
          for (let i = past.length - 1; i >= 0; i -= 1) if (past[i].timeSeconds <= frame.timeSeconds + 1e-9) { lastContact = past[i]; break; }
          let recent20 = false;
          if (lastContact && frame.timeSeconds - lastContact.timeSeconds <= 20 + 1e-9) recent20 = true;
          const bits = frameFlags[cell] & 7;
          admissions.push({ frameIndex, timeSeconds: frame.timeSeconds, episodeId: episode.id, componentId: currentComponentId,
            cellIndex: cell, qAtAdmission: Number(bits === 7), chemicalAndMechanicalAtAdmission: Number((bits & 3) === 3),
            chemicalAtAdmission: Number((bits & 1) === 1), mechanicalAtAdmission: Number((bits & 2) === 2),
            globalQCellObservationsThroughAdmission: cumulativeGlobalQ,
            globalChemicalMechanicalCellObservationsThroughAdmission: cumulativeGlobalCM,
            localQObservationsThroughAdmission: cumulativeLocalQ[cell],
            localChemicalMechanicalObservationsThroughAdmission: cumulativeLocalCM[cell],
            lastActualPointContactSeconds: lastContact?.timeSeconds ?? null,
            lastActualPointContactAgeSeconds: lastContact ? frame.timeSeconds - lastContact.timeSeconds : null,
            lastActualPointContactAntId: lastContact?.antId ?? null, lastActualPointContactIndex: lastContact?.contactIndex ?? null,
            pointContactPresentInPrior20Seconds: recent20,
            staleSameCellPointContactBeyond20Seconds: Boolean(lastContact && !recent20) });
        }
      }
      episode.lastActiveTimeSeconds = frame.timeSeconds; episode.lastActiveFrameIndex = frameIndex;
      return { cells: component.cells, episode, previousComponentIds: labels, canonicalParentEpisodeIds: parents.map(parent => parent.id),
        processingEpisodeId: episode.id, newCells, survivingCells };
    });
    const activeEpisodes = new Set(currentComponents.map(component => component.episode));
    for (const episode of activeEpisodes) episode.activeFrames.add(frameIndex);
    const closedThisFrame = [], discardedThisFrame = [];
    for (const [id, episode] of [...state.open]) if (!activeEpisodes.has(episode)) {
      state.open.delete(id);
      const result = finishEpisode(episode, frame.timeSeconds);
      (result.status === 'frozen' ? closedThisFrame : discardedThisFrame).push(result);
      (result.status === 'frozen' ? state.closed : state.discarded).push(result);
      events.push({ frameIndex, timeSeconds: frame.timeSeconds, type: result.status === 'frozen' ? 'closure' : 'discard', episodeId: result.id,
        cellCount: result.cellIndices.length, persistenceSeconds: result.persistenceSeconds, ancestryIds: result.ancestryIds });
    }

    const reconstructedLabels = new Int32Array(cellCount).fill(-1);
    currentComponents.forEach((component, label) => component.cells.forEach(cell => { reconstructedLabels[cell] = label; }));
    const reconstructedOpen = [...state.open.values()].sort(byId).map(episodeView);
    assert.deepEqual([...snapshot.activeMask], [...reconstructedLabels].map(label => Number(label >= 0)), `active mask frame ${frameIndex}`);
    assert.equal(currentComponents.length, snapshot.activeComponentCount, `component count frame ${frameIndex}`);
    assert.equal(state.open.size, step.openEpisodeCount, `open count frame ${frameIndex}`);
    assert.deepEqual(reconstructedOpen, [...original.getOpenEpisodes()], `open lineage geometry/admissions/ancestry frame ${frameIndex}`);
    assert.deepEqual(closedThisFrame, [...step.closedEpisodes], `closed episode parity frame ${frameIndex}`);
    assert.deepEqual(discardedThisFrame, [...step.discardedEpisodes], `discarded episode parity frame ${frameIndex}`);

    const overlapEdges = [];
    for (const component of currentComponents) for (const previousComponentId of component.previousComponentIds) {
      let overlapCellCount = 0;
      for (const cell of component.cells) if (previousLabels[cell] === previousComponentId) overlapCellCount += 1;
      const overlapCellIndices = component.cells.filter(cell => previousLabels[cell] === previousComponentId);
      overlapEdges.push({ previousComponentId, previousCanonicalEpisodeId: priorCanonicalIds[previousComponentId],
        componentId: currentComponents.indexOf(component), overlapCellCount, overlapCellIndices,
        currentCanonicalEpisodeId: canonical(component.episode).id,
        sameCanonicalLineage: priorCanonicalIds[previousComponentId] === canonical(component.episode).id });
    }
    const active = snapshot.activeMask;
    const qFalseActiveFilterWitnesses = [];
    for (let cell = 0; cell < cellCount; cell += 1) {
      const predicted = Number(fast[cell] - slow[cell] > alpha - beta);
      assert.equal(predicted, active[cell], `EMA active predicate frame ${frameIndex}, cell ${cell}`);
      if (active[cell] && (frameFlags[cell] & 7) !== 7) qFalseActiveFilterWitnesses.push({ cellIndex: cell,
        fast: fast[cell], slow: slow[cell], activeMargin: fast[cell] - slow[cell] - (alpha - beta) });
    }
    const surviving = [], newlyActive = [], lost = [];
    let activeQTrueCellCount = 0, activeQFalseCellCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      if (previousActive[cell] && active[cell]) surviving.push(cell);
      else if (!previousActive[cell] && active[cell]) newlyActive.push(cell);
      else if (previousActive[cell] && !active[cell]) lost.push(cell);
      const q = Number((frameFlags[cell] & 7) === 7);
      if (active[cell]) { if (q) activeQTrueCellCount += 1; else activeQFalseCellCount += 1; }
    }
    const activeCellCount = snapshot.activeCellCount;
    const largestComponent = [...currentComponents].sort((a, b) => b.cells.length - a.cells.length || a.cells[0] - b.cells[0])[0] ?? null;
    if (firstHalfShare === null && activeCellCount > 0 && largestComponent.cells.length / activeCellCount >= 0.5) {
      firstHalfShare = { frameIndex, timeSeconds: frame.timeSeconds, activeCellCount, componentId: currentComponents.indexOf(largestComponent),
        componentCellCount: largestComponent.cells.length, share: largestComponent.cells.length / activeCellCount };
      events.push({ ...firstHalfShare, type: 'first-largest-component-half-share' });
    }
    const thenCurrentDominant = [...state.open.values()].sort((a, b) => b.cells.size - a.cells.size || a.id - b.id)[0] ?? null;
    const currentCanonicalIds = canonicalComponentEpisodeIds(currentComponents);
    const thenDominantComponentCount = thenCurrentDominant
      ? currentCanonicalIds.filter(id => id === thenCurrentDominant.id).length : 0;
    const componentsPerLineage = new Map();
    for (const [componentIndex] of currentComponents.entries()) {
      const episodeId = currentCanonicalIds[componentIndex];
      componentsPerLineage.set(episodeId, (componentsPerLineage.get(episodeId) ?? 0) + 1);
    }
    const maxDisconnectedSameLineageComponents = Math.max(0, ...componentsPerLineage.values());
    const nodeRows = currentComponents.map((component, componentId) => ({ componentId, cellIndices: component.cells,
      instantaneousArea: component.cells.length, previousComponentIds: component.previousComponentIds,
      overlapEdges: overlapEdges.filter(edge => edge.componentId === componentId), episodeId: currentCanonicalIds[componentId],
      processingEpisodeId: component.processingEpisodeId,
      canonicalParentEpisodeIds: component.canonicalParentEpisodeIds,
      cellFlags: component.cells.map(cell => frameFlags[cell]), qCellIndices: component.cells.filter(cell => (frameFlags[cell] & 7) === 7),
      canonicalLineageCumulativeArea: canonical(component.episode).cells.size, newCells: component.newCells,
      survivingCells: component.survivingCells }));
    const pendingCells = new Set(reconstructedOpen.flatMap(episode => episode.cellIndices));
    const row = { seed: null, frameIndex, timeSeconds: frame.timeSeconds, activeCellCount, activeComponentCount: currentComponents.length,
      activeAreaFraction: activeCellCount / cellCount, pendingCellCount: pendingCells.size,
      cumulativePendingUnionAreaFraction: pendingCells.size / cellCount,
      openEpisodeCount: state.open.size, qCellCount, chemicalAndMechanicalCellCount: cmCellCount,
      cumulativeGlobalQCellObservations: cumulativeGlobalQ,
      cumulativeGlobalChemicalMechanicalCellObservations: cumulativeGlobalCM,
      activeQTrueCellCount, activeQFalseCellCount,
      survivingCellCount: surviving.length, newActiveCellCount: newlyActive.length, lostActiveCellCount: lost.length,
      survivingCellIndices: surviving, newActiveCellIndices: newlyActive, lostActiveCellIndices: lost,
      largestComponentId: largestComponent ? currentComponents.indexOf(largestComponent) : null,
      largestComponentCellCount: largestComponent?.cells.length ?? 0,
      largestComponentShare: activeCellCount ? largestComponent.cells.length / activeCellCount : null,
      thenCurrentCanonicalDominantId: thenCurrentDominant?.id ?? null,
      thenCurrentCanonicalDominantCumulativeArea: thenCurrentDominant?.cells.size ?? 0,
      thenCurrentDominantInstantaneousComponentCount: thenDominantComponentCount,
      maxDisconnectedComponentsOnOneCanonicalLineage: maxDisconnectedSameLineageComponents };
    frameRows.push(row);
    frameDetails.push({ ...row, components: nodeRows, overlapEdges, openLineages: reconstructedOpen,
      qFalseActiveFilterWitnesses,
      closedEpisodes: closedThisFrame, discardedEpisodes: discardedThisFrame });

    for (let cell = 0; cell < cellCount; cell += 1) {
      const spell = cellSpells[cell];
      if (active[cell]) {
        if (spell.start === null) {
          if (spell.last !== null) spell.returns += 1;
          spell.start = frame.timeSeconds;
        }
        spell.last = frame.timeSeconds;
      } else if (spell.start !== null) {
        events.push({ frameIndex, timeSeconds: frame.timeSeconds, type: 'cell-active-spell-end', cellIndex: cell,
          spellStartSeconds: spell.start, lastActiveSeconds: spell.last, observedDurationSeconds: spell.last - spell.start,
          priorCompletedSpells: spell.returns });
        spell.start = null;
      }
    }
    previousLabels = reconstructedLabels; previousComponents = currentComponents; previousActive = Uint8Array.from(active); lastTime = frame.timeSeconds;
  }
  for (const [cell, spell] of cellSpells.entries()) if (spell.start !== null) events.push({ frameIndex: frames.length - 1,
    timeSeconds: frames.at(-1).timeSeconds, type: 'cell-active-spell-right-censored', cellIndex: cell,
    spellStartSeconds: spell.start, lastActiveSeconds: spell.last, observedDurationSeconds: spell.last - spell.start,
    priorCompletedSpells: spell.returns });
  const finalOpen = [...state.open.values()].sort(byId);
  const retrospective = [...finalOpen].sort((a, b) => b.cells.size - a.cells.size || a.id - b.id)[0] ?? null;
  const retrospectiveAncestry = retrospective ? sortedNumbers(retrospective.ancestryIds) : [];
  const cohort = new Set(retrospectiveAncestry);
  let anchorCells = null, firstCohortFrame = null;
  for (const detail of frameDetails) {
    const cohortNodes = detail.components.filter(node => cohort.has(node.episodeId));
    const cohortActiveCells = new Set(cohortNodes.flatMap(node => node.cellIndices));
    if (cohortNodes.length) {
      if (firstCohortFrame === null) firstCohortFrame = detail.frameIndex;
      anchorCells = anchorCells === null ? cohortActiveCells : new Set([...anchorCells].filter(cell => cohortActiveCells.has(cell)));
    }
    detail.retrospectiveFinalCohortEpisodeIds = cohortNodes.map(node => node.episodeId);
    detail.retrospectiveFinalCohortActiveCellCount = cohortActiveCells.size;
    detail.retrospectiveFinalCohortContinuousAnchorCells = anchorCells ? sortedNumbers(anchorCells) : [];
    detail.retrospectiveFinalCohortContinuousAnchorCellCount = anchorCells?.size ?? 0;
    detail.thenCurrentDominantIsRetrospectiveFinalCohort = cohort.has(detail.thenCurrentCanonicalDominantId);
  }
  for (const admission of admissions) {
    admission.retrospectiveFinalCohortMember = cohort.has(admission.episodeId);
    admission.priorSameCellPointContactCount = (contactIndex.get(admission.cellIndex) ?? [])
      .filter(contact => contact.timeSeconds <= admission.timeSeconds + 1e-9).length;
  }
  const checkpoints = [120, 300, 480, 599.25].map(requestedSeconds => {
    const detail = frameDetails.reduce((best, row) => Math.abs(row.timeSeconds - requestedSeconds) < Math.abs(best.timeSeconds - requestedSeconds) ? row : best);
    const qCellIndices = [];
    for (let cell = 0; cell < cellCount; cell += 1) if ((flags[detail.frameIndex * cellCount + cell] & 7) === 7) qCellIndices.push(cell);
    const recentTrafficCellIndices = sortedNumbers(new Set(feet.filter(foot => foot.timeSeconds > detail.timeSeconds - 20 &&
      foot.timeSeconds <= detail.timeSeconds + 1e-9).map(foot => foot.cellIndex)));
    const staleContactCellIndices = qCellIndices.filter(cell => {
      const contacts = contactIndex.get(cell) ?? [];
      for (let i = contacts.length - 1; i >= 0; i -= 1) if (contacts[i].timeSeconds <= detail.timeSeconds + 1e-9)
        return detail.timeSeconds - contacts[i].timeSeconds > 20 + 1e-9;
      return false;
    });
    return { requestedSeconds, sampledSeconds: detail.timeSeconds, frameIndex: detail.frameIndex,
      activeCellIndices: sortedNumbers(detail.components.flatMap(node => node.cellIndices)),
      cumulativePendingCellIndices: sortedNumbers(new Set(detail.openLineages.flatMap(episode => episode.cellIndices))),
      recentTrafficCellIndices, qCellIndices, staleContactCellIndices, staleContactAgeThresholdSeconds: 20 };
  });
  const overlapSamples = frameDetails.flatMap(frame => frame.overlapEdges.map(edge => ({ seed: null, frameIndex: frame.frameIndex,
    timeSeconds: frame.timeSeconds, ...edge })));
  const overlapCounts = overlapSamples.map(edge => edge.overlapCellCount).sort((a, b) => a - b);
  const overlapStats = { count: overlapCounts.length, min: overlapCounts[0] ?? null,
    median: overlapCounts.length ? overlapCounts[Math.floor((overlapCounts.length - 1) / 2)] : null,
    max: overlapCounts.at(-1) ?? null, singleCellCount: overlapCounts.filter(n => n === 1).length,
    firstSingleCellWitness: overlapSamples.find(edge => edge.overlapCellCount === 1) ?? null };
  return { frames: frameRows, frameDetails, events, admissions, checkpoints, firstHalfShare, overlapStats,
    retrospectiveFinalDominant: retrospective ? { id: retrospective.id, cumulativeArea: retrospective.cells.size,
      ancestryIds: retrospectiveAncestry, birthTimeSeconds: retrospective.birthTimeSeconds,
      lastActiveTimeSeconds: retrospective.lastActiveTimeSeconds, activeFrameCount: retrospective.activeFrames.size,
      firstCohortFrame, continuousAnchorCellCountAtEnd: anchorCells?.size ?? 0 } : null,
    finalOpen: finalOpen.map(episodeView), closed: state.closed, discarded: state.discarded,
    closures: [...state.closed, ...state.discarded].sort((a, b) => a.closeTimeSeconds - b.closeTimeSeconds || a.id - b.id) };
}

function csv(rows, columns) {
  const quote = value => {
    if (value === null || value === undefined) return '';
    const text = Array.isArray(value) ? value.join('|') : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(','), ...rows.map(row => columns.map(key => quote(row[key])).join(','))].join('\n') + '\n';
}

function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function describe(values) {
  return values.length ? { count: values.length, min: Math.min(...values), q1: quantile(values, 0.25),
    median: quantile(values, 0.5), q3: quantile(values, 0.75), max: Math.max(...values) }
    : { count: 0, min: null, q1: null, median: null, q3: null, max: null };
}

function spellStats(events, cells = null) {
  const includesCell = row => cells === null || cells.has(row.cellIndex);
  const completed = events.filter(row => row.type === 'cell-active-spell-end' && includesCell(row));
  const rightCensored = events.filter(row => row.type === 'cell-active-spell-right-censored' && includesCell(row));
  return { completedObservedSeconds: describe(completed.map(row => row.observedDurationSeconds)),
    rightCensoredObservedSeconds: describe(rightCensored.map(row => row.observedDurationSeconds)) };
}

function compactFrameDetail({ openLineages, components, qFalseActiveFilterWitnesses, closedEpisodes, discardedEpisodes, ...frame }) {
  return { ...frame,
    components: components.map(({ overlapEdges, cellFlags, qCellIndices, newCells, survivingCells, ...component }) => component),
    openLineages: openLineages.map(lineage => ({ id: lineage.id,
      birthTimeSeconds: lineage.birthTimeSeconds, birthFrameIndex: lineage.birthFrameIndex,
      lastActiveTimeSeconds: lineage.lastActiveTimeSeconds, lastActiveFrameIndex: lineage.lastActiveFrameIndex,
      activeFrameCount: lineage.activeFrameCount, status: lineage.status,
      mergeCount: lineage.mergeCount, splitCount: lineage.splitCount,
      cumulativeArea: lineage.cellIndices.length, ancestryCount: lineage.ancestryIds.length })),
    qFalseActiveFilterWitnessCount: qFalseActiveFilterWitnesses.length,
    qFalseActiveFilterFirstWitness: qFalseActiveFilterWitnesses[0] ?? null };
}

export function summarizeDiagnostics(replay) {
  const final = replay.retrospectiveFinalDominant;
  const cohort = new Set(final?.ancestryIds ?? []);
  const selectedEpisode = replay.finalOpen.find(episode => episode.id === final?.id) ?? null;
  const canonicalRows = [];
  if (selectedEpisode) for (const [offset, cellIndex] of selectedEpisode.cellIndices.entries()) {
    const timeSeconds = selectedEpisode.firstAdmissionTimeSecondsByCell[offset];
    const matches = replay.admissions.filter(row => cohort.has(row.episodeId) && row.cellIndex === cellIndex &&
      Math.abs(row.timeSeconds - timeSeconds) <= 1e-9);
    assert.equal(matches.length, 1, `one raw event must match canonical first admission for cell ${cellIndex}`);
    canonicalRows.push(matches[0]);
  }
  const rawCohortAdmissions = replay.admissions.filter(row => cohort.has(row.episodeId));
  const contactAges = canonicalRows.map(row => row.lastActualPointContactAgeSeconds).filter(Number.isFinite);
  const canonicalCells = new Set(canonicalRows.map(row => row.cellIndex));
  const over20 = contactAges.filter(age => age > 20).length, over90 = contactAges.filter(age => age > 90).length;
  const canonicalAdmissionContacts = { rawCohortAdmissionEventCount: rawCohortAdmissions.length,
    distinctCohortAdmissionCellCount: new Set(rawCohortAdmissions.map(row => row.cellIndex)).size,
    duplicateCohortAdmissionEventCount: rawCohortAdmissions.length - new Set(rawCohortAdmissions.map(row => row.cellIndex)).size,
    canonicalFirstAdmissionCount: canonicalRows.length, canonicalFinalCellCount: selectedEpisode?.cellIndices.length ?? 0,
    canonicalFirstAdmissionTable: canonicalRows.map(row => ({ lineageId: final?.id, sourceAdmissionEpisodeId: row.episodeId,
      cellIndex: row.cellIndex, admissionTimeSeconds: row.timeSeconds,
      lastActualPointContactAgeSeconds: row.lastActualPointContactAgeSeconds,
      lastActualPointContactAntId: row.lastActualPointContactAntId, lastActualPointContactIndex: row.lastActualPointContactIndex,
      priorSameCellPointContactCount: row.priorSameCellPointContactCount, qAtAdmission: row.qAtAdmission,
      chemicalAndMechanicalAtAdmission: row.chemicalAndMechanicalAtAdmission })),
    contactAgeSeconds: describe(contactAges), fractionOlderThan20Seconds: contactAges.length ? over20 / contactAges.length : null,
    countOlderThan20Seconds: over20, fractionOlderThan90Seconds: contactAges.length ? over90 / contactAges.length : null,
    countOlderThan90Seconds: over90,
    qFalseAtAdmissionCount: canonicalRows.filter(row => row.qAtAdmission === 0).length,
    noPriorSameCellContactCount: canonicalRows.filter(row => row.lastActualPointContactAgeSeconds === null).length };

  const milestones = replay.checkpoints.filter(checkpoint => typeof checkpoint.requestedSeconds === 'number').map(checkpoint => {
    const detail = replay.frameDetails[checkpoint.frameIndex];
    const nodes = detail.components.filter(node => cohort.has(node.episodeId));
    const lineages = detail.openLineages.filter(lineage => cohort.has(lineage.id));
    const cumulativeCells = new Set(lineages.flatMap(lineage => lineage.cellIndices));
    const ancestryIds = new Set(lineages.flatMap(lineage => lineage.ancestryIds));
    return { requestedSeconds: checkpoint.requestedSeconds, sampledSeconds: checkpoint.sampledSeconds,
      finalCohortFrameLocalInstantaneousArea: nodes.reduce((sum, node) => sum + node.instantaneousArea, 0),
      finalCohortFrameLocalComponentCount: nodes.length,
      finalCohortThenOpenCumulativeCellArea: cumulativeCells.size, finalCohortThenOpenAncestryCount: ancestryIds.size,
      thenCurrentCanonicalDominantId: detail.thenCurrentCanonicalDominantId,
      thenCurrentCanonicalDominantCumulativeArea: detail.thenCurrentCanonicalDominantCumulativeArea,
      retrospectivelySelectedFinalCumulativeArea: final?.cumulativeArea ?? null,
      retrospectivelySelectedFinalAncestryCount: final?.ancestryIds.length ?? 0 };
  });

  const globalActive = replay.frames.reduce((sum, row) => sum + row.activeCellCount, 0);
  const globalQFalseActive = replay.frames.reduce((sum, row) => sum + row.activeQFalseCellCount, 0);
  let cohortActive = 0, cohortQFalseActive = 0;
  for (const detail of replay.frameDetails) {
    const cohortCells = new Set(detail.components.filter(node => cohort.has(node.episodeId)).flatMap(node => node.cellIndices));
    cohortActive += cohortCells.size;
    cohortQFalseActive += detail.qFalseActiveFilterWitnesses.filter(row => cohortCells.has(row.cellIndex)).length;
  }

  const cohortMergeLabels = replay.events.filter(row => row.type === 'merge' && cohort.has(row.episodeId));
  const sameParentRejoins = cohortMergeLabels.filter(row => row.distinctCanonicalParentCount === 1);
  const distinctParentMerges = cohortMergeLabels.filter(row => row.distinctCanonicalParentCount > 1);
  const absorptions = replay.events.filter(row => row.type === 'merge_absorption' &&
    (cohort.has(row.episodeId) || cohort.has(row.absorbedEpisodeId)));
  const retention = [];
  for (let frameIndex = 1; frameIndex < replay.frameDetails.length; frameIndex += 1) {
    const previous = replay.frameDetails[frameIndex - 1], current = replay.frameDetails[frameIndex];
    for (const node of previous.components.filter(item => cohort.has(item.episodeId))) {
      const retained = current.overlapEdges.filter(edge => edge.previousComponentId === node.componentId &&
        cohort.has(edge.previousCanonicalEpisodeId) && cohort.has(edge.currentCanonicalEpisodeId))
        .reduce((sum, edge) => sum + edge.overlapCellCount, 0);
      retention.push(retained / node.instantaneousArea);
    }
  }
  let earliestAnchorLoss = null;
  for (const detail of replay.frameDetails) {
    if (detail.retrospectiveFinalCohortActiveCellCount > 0 && detail.retrospectiveFinalCohortContinuousAnchorCellCount === 0) {
      const previous = replay.frameDetails[detail.frameIndex - 1];
      earliestAnchorLoss = { frameIndex: detail.frameIndex, timeSeconds: detail.timeSeconds,
        previousAnchorCellCount: previous?.retrospectiveFinalCohortContinuousAnchorCellCount ?? 0,
        previousAnchorCellIndices: previous?.retrospectiveFinalCohortContinuousAnchorCells ?? [],
        currentAnchorCellCount: 0 };
      break;
    }
  }
  const split = replay.events.find(row => row.type === 'split' && cohort.has(row.episodeId));
  const splitFrame = split ? replay.frameDetails[split.frameIndex] : null;
  const splitSharingWitness = split && splitFrame ? { timeSeconds: split.timeSeconds, episodeId: split.episodeId,
    previousComponentId: split.previousComponentId,
    descendants: split.descendantComponentIds.map(componentId => {
      const node = splitFrame.components.find(component => component.componentId === componentId);
      return { componentId, canonicalEpisodeId: node?.episodeId ?? null, cellIndices: node?.cellIndices ?? [] };
    }) } : null;
  const selectedSpellStats = spellStats(replay.events, canonicalCells);
  return { selectedLineage: final ? { id: final.id, cumulativeCellArea: final.cumulativeArea,
    ancestryCount: final.ancestryIds.length, birthTimeSeconds: final.birthTimeSeconds,
    lastActiveTimeSeconds: final.lastActiveTimeSeconds, activeFrameCount: final.activeFrameCount } : null,
    milestoneFrameLocalVsCumulative: milestones,
    qFalseActive: { globalActiveCellSamples: globalActive, globalQFalseActiveCellSamples: globalQFalseActive,
      globalFraction: globalActive ? globalQFalseActive / globalActive : null,
      selectedLineageActiveCellSamples: cohortActive, selectedLineageQFalseActiveCellSamples: cohortQFalseActive,
      selectedLineageFraction: cohortActive ? cohortQFalseActive / cohortActive : null },
    continuity: { disconnectedDescendantFrameCount: replay.frames.filter(row => row.maxDisconnectedComponentsOnOneCanonicalLineage > 1).length,
      selectedLineageDisconnectedDescendantFrameCount: replay.frameDetails.filter(detail => {
        const counts = new Map();
        for (const node of detail.components) if (cohort.has(node.episodeId)) counts.set(node.episodeId, (counts.get(node.episodeId) ?? 0) + 1);
        return [...counts.values()].some(count => count > 1);
      }).length,
      earliestAnchorIntersectionZero: earliestAnchorLoss, consecutiveOverlapRetention: describe(retention),
      splitSharingWitness, cohortMergeLabelEventCount: cohortMergeLabels.length,
      sameParentSiblingRejoinCount: sameParentRejoins.length, distinctParentMergeEventCount: distinctParentMerges.length,
      distinctParentAbsorptionEventCount: absorptions.length, inheritedCanonicalMergeCount: selectedEpisode?.mergeCount ?? 0 },
    activeSpells: { allCells: spellStats(replay.events), selectedLineageCells: selectedSpellStats },
    canonicalFirstAdmissions: canonicalAdmissionContacts };
}

async function run() {
  const outputDir = resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  for (const protectedRoot of [W1_PACKAGE, CHARACTER]) {
    const relative = pathRelative(resolve(protectedRoot), outputDir);
    assert.ok(relative.startsWith('..') && relative !== '.', `output directory must remain outside protected source package ${protectedRoot}`);
  }
  const oldRandom = Math.random;
  Math.random = () => { throw new Error('W1 continuity diagnostic must not consume RNG'); };
  const baseline = JSON.parse(gunzipSync(await readFile(resolve(W1_PACKAGE, 'inputs/baselines/local-accretion-analysis.json.gz'))));
  const previousAnalysis = JSON.parse(gunzipSync(await readFile(resolve(CHARACTER, 'results/analysis.json.gz'))));
  const seedResults = [];
  try {
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, W1_PACKAGE);
      const comparison = baseline.seeds.find(item => item.seed === seed);
      const priorSeed = previousAnalysis.seeds.find(item => item.seed === seed);
      const originalAnalysis = analyzeSeed(input, comparison);
      assert.deepEqual(originalAnalysis, priorSeed, `full committed causal-character seed baseline ${seed}`);
      const replay = replayContinuity({ frames: input.fieldMetadata.frames, flags: input.flags, feet: input.feet });
      assert.deepEqual(replay.closures, [...originalAnalysis.episodes, ...originalAnalysis.discardedEpisodes]
        .map(episode => ({ id: episode.id, parentIds: episode.parentIds, ancestryIds: episode.ancestryIds,
          mergeCount: episode.mergeCount, splitCount: episode.splitCount, birthTimeSeconds: episode.birthTimeSeconds,
          birthFrameIndex: episode.birthFrameIndex, lastActiveTimeSeconds: episode.lastActiveTimeSeconds,
          lastActiveFrameIndex: episode.lastActiveFrameIndex, closeTimeSeconds: episode.closeTimeSeconds,
          persistenceSeconds: episode.persistenceSeconds, activeFrameCount: episode.activeFrameCount,
          status: episode.status, discardReason: episode.discardReason, cellIndices: episode.cellIndices,
          firstAdmissionTimeSecondsByCell: episode.firstAdmissionTimeSecondsByCell,
          firstAdmissionFrameByCell: episode.firstAdmissionFrameByCell }))
          .sort((a, b) => a.closeTimeSeconds - b.closeTimeSeconds || a.id - b.id), `analyzeSeed closure geometry seed ${seed}`);
      for (const [index, row] of originalAnalysis.history.entries()) {
        const diagnostic = replay.frames[index];
        assert.equal(row.activeCells, diagnostic.activeCellCount, `analysis active-cell parity seed ${seed}, frame ${index}`);
        assert.equal(row.activeComponents, diagnostic.activeComponentCount, `analysis component parity seed ${seed}, frame ${index}`);
      }
      const detail = replay.frameDetails;
      for (const row of detail) row.seed = seed;
      for (const row of replay.frames) row.seed = seed;
      for (const row of replay.events) row.seed = seed;
      for (const row of replay.admissions) row.seed = seed;
      for (const row of replay.closures) row.seed = seed;
      for (const row of replay.checkpoints) row.seed = seed;
      if (replay.overlapStats.firstSingleCellWitness) replay.overlapStats.firstSingleCellWitness.seed = seed;
      const milestones = replay.checkpoints.map(checkpoint => {
        const nearest = replay.frames[checkpoint.frameIndex];
        return { ...checkpoint, activeCellCount: nearest.activeCellCount, activeComponentCount: nearest.activeComponentCount,
          largestComponentShare: nearest.largestComponentShare, openEpisodeCount: nearest.openEpisodeCount,
          thenCurrentCanonicalDominantId: nearest.thenCurrentCanonicalDominantId,
          thenCurrentCanonicalDominantCumulativeArea: nearest.thenCurrentCanonicalDominantCumulativeArea,
          retrospectiveFinalDominantId: replay.retrospectiveFinalDominant?.id ?? null,
          retrospectiveFinalDominantCumulativeArea: replay.retrospectiveFinalDominant?.cumulativeArea ?? null };
      });
      if (replay.firstHalfShare) milestones.push({ seed, requestedSeconds: 'first-largest-component-half-share',
        sampledSeconds: replay.firstHalfShare.timeSeconds, frameIndex: replay.firstHalfShare.frameIndex,
        activeCellCount: replay.firstHalfShare.activeCellCount, activeComponentCount: replay.frames[replay.firstHalfShare.frameIndex].activeComponentCount,
        largestComponentShare: replay.firstHalfShare.share });
      seedResults.push({ seed, inputProvenance: input.metadata, parity: { frameCount: replay.frames.length,
        originalAnalysisStatus: originalAnalysis.status, closureCount: replay.closures.length,
        activeMaskAndComponents: true, openAdmissionsAncestryMergeSplit: true, closureDiscardGeometry: true,
        analyzeSeedFullGeometryAndCharacter: true, analyzeSeedHistory: true }, replay, milestones,
        diagnostics: summarizeDiagnostics(replay) });
      process.stdout.write(JSON.stringify({ seed, parity: 'pass', frames: replay.frames.length,
        nodes: replay.frameDetails.reduce((sum, frame) => sum + frame.components.length, 0),
        overlaps: replay.frameDetails.reduce((sum, frame) => sum + frame.overlapEdges.length, 0),
        admissions: replay.admissions.length }) + '\n');
    }
  } finally { Math.random = oldRandom; }
  const allFrames = seedResults.flatMap(seed => seed.replay.frames);
  const allEvents = seedResults.flatMap(seed => seed.replay.events);
  const allAdmissions = seedResults.flatMap(seed => seed.replay.admissions);
  const allMilestones = seedResults.flatMap(seed => seed.milestones);
  const analysis = { schemaVersion: 1, family: 'W1 read-only continuity diagnostic', seeds: seedResults.map(seed => ({
    seed: seed.seed, parity: seed.parity, inputProvenance: seed.inputProvenance,
    frames: seed.replay.frameDetails.map(compactFrameDetail), closures: seed.replay.closures, finalOpen: seed.replay.finalOpen,
    events: seed.replay.events, admissions: seed.replay.admissions, checkpoints: seed.replay.checkpoints,
    milestones: seed.milestones,
    overlapStats: seed.replay.overlapStats, retrospectiveFinalDominant: seed.replay.retrospectiveFinalDominant,
    firstLargestComponentHalfShare: seed.replay.firstHalfShare })) };
  const outputs = {
    'analysis.json.gz': gzipSync(Buffer.from(JSON.stringify(analysis)), { level: 9, mtime: 0 }),
    'frames.csv': Buffer.from(csv(allFrames, ['seed', 'frameIndex', 'timeSeconds', 'activeCellCount', 'activeComponentCount', 'openEpisodeCount',
      'qCellCount', 'cumulativeGlobalQCellObservations', 'survivingCellCount', 'newActiveCellCount', 'lostActiveCellCount',
      'largestComponentId', 'largestComponentCellCount',
      'largestComponentShare', 'thenCurrentCanonicalDominantId', 'thenCurrentCanonicalDominantCumulativeArea',
      'thenCurrentDominantInstantaneousComponentCount', 'maxDisconnectedComponentsOnOneCanonicalLineage',
      'activeQTrueCellCount', 'activeQFalseCellCount', 'activeAreaFraction', 'pendingCellCount', 'cumulativePendingUnionAreaFraction'])),
    'events.csv': Buffer.from(csv(allEvents, ['seed', 'frameIndex', 'timeSeconds', 'type', 'episodeId', 'absorbedEpisodeId', 'componentId',
      'previousComponentId', 'descendantComponentIds', 'previousComponentIds', 'previousComponentCount',
      'distinctCanonicalParentEpisodeIds', 'distinctCanonicalParentCount', 'cellIndex', 'spellStartSeconds', 'lastActiveSeconds',
      'observedDurationSeconds', 'priorCompletedSpells', 'cellCount', 'persistenceSeconds', 'ancestryIds', 'share'])),
    'admissions.csv': Buffer.from(csv(allAdmissions, ['seed', 'frameIndex', 'timeSeconds', 'episodeId', 'componentId', 'cellIndex',
      'globalQCellObservationsThroughAdmission', 'localQObservationsThroughAdmission', 'lastActualPointContactSeconds',
      'lastActualPointContactAgeSeconds', 'lastActualPointContactAntId', 'lastActualPointContactIndex',
      'qAtAdmission', 'chemicalAndMechanicalAtAdmission', 'chemicalAtAdmission', 'mechanicalAtAdmission',
      'globalChemicalMechanicalCellObservationsThroughAdmission', 'localChemicalMechanicalObservationsThroughAdmission',
      'priorSameCellPointContactCount', 'staleSameCellPointContactBeyond20Seconds',
      'pointContactPresentInPrior20Seconds', 'retrospectiveFinalCohortMember'])),
    'milestones.csv': Buffer.from(csv(allMilestones, ['seed', 'requestedSeconds', 'sampledSeconds', 'frameIndex', 'activeCellCount',
      'activeComponentCount', 'largestComponentShare', 'openEpisodeCount', 'thenCurrentCanonicalDominantId',
      'thenCurrentCanonicalDominantCumulativeArea', 'retrospectiveFinalDominantId', 'retrospectiveFinalDominantCumulativeArea']))
  };
  await mkdir(outputDir, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(outputDir, name), bytes);
  const sources = ['scripts/ant-w1-continuity.js', 'scripts/ant-w1-crystallization.js', 'scripts/ant-w1-analysis.js',
    'scripts/ant-w1-inputs.js', 'scripts/ant-w1-character.js', `${CHARACTER}/DESIGN.md`];
  const summary = { schemaVersion: 1, status: 'complete', seedOrder: SEEDS,
    sourceSha256: Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(resolve(path)))]))),
    outputSha256: Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, hash(bytes)])),
    frameCountPerSeed: seedResults.map(seed => ({ seed: seed.seed, frames: seed.replay.frames.length, parity: seed.parity })),
    finalRetrospectiveCohorts: seedResults.map(seed => ({ seed: seed.seed, selection: 'largest final open cumulative cell set; retrospective label only',
      lineage: seed.replay.retrospectiveFinalDominant, thenCurrentDominantRecordedSeparately: true,
      overlapStats: seed.replay.overlapStats, diagnostics: seed.diagnostics })),
    interpretationLimits: ['retrospective cohort labels do not affect causal replay state',
      'foot evidence is rounded point-to-grid-cell mapping, not brush contribution',
      'q support counts stored predicate observations; it does not estimate field contribution',
      'the half-share milestone is descriptive, not a formation threshold'],
    protectedSourceHashesRecorded: true };
  await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();

export const _w1ContinuityTest = { components8, actualContactsByCell, finishEpisode, compactFrameDetail };
