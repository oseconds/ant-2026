import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate');
const sha = b => createHash('sha256').update(b).digest('hex');
const load = async name => { const bytes = await readFile(resolve(base, 'data', name)); return { bytes, data: JSON.parse(bytes) }; };
const packetBytes = await readFile(resolve(base, 'data/history-packet.json.gz'));
assert.equal(sha(packetBytes), (await load('capture.json')).data.packetSha256);
const packet = JSON.parse(gunzipSync(packetBytes));
const provenance = await load('terminal-provenance.json');
assert.equal(sha(provenance.bytes), (await load('terminal-provenance-validation.json')).data.resultSha256);
const names = ['E_qualified', 'H_boundary_length_eligible', 'I_retained_network', 'J_frozen_birth_union'];
const frames = packet.analyses.map((a, i) => ({ t: a.simulationTimeMs / 1000, tick: a.tick,
  birth: a.birthsThisTick, candidate: a.candidate,
  maps: names.map(name => a.maps[name].flatMap((value, cell) => value ? [cell] : [])),
  groups: provenance.data.rows[i].classification?.groups ?? null }));
assert.equal(frames.length, 120);
for (const frame of frames) for (const cells of frame.maps) assert.ok(cells.every(c => Number.isInteger(c) && c >= 0 && c < 9216));
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plate formation: history and selection</title><style>
body{font:15px system-ui,sans-serif;color:#222;margin:24px;max-width:1500px}p{max-width:95ch;line-height:1.6}
.maps{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}figure{margin:0}figcaption{min-height:3em}
canvas{width:100%;height:auto;border:1px solid #bbb;background:#fff;image-rendering:pixelated}input{width:min(900px,90vw)}button{margin:8px;padding:6px}output{display:block;margin:12px 0}li{line-height:1.6}
</style><h1>현재 history와 선택 결과</h1>
<p>Current G H0 · seed 20261005 · Audio Off · 120개의 실제 초당 analysis. 새 formation 후보의 시각화가 아닙니다.
96-grid 기술 도면을 같은 640×640 좌표에 표시합니다. 개미·production renderer·native AV를 재현하지 않습니다. 색은 graph 분류 표지이며 물성이나 미학의 평가가 아닙니다.</p>
<label for="time">기록된 analysis 선택</label><br><input id="time" type="range" min="0" max="119" value="84" step="1">
<div><button data-frame="64">첫 candidate</button><button data-frame="84">첫 birth</button><button data-frame="106">두 번째 birth</button><button data-frame="119">마지막 analysis</button></div>
<output id="status" aria-live="polite"></output><div class="maps">
${['E · chemical + mechanical qualification','H · source/boundary/length eligible skeleton','I · production retained network','J · 실제 frozen Plate union','H 분류 · 같은 root / boundary terminal'].map((label, i) => `<figure><figcaption>${label}</figcaption><canvas id="map${i}" width="640" height="640" aria-label="${label}"></canvas></figure>`).join('')}
</div><p>분류: 검정=선택 I, 파랑=동률 최단 대안, 주황=더 긴 단순 terminal-path 대안, 자주=terminal 없는 pendant 부분.
작은 raster 연결은 실제 거시 경로나 물체를 뜻하지 않습니다. H 분류 그림 전체를 하나의 Plate로 제안하지 않습니다.</p>
<h2>판단 메모</h2><ol><li>먼저 어느 변화·장소를 따라갈 수 있는지 자유롭게 적습니다.</li>
<li>선택에서 빠진 더 긴 연결부가 별개의 보존할 history로 보이는지, 현재 통로의 세부 변동으로 보이는지 구분합니다.</li>
<li>한 물질화 사건은 변하는 통로 전체를 확정해야 하는지, 국소적으로 자격을 유지한 공간을 확정해야 하는지 판단합니다.</li></ol>
<p>두 번째와 세 번째 질문은 작품 계약의 선택입니다. 이 도면만으로 audience salience, sound, 자연 phase transition을 판정할 수 없습니다.
<a href="GATE-REPORT.md">Gate Report</a> · <a href="README.md">재현·측정·한계</a></p>
<script id="frames" type="application/json">${JSON.stringify(frames)}</script>
<script>
const frames=JSON.parse(document.getElementById('frames').textContent), slider=document.getElementById('time');
const colors={selected:'#111111',equalShortest:'#2878b5',longerAlternative:'#c57016',pendant:'#a04286'};
function paint(canvas,groups){const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,640,640);
 for(const [color,cells] of groups){ctx.fillStyle=color;for(const c of cells){const x=c%96,y=Math.floor(c/96);
  const x0=Math.ceil((x-.5)*639/95),y0=Math.ceil((y-.5)*639/95),x1=Math.ceil((x+.5)*639/95),y1=Math.ceil((y+.5)*639/95);
  ctx.fillRect(Math.max(0,x0),Math.max(0,y0),Math.min(640,x1)-Math.max(0,x0),Math.min(640,y1)-Math.max(0,y0));}}}
function show(index){slider.value=index;const f=frames[index];document.getElementById('status').textContent=
 f.t.toFixed(6)+' s · tick '+f.tick+' · birth '+f.birth+' · E/H/I/J cells '+f.maps.map(a=>a.length).join(' / ');
 f.maps.forEach((cells,i)=>paint(document.getElementById('map'+i),[['#111111',cells]]));
 paint(document.getElementById('map4'),f.groups?Object.entries(f.groups).map(([name,cells])=>[colors[name],cells]):[]);}
slider.addEventListener('input',()=>show(Number(slider.value)));document.querySelectorAll('button[data-frame]').forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.frame))));show(84);
</script></html>\n`;
const target = resolve(base, 'review.html');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), html);
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, html);
  await writeFile(resolve(base, 'data/review-validation.json'), JSON.stringify({ htmlSha256: sha(html), packetSha256: sha(packetBytes),
    provenanceSha256: sha(provenance.bytes), frames: frames.length, canvas: [640, 640], maps: names,
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))), scope: 'technical map viewer only; no artistic/human result' }, null, 2) + '\n');
}
console.log('120-frame technical review packet verified; no new world or renderer.');
