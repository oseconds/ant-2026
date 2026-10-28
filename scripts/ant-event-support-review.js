import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-event-scoped-material-support');
const sha = b => createHash('sha256').update(b).digest('hex');
async function verified(name, receipt, key) {
  const bytes = await readFile(resolve(base, 'data', name)), r = JSON.parse(await readFile(resolve(base, 'data', receipt), 'utf8'));
  assert.equal(sha(bytes), r[key]); return name.endsWith('.gz') ? JSON.parse(gunzipSync(bytes)) : JSON.parse(bytes);
}
const atlas = await verified('atlas.json.gz', 'atlas-validation.json', 'resultGzipSha256');
const association = await verified('association.json', 'association-validation.json', 'resultSha256');
const contracts = await verified('contracts.json', 'contracts-validation.json', 'resultSha256');
const overview = JSON.parse(await readFile(resolve(base, 'data/atlas-summary.json'), 'utf8'));
const data = atlas.atlases.map((a, i) => ({ event: a.event, occupancy: overview.events[i].occupancy,
  controls: Object.fromEntries(Object.entries(contracts.cases[i]).map(([name, c]) => [name, c.cells])),
  cells: a.cells.map(c => ({ cell: c.cell, occupancy: c.E.event.fraction, carryIn: c.E.event.leftBoundaryCarryIn,
    onsetSeconds: c.E.event.onsetOffsetMs === null ? null : c.E.event.onsetOffsetMs / 1000,
    eventE: c.E.event, absoluteE: c.E.absoluteAtBirth, membershipBits: c.orbitBits,
    rawMechanicalIncrement: association.events[i].mechanical.retainedIncrementValues[c.cell],
    mechanicalIncrementShare: association.events[i].mechanical.observedEndValues[c.cell] > 0
      ? association.events[i].mechanical.retainedIncrementValues[c.cell] / association.events[i].mechanical.observedEndValues[c.cell] : null,
    fields: Object.fromEntries(Object.entries(c.fields).map(([name, { integralSemantics, ...f }]) => [name, f])),
    contacts: c.contacts, finalRibbon: c.ribbon.final, laterFrozen: c.ribbon.laterNewFrozen })) }));
assert.equal(data.length, 2);
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Event-support atlas</title><style>
body{font:15px system-ui,sans-serif;color:#222;margin:24px;max-width:1400px}p,li{line-height:1.6}p{max-width:105ch}
.maps{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}figure{margin:0}figcaption{min-height:3em}
canvas{width:100%;height:auto;border:1px solid #aaa;image-rendering:pixelated}button,select{padding:7px;margin:8px 8px 12px 0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #ddd;background:#fafafa;padding:16px;max-height:500px;overflow:auto}
svg{width:min(850px,100%);height:auto}output{display:block;margin:12px 0}rect{shape-rendering:crispEdges}
</style><h1>Event-support history atlas</h1>
<p>Current G / H0 / seed 20261005 / Audio Off. 기존의 두 candidate lineage를 관찰용 시간창으로 사용했습니다.
Event membership·순간 E qualification·최종 geometry는 서로 다릅니다. 아래 support A/B는 연구 대조이며 production 후보로 채택되지 않았습니다.
새로운 production 화면·오디오·미학 비교가 아닙니다.</p>
<label for="event">기록된 event</label><select id="event"><option value="0">Event 1 · 64.016667–84.016667 s</option><option value="1">Event 2 · 86.016667–106.016667 s</option></select>
<output id="status" aria-live="polite"></output><div class="maps">
${['E occupancy · 고정 범위 0–1','직전 anchor부터 이어진 E · carry-in','기간 내 기계 기여 / 종료 compaction · 0–1','실제 final ribbon · reference','A · 모든 anchor 연관 E + 양의 기계 기여','B · 종료 연관 E + 양의 기계 기여'].map((label, i) => `<figure><figcaption>${label}</figcaption><canvas id="map${i}" width="640" height="640" aria-label="${label}"></canvas></figure>`).join('')}
</div><p>검정일수록 값이 큽니다. 첫 세 도면의 회색 배경은 atlas census 밖이며 field가 0이라는 뜻이 아닙니다.
기계 기여는 실제 접촉 위치를 고정한 field-only shadow의 조건부 차이입니다. 특정 event만의 독점 원인이나 물리 dose가 아닙니다.
모든 값은 파일의 동일 좌표·동일 시간창을 사용합니다. 셀을 클릭하면 개별 이력을 볼 수 있습니다.</p>
<h2>E occupancy 분포 · cutoff 없음</h2><svg id="histogram" viewBox="0 0 850 240" role="img" aria-label="전체 occupancy 수준별 셀 수"></svg>
<p>0/21은 census 안에서 E가 없던 셀입니다. Census는 기간 중 E/H/I/candidate ribbon의 조사 대상 합집합이며 event의 구성원 수가 아닙니다.</p>
<h2>선택한 좌표의 이력</h2><pre id="detail">도면의 셀을 클릭하세요.</pre>
<p><a href="GATE-REPORT.md">Gate Report</a> · <a href="README.md">근거·재현·한계</a></p>
<script id="atlasData" type="application/json">${JSON.stringify(data)}</script>
<script>
const atlasData=JSON.parse(document.getElementById('atlasData').textContent),choose=document.getElementById('event');
function paint(id,values){const ctx=document.getElementById(id).getContext('2d');ctx.fillStyle=id==='map0'||id==='map1'||id==='map2'?'#eeeeee':'#ffffff';ctx.fillRect(0,0,640,640);
 for(const [c,v] of values){const g=255-Math.round(255*Math.max(0,Math.min(1,v)));ctx.fillStyle='rgb('+g+','+g+','+g+')';
 const x=c%96,y=Math.floor(c/96),x0=Math.max(0,Math.ceil((x-.5)*639/95)),y0=Math.max(0,Math.ceil((y-.5)*639/95));
 const x1=Math.min(640,Math.ceil((x+.5)*639/95)),y1=Math.min(640,Math.ceil((y+.5)*639/95));ctx.fillRect(x0,y0,x1-x0,y1-y0);}}
function show(){document.getElementById('detail').textContent='도면의 셀을 클릭하세요.';const d=atlasData[Number(choose.value)];document.getElementById('status').textContent='관찰용 시간창 '+(d.event.startMs/1000).toFixed(6)+'–'+(d.event.endAnalysisTimeMs/1000).toFixed(6)+' s · '+d.event.anchors+' anchors · census '+d.cells.length+' 좌표';
 paint('map0',d.cells.map(c=>[c.cell,c.occupancy]));paint('map1',d.cells.map(c=>[c.cell,Number(c.carryIn)]));paint('map2',d.cells.map(c=>[c.cell,c.mechanicalIncrementShare??0]));
 paint('map3',d.cells.filter(c=>c.finalRibbon).map(c=>[c.cell,1]));paint('map4',d.controls.core.map(c=>[c,1]));paint('map5',d.controls.closing.map(c=>[c,1]));
 const max=Math.max(...d.occupancy.map(o=>o.cells)),h=document.getElementById('histogram');h.replaceChildren();
 d.occupancy.forEach((o,i)=>{const x=30+i*36,height=o.cells/max*170;const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('x',x);r.setAttribute('y',185-height);r.setAttribute('width',26);r.setAttribute('height',height);r.setAttribute('fill','#555');const title=document.createElementNS(r.namespaceURI,'title');title.textContent=o.presentAnchors+'/'+d.event.anchors+': '+o.cells+' cells';r.append(title);h.append(r);
 const t=document.createElementNS(r.namespaceURI,'text');t.setAttribute('x',x);t.setAttribute('y',210);t.setAttribute('font-size','11');t.textContent=o.presentAnchors;h.append(t);});}
choose.addEventListener('change',show);document.querySelectorAll('canvas').forEach(c=>c.addEventListener('click',e=>{const r=c.getBoundingClientRect(),x=Math.max(0,Math.min(95,Math.round((e.clientX-r.left)/r.width*95))),y=Math.max(0,Math.min(95,Math.round((e.clientY-r.top)/r.height*95)));const row=atlasData[Number(choose.value)].cells.find(c=>c.cell===y*96+x);document.getElementById('detail').textContent=JSON.stringify(row??{cell:y*96+x,note:'census 밖'},null,2);}));show();
</script></html>\n`;
const target = resolve(base, 'atlas.html');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), html);
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, html);
  await writeFile(resolve(base, 'data/review-validation.json'), JSON.stringify({ htmlSha256: sha(html), runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    events: 2, canvas: [640, 640], semantics: 'technical atlas only; no human artistic result or renderer adoption' }, null, 2) + '\n');
}
console.log('Two-event technical atlas generated/verified.');
