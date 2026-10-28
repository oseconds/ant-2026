const CHEMICAL_TAU_SECONDS = 20;
const CHEMICAL_HALF_SATURATION = 0.04;
const PHASES = ['carriedIn', 'ownedNew', 'future'];

export function reconstructChemicalWindow(frames, startIndex, endIndex, size = 96) {
  if (!Array.isArray(frames) || !Number.isInteger(startIndex) || !Number.isInteger(endIndex)
    || startIndex < 0 || endIndex <= startIndex || endIndex >= frames.length) {
    throw new RangeError('chemical window must select ordered analysis frames');
  }
  const count = size * size, anchor = frames[startIndex]?.maps, end = frames[endIndex]?.maps;
  if (!anchor?.B_memory || !anchor?.A_projection96 || !end?.B_memory
    || anchor.B_memory.length !== count || end.B_memory.length !== count) {
    throw new TypeError(`chemical window maps must contain ${count} cells`);
  }
  const replay = Float32Array.from(anchor.B_memory);
  const noInput = Float32Array.from(anchor.B_memory);
  let compared = 0, mismatches = 0, maxAbsError = 0, maxUlpDistance = 0;
  let priorTime = frames[startIndex].simulationTimeMs;
  for (let frameIndex = startIndex + 1; frameIndex <= endIndex; frameIndex += 1) {
    const frame = frames[frameIndex], projection = frame.maps?.A_projection96, memory = frame.maps?.B_memory;
    if (!Number.isFinite(frame.simulationTimeMs) || frame.simulationTimeMs <= priorTime
      || !projection || projection.length !== count || !memory || memory.length !== count) {
      throw new TypeError(`chemical analysis ${frameIndex} has invalid time or maps`);
    }
    const elapsed = (frame.simulationTimeMs - priorTime) / 1000;
    const alpha = 1 - Math.exp(-elapsed / CHEMICAL_TAU_SECONDS);
    for (let cell = 0; cell < count; cell += 1) {
      const raw = Math.max(0, projection[cell]);
      const bounded = raw / (raw + CHEMICAL_HALF_SATURATION);
      replay[cell] += (bounded - replay[cell]) * alpha;
      noInput[cell] += (0 - noInput[cell]) * alpha;
      const error = Math.abs(replay[cell] - memory[cell]);
      compared += 1;
      if (error !== 0) mismatches += 1;
      maxAbsError = Math.max(maxAbsError, error);
      maxUlpDistance = Math.max(maxUlpDistance, ulpDistance(replay[cell], memory[cell]));
    }
    priorTime = frame.simulationTimeMs;
  }
  const actual = Float32Array.from(end.B_memory);
  const postAnchorEffect = Float64Array.from(actual, (value, cell) => value - noInput[cell]);
  return {
    anchorMemory: Float32Array.from(anchor.B_memory),
    carriedInAtCommit: noInput,
    postAnchorEffect,
    actualAtCommit: actual,
    sampledProjectionReplay: { compared, mismatches, maxAbsError, maxUlpDistance,
      exactEndpoint: replay.every((value, cell) => value === actual[cell]) },
    intervals: endIndex - startIndex
  };
}

export function collectOrderedFootLedger(packet, cases, size = 96) {
  if (!Array.isArray(packet?.contacts) || !Array.isArray(cases) || !cases.length) {
    throw new TypeError('packet contacts and ownership cases are required');
  }
  const cellCount = size * size;
  const perCase = Object.fromEntries(cases.map(item => [item.id, {
    phases: Object.fromEntries(PHASES.map(phase => [phase, {
      eventGroups: 0, individualFeet: 0, withinFrozenMask: 0, outsideFrozenMask: 0,
      perCellCounts: new Uint32Array(cellCount)
    }]))
  }]));
  const rows = [];
  let streamOrder = 0, timestampInversions = 0, priorEventTime = -Infinity;
  for (const [eventIndex, event] of packet.contacts.entries()) {
    if (event?.type !== 'FOOT_CONTACT') continue;
    const timeMs = event.simulationTimeMs;
    if (!Number.isFinite(timeMs) || !Array.isArray(event.contacts)) throw new TypeError(`invalid contact event ${eventIndex}`);
    if (timeMs < priorEventTime) timestampInversions += 1;
    priorEventTime = timeMs;
    const phaseByCase = Object.fromEntries(cases.map(item => [item.id, phaseAt(timeMs, item.anchorMs, item.commitMs)]));
    for (const item of cases) perCase[item.id].phases[phaseByCase[item.id]].eventGroups += 1;
    for (const [contactIndex, contact] of event.contacts.entries()) {
      const position = contact?.position;
      const inDomain = Number.isFinite(position?.x) && Number.isFinite(position?.y)
        && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1;
      const cell = inDomain
        ? Math.round(position.y * (size - 1)) * size + Math.round(position.x * (size - 1)) : null;
      const ownership = {};
      for (const item of cases) {
        const phase = phaseByCase[item.id], selected = perCase[item.id].phases[phase];
        const insideFrozenMask = cell !== null && Boolean(item.mask[cell]);
        selected.individualFeet += 1;
        if (insideFrozenMask) selected.withinFrozenMask += 1;
        else selected.outsideFrozenMask += 1;
        if (cell !== null) selected.perCellCounts[cell] += 1;
        ownership[item.id] = { phase, cell, insideFrozenMask };
      }
      rows.push({ streamOrder, eventIndex, contactIndex, timeMs, contactGroup: event.contactGroup ?? null,
        antId: event.antId ?? null, legId: contact?.legId ?? null,
        x: position?.x ?? null, y: position?.y ?? null,
        surfaceFieldAccepted: typeof contact?.legId === 'string' && contact.legId.length > 0 && inDomain, ownership });
      streamOrder += 1;
    }
  }
  return { rows, perCase, timestampInversions, sourceOrderPreserved: rows.every((row, i) => row.streamOrder === i) };
}

export function deriveMatchedRepeatWindows(fixture, contactTimesSeconds, point) {
  if (fixture?.schedule !== 'continuous-load' || !Array.isArray(fixture.commits)
    || !Array.isArray(contactTimesSeconds) || !point) throw new TypeError('continuous-load fixture inputs are required');
  const commits = fixture.commits.slice(0, 3);
  if (commits.length !== 3 || commits.some((row, i) => row.seconds !== [20, 110, 200][i])) {
    throw new Error('fixture must contain its first three registered commits at 20, 110, and 200 seconds');
  }
  const lineageStartMs = commits[0].lineageStartMs;
  if (!commits.every(row => row.lineageStartMs === lineageStartMs && row.selectedCandidateRemainsPresent)) {
    throw new Error('logical fixture connection did not remain continuous');
  }
  const owned = new Set();
  const windows = commits.map((commit, index) => {
    const previous = commits[index - 1] ?? null;
    const anchorSeconds = previous ? previous.seconds : lineageStartMs / 1000;
    const expectedPrior = previous?.committedIds[0] ?? null;
    if (commit.priorMatch !== expectedPrior) throw new Error(`commit ${commit.seconds}s did not match newest prior`);
    const times = contactTimesSeconds.filter(seconds => seconds > anchorSeconds && seconds <= commit.seconds);
    if (times.some(seconds => owned.has(seconds))) throw new Error('fixture contribution received duplicate ownership');
    for (const seconds of times) owned.add(seconds);
    const rows = fixture.rows.filter(row => row.seconds > anchorSeconds && row.seconds <= commit.seconds);
    if (rows.length !== times.length || rows.some((row, i) => row.seconds !== times[i])) {
      throw new Error(`fixture contacts do not cover ownership window ${anchorSeconds}-${commit.seconds}s`);
    }
    if (previous && commit.newFeet !== times.length) throw new Error(`repeat burden differs at ${commit.seconds}s`);
    return { layerId: commit.committedIds[0], anchorSeconds, anchorKind: previous ? 'newest-matched-prior-commit' : 'lineage-start',
      lineageStartMs, priorCommitId: expectedPrior, commitSeconds: commit.seconds,
      newContactCount: times.length, contributionTimesSeconds: times, point };
  });
  return { schedule: fixture.schedule, scope: fixture.scope, lineageContinues: true,
    priorDescriptorsRemainImmutable: fixture.descriptorsRemainImmutable, noCandidateReset: fixture.noCandidateReset,
    refractoryAccumulation: [21, 109].map(seconds => {
      const row = fixture.rows[seconds];
      return { seconds, matchedPrior: row.priorMatch, priorAgeSeconds: row.priorAgeSeconds,
        bankedFootContacts: row.newFeet, refractoryRemainingSeconds: row.repeatAfter?.refractoryRemainingSeconds,
        committed: row.committedIds.length > 0 };
    }), windows, uniqueOwnedContributionCount: owned.size };
}

export function phaseAt(timeMs, anchorMs, commitMs) {
  if (![timeMs, anchorMs, commitMs].every(Number.isFinite) || commitMs < anchorMs) {
    throw new RangeError('ownership times must be finite and ordered');
  }
  return timeMs <= anchorMs ? 'carriedIn' : timeMs <= commitMs ? 'ownedNew' : 'future';
}

function ulpDistance(a, b) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, a); const left = view.getUint32(0);
  view.setFloat32(0, b); const right = view.getUint32(0);
  return Math.abs(left - right);
}
