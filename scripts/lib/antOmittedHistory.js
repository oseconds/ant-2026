const MAP_NAMES = ['B_memory', 'C_surface', 'D_support', 'E_qualified', 'F_skeleton',
  'H_boundary_length_eligible', 'I_retained_network', 'J_candidate_ribbon', 'J_frozen_birth_union'];

/** Analyze sampled raster history without assigning biological identity to cells or components. */
export function analyzePacket(packet, { size = 96 } = {}) {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('size must be an integer >= 2');
  const analyses = packet?.analyses;
  if (!Array.isArray(analyses) || !analyses.length) throw new TypeError('packet.analyses must be nonempty');
  const cells = size * size;
  let previousTime = -Infinity;
  for (const [i, a] of analyses.entries()) {
    if (!Number.isFinite(a?.simulationTimeMs) || a.simulationTimeMs <= previousTime) throw new Error(`analysis ${i} time must increase`);
    previousTime = a.simulationTimeMs;
    for (const key of MAP_NAMES) {
      if (!a.maps?.[key] || a.maps[key].length !== cells) throw new Error(`analysis ${i} ${key} must have ${cells} cells`);
      for (const value of a.maps[key]) if (!Number.isFinite(value)) throw new Error(`analysis ${i} ${key} has a nonfinite value`);
    }
  }
  const contacts = mapContacts(packet.contacts || [], size);
  const birthIndex = analyses.findIndex(a => (a.birthsThisTick || 0) > 0);
  const rows = analyses.map((a, i) => {
    const H = a.maps.H_boundary_length_eligible, I = a.maps.I_retained_network;
    const O = new Uint8Array(cells);
    for (let c = 0; c < cells; c++) {
      O[c] = H[c] && !I[c] ? 1 : 0;
      if (I[c] && !H[c]) throw new Error(`analysis ${i}: I is not a subset of H at ${c}`);
      if (O[c] && I[c]) throw new Error(`analysis ${i}: O intersects I at ${c}`);
    }
    const components = { production8: componentsOf(O, I, H, size, false), diagonalGuard: componentsOf(O, I, H, size, true) };
    return { index: i, tick: a.tick, time: a.simulationTimeMs, maps: a.maps, O, components };
  });
  const cellRecords = [];
  let hTransitions = 0, oTransitions = 0, eTransitions = 0;
  for (let c = 0; c < cells; c++) {
    const h = series(rows, 'H_boundary_length_eligible', c), o = rows.map(r => r.O[c]), e = series(rows, 'E_qualified', c), f = series(rows, 'F_skeleton', c);
    hTransitions += returns(h); oTransitions += returns(o); eTransitions += returns(e);
    const record = { cell: c, histories: { H: bits(h), I: bits(series(rows, 'I_retained_network', c)), O: bits(o), E: bits(e), F: bits(f) },
      H: runs(h, rows), O: runs(o, rows), E: runs(e, rows), F: runs(f, rows) };
    if (birthIndex >= 0 && o[birthIndex]) {
      const laterI = rows.find(r => r.index > birthIndex && r.maps.I_retained_network[c]);
      const alreadyFrozenAtBirth = Boolean(rows[birthIndex].maps.J_frozen_birth_union[c]);
      const laterFrozen = rows.find(r => r.index > birthIndex && r.maps.J_frozen_birth_union[c]);
      record.birth = {
        firstBirthAt: rows[birthIndex].time, laterIFirstAt: laterI?.time ?? null,
        laterIFirstDelayMs: laterI ? laterI.time - rows[birthIndex].time : null,
        alreadyInFrozenBirthUnionAtBirth: alreadyFrozenAtBirth,
        laterFrozenMaskFirstAt: laterFrozen?.time ?? null,
        laterFrozenMaskDelayMs: laterFrozen ? laterFrozen.time - rows[birthIndex].time : null,
        laterNewFrozenCoverageFirstAt: alreadyFrozenAtBirth ? null : laterFrozen?.time ?? null,
        laterNewFrozenCoverageDelayMs: alreadyFrozenAtBirth || !laterFrozen ? null : laterFrozen.time - rows[birthIndex].time,
        exactContacts: contactSummary(contacts.exact[c], rows, birthIndex),
        neighborhoodContacts: contactSummary(neighborhoodContacts(contacts, c, size), rows, birthIndex),
        fields: rows.map(r => ({ time: r.time, B_memory: r.maps.B_memory[c], C_surface: r.maps.C_surface[c], D_support: r.maps.D_support[c] }))
      };
      cellRecords.push(record);
    }
  }
  const componentTimeline = rows.map(r => ({ tick: r.tick, time: r.time, production8: r.components.production8, diagonalGuard: r.components.diagonalGuard }));
  const links = { production8: overlapLinks(rows, 'production8'), diagonalGuard: overlapLinks(rows, 'diagonalGuard') };
  const first = birthIndex < 0 ? null : rows[birthIndex];
  const firstCoverage = first ? maskCoverage(first) : null;
  return {
    schema: 'ant-omitted-history-v1', size,
    summary: {
      analyses: rows.length, firstBirthAt: first?.time ?? null, firstBirthTick: first?.tick ?? null,
      omittedCellsByAnalysis: rows.map(r => ({ tick: r.tick, time: r.time, count: count(r.O) })),
      sampledReturns: { H: hTransitions, O: oTransitions, E: eTransitions },
      firstBirthO: first ? count(first.O) : 0,
      firstBirthCoverage: firstCoverage,
      firstBirthFieldDistributions: first ? fieldDistributions(first, first.O) : null,
      lastFieldDistributions: fieldDistributions(rows.at(-1), rows.at(-1).O)
    },
    firstBirthOCells: cellRecords,
    firstBirthComponents: first ? first.components.production8.map((component, id) => ({
      component: id, cells: component.cells,
      consecutiveExactCellCoverage: rows.slice(birthIndex).map(r => ({ time: r.time,
        cellsPresent: component.cells.filter(c => r.O[c]).length,
        fractionPresent: component.cells.length ? component.cells.filter(c => r.O[c]).length / component.cells.length : 0 }))
    })) : [],
    componentTimeline, overlapLinks: links,
    contacts: { mapping: `cell=round(y*${size - 1})*${size}+round(x*${size - 1})`, mappedEvents: contacts.events, unmappedContacts: contacts.unmapped }
  };
}

function series(rows, key, cell) { return rows.map(r => r.maps[key][cell] ? 1 : 0); }
function runs(values, rows) {
  const out = []; let start = -1;
  for (let i = 0; i <= values.length; i++) {
    if (i < values.length && values[i]) { if (start < 0) start = i; continue; }
    if (start >= 0) out.push({ startAt: rows[start].time, endAt: rows[i - 1].time,
      sampledDurationMs: rows[i - 1].time - rows[start].time,
      leftCensored: start === 0, rightCensored: i === values.length });
    start = -1;
  }
  return { sampledPresent: values.reduce((a, b) => a + b, 0), cumulativeSampledDurationMs: out.reduce((a, b) => a + b.sampledDurationMs, 0),
    absenceReturnCount: returns(values), runs: out };
}
function returns(v) { let present = false, absentAfterPresence = false, n = 0;
  for (const x of v) { if (x) { if (absentAfterPresence) n++; present = true; absentAfterPresence = false; } else if (present) absentAfterPresence = true; }
  return n;
}
function count(mask) { let n = 0; for (const x of mask) n += x ? 1 : 0; return n; }
function bits(values) { return values.join(''); }
function maskCoverage(row) { const n = count(row.O), ribbon = row.maps.J_candidate_ribbon, frozen = row.maps.J_frozen_birth_union;
  let inRibbon = 0, inFrozen = 0;
  for (let i = 0; i < row.O.length; i++) if (row.O[i]) { inRibbon += ribbon[i] ? 1 : 0; inFrozen += frozen[i] ? 1 : 0; }
  return { omitted: n, inCandidateRibbon: inRibbon, outsideCandidateRibbon: n - inRibbon, inFrozenBirthUnion: inFrozen, outsideFrozenBirthUnion: n - inFrozen };
}
function mapContacts(events, size) {
  const exact = Array.from({ length: size * size }, () => []); let unmapped = 0, accepted = 0;
  for (const event of events) for (const contact of event.contacts || []) {
    const p = contact.position;
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { unmapped++; continue; }
    const cell = Math.round(p.y * (size - 1)) * size + Math.round(p.x * (size - 1));
    exact[cell].push({ time: event.simulationTimeMs, antId: event.antId, legId: contact.legId }); accepted++;
  }
  for (const list of exact) list.sort((a, b) => a.time - b.time);
  return { exact, events: accepted, unmapped };
}
function neighborhoodContacts(contacts, cell, size) { const x = cell % size, y = Math.floor(cell / size), all = [];
  for (let yy = Math.max(0, y - 1); yy <= Math.min(size - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(size - 1, x + 1); xx++) all.push(...contacts.exact[yy * size + xx]);
  return all.sort((a, b) => a.time - b.time);
}
function contactSummary(list, rows, birthIndex) { const birth = rows[birthIndex].time, times = list.map(c => c.time);
  const perAnalysis = rows.map((r, i) => {
    const startExclusive = i ? rows[i - 1].time : null;
    return { startExclusive, endInclusive: r.time,
      count: list.filter(c => (i ? c.time > rows[i - 1].time : true) && c.time <= r.time).length };
  });
  const lastTime = rows.at(-1).time, tail = list.filter(c => c.time > lastTime);
  if (perAnalysis.reduce((sum, bin) => sum + bin.count, 0) + tail.length !== list.length) throw new Error('contact time bins do not conserve mapped contacts');
  return { total: list.length, preBirth: list.filter(c => c.time < birth).length, atBirth: list.filter(c => c.time === birth).length,
    postBirth: list.filter(c => c.time > birth).length, timesMs: times, gapsMs: times.slice(1).map((t, i) => t - times[i]),
    perAnalysis, tailAfterLastAnalysis: { startExclusive: lastTime, count: tail.length, timesMs: tail.map(c => c.time) } };
}
function fieldDistributions(row, mask) { const out = {};
  for (const key of ['B_memory', 'C_surface', 'D_support']) { const values = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) values.push(row.maps[key][i]);
    out[key] = distribution(values);
  } return out;
}
function distribution(values) { values.sort((a, b) => a - b); return values.length ? { n: values.length, min: values[0], median: values[Math.floor((values.length - 1) / 2)], max: values.at(-1) } : { n: 0, min: null, median: null, max: null }; }
function componentsOf(mask, I, H, size, guard) {
  const seen = new Uint8Array(mask.length), out = [];
  for (let start = 0; start < mask.length; start++) if (mask[start] && !seen[start]) {
    const cells = [], stack = [start]; seen[start] = 1;
    while (stack.length) { const c = stack.pop(); cells.push(c); for (const n of adjacent(c, mask, H, size, guard)) if (!seen[n]) { seen[n] = 1; stack.push(n); } }
    cells.sort((a, b) => a - b); const degrees = cells.map(c => adjacent(c, mask, H, size, guard).length);
    const hDegrees = cells.map(c => adjacent(c, H, H, size, guard).length), attachments = new Set();
    for (const c of cells) for (const n of adjacent(c, I, H, size, guard)) attachments.add(n);
    const xs = cells.map(c => c % size), ys = cells.map(c => Math.floor(c / size));
    const E = degrees.reduce((a, b) => a + b, 0) / 2;
    const hEndpointCells = cells.filter((c, i) => hDegrees[i] === 1).map(c => ({ cell: c, withinTargetBoundaryBand: nearTargetBoundary(c, size) }));
    out.push({ cells, size: cells.length, bbox: { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) },
      omittedGraphDegree1Endpoints: degrees.filter(d => d === 1).length,
      fullHDegree1Endpoints: hEndpointCells.length, fullHDegree1EndpointsInTargetBoundaryBand: hEndpointCells.filter(e => e.withinTargetBoundaryBand).length,
      fullHDegree1EndpointCells: hEndpointCells, attachmentsToI: attachments.size,
      attachmentCategory: attachments.size === 0 ? 'zero' : attachments.size === 1 ? 'one' : 'multiple',
      attachmentGroupsOnI: componentCount(attachments, I, H, size, guard), cycleRank: E - cells.length + 1 });
  }
  return out;
}
function adjacent(cell, mask, guardContext, size, guard) { const x = cell % size, y = Math.floor(cell / size), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy;
    if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue; const n = yy * size + xx; if (!mask[n]) continue;
    if (guard && dx && dy && (guardContext[y * size + xx] || guardContext[yy * size + x])) continue; out.push(n);
  } return out;
}
function componentCount(nodes, mask, H, size, guard) { const set = new Set(nodes), seen = new Set(); let count = 0;
  for (const n of set) if (!seen.has(n)) { count++; const stack = [n]; seen.add(n); while (stack.length) for (const a of adjacent(stack.pop(), mask, H, size, guard)) if (set.has(a) && !seen.has(a)) { seen.add(a); stack.push(a); } }
  return count;
}
function nearTargetBoundary(cell, size) { const x = cell % size, y = Math.floor(cell / size);
  return Math.min(x, y, size - 1 - x, size - 1 - y) / (size - 1) <= 0.05;
}
function overlapLinks(rows, key) { const links = [];
  for (let t = 1; t < rows.length; t++) { const prev = rows[t - 1].components[key], next = rows[t].components[key];
    for (let a = 0; a < prev.length; a++) for (let b = 0; b < next.length; b++) { const old = new Set(prev[a].cells), overlapCells = next[b].cells.filter(c => old.has(c)); if (overlapCells.length) links.push({ fromTime: rows[t - 1].time, toTime: rows[t].time, fromComponent: a, toComponent: b, overlapCells: overlapCells.length }); }
  } return links;
}
