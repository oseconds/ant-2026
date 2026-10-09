import assert from 'node:assert/strict';

const PERSISTENCE_SECONDS = 20;
const MAX_GAP_SECONDS = 1 + 1 / 60 + 1e-9;
const QUALIFICATION_BITS = [1, 2, 4];

export function createW1SupportedSpellObserver({ width, height }) {
  assert.ok(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0,
    'positive safe grid dimensions');
  const cellCount = width * height;
  assert.ok(Number.isSafeInteger(cellCount), 'safe grid cell count');
  const startFrames = new Int32Array(cellCount).fill(-1), startTimes = new Float64Array(cellCount);
  const lastSupportedFrames = new Int32Array(cellCount).fill(-1), lastSupportedTimes = new Float64Array(cellCount);
  const previousQ = new Uint8Array(cellCount), previousActive = new Uint8Array(cellCount);
  const startedWithActiveCarryover = new Uint8Array(cellCount);
  const startOwners = new Int32Array(cellCount).fill(-1), lastOwners = new Int32Array(cellCount).fill(-1);
  const ownerHistory = Array.from({ length: cellCount }, () => null);
  const materialized = new Uint8Array(cellCount), terminatedSpells = [], events = [];
  let lastFrameIndex = -1, lastTimeSeconds = -Infinity;

  function advance({ frameIndex, timeSeconds, flags, activeMask, activeOwners,
    id0HistoricalCellIndices = [], id0Alive = false }) {
    assert.ok(Number.isSafeInteger(frameIndex) && frameIndex === lastFrameIndex + 1, 'contiguous frame index');
    assert.ok(Number.isFinite(timeSeconds) && timeSeconds >= 0 && timeSeconds > lastTimeSeconds &&
      (lastFrameIndex < 0 || timeSeconds - lastTimeSeconds <= MAX_GAP_SECONDS), 'increasing adjacent observation time');
    validateMask(flags, 'flags', value => Number.isInteger(value) && value >= 0 && value <= 7);
    validateMask(activeMask, 'activeMask', value => value === 0 || value === 1);
    assert.ok(Array.isArray(activeOwners), 'activeOwners must be an array');
    assert.ok(typeof id0Alive === 'boolean', 'id0Alive must be boolean');
    const id0History = validateCells(id0HistoricalCellIndices, 'ID 0 historical');
    const ownerByCell = new Int32Array(cellCount).fill(-1);
    for (const owner of activeOwners) {
      assert.ok(Number.isSafeInteger(owner.identityId) && owner.identityId >= 0, 'valid active owner ID');
      for (const cell of validateCells(owner.cellIndices, `active owner ${owner.identityId}`)) {
        assert.equal(activeMask[cell], 1, `owned cell ${cell} is active`);
        assert.equal(ownerByCell[cell], -1, `active cell ${cell} has one owner`);
        ownerByCell[cell] = owner.identityId;
      }
    }
    for (let cell = 0; cell < cellCount; cell += 1)
      assert.equal(ownerByCell[cell] >= 0 ? 1 : 0, activeMask[cell], `active cell ${cell} has one identity`);

    const q = new Uint8Array(cellCount), currentTerminations = [], eligibleCells = [];
    for (let cell = 0; cell < cellCount; cell += 1) {
      q[cell] = Number((flags[cell] & 7) === 7);
      if (q[cell] && activeMask[cell]) {
        if (startFrames[cell] < 0) {
          startFrames[cell] = frameIndex; startTimes[cell] = timeSeconds;
          startedWithActiveCarryover[cell] = Number(frameIndex > 0 && !previousQ[cell] && previousActive[cell]);
          startOwners[cell] = ownerByCell[cell];
          ownerHistory[cell] = new Set();
        }
        lastSupportedFrames[cell] = frameIndex; lastSupportedTimes[cell] = timeSeconds;
        lastOwners[cell] = ownerByCell[cell]; ownerHistory[cell].add(ownerByCell[cell]);
      } else if (startFrames[cell] >= 0) {
        const reason = !q[cell] ? (activeMask[cell] ? 'q-off' : 'both') : 'active-off';
        const observedDurationSeconds = lastSupportedTimes[cell] - startTimes[cell];
        const identityIds = [...ownerHistory[cell]].sort((a, b) => a - b);
        const spell = Object.freeze({ cellIndex: cell,
          startFrameIndex: startFrames[cell], startTimeSeconds: startTimes[cell],
          lastSupportedFrameIndex: lastSupportedFrames[cell], lastSupportedTimeSeconds: lastSupportedTimes[cell],
          terminationFrameIndex: frameIndex, terminationTimeSeconds: timeSeconds, observedDurationSeconds,
          eligible: observedDurationSeconds >= PERSISTENCE_SECONDS, terminationReason: reason,
          qAtTermination: Boolean(q[cell]), activeAtTermination: Boolean(activeMask[cell]),
          missingQualificationBits: Object.freeze(QUALIFICATION_BITS.filter(bit => !(flags[cell] & bit))),
          contactQualificationMissingAtTermination: !(flags[cell] & 4),
          activeCarryoverAtTermination: reason === 'q-off' && Boolean(activeMask[cell]),
          startedWithActiveCarryover: Boolean(startedWithActiveCarryover[cell]),
          startOwnerEpisodeId: startOwners[cell], lastSupportedOwnerEpisodeId: lastOwners[cell],
          ownerAtTerminationEpisodeId: ownerByCell[cell] >= 0 ? ownerByCell[cell] : null,
          relatedEpisodeIds: Object.freeze(identityIds) });
        terminatedSpells.push(spell); currentTerminations.push(spell);
        if (spell.eligible) eligibleCells.push(cell);
        startFrames[cell] = -1; lastSupportedFrames[cell] = -1;
        startTimes[cell] = 0; lastSupportedTimes[cell] = 0;
        startedWithActiveCarryover[cell] = 0; startOwners[cell] = -1; lastOwners[cell] = -1;
        ownerHistory[cell] = null;
      }
      previousQ[cell] = q[cell]; previousActive[cell] = activeMask[cell];
    }

    const spellsByCell = new Map(currentTerminations.map(spell => [spell.cellIndex, spell]));
    const currentEvents = [];
    for (const cells of components8(eligibleCells, width, height)) {
      const newCellIndices = cells.filter(cell => !materialized[cell]);
      const overlapCellIndices = cells.filter(cell => materialized[cell]);
      const cellSpells = cells.map(cell => spellsByCell.get(cell));
      const reasonCounts = { 'q-off': 0, 'active-off': 0, both: 0 };
      const relatedEpisodeIds = new Set(), id0RelatedCellIndices = [], terminationEpisodeIds = new Set();
      for (const spell of cellSpells) {
        reasonCounts[spell.terminationReason] += 1;
        for (const id of spell.relatedEpisodeIds) relatedEpisodeIds.add(id);
        if (spell.relatedEpisodeIds.includes(0)) id0RelatedCellIndices.push(spell.cellIndex);
        if (spell.ownerAtTerminationEpisodeId !== null) terminationEpisodeIds.add(spell.ownerAtTerminationEpisodeId);
      }
      const event = Object.freeze({ eventId: events.length, frameIndex, timeSeconds, cellIndices: Object.freeze(cells),
        size: cells.length, newCellIndices: Object.freeze(newCellIndices), overlapCellIndices: Object.freeze(overlapCellIndices),
        newCellCount: newCellIndices.length, overlapCellCount: overlapCellIndices.length,
        terminationReasonCounts: Object.freeze(Object.fromEntries(Object.entries(reasonCounts).filter(([, count]) => count > 0))),
        relatedEpisodeIds: Object.freeze([...relatedEpisodeIds].sort((a, b) => a - b)),
        terminationEpisodeIds: Object.freeze([...terminationEpisodeIds].sort((a, b) => a - b)),
        id0RelatedCellIndices: Object.freeze(id0RelatedCellIndices),
        id0HistoricalOverlapCellIndices: Object.freeze(cells.filter(cell => id0History.has(cell))),
        id0AliveAtCompletion: id0Alive });
      currentEvents.push(event); events.push(event);
      for (const cell of cells) materialized[cell] = 1;
    }
    lastFrameIndex = frameIndex; lastTimeSeconds = timeSeconds;
    return Object.freeze({ frameIndex, timeSeconds, terminatedSpells: Object.freeze(currentTerminations),
      events: Object.freeze(currentEvents) });
  }

  function validateMask(values, label, predicate) {
    assert.ok((Array.isArray(values) || ArrayBuffer.isView(values)) && !(values instanceof DataView) &&
      values.length === cellCount, `${label} length must equal width * height (${cellCount})`);
    for (let i = 0; i < cellCount; i += 1) assert.ok(predicate(values[i]), `${label} value at cell ${i}`);
  }

  function validateCells(cells, label) {
    assert.ok(Array.isArray(cells) || ArrayBuffer.isView(cells), `${label} cells must be an array`);
    const unique = new Set();
    for (const cell of cells) {
      assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < cellCount, `${label} cell is in grid`);
      assert.ok(!unique.has(cell), `${label} cells are unique`); unique.add(cell);
    }
    return unique;
  }

  function snapshot() {
    const pendingSpells = [];
    for (let cell = 0; cell < cellCount; cell += 1) if (startFrames[cell] >= 0) {
      const observedDurationSeconds = lastSupportedTimes[cell] - startTimes[cell];
      pendingSpells.push({ cellIndex: cell, startFrameIndex: startFrames[cell], startTimeSeconds: startTimes[cell],
        lastSupportedFrameIndex: lastSupportedFrames[cell], lastSupportedTimeSeconds: lastSupportedTimes[cell],
        observedDurationSeconds, eligibleAtCutoff: observedDurationSeconds >= PERSISTENCE_SECONDS,
        relatedEpisodeIds: [...ownerHistory[cell]].sort((a, b) => a - b) });
    }
    return { lastFrameIndex, lastTimeSeconds, persistenceSeconds: PERSISTENCE_SECONDS,
      terminatedSpells: [...terminatedSpells], events: [...events], pendingSpells,
      materializedCellIndices: Array.from(materialized, (value, cell) => value ? cell : -1).filter(cell => cell >= 0) };
  }

  return Object.freeze({ advance, snapshot });
}

function components8(cells, width, height) {
  const mask = new Uint8Array(width * height);
  for (const cell of cells) mask[cell] = 1;
  const seen = new Uint8Array(mask.length), components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    const cells = [start];
    for (let head = 0; head < cells.length; head += 1) {
      const cell = cells[head], x = cell % width, y = Math.floor(cell / width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; cells.push(next); }
      }
    }
    cells.sort((a, b) => a - b); components.push(cells);
  }
  return components;
}
