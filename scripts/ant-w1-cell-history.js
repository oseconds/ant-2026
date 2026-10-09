import assert from 'node:assert/strict';

function validId(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative safe integer`);
}

export function createW1CellHistoryObserver({ width, height, feet = [] }) {
  assert.ok(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0,
    'positive safe grid dimensions');
  const cellCount = width * height;
  assert.ok(Number.isSafeInteger(cellCount), 'safe grid cell count');
  assert.ok(Array.isArray(feet), 'feet must be an array');
  const contacts = Array.from({ length: cellCount }, () => []);
  for (const foot of feet) {
    assert.ok(Number.isFinite(foot.timeSeconds) && foot.timeSeconds >= 0, 'finite nonnegative foot time');
    assert.ok(Number.isSafeInteger(foot.cellIndex) && foot.cellIndex >= 0 && foot.cellIndex < cellCount, 'valid foot cell');
    assert.ok(Number.isSafeInteger(foot.contactIndex) && foot.contactIndex >= 0, 'valid foot contact index');
    contacts[foot.cellIndex].push({ timeSeconds: foot.timeSeconds, contactIndex: foot.contactIndex,
      antId: foot.antId ?? null });
  }
  for (const rows of contacts) rows.sort((a, b) => a.timeSeconds - b.timeSeconds || a.contactIndex - b.contactIndex);

  const identities = new Map(), frames = [], merges = [];
  let lastFrameIndex = -1, lastTimeSeconds = -Infinity;
  let currentActiveOwners = new Map();

  function identity(id) {
    validId(id, 'identity ID');
    if (!identities.has(id)) identities.set(id, { id, cells: new Map(), redirect: null, componentCellObservations: 0,
      repeatedExistingUnionCellObservations: 0, mergeCount: 0 });
    return identities.get(id);
  }
  function canonical(id) {
    let record = identity(id);
    while (record.redirect !== null) record = identity(record.redirect);
    return record;
  }
  function validateCells(cells, label) {
    assert.ok(Array.isArray(cells), `${label} cells must be an array`);
    const unique = new Set();
    for (const cell of cells) {
      assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < cellCount, `${label} cell is in grid`);
      assert.ok(!unique.has(cell), `${label} cells are unique`);
      unique.add(cell);
    }
    return unique;
  }

  function advance({ frameIndex, timeSeconds, flags, operations, activeOwners }) {
    assert.ok(Number.isSafeInteger(frameIndex) && frameIndex === lastFrameIndex + 1, 'contiguous frame index');
    assert.ok(Number.isFinite(timeSeconds) && timeSeconds >= 0 && timeSeconds > lastTimeSeconds, 'increasing finite frame time');
    assert.ok(flags && flags.length === cellCount, 'one qualification flag per grid cell');
    for (const [cell, value] of Array.from(flags).entries())
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 7, `qualification flags at cell ${cell}`);
    assert.ok(Array.isArray(operations) && Array.isArray(activeOwners), 'operations and active owners must be arrays');

    const active = new Uint8Array(cellCount), ownerByCell = new Uint8Array(cellCount);
    const owners = new Map(), admissionCells = [];
    for (const owner of activeOwners) {
      const id = canonical(owner.identityId).id;
      const cells = validateCells(owner.cells, `active owner ${id}`);
      if (!owners.has(id)) owners.set(id, new Set());
      for (const cell of cells) {
        assert.equal(ownerByCell[cell], 0, `active cell ${cell} has one owner`);
        ownerByCell[cell] = 1;
        owners.get(id).add(cell);
        active[cell] = 1;
      }
    }

    const frameMerges = [];
    for (const operation of operations) {
      if (operation.type === 'merge') {
        validId(operation.targetId, 'merge target ID'); validId(operation.sourceId, 'merge source ID');
        let target = canonical(operation.targetId), source = canonical(operation.sourceId);
        assert.notEqual(target, source, 'cannot merge identity into itself');
        assert.equal(source.id, operation.sourceId, 'merge source must still be canonical');
        assert.equal(target.id, operation.targetId, 'merge target must be canonical');
        const targetBefore = new Set(target.cells.keys()), sourceCells = [...source.cells.keys()];
        const transferred = [], overlap = [];
        for (const [cell, sourceRow] of source.cells) {
          let targetRow = target.cells.get(cell);
          if (!targetRow) {
            targetRow = { cellIndex: cell, canonicalFirstAdmissionFrame: sourceRow.canonicalFirstAdmissionFrame,
              canonicalFirstAdmissionTimeSeconds: sourceRow.canonicalFirstAdmissionTimeSeconds,
              firstUnionEntryFrame: frameIndex, firstUnionEntryRoute: 'inherited', firstDirectHereFrame: null,
              firstImportHereFrame: frameIndex, directHere: false, inheritedHere: true,
              directSourceIds: new Set(sourceRow.directSourceIds), inheritedSourceIds: new Set([source.id, ...sourceRow.inheritedSourceIds]),
              actualMergeSourceIds: new Set([source.id, ...sourceRow.actualMergeSourceIds]), ambiguousAdmission: false,
              activeFrames: new Set(sourceRow.activeFrames), directExposureFrames: new Set() };
            target.cells.set(cell, targetRow); transferred.push(cell);
          } else {
            overlap.push(cell);
            if (sourceRow.canonicalFirstAdmissionFrame === targetRow.canonicalFirstAdmissionFrame)
              targetRow.ambiguousAdmission = true;
            targetRow.canonicalFirstAdmissionFrame = Math.min(targetRow.canonicalFirstAdmissionFrame, sourceRow.canonicalFirstAdmissionFrame);
            targetRow.canonicalFirstAdmissionTimeSeconds = Math.min(targetRow.canonicalFirstAdmissionTimeSeconds, sourceRow.canonicalFirstAdmissionTimeSeconds);
            targetRow.inheritedHere = true;
            targetRow.firstImportHereFrame ??= frameIndex;
            for (const id of sourceRow.directSourceIds) targetRow.directSourceIds.add(id);
            for (const id of sourceRow.inheritedSourceIds) targetRow.inheritedSourceIds.add(id);
            targetRow.inheritedSourceIds.add(source.id);
            for (const id of sourceRow.actualMergeSourceIds) targetRow.actualMergeSourceIds.add(id);
            targetRow.actualMergeSourceIds.add(source.id);
            targetRow.ambiguousAdmission ||= sourceRow.ambiguousAdmission;
            for (const activeFrame of sourceRow.activeFrames) targetRow.activeFrames.add(activeFrame);
          }
        }
        assert.equal(target.cells.size, targetBefore.size + sourceCells.length - overlap.length, 'merge union accounting');
        target.mergeCount += 1;
        source.redirect = target.id;
        const event = { frameIndex, timeSeconds, targetId: target.id, sourceId: source.id,
          sourceCellCount: sourceCells.length, targetCellCountBefore: targetBefore.size,
          transferredCellCount: transferred.length, overlapCellCount: overlap.length,
          transferredCellIndices: transferred.sort((a, b) => a - b), overlapCellIndices: overlap.sort((a, b) => a - b) };
        frameMerges.push(event); merges.push(event);
      } else if (operation.type === 'directAdmission') {
        validId(operation.identityId, 'admission identity ID');
        const record = canonical(operation.identityId), cells = validateCells(operation.cells, `direct admission ${record.id}`);
        for (const cell of cells) admissionCells.push([record.id, cell]);
        for (const cell of cells) {
          record.componentCellObservations += 1;
          const existing = record.cells.get(cell);
          if (existing) {
            record.repeatedExistingUnionCellObservations += 1;
            existing.directExposureFrames.add(frameIndex);
          } else {
            record.cells.set(cell, { cellIndex: cell,
            canonicalFirstAdmissionFrame: frameIndex, canonicalFirstAdmissionTimeSeconds: timeSeconds,
            firstUnionEntryFrame: frameIndex, firstUnionEntryRoute: 'direct', firstDirectHereFrame: frameIndex,
            firstImportHereFrame: null, directHere: true, inheritedHere: false,
            directSourceIds: new Set([record.id]), inheritedSourceIds: new Set(),
            actualMergeSourceIds: new Set(), ambiguousAdmission: false, activeFrames: new Set(),
            directExposureFrames: new Set([frameIndex]) });
          }
        }
      } else assert.fail(`unknown operation type ${operation.type}`);
    }

    const resolvedOwners = new Map();
    for (const [id, cells] of owners) {
      const canonicalId = canonical(id).id;
      if (!resolvedOwners.has(canonicalId)) resolvedOwners.set(canonicalId, new Set());
      for (const cell of cells) resolvedOwners.get(canonicalId).add(cell);
    }
    for (const [id, cells] of resolvedOwners) for (const cell of cells) {
      const state = canonical(id).cells.get(cell);
      assert.ok(state, `active cell ${cell} must belong to its identity union`);
      state.activeFrames.add(frameIndex);
    }
    for (const [id, cell] of admissionCells)
      assert.ok(resolvedOwners.get(canonical(id).id)?.has(cell), `component admission cell ${cell} must remain active after frame redirects`);
    currentActiveOwners = resolvedOwners;
    const row = { frameIndex, timeSeconds, flags: Uint8Array.from(flags), active };
    frames.push(row);
    lastFrameIndex = frameIndex; lastTimeSeconds = timeSeconds;
    return Object.freeze({ frameIndex, mergeEvents: Object.freeze(frameMerges) });
  }

  function snapshot(requestedId) {
    const record = canonical(requestedId), cutoff = frames.at(-1);
    assert.ok(cutoff, 'snapshot requires at least one observed frame');
    const rows = [...record.cells.values()].sort((a, b) => a.cellIndex - b.cellIndex).map(cell => {
      let activeSampleCount = 0, firstActiveTimeSeconds = null, lastActiveTimeSeconds = null;
      let activeSpells = 0, inSpell = false, spellFirstTimeSeconds = null, spellLastTimeSeconds = null;
      const globalSpellDurations = [];
      let chemicalQualifiedObservations = 0, mechanicalQualifiedObservations = 0, jointQualifiedObservations = 0;
      let qTrueActiveObservations = 0, qFalseActiveObservations = 0, observationCount = 0;
      for (let i = cell.canonicalFirstAdmissionFrame; i <= cutoff.frameIndex; i += 1) {
        const frame = frames[i], bits = frame.flags[cell.cellIndex], isActive = frame.active[cell.cellIndex] === 1;
        observationCount += 1;
        chemicalQualifiedObservations += Number((bits & 1) !== 0);
        mechanicalQualifiedObservations += Number((bits & 2) !== 0);
        jointQualifiedObservations += Number((bits & 3) === 3);
        if (isActive) {
          activeSampleCount += 1; firstActiveTimeSeconds ??= frame.timeSeconds; lastActiveTimeSeconds = frame.timeSeconds;
          qTrueActiveObservations += Number((bits & 7) === 7);
          qFalseActiveObservations += Number((bits & 7) !== 7);
          if (!inSpell) { activeSpells += 1; spellFirstTimeSeconds = frame.timeSeconds; inSpell = true; }
          spellLastTimeSeconds = frame.timeSeconds;
        } else if (inSpell) {
          globalSpellDurations.push(spellLastTimeSeconds - spellFirstTimeSeconds);
          inSpell = false;
        }
      }
      if (inSpell) globalSpellDurations.push(spellLastTimeSeconds - spellFirstTimeSeconds);
      let lastFootContact = null;
      const cellContacts = contacts[cell.cellIndex];
      for (let i = cellContacts.length - 1; i >= 0; i -= 1)
        if (cellContacts[i].timeSeconds <= cell.canonicalFirstAdmissionTimeSeconds + 1e-9) { lastFootContact = cellContacts[i]; break; }
      const ageAt = time => {
        if (time === null) return null;
        for (let i = cellContacts.length - 1; i >= 0; i -= 1)
          if (cellContacts[i].timeSeconds <= time + 1e-9) return time - cellContacts[i].timeSeconds;
        return null;
      };
      const ownedFrames = [...cell.activeFrames].sort((a, b) => a - b);
      const ownedTimes = ownedFrames.map(i => frames[i].timeSeconds);
      let ownedSpells = 0, priorOwnedFrame = null;
      for (const i of ownedFrames) { if (priorOwnedFrame !== i - 1) ownedSpells += 1; priorOwnedFrame = i; }
      const ownedQTrue = ownedFrames.reduce((n, i) => n + Number((frames[i].flags[cell.cellIndex] & 7) === 7), 0);
      const ownedQFalse = ownedFrames.length - ownedQTrue;
      const ownedSpellDurations = [];
      for (let start = 0; start < ownedFrames.length;) {
        let end = start;
        while (end + 1 < ownedFrames.length && ownedFrames[end + 1] === ownedFrames[end] + 1) end += 1;
        ownedSpellDurations.push(frames[ownedFrames[end]].timeSeconds - frames[ownedFrames[start]].timeSeconds);
        start = end + 1;
      }
      const ageAtAdmission = lastFootContact ? cell.canonicalFirstAdmissionTimeSeconds - lastFootContact.timeSeconds : null;
      const directExposureFrames = [...cell.directExposureFrames].sort((a, b) => a - b);
      const postImportDirectExposureFrames = cell.firstImportHereFrame === null ? [] : directExposureFrames.filter(i => i >= cell.firstImportHereFrame);
      return { cellIndex: cell.cellIndex,
        canonicalFirstAdmissionFrame: cell.canonicalFirstAdmissionFrame,
        canonicalFirstAdmissionTimeSeconds: cell.canonicalFirstAdmissionTimeSeconds,
        firstUnionEntryFrame: cell.firstUnionEntryFrame, firstUnionEntryRoute: cell.firstUnionEntryRoute,
        firstDirectHereFrame: cell.firstDirectHereFrame, firstImportHereFrame: cell.firstImportHereFrame,
        directAndImportedSameFrame: cell.firstDirectHereFrame !== null && cell.firstDirectHereFrame === cell.firstImportHereFrame,
        directHere: cell.directHere, inheritedHere: cell.inheritedHere, ambiguousAdmission: cell.ambiguousAdmission,
        directSourceIds: [...cell.directSourceIds].sort((a, b) => a - b),
        inheritedSourceIds: [...cell.inheritedSourceIds].sort((a, b) => a - b),
        actualMergeSourceIds: [...cell.actualMergeSourceIds].sort((a, b) => a - b),
        directExposureSampleCount: directExposureFrames.length,
        firstDirectExposureFrame: directExposureFrames[0] ?? null,
        lastDirectExposureFrame: directExposureFrames.at(-1) ?? null,
        importedAndLocallyRevisitedSampleCount: postImportDirectExposureFrames.length,
        provenanceClass: cell.directHere && cell.inheritedHere ? 'overlapping' : cell.directHere ? 'direct' : 'inherited',
        observationCount, chemicalQualifiedObservations, mechanicalQualifiedObservations, jointQualifiedObservations,
        globalActiveSampleCount: activeSampleCount, globalActiveDuty: observationCount ? activeSampleCount / observationCount : 0,
        globalFirstActiveTimeSeconds: firstActiveTimeSeconds, globalLastActiveTimeSeconds: lastActiveTimeSeconds,
        globalActiveSpells: activeSpells, globalReactivationCount: Math.max(0, activeSpells - 1),
        activeDurationSinceAdmissionSeconds: firstActiveTimeSeconds === null ? 0 : lastActiveTimeSeconds - cell.canonicalFirstAdmissionTimeSeconds,
        observedActiveSpanSeconds: firstActiveTimeSeconds === null ? 0 : lastActiveTimeSeconds - firstActiveTimeSeconds,
        activeSpellObservedDurationsSeconds: globalSpellDurations,
        activeSpellObservedDurationSeconds: globalSpellDurations.reduce((sum, value) => sum + value, 0),
        lastActiveAgeSeconds: lastActiveTimeSeconds === null ? null : cutoff.timeSeconds - lastActiveTimeSeconds,
        globalQTrueActiveObservations: qTrueActiveObservations, globalQFalseActiveObservations: qFalseActiveObservations,
        episodeOwnedActiveSampleCount: ownedFrames.length,
        episodeOwnedActiveDuty: observationCount ? ownedFrames.length / observationCount : 0,
        episodeOwnedFirstActiveTimeSeconds: ownedTimes[0] ?? null, episodeOwnedLastActiveTimeSeconds: ownedTimes.at(-1) ?? null,
        episodeOwnedActiveDurationSinceAdmissionSeconds: ownedTimes.length ? ownedTimes.at(-1) - cell.canonicalFirstAdmissionTimeSeconds : 0,
        episodeOwnedObservedActiveSpanSeconds: ownedTimes.length ? ownedTimes.at(-1) - ownedTimes[0] : 0,
        episodeOwnedLastActiveAgeSeconds: ownedTimes.length ? cutoff.timeSeconds - ownedTimes.at(-1) : null,
        episodeOwnedActiveSpells: ownedSpells, episodeOwnedReactivationCount: Math.max(0, ownedSpells - 1),
        episodeOwnedActiveSpellObservedDurationsSeconds: ownedSpellDurations,
        episodeOwnedActiveSpellObservedDurationSeconds: ownedSpellDurations.reduce((sum, value) => sum + value, 0),
        episodeOwnedQTrueActiveObservations: ownedQTrue, episodeOwnedQFalseActiveObservations: ownedQFalse,
        lastActualSameCellFootContact: lastFootContact, lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds: ageAtAdmission,
        lastActualSameCellFootContactAgeAtFirstDirectHereSeconds: ageAt(cell.firstDirectHereFrame === null ? null : frames[cell.firstDirectHereFrame].timeSeconds),
        lastActualSameCellFootContactAgeAtFirstImportHereSeconds: ageAt(cell.firstImportHereFrame === null ? null : frames[cell.firstImportHereFrame].timeSeconds) };
    });
    const activeCellIndices = [...(currentActiveOwners.get(record.id) ?? [])].sort((a, b) => a - b);
    const activeSet = new Set(activeCellIndices), historicalCellIndices = rows.map(row => row.cellIndex);
    const globalActiveHistoricalCellIndices = rows.filter(row => cutoff.active[row.cellIndex]).map(row => row.cellIndex);
    const directCellCount = rows.filter(row => row.provenanceClass === 'direct').length;
    const inheritedCellCount = rows.filter(row => row.provenanceClass === 'inherited').length;
    const overlappingCellCount = rows.filter(row => row.provenanceClass === 'overlapping').length;
    const directUnionEntryCellCount = rows.filter(row => row.firstUnionEntryRoute === 'direct').length;
    const transferredUnionEntryCellCount = rows.filter(row => row.firstUnionEntryRoute === 'inherited').length;
    assert.equal(directCellCount + inheritedCellCount + overlappingCellCount, rows.length, 'direct/inherited/overlap cell partition');
    assert.equal(directUnionEntryCellCount + transferredUnionEntryCellCount, rows.length, 'first union-entry route partition');
    return { requestedId, canonicalId: record.id, cutoffFrameIndex: cutoff.frameIndex, cutoffTimeSeconds: cutoff.timeSeconds,
      historicalCellIndices, activeCellIndices, inactiveHistoricalCellIndices: historicalCellIndices.filter(cell => !activeSet.has(cell)),
      globalActiveHistoricalCellIndices,
      historicalCellCount: rows.length, currentActiveCellCount: activeCellIndices.length,
      globalActiveHistoricalCellCount: globalActiveHistoricalCellIndices.length,
      directCellCount, inheritedCellCount, overlappingCellCount,
      directUnionEntryCellCount, transferredUnionEntryCellCount,
      componentCellObservations: record.componentCellObservations,
      repeatedExistingUnionCellObservations: record.repeatedExistingUnionCellObservations, mergeCount: record.mergeCount,
      mergeEvents: merges.filter(event => rows.some(row => row.actualMergeSourceIds.includes(event.sourceId))), cells: rows };
  }

  function getUnion(requestedId) {
    const record = canonical(requestedId), rows = [...record.cells.values()].sort((a, b) => a.cellIndex - b.cellIndex);
    return { requestedId, canonicalId: record.id, cellIndices: rows.map(row => row.cellIndex),
      firstAdmissionFrameByCell: rows.map(row => row.canonicalFirstAdmissionFrame),
      firstAdmissionTimeSecondsByCell: rows.map(row => row.canonicalFirstAdmissionTimeSeconds) };
  }

  return Object.freeze({ advance, snapshot, getUnion,
    get lastFrameIndex() { return lastFrameIndex; },
    get mergeEvents() { return merges.map(event => ({ ...event })); } });
}
