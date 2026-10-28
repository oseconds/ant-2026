const MAPS = ['E_qualified', 'H_boundary_length_eligible', 'I_retained_network', 'J_candidate_ribbon',
  'B_memory', 'C_surface', 'D_support'];

/** Describe sampled material support around one saved Plate-birth event. */
export function analyzeEventSupport(packet, terminalProvenance, { eventBirthIndex = 0, size = 96 } = {}) {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('size must be an integer >= 2');
  const frames = packet?.analyses, n = size * size;
  if (!Array.isArray(frames) || !frames.length) throw new TypeError('packet.analyses must be nonempty');
  if (!Number.isInteger(eventBirthIndex) || eventBirthIndex < 0) throw new RangeError('eventBirthIndex must be a nonnegative birth ordinal');
  let priorTime = -Infinity;
  for (const [i, frame] of frames.entries()) {
    if (!Number.isFinite(frame?.simulationTimeMs) || frame.simulationTimeMs <= priorTime) throw new Error(`analysis ${i} time must increase`);
    priorTime = frame.simulationTimeMs;
    for (const key of MAPS) {
      const map = frame.maps?.[key];
      if (!map || map.length !== n) throw new Error(`analysis ${i} ${key} must have ${n} cells`);
      for (const value of map) if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`analysis ${i} ${key} must contain finite [0,1] values`);
    }
    for (const key of MAPS.slice(0, 4)) for (const value of frame.maps[key])
      if (value !== 0 && value !== 1) throw new Error(`analysis ${i} ${key} must be binary`);
  }
  const birthIndices = frames.flatMap((frame, i) => frame.birthsThisTick > 0 ? [i] : []);
  if (eventBirthIndex >= birthIndices.length) throw new RangeError('eventBirthIndex does not identify a saved Plate birth');
  const analysisBirthIndex = birthIndices[eventBirthIndex];
  const birth = frames[analysisBirthIndex], startMs = birth.candidate?.startedAtMs;
  if (!Number.isFinite(startMs) || startMs > birth.simulationTimeMs) throw new Error('birth candidate.startedAtMs must be finite and no later than birth analysis');
  const startIndex = frames.findIndex(frame => frame.simulationTimeMs >= startMs);
  if (startIndex < 0 || startIndex > analysisBirthIndex) throw new Error('event start has no saved analysis anchor before birth');
  const eventFrames = frames.slice(startIndex, analysisBirthIndex + 1);
  const finalRibbon = birth.maps.J_candidate_ribbon;
  const classifications = eventFrames.map((_, i) => {
    const groups = terminalProvenance?.rows?.[startIndex + i]?.classification?.groups;
    if (!groups || typeof groups !== 'object') throw new TypeError(`terminalProvenance.rows[${startIndex + i}].classification.groups is required`);
    return Object.fromEntries(['selected', 'equalShortest', 'longerAlternative', 'pendant'].map(name =>
      [name, groupMask(groups[name], n, name)]));
  });
  const finalGroups = terminalProvenance.rows[analysisBirthIndex].classification.groups;
  const finalClassification = Object.fromEntries(['selected', 'equalShortest', 'longerAlternative', 'pendant'].map(name =>
    [name, groupMask(finalGroups[name], n, name)]));
  const relevant = new Uint8Array(n);
  for (const frame of eventFrames) for (const key of MAPS.slice(0, 4)) {
    const map = frame.maps[key]; for (let c = 0; c < n; c++) if (map[c]) relevant[c] = 1;
  }
  for (let c = 0; c < n; c++) {
    if (finalRibbon[c] || finalClassification.longerAlternative[c] || finalClassification.pendant[c]) relevant[c] = 1;
    for (const row of classifications) if (row.longerAlternative[c] || row.pendant[c]) relevant[c] = 1;
  }
  const exactContacts = Array.from({ length: n }, () => []);
  let unmappedContacts = 0;
  for (const event of packet.contacts ?? []) {
    const time = event?.simulationTimeMs;
    if (!Number.isFinite(time)) throw new Error('contact event simulationTimeMs must be finite');
    for (const foot of event.contacts ?? []) {
      const p = foot?.position;
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { unmappedContacts++; continue; }
      exactContacts[Math.round(p.y * (size - 1)) * size + Math.round(p.x * (size - 1))].push(time);
    }
  }
  const records = [];
  for (let c = 0; c < n; c++) if (relevant[c]) {
    const es = eventFrames.map(frame => frame.maps.E_qualified[c] ? 1 : 0);
    const eMetrics = eHistory(es, eventFrames, startMs, startIndex > 0 ? frames[startIndex - 1].maps.E_qualified[c] === 1 : false);
    const values = key => eventFrames.map(frame => frame.maps[key][c]);
    const contacts = exactContacts[c];
    const near = [];
    const x = c % size, y = Math.floor(c / size);
    for (let yy = Math.max(0, y - 1); yy <= Math.min(size - 1, y + 1); yy++)
      for (let xx = Math.max(0, x - 1); xx <= Math.min(size - 1, x + 1); xx++) near.push(...exactContacts[yy * size + xx]);
    const groupBits = name => classifications.map(row => row[name][c]).join('');
    const longerBits = groupBits('longerAlternative'), pendantBits = groupBits('pendant');
    records.push({ cell: c, relevant: true, orbitBits: { E: es.join(''), H: eventFrames.map(f => f.maps.H_boundary_length_eligible[c]).join(''),
        I: eventFrames.map(f => f.maps.I_retained_network[c]).join(''), longerAlternative: longerBits, pendant: pendantBits },
      E: { event: eMetrics, absoluteAtBirth: sampledTenure(frames.slice(0, analysisBirthIndex + 1), c) },
      classification: { longerAlternativeFraction: fraction(longerBits), pendantFraction: fraction(pendantBits),
        atBirth: { selected: Boolean(finalClassification.selected[c]), equalShortest: Boolean(finalClassification.equalShortest[c]),
          longerAlternative: Boolean(finalClassification.longerAlternative[c]), pendant: Boolean(finalClassification.pendant[c]) } },
      ribbon: { final: Boolean(finalRibbon[c]), laterI: frames.slice(analysisBirthIndex + 1).some(frame => frame.maps.I_retained_network[c] === 1),
        frozenAtBirth: Boolean(birth.maps.J_frozen_birth_union?.[c]),
        laterFrozen: frames.slice(analysisBirthIndex + 1).some(frame => frame.maps.J_frozen_birth_union?.[c] === 1),
        laterNewFrozen: !birth.maps.J_frozen_birth_union?.[c] && frames.slice(analysisBirthIndex + 1).some(frame => frame.maps.J_frozen_birth_union?.[c] === 1) },
      fields: { B_memory: fieldHistory(values('B_memory'), es, eventFrames), C_surface: fieldHistory(values('C_surface'), es, eventFrames),
        D_support: fieldHistory(values('D_support'), es, eventFrames) },
      contacts: { exact: contactHistory(contacts, startMs, birth.simulationTimeMs), neighborhood3x3: contactHistory(near, startMs, birth.simulationTimeMs) } });
  }
  return { schema: 'ant-event-support-atlas-v1', size, event: { birthOrdinal: eventBirthIndex, birthAnalysisIndex: analysisBirthIndex, startMs,
    startAnalysisIndex: startIndex, endAnalysisIndex: analysisBirthIndex, startAnalysisTimeMs: eventFrames[0].simulationTimeMs,
    endAnalysisTimeMs: birth.simulationTimeMs, anchors: eventFrames.length }, relevantCellCount: records.length,
  coverage: { totalCells: n, relevantCells: records.length }, unmappedContacts, cells: records };
}

function groupMask(groups, n, name) {
  const mask = new Uint8Array(n);
  if (!Array.isArray(groups)) throw new TypeError(`terminalProvenance ${name} group must be an array of cell indices`);
  for (const cell of groups) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= n) throw new RangeError(`terminalProvenance ${name} cell is out of range`);
    mask[cell] = 1;
  }
  return mask;
}
function eHistory(e, frames, startMs, carry) {
  let count = 0, onset = null, last = null, longest = 0, spanStart = null, spanEnd = null, currentStart = null, currentEnd = null;
  let lower = 0, upper = 0, returns = 0, wasPresent = false, absentAfter = false;
  for (let i = 0; i < e.length; i++) {
    if (e[i]) {
      count++; const t = frames[i].simulationTimeMs;
      if (onset === null) onset = t; last = t;
      if (absentAfter && wasPresent) returns++;
      wasPresent = true; absentAfter = false;
      if (currentStart === null) currentStart = t;
      currentEnd = t;
    } else if (wasPresent) { absentAfter = true; }
    if (i) {
      const dt = frames[i].simulationTimeMs - frames[i - 1].simulationTimeMs;
      if (e[i] && e[i - 1]) lower += dt;
      if (e[i] || e[i - 1]) upper += dt;
    }
    if ((!e[i] || i === e.length - 1) && currentStart !== null) {
      if (spanStart === null || currentEnd - currentStart > longest) { longest = currentEnd - currentStart; spanStart = currentStart; spanEnd = currentEnd; }
      currentStart = null; currentEnd = null;
    }
  }
  const duration = frames.at(-1).simulationTimeMs - frames[0].simulationTimeMs;
  return { sampledPresentAnchors: count, fraction: e.length ? count / e.length : 0,
    endpointIntervalEstimatesMs: { bothEndpointsPresent: Math.min(lower, duration), eitherEndpointPresent: Math.min(upper, duration),
      interpretation: 'sampled endpoint convention; not continuous-presence bounds or proof' },
    longestConsecutivePresentAnchorSpanMs: longest, longestSpanStartOffsetMs: spanStart === null ? null : spanStart - startMs,
    longestSpanEndOffsetMs: spanEnd === null ? null : spanEnd - startMs,
    onsetOffsetMs: onset === null ? null : onset - startMs, lastPresentOffsetMs: last === null ? null : last - startMs,
    precedingAnchorPresent: Boolean(carry), firstEventAnchorPresent: Boolean(e[0]),
    leftBoundaryCarryIn: Boolean(carry && e[0]), absenceReturnCount: returns };
}
function fieldHistory(values, e, frames) {
  let integral = 0, eBothIntegral = 0, eEitherIntegral = 0;
  for (let i = 1; i < values.length; i++) {
    const area = (values[i - 1] + values[i]) * 0.5 * (frames[i].simulationTimeMs - frames[i - 1].simulationTimeMs) / 1000;
    integral += area;
    if (e[i - 1] && e[i]) eBothIntegral += area;
    if (e[i - 1] || e[i]) eEitherIntegral += area;
  }
  const active = values.filter((_, i) => e[i]);
  return { sampledAnchorMean: mean(values), sampledAnchorMin: Math.min(...values), sampledAnchorMax: Math.max(...values),
    sampledTrapezoidIntegralStateSeconds: integral, EActiveAnchorMean: active.length ? mean(active) : null,
    EActiveAnchorMin: active.length ? Math.min(...active) : null,
    EBothEndpointsTrapezoidIntegralStateSeconds: eBothIntegral,
    EEitherEndpointTrapezoidIntegralStateSeconds: eEitherIntegral,
    integralSemantics: 'sampled trapezoid in state*seconds; E-conditioned integrals select intervals by endpoint E membership' };
}
function sampledTenure(frames, c) {
  const values = frames.map(f => f.maps.E_qualified[c]), count = values.reduce((sum, x) => sum + x, 0);
  const history = eHistory(values, frames, frames[0].simulationTimeMs, false);
  let runStart = frames.length - 1;
  if (values.at(-1)) while (runStart > 0 && values[runStart - 1]) runStart--;
  return { sampledPresentAnchors: count, currentEAtBirth: Boolean(values.at(-1)), firstPresentAtMs: history.onsetOffsetMs === null ? null : frames[0].simulationTimeMs + history.onsetOffsetMs,
    cumulativeSampledDurationMs: history.endpointIntervalEstimatesMs.bothEndpointsPresent,
    continuousTenureEndingAtBirthMs: values.at(-1) ? frames.at(-1).simulationTimeMs - frames[runStart].simulationTimeMs : 0,
    longestConsecutivePresentAnchorSpanMs: history.longestConsecutivePresentAnchorSpanMs };
}
function contactHistory(times, start, end) { const inWindow = times.filter(t => t >= start && t <= end).sort((a, b) => a - b);
  return { eventWindowInclusiveCount: inWindow.length, cumulativePreStartCount: times.filter(t => t < start).length,
    firstOffsetMs: inWindow.length ? inWindow[0] - start : null, lastOffsetMs: inWindow.length ? inWindow.at(-1) - start : null,
    timestampsOffsetMs: inWindow.map(t => t - start) };
}
function mean(values) { return values.reduce((sum, x) => sum + x, 0) / values.length; }
function fraction(bits) { return bits.length ? [...bits].reduce((sum, x) => sum + Number(x), 0) / bits.length : 0; }
