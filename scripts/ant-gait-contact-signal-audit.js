import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-29-gait-contact-signal-audit';
const INPUT = PACKAGE + '/data/frozen-contact-input.json.gz';
const ANCHORS = 'docs/ant/evidence/2026-10-29-traffic-direction-signal-audit/data/frozen-parity-anchors.json.gz';
const OUTPUTS = [PACKAGE + '/analysis.json', PACKAGE + '/data/measurements.json.gz', PACKAGE + '/atlas.html'];
const SIZE = 96;
const CELL_COUNT = SIZE * SIZE;
const LEGS = ['FL', 'FR', 'ML', 'MR', 'RL', 'RR'];
const TRIPOD_LEGS = { A: ['FL', 'MR', 'RL'], B: ['FR', 'ML', 'RR'] };
const LEG_COLORS = { FL: '#e45756', FR: '#4c78a8', ML: '#f2a541', MR: '#54a24b', RL: '#b279a2', RR: '#72b7b2' };

const sha256 = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha256(JSON.stringify(value));
const readGzipJson = async path => JSON.parse(gunzipSync(await readFile(resolve(ROOT, path))));
const stats = values => {
  if (!values.length) return { n: 0, min: null, q25: null, median: null, mean: null, q75: null, q90: null, max: null };
  const sorted = [...values].sort((a, b) => a - b), at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: values.length, min: sorted[0], q25: at(.25), median: at(.5), mean: values.reduce((a, b) => a + b, 0) / values.length,
    q75: at(.75), q90: at(.9), max: sorted.at(-1) };
};
const pearson = (xs, ys) => {
  if (xs.length < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < xs.length; i += 1) { const x = xs[i] - mx, y = ys[i] - my; xx += x * x; yy += y * y; xy += x * y; }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
};
const cellIndex = ({ x, y }) => Math.round(y * (SIZE - 1)) * SIZE + Math.round(x * (SIZE - 1));
const pointFor = index => ({ x: (index % SIZE) / (SIZE - 1), y: Math.floor(index / SIZE) / (SIZE - 1) });
const streamHash = rows => { const h = createHash('sha256'); for (const row of rows) h.update(JSON.stringify(row) + '\n'); return h.digest('hex'); };

function profile() {
  return { count: 0, legs: Object.fromEntries(LEGS.map(leg => [leg, 0])), tripods: { A: 0, B: 0 }, ants: new Set(),
    touches: [], groups: new Map(), xy: [] };
}

function summarizeWindow(inputWindow, allContacts, anchors) {
  const windowRows = allContacts.filter(row => row.simulationTimeMs > inputWindow.startMs
    && row.simulationTimeMs <= inputWindow.simulationTimeMs);
  const anchor = anchors.eventRanges.find(row => row.id === inputWindow.id);
  assert(anchor, inputWindow.id + ' frozen event anchor');
  assert.equal(windowRows.length, anchor.contactGroups);
  assert.equal(windowRows.reduce((sum, row) => sum + row.contacts.length, 0), anchor.feet);
  assert.equal(streamHash(windowRows), anchor.contactStreamSha256, inputWindow.id + ' event stream digest');
  assert.deepEqual({ startMs: inputWindow.startMs, endMs: inputWindow.simulationTimeMs,
    contactGroups: inputWindow.contactGroups, feet: inputWindow.feet },
  { startMs: anchor.startMs, endMs: anchor.endMs, contactGroups: anchor.contactGroups, feet: anchor.feet }, inputWindow.id + ' window bounds');
  assert.equal(inputWindow.surface.length, CELL_COUNT);
  assert.equal(inputWindow.selectedI.length, anchors.analysisSnapshots.find(row => row.tick === inputWindow.tick)
    .criticalMapOnes.I_retained_network);
  const selectedNodes = new Set(inputWindow.selectedI);
  assert(inputWindow.edges.every(([a, b]) => selectedNodes.has(a) && selectedNodes.has(b)), inputWindow.id + ' selected-I edge endpoints');

  const cumulativeRows = allContacts.filter(row => row.simulationTimeMs <= inputWindow.simulationTimeMs);
  const cumulativeCounts = new Uint32Array(CELL_COUNT), windowCounts = new Uint32Array(CELL_COUNT);
  const profiles = Array.from({ length: CELL_COUNT }, profile);
  let footCount = 0, invalidFeet = 0, tripodMismatchFeet = 0;
  const antGroups = new Map(), groupSizeCounts = {}, strengthByAnt = new Map();
  for (const event of cumulativeRows) for (const contact of event.contacts) {
    const point = contact?.position;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1
      || point.y < 0 || point.y > 1 || !LEGS.includes(contact.legId)) { invalidFeet += 1; continue; }
    cumulativeCounts[cellIndex(point)] += 1;
  }
  for (const event of windowRows) {
    assert(Number.isFinite(event.strength) && Number.isFinite(event.position?.x) && Number.isFinite(event.position?.y),
      inputWindow.id + ' event strength and emitted centroid');
    const legs = event.contacts.map(contact => contact.legId);
    groupSizeCounts[legs.length] = (groupSizeCounts[legs.length] || 0) + 1;
    tripodMismatchFeet += legs.filter(leg => !TRIPOD_LEGS[event.contactGroup]?.includes(leg)).length;
    const row = { simulationTimeMs: event.simulationTimeMs, antId: event.antId, contactGroup: event.contactGroup };
    const sequence = antGroups.get(event.antId) || [];
    sequence.push(row); antGroups.set(event.antId, sequence);
    if (strengthByAnt.has(event.antId)) assert.equal(strengthByAnt.get(event.antId), event.strength,
      inputWindow.id + ' deterministic per-ant contact strength');
    else strengthByAnt.set(event.antId, event.strength);
    for (const contact of event.contacts) {
      const point = contact?.position;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1
        || point.y < 0 || point.y > 1 || !LEGS.includes(contact.legId)) { invalidFeet += 1; continue; }
      const index = cellIndex(point), local = profiles[index];
      windowCounts[index] += 1; local.count += 1; local.legs[contact.legId] += 1;
      local.tripods[event.contactGroup] += 1; local.ants.add(event.antId); local.xy.push([point.x, point.y]);
      local.touches.push({ simulationTimeMs: event.simulationTimeMs, antId: event.antId,
        contactGroup: event.contactGroup, legId: contact.legId, x: point.x, y: point.y });
      const groupKey = `${event.simulationTimeMs}:${event.antId}:${event.contactGroup}`;
      const cellGroup = local.groups.get(groupKey) || { simulationTimeMs: event.simulationTimeMs,
        antId: event.antId, contactGroup: event.contactGroup, legIds: [] };
      cellGroup.legIds.push(contact.legId); local.groups.set(groupKey, cellGroup);
      footCount += 1;
    }
  }
  assert.equal(invalidFeet, 0, inputWindow.id + ' valid event feet');
  assert.equal(footCount, anchor.feet, inputWindow.id + ' accepted event feet');
  assert.equal(tripodMismatchFeet, 0, inputWindow.id + ' fixed tripod leg mapping');
  assert.equal(cumulativeRows.reduce((sum, row) => sum + row.contacts.length, 0), cumulativeCounts.reduce((a, b) => a + b, 0));

  const legs = Object.fromEntries(LEGS.map(leg => [leg, windowRows.reduce((sum, row) =>
    sum + row.contacts.filter(contact => contact.legId === leg).length, 0)]));
  const tripodFeet = { A: 0, B: 0 };
  for (const row of windowRows) tripodFeet[row.contactGroup] += row.contacts.length;
  const transitions = { n: 0, switched: 0, sameObservedGroup: 0 };
  const antIntervals = [];
  for (const sequence of antGroups.values()) {
    sequence.sort((a, b) => a.simulationTimeMs - b.simulationTimeMs);
    for (let index = 1; index < sequence.length; index += 1) {
      transitions.n += 1;
      if (sequence[index].contactGroup !== sequence[index - 1].contactGroup) transitions.switched += 1;
      else transitions.sameObservedGroup += 1;
      antIntervals.push(sequence[index].simulationTimeMs - sequence[index - 1].simulationTimeMs);
    }
  }
  const cellIntervals = profiles.flatMap(local => {
    const times = [...new Set([...local.groups.values()].map(group => group.simulationTimeMs))].sort((a, b) => a - b);
    return times.slice(1).map((time, index) => time - times[index]);
  });
  const touchedCells = Array.from(windowCounts).filter(value => value > 0).length;
  const touchedCumulativeCells = Array.from(cumulativeCounts).filter(value => value > 0).length;
  const cumulativeNonzeroCounts = [], surfaceNonzero = [];
  for (let i = 0; i < CELL_COUNT; i += 1) if (cumulativeCounts[i] > 0) {
    cumulativeNonzeroCounts.push(cumulativeCounts[i]); surfaceNonzero.push(inputWindow.surface[i]);
  }
  const exactBuckets = new Map();
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!windowCounts[index]) continue;
    const key = `${cumulativeCounts[index]}|${inputWindow.surface[index]}`;
    const rows = exactBuckets.get(key) || [];
    rows.push(index); exactBuckets.set(key, rows);
  }
  let matchedPairs = 0, pairsDifferentWindowCount = 0, pairsDifferentLegs = 0, pairsDifferentTripods = 0,
    pairsDifferentTiming = 0, pairsDifferentAnts = 0;
  const examples = { windowCount: null, legs: null, tripods: null, timing: null };
  const countBuckets = new Map();
  const pairSignature = (index, mode) => {
    const local = profiles[index];
    if (mode === 'windowCount') return `${local.count}`;
    if (mode === 'legs') return LEGS.map(leg => local.legs[leg]).join(',');
    if (mode === 'tripods') return `${local.tripods.A},${local.tripods.B}`;
    if (mode === 'timing') return [...local.groups.values()].sort((a, b) => a.simulationTimeMs - b.simulationTimeMs)
      .map(group => `${group.simulationTimeMs}:${group.contactGroup}:${group.legIds.slice().sort().join('+')}`).join(';');
    return [...local.ants].sort().join(',');
  };
  for (const cells of exactBuckets.values()) {
    if (cells.length < 2) continue;
    matchedPairs += cells.length * (cells.length - 1) / 2;
    for (let left = 0; left < cells.length; left += 1) for (let right = left + 1; right < cells.length; right += 1) {
      for (const mode of ['windowCount', 'legs', 'tripods', 'timing', 'ants']) {
        if (pairSignature(cells[left], mode) === pairSignature(cells[right], mode)) continue;
        if (mode === 'windowCount') pairsDifferentWindowCount += 1;
        if (mode === 'legs') pairsDifferentLegs += 1;
        if (mode === 'tripods') pairsDifferentTripods += 1;
        if (mode === 'timing') pairsDifferentTiming += 1;
        if (mode === 'ants') pairsDifferentAnts += 1;
        if (mode !== 'ants' && !examples[mode]) examples[mode] = [cells[left], cells[right]].map(index => ({
          index, position: pointFor(index), cumulativeCount: cumulativeCounts[index], surface: inputWindow.surface[index],
          windowCount: profiles[index].count, legs: profiles[index].legs, tripods: profiles[index].tripods,
          touches: profiles[index].touches.map(({ simulationTimeMs, antId, contactGroup, legId }) => ({ simulationTimeMs, antId, contactGroup, legId }))
        }));
      }
    }
  }
  let adjacentPairs = 0, adjacentDifferentWindowCount = 0, adjacentDifferentLegs = 0,
    adjacentDifferentTripods = 0, adjacentDifferentTiming = 0, adjacentDifferentAnts = 0;
  const adjacentSurfaceDifferences = [], adjacentExamples = { windowCount: null, legs: null, tripods: null, timing: null };
  for (let index = 0; index < CELL_COUNT; index += 1) if (windowCounts[index]) {
    const cells = countBuckets.get(cumulativeCounts[index]) || [];
    cells.push(index); countBuckets.set(cumulativeCounts[index], cells);
  }
  for (const cells of countBuckets.values()) {
    cells.sort((a, b) => inputWindow.surface[a] - inputWindow.surface[b] || a - b);
    for (let pair = 1; pair < cells.length; pair += 1) {
      const left = cells[pair - 1], right = cells[pair];
      adjacentPairs += 1;
      const surfaceDelta = Math.abs(inputWindow.surface[left] - inputWindow.surface[right]);
      adjacentSurfaceDifferences.push(surfaceDelta);
      const pairRows = [left, right].map(index => ({ index, position: pointFor(index), cumulativeCount: cumulativeCounts[index],
        surface: inputWindow.surface[index], windowCount: profiles[index].count, legs: profiles[index].legs,
        tripods: profiles[index].tripods,
        touches: profiles[index].touches.map(({ simulationTimeMs, antId, contactGroup, legId }) => ({ simulationTimeMs, antId, contactGroup, legId })) }));
      for (const mode of ['windowCount', 'legs', 'tripods', 'timing', 'ants']) {
        if (pairSignature(left, mode) === pairSignature(right, mode)) continue;
        if (mode === 'windowCount') adjacentDifferentWindowCount += 1;
        if (mode === 'legs') adjacentDifferentLegs += 1;
        if (mode === 'tripods') adjacentDifferentTripods += 1;
        if (mode === 'timing') adjacentDifferentTiming += 1;
        if (mode === 'ants') adjacentDifferentAnts += 1;
        if (mode !== 'ants' && !adjacentExamples[mode]) adjacentExamples[mode] = { surfaceDelta, cells: pairRows };
      }
    }
  }
  const meanX = profiles.flatMap(local => local.xy).reduce((sum, row) => sum + row[0], 0) / footCount;
  const meanY = profiles.flatMap(local => local.xy).reduce((sum, row) => sum + row[1], 0) / footCount;
  let subgridSquareError = 0, subgridMaxOffset = 0;
  for (const local of profiles) for (const [x, y] of local.xy) {
    const center = pointFor(cellIndex({ x, y })), dx = x - center.x, dy = y - center.y;
    subgridSquareError += dx * dx + dy * dy; subgridMaxOffset = Math.max(subgridMaxOffset, Math.hypot(dx, dy));
  }
  return {
    id: inputWindow.id, tick: inputWindow.tick, startMs: inputWindow.startMs, commitMs: inputWindow.simulationTimeMs,
    durationMs: inputWindow.simulationTimeMs - inputWindow.startMs, cumulativeContactGroups: cumulativeRows.length,
    cumulativeFootContacts: cumulativeCounts.reduce((sum, value) => sum + value, 0),
    contactGroups: windowRows.length, feet: footCount, ants: antGroups.size, groupSizeCounts, legs, tripodFeet,
    tripodGroupCounts: Object.fromEntries(['A', 'B'].map(group => [group, windowRows.filter(row => row.contactGroup === group).length])),
    observedPerAntTripodTransitions: transitions,
    contactStrengthByGroup: stats(windowRows.map(row => row.strength)),
    uniquePerAntContactStrengths: strengthByAnt.size,
    observedPerAntIntercontactIntervalMs: stats(antIntervals),
    cellRevisitIntervalMs: stats(cellIntervals),
    spatial: { touchedCells, cumulativeTouchedCells: touchedCumulativeCells, maxWindowCellCount: Math.max(...windowCounts),
      maxCumulativeCellCount: Math.max(...cumulativeCounts), contactCentroid: { x: meanX, y: meanY },
      rawPointTo96GridCellCenterRmsDistance: Math.sqrt(subgridSquareError / footCount),
      maxRawPointTo96GridCellCenterDistance: subgridMaxOffset,
      cumulativeCountSurfacePearsonAllCells: pearson(Array.from(cumulativeCounts), inputWindow.surface),
      cumulativeCountSurfacePearsonCumulativeTouchedCells: pearson(cumulativeNonzeroCounts, surfaceNonzero),
      exactScalarMatchedTouchedCellPairs: matchedPairs,
      exactScalarMatchedPairsDifferentWindowCount: pairsDifferentWindowCount,
      exactScalarMatchedPairsDifferentLegComposition: pairsDifferentLegs,
      exactScalarMatchedPairsDifferentTripodComposition: pairsDifferentTripods,
      exactScalarMatchedPairsDifferentTimedContactSequence: pairsDifferentTiming,
      exactScalarMatchedPairsDifferentAntComposition: pairsDifferentAnts,
      deterministicExamples: examples,
      sameCountAdjacentSurfacePairs: adjacentPairs,
      sameCountAdjacentSurfaceDifference: stats(adjacentSurfaceDifferences),
      adjacentScalarPairsDifferentWindowCount: adjacentDifferentWindowCount,
      adjacentScalarPairsDifferentLegComposition: adjacentDifferentLegs,
      adjacentScalarPairsDifferentTripodComposition: adjacentDifferentTripods,
      adjacentScalarPairsDifferentTimedContactSequence: adjacentDifferentTiming,
      adjacentScalarPairsDifferentAntComposition: adjacentDifferentAnts,
      deterministicAdjacentExamples: adjacentExamples },
    maps: { cumulativeCounts: Array.from(cumulativeCounts), windowCounts: Array.from(windowCounts),
      surface: inputWindow.surface, legCounts: Object.fromEntries(LEGS.map(leg => [leg, profiles.map(local => local.legs[leg])])),
      tripodCounts: { A: profiles.map(local => local.tripods.A), B: profiles.map(local => local.tripods.B) },
      revisitCounts: profiles.map(local => new Set([...local.groups.values()].map(group => group.simulationTimeMs)).size) },
    contacts: windowRows.map(event => ({ simulationTimeMs: event.simulationTimeMs, antId: event.antId,
      contactGroup: event.contactGroup, strength: event.strength, centroid: event.position,
      contacts: event.contacts.map(contact => ({ legId: contact.legId, position: contact.position })) })),
    scaffold: { selectedI: inputWindow.selectedI, edges: inputWindow.edges },
    _diagnostic: { windowCounts, cumulativeCounts, profiles }
  };
}

function overlap(a, b) {
  let intersection = 0, union = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const aa = a[i] > 0, bb = b[i] > 0;
    if (aa && bb) intersection += 1;
    if (aa || bb) union += 1;
  }
  return { intersection, union, jaccard: union ? intersection / union : null };
}

function atlasHtml(results) {
  const data = JSON.stringify(results.map(({ id, startMs, commitMs, contacts, scaffold, maps }) =>
    ({ id, startMs, commitMs, contacts, scaffold, maps }))).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANT gait contact signal audit</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#20242a}h1{margin:0 0 5px}.note{max-width:1000px;color:#444}.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:18px 0}.events{display:grid;grid-template-columns:repeat(2,minmax(320px,1fr));gap:20px}.event{border-top:1px solid #aaa;padding-top:12px}.event h2{font-size:16px}.map{width:min(100%,640px);aspect-ratio:1;background:#fff;border:1px solid #888}.legend{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0;color:#444;font-size:12px}.scale{font-variant-numeric:tabular-nums}@media(max-width:800px){.events{grid-template-columns:1fr}}</style>
<h1>ANT FOOT_CONTACT signal atlas</h1><p class="note">Frozen P1/P2 contacts on the authored 96×96 coordinate grid. Raw marks retain individual touchdown locations; maps use the production nearest-cell count projection or exact commit SurfaceField values. P1 and P2 share display scales. Selected I is optional context only. No interpolation, smoothing, per-event normalization, body mask, or material mapping.</p>
<div class="controls"><label>Layer <select id="layer"><option value="leg">Raw feet · leg identity</option><option value="tripod">Raw feet · tripod A/B</option><option value="time">Raw feet · elapsed touchdown time (shared 0–20 s)</option><option value="count">Window foot count · per 96 cell</option><option value="cumulative">Cumulative foot count · commit</option><option value="surface">SurfaceField · commit value (fixed 0–1)</option><option value="revisit">Distinct touchdown times · per 96 cell</option></select></label><label><input id="scaffold" type="checkbox"> show selected I context</label><span class="scale" id="scale"></span></div>
<div class="events">${results.map((row, i) => `<section class="event"><h2>${row.id} · ${row.contacts.length.toLocaleString()} FOOT_CONTACT groups · ${(row.commitMs-row.startMs).toFixed(3)} ms</h2><canvas class="map" id="map${i}" width="640" height="640" aria-label="${row.id} signal map"></canvas></section>`).join('')}</div>
<div class="legend" id="legend"></div><script id="audit-data" type="application/json">${data}</script><script>
const D=JSON.parse(document.getElementById('audit-data').textContent),SIZE=96,LEG=${JSON.stringify(LEG_COLORS)},layer=document.getElementById('layer'),show=document.getElementById('scaffold');
const maxCount=Math.max(...D.flatMap(e=>e.maps.windowCounts)),maxCumulative=Math.max(...D.flatMap(e=>e.maps.cumulativeCounts)),maxRevisit=Math.max(...D.flatMap(e=>e.maps.revisitCounts)),palette=['#eff3ff','#bdd7e7','#6baed6','#2171b5','#08306b'];
const countColor=(v,max)=>palette[Math.min(4,Math.floor(v/(max||1)*4))],surfaceColor=v=>{const c=Math.round(255*(1-v));return 'rgb('+c+','+c+','+c+')'},timeColor=(t,start)=>{const u=Math.max(0,Math.min(1,(t-start)/(20000)));const r=Math.round(40+210*u),b=Math.round(220-180*u);return 'rgb('+r+',75,'+b+')'};
function draw(i){const e=D[i],c=document.getElementById('map'+i),x=c.getContext('2d'),span=610,off=15,px=p=>off+p.x*span,py=p=>off+(1-p.y)*span; x.clearRect(0,0,640,640);x.fillStyle='#fbfbf8';x.fillRect(off,off,span,span);x.strokeStyle='#888';x.strokeRect(off,off,span,span);
const mode=layer.value;if(mode==='count'||mode==='cumulative'||mode==='surface'||mode==='revisit'){const vals=mode==='count'?e.maps.windowCounts:mode==='cumulative'?e.maps.cumulativeCounts:mode==='surface'?e.maps.surface:e.maps.revisitCounts;for(let k=0;k<vals.length;k++){const v=vals[k];if(!v)continue;const p={x:k%SIZE/(SIZE-1),y:Math.floor(k/SIZE)/(SIZE-1)},cell=span/(SIZE-1);x.fillStyle=mode==='surface'?surfaceColor(v):countColor(v,mode==='count'?maxCount:mode==='cumulative'?maxCumulative:maxRevisit);x.fillRect(px(p)-cell/2,py(p)-cell/2,cell,cell)}}
else for(const g of e.contacts)for(const q of g.contacts){const p=q.position;x.beginPath();x.arc(px(p),py(p),1.55,0,Math.PI*2);x.fillStyle=mode==='leg'?LEG[q.legId]:mode==='tripod'?(g.contactGroup==='A'?'#2878b5':'#df7f20'):timeColor(g.simulationTimeMs,e.startMs);x.globalAlpha=.62;x.fill();x.globalAlpha=1}
if(show.checked){x.strokeStyle='#1f5b85';x.lineWidth=.65;x.globalAlpha=.48;for(const [a,b] of e.scaffold.edges){const p=px({x:a%SIZE/(SIZE-1),y:Math.floor(a/SIZE)/(SIZE-1)}),q=px({x:b%SIZE/(SIZE-1),y:Math.floor(b/SIZE)/(SIZE-1)});x.beginPath();x.moveTo(p,py({x:0,y:Math.floor(a/SIZE)/(SIZE-1)}));x.lineTo(q,py({x:0,y:Math.floor(b/SIZE)/(SIZE-1)}));x.stroke()}x.globalAlpha=1}
}
function legend(){const m=layer.value,node=document.getElementById('legend'),s=document.getElementById('scale');node.innerHTML='';if(m==='leg'){for(const [k,v] of Object.entries(LEG)){const q=document.createElement('span');q.textContent=k;q.style.color=v;node.appendChild(q)}s.textContent='Raw individual FOOT_CONTACT positions; each mark is one emitted foot.'}else if(m==='tripod'){node.textContent='A = blue · B = orange. Tripod assignment is fixed by GaitController.';s.textContent='Raw individual foot positions; emitted contactGroup retained.'}else if(m==='time'){node.textContent='Blue = early · red = late.';s.textContent='Elapsed time uses the same 0–20 s scale for both event windows.'}else if(m==='count'){node.textContent='Sequential blue scale; zero cells left blank.';s.textContent='Shared window-count display maximum: '+maxCount+' feet/cell.'}else if(m==='cumulative'){node.textContent='Sequential blue scale; zero cells left blank.';s.textContent='Shared commit cumulative-count display maximum: '+maxCumulative+' feet/cell.'}else if(m==='surface'){node.textContent='Black = 1 · white = 0.';s.textContent='Exact SurfaceField commit value, fixed 0–1 scale.'}else{node.textContent='Sequential blue scale; zero cells left blank.';s.textContent='Shared revisit-count display maximum: '+maxRevisit+' distinct touchdown times/cell.'}}
for(let i=0;i<D.length;i++)draw(i);legend();layer.addEventListener('change',()=>{for(let i=0;i<D.length;i++)draw(i);legend()});show.addEventListener('change',()=>{for(let i=0;i<D.length;i++)draw(i)});
</script></html>`;
}

async function main() {
  const check = process.argv.includes('--check');
  const inputBytes = await readFile(resolve(ROOT, INPUT)), input = JSON.parse(gunzipSync(inputBytes));
  const anchorsBytes = await readFile(resolve(ROOT, ANCHORS)), anchors = JSON.parse(gunzipSync(anchorsBytes));
  assert.equal(input.schema, 'ant-gait-contact-signal-input-v1');
  assert.deepEqual(input.scope, { seed: 20261005, seconds: 120, tickRate: 60, audio: 'Off', grid: SIZE });
  assert.equal(input.provenance.packetSha256, '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc');
  assert.equal(sha256(anchorsBytes), input.provenance.parityAnchorSha256);
  assert.equal(input.contacts.length, anchors.contactPrefix.groups);
  assert.equal(input.contacts.reduce((sum, row) => sum + row.contacts.length, 0), anchors.contactPrefix.feet);
  assert.equal(streamHash(input.contacts), anchors.contactPrefix.sha256, 'complete frozen P2 contact prefix');
  assert.equal(input.windows.length, 2);
  for (const [path, expected] of Object.entries(input.provenance.sourceHashes)) {
    assert.equal(sha256(await readFile(resolve(ROOT, path))), expected, 'production source hash ' + path);
  }
  for (const path of ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/GaitController.js',
    'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
    'src/lib/agents/ant/MaterialStratigraphy.js']) {
    assert.equal(input.provenance.sourceHashes[path], anchors.source.sourceHashes[path], 'frozen source receipt ' + path);
  }

  const results = input.windows.map(window => summarizeWindow(window, input.contacts, anchors));
  const p1 = results[0]._diagnostic, p2 = results[1]._diagnostic;
  const mapComparison = (left, right) => ({
    support: overlap(left, right),
    pearsonAcrossAllCells: pearson(left, right)
  });
  const rawFootTotals = results.map(row => row.feet);
  const shared = { p1P2WindowContactTotalRatio: rawFootTotals[1] / rawFootTotals[0],
    exactGridCellSupportOverlap: overlap(p1.windowCounts, p2.windowCounts),
    windowCountPerCellPearsonAcrossAllCells: pearson(Array.from(p1.windowCounts), Array.from(p2.windowCounts)),
    legSpatialMaps: Object.fromEntries(LEGS.map(leg => [leg, mapComparison(results[0].maps.legCounts[leg], results[1].maps.legCounts[leg])])),
    tripodSpatialMaps: Object.fromEntries(['A', 'B'].map(group => [group,
      mapComparison(results[0].maps.tripodCounts[group], results[1].maps.tripodCounts[group])])) };
  const summary = {
    schema: 'ant-gait-contact-signal-audit-v1',
    decision: { label: 'INDEPENDENT INFORMATION OBSERVED', qualifier: 'descriptive event-history information only; not an independent gait mechanism or validated material responsibility' },
    baseline: { productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
      researchParent: '86308a9cc8bdb067ecabd33465e127d9d453164d', branch: 'codex/ant-gait-contact-signal-audit-20261029',
      historyPacketCommit: input.provenance.packetCommit, historyPacketMain: input.provenance.sourceMain,
      historyPacketSha256: input.provenance.packetSha256 },
    provenance: { inputSha256: sha256(inputBytes), inputBytes: inputBytes.length,
      parityAnchorsSha256: sha256(anchorsBytes), sourceHashes: input.provenance.sourceHashes,
      contactPrefixGroups: input.contacts.length, contactPrefixFeet: input.contacts.reduce((sum, row) => sum + row.contacts.length, 0),
      contactPrefixSha256: streamHash(input.contacts), replayPerformed: false,
      p1P2WindowDigestsMatched: true, surfaceEndpointHashesMatched: true, sourceHashesMatched: true },
    methods: { timeRule: '(event start, commit] from frozen ownership anchors', grid: 'production 96x96; nearest-cell Math.round in each dimension',
      cumulativeCount: 'all valid individual FOOT_CONTACT feet through commit, nearest-cell exact projection',
      surfaceField: 'frozen production C_surface endpoint, exact 96x96 Float32 values',
      scalarMatchedCells: 'within each event, exact equality of cumulative per-cell contact count and SurfaceField value; both cells have current-window contacts',
      smoothingOrEventwiseNormalization: false, arbitraryThresholds: false },
    gaitCountermodel: { fixedTripods: TRIPOD_LEGS,
      sourceLaw: 'GaitController emits alternating tripod touchdown groups from deterministic per-ant distance-driven phase; leg geometry is fixed by body heading, radius and phase.',
      observedTripodLegMismatchFeet: 0,
      limitation: 'Frozen contact stream has exact touchdown events but not per-tick gait phase, full ant movement, heading or body pose; no trajectory-conditioned counterfactual was reconstructed.' },
    windows: results.map(({ _diagnostic, maps: _maps, contacts: _contacts, scaffold: _scaffold, ...row }) => row),
    sharedP1P2: shared,
    interpretationBoundary: 'Raw organization may contain event-specific history beyond scalar endpoints; a difference does not establish a useful or necessary material responsibility, mechanical force, or a new material law.'
  };
  const maps = { schema: 'ant-gait-contact-signal-measurements-v1', windows: results.map(({ id, startMs, commitMs, maps, contacts, scaffold }) =>
    ({ id, startMs, commitMs, maps, contacts, scaffold })) };
  const outputs = [Buffer.from(JSON.stringify(summary, null, 2) + '\n'), gzipSync(Buffer.from(JSON.stringify(maps)), { level: 9, mtime: 0 }),
    Buffer.from(atlasHtml(results))];
  for (let index = 0; index < OUTPUTS.length; index += 1) {
    const target = resolve(ROOT, OUTPUTS[index]);
    if (check) assert((await readFile(target)).equals(outputs[index]), OUTPUTS[index] + ' differs from deterministic measurement output');
    else await writeFile(target, outputs[index]);
  }
  console.log(JSON.stringify({ mode: check ? 'check' : 'write', outputs: OUTPUTS,
    windows: summary.windows.map(row => ({ id: row.id, groups: row.contactGroups, feet: row.feet,
      touchedCells: row.spatial.touchedCells, matchedPairs: row.spatial.exactScalarMatchedTouchedCellPairs,
      differentLegPairs: row.spatial.exactScalarMatchedPairsDifferentLegComposition,
      nearestSurfacePairs: row.spatial.sameCountAdjacentSurfacePairs,
      adjacentDifferentLegPairs: row.spatial.adjacentScalarPairsDifferentLegComposition,
      adjacentDifferentTripodPairs: row.spatial.adjacentScalarPairsDifferentTripodComposition,
      adjacentDifferentTimingPairs: row.spatial.adjacentScalarPairsDifferentTimedContactSequence })),
    p1P2WindowCountSupport: shared.exactGridCellSupportOverlap }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
