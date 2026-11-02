import './styles.css';
import { STEP, seedValue, stateDigest } from './common.js';
import { ActivityWorld } from './activity.js';
import { MemoryWorld } from './memory.js';
import { CapacityWorld } from './capacity.js';
import { renderProbe } from './response.js';

const $ = id => document.getElementById(id);
const constructors = { A: ActivityWorld, B: MemoryWorld, C: CapacityWorld };
const MAX_TICKS = 216000;
const laws = {
  A: '활동은 공급과 교란을 함께 남깁니다. 교란은 빨리 줄고, 결합은 천천히 회복하며 이동성을 낮춥니다.',
  B: '동일한 질량·형상과 입력량. AB / BA 순서가 방향 기억을 바꾸고, 같은 결합 법칙이 이를 읽습니다.',
  C: '질량과 위치는 고정. 국소 구동이 변형을 만들고, 연결별 용량이 보존된 예산 안에서 재분배됩니다.'
};
let modelId = 'A', world = new ActivityWorld(), running = false, busy = false;
let responses = [], context, source, accumulator = 0, lastFrame;
const canvas = $('world'), pen = canvas.getContext('2d');
const wave = $('wave'), wavePen = wave.getContext('2d');

function stopAudio() { if (source) { source.stop(); source.disconnect(); source = null; } }
function clearProbe() { stopAudio(); responses = []; $('listen').disabled = true; $('sample').replaceChildren(); drawWave(); }
function pause() { running = false; accumulator = 0; $('run').textContent = '실행'; }
function select(id = $('model').value, seed = $('seed').value) {
  if (!Object.hasOwn(constructors, id)) throw new Error('Unknown model');
  const next = new constructors[id](seedValue(seed));
  pause(); clearProbe(); modelId = id; world = next;
  $('model').value = id; $('seed').value = world.seed;
  $('field').hidden = id !== 'A'; $('law').textContent = laws[id];
  $('receipt').textContent = ''; $('status').textContent = ''; draw();
}
function text(value, x, y, size = 16) { pen.font = `${size}px system-ui`; pen.fillStyle = '#494940'; pen.fillText(value, x, y); }
function point(x, y, radius, alpha = 1) {
  pen.fillStyle = `rgba(38,38,33,${alpha})`; pen.beginPath(); pen.arc(x, y, radius, 0, Math.PI * 2); pen.fill();
}
function line(x, y, xx, yy, width, alpha = 1) {
  pen.strokeStyle = `rgba(38,38,33,${alpha})`; pen.lineWidth = width; pen.beginPath(); pen.moveTo(x, y); pen.lineTo(xx, yy); pen.stroke();
}
function draw() {
  const view = world.view(), diagnostic = $('diagnostic').checked;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  $('time').textContent = `${(world.tick * STEP).toFixed(3)} s`;
  $('phase').textContent = view.phase;
  $('stats').replaceChildren(...Object.entries(view.stats).map(([key, value]) => {
    const group = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
    term.textContent = key; detail.textContent = typeof value === 'number' ? value.toPrecision(5) : value;
    group.append(term, detail); return group;
  }));
  if (modelId === 'A') {
    const size = view.size, cell = 18, left = (1200 - size * cell) / 2, top = (520 - size * cell) / 2;
    for (let i = 0; i < view.mass.length; i++) {
      const x = left + (i % size) * cell, y = top + Math.floor(i / size) * cell;
      const field = diagnostic ? $('field').value : 'mass';
      const value = field === 'mass' ? 1 - Math.exp(-view.mass[i] / 0.08) : field === 'agitation' ? view.agitation[i] / 2 : view.bond[i];
      pen.fillStyle = `rgba(38,38,33,${Math.min(1, value)})`; pen.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (!diagnostic && view.mass[i] > 0) point(x + cell / 2, y + cell / 2, 3 * view.bond[i]);
    }
    $('legend').textContent = diagnostic ? `진단: ${$('field').selectedOptions[0].textContent}. 고정 스케일: mass 1−exp(−m/.08), 교란 0…2, 결합 0…1.` : '재료량은 면의 농도, 결합은 중앙 점의 반경. 고정 스케일, 프레임별 정규화 없음.';
  } else if (modelId === 'B') {
    const samples = world.snapshot().samples;
    samples.forEach((sample, n) => {
      const left = n * 600 + 100, top = 70, scale = 400;
      text(n === 0 ? 'Sample 1 · A then B' : 'Sample 2 · B then A', left, 35);
      for (const [i, j] of sample.edges) {
        const [x, y] = sample.positions[i], [xx, yy] = sample.positions[j];
        line(left + x * scale, top + y * scale, left + xx * scale, top + yy * scale, 1, .13);
      }
      sample.positions.forEach(([x, y], i) => {
        const cx = left + x * scale, cy = top + y * scale;
        point(cx, cy, 2 + sample.masses[i] * 2, .6);
        if (diagnostic) {
          line(cx - sample.memoryX[i] * 1800, cy, cx + sample.memoryX[i] * 1800, cy, 2);
          line(cx, cy - sample.memoryY[i] * 1800, cx, cy + sample.memoryY[i] * 1800, 2);
        }
      });
    });
    $('legend').textContent = diagnostic ? '내부 방향 기억: 가로 A / 세로 B. 길이 = 3600 × 국소 기억, 고정 스케일. 점은 동일한 질량.' : '현재 외형은 동일합니다. 내부 상태에서 가로/세로 기억을, probe에서 같은 자극의 응답을 비교하세요.';
  } else {
    const left = 370, top = 30, scale = 460;
    view.edges.forEach(([i, j], edge) => {
      const [x, y] = view.positions[i], [xx, yy] = view.positions[j];
      line(left + x * scale, top + y * scale, left + xx * scale, top + yy * scale, diagnostic ? .5 + view.capacity[edge] * 2 : 1, diagnostic ? .7 : .15);
    });
    view.positions.forEach(([x, y], i) => point(left + x * scale, top + y * scale, 4, diagnostic ? .4 + .5 * Math.tanh(Math.abs(view.displacement[i]) / .01) : .65));
    $('legend').textContent = diagnostic ? '연결 폭 = .5 + 2 × capacity. 점 농도는 |변위|/.01의 tanh. 질량과 노드 위치는 고정.' : '고정된 물질의 외형. 내부 상태를 켜면 연결 용량의 재분배와 현재 변위를 볼 수 있습니다.';
  }
}
function drawWave() {
  wavePen.clearRect(0, 0, wave.width, wave.height);
  for (let channel = 0; channel < 2; channel++) {
    const base = 25 + channel * 50;
    wavePen.strokeStyle = '#c9c9c0'; wavePen.beginPath(); wavePen.moveTo(0, base); wavePen.lineTo(1200, base); wavePen.stroke();
    const response = responses[Number($('sample').value) || 0];
    if (!response) continue;
    const data = channel === 0 ? response.left : response.right;
    wavePen.strokeStyle = '#34342e'; wavePen.beginPath();
    for (let x = 0; x < 1200; x++) {
      const start = Math.floor(x * data.length / 1200), end = Math.max(start + 1, Math.floor((x + 1) * data.length / 1200));
      let low = 0, high = 0;
      for (let i = start; i < end; i++) { low = Math.min(low, data[i]); high = Math.max(high, data[i]); }
      wavePen.moveTo(x, base - 23 * low); wavePen.lineTo(x, base - 23 * high);
    }
    wavePen.stroke();
  }
}
function probe() {
  const before = JSON.stringify(world.snapshot());
  const graphs = world.mechanics(); responses = graphs.map(graph => renderProbe(graph));
  if (JSON.stringify(world.snapshot()) !== before) throw new Error('Probe mutated the material');
  $('sample').replaceChildren(...graphs.map((graph, index) => new Option(graph.label, index)));
  $('listen').disabled = false; $('probe-status').textContent = `Frozen ${(world.tick * STEP).toFixed(3)} s · peak ${responses.map(response => response.metrics.peak.toExponential(2)).join(' / ')}`;
  drawWave(); return responses.map(response => response.metrics);
}
async function listen() {
  if (!responses.length) return;
  context ??= new AudioContext(); await context.resume(); stopAudio();
  const response = responses[Number($('sample').value) || 0];
  const buffer = context.createBuffer(2, response.left.length, response.sampleRate);
  buffer.copyToChannel(response.left, 0); buffer.copyToChannel(response.right, 1);
  source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start();
  $('status').textContent = '현재 구조의 고정 gain 응답 재생. 시스템 볼륨은 낮게 시작하세요.';
}
function record() {
  const state = world.snapshot();
  return { schema: 'ant-material-sketchbook-v0', model: modelId, seed: world.seed, tick: world.tick, state, digest: stateDigest(state) };
}
function advance(ticks) {
  if (!Number.isSafeInteger(ticks) || ticks < 0 || world.tick + ticks > MAX_TICKS) throw new Error('Observation limit: one hour');
  pause(); for (let i = 0; i < ticks; i++) world.step(); draw(); return record();
}
async function restore(receipt) {
  if (busy) throw new Error('Replay already running');
  if (receipt?.schema !== 'ant-material-sketchbook-v0' || !Object.hasOwn(constructors, receipt.model) || !Number.isSafeInteger(receipt.tick) || receipt.tick < 0 || receipt.tick > MAX_TICKS) throw new Error('Unsupported record or tick limit (one hour)');
  const candidate = new constructors[receipt.model](seedValue(receipt.seed));
  pause(); busy = true;
  try {
    for (let tick = 0; tick < receipt.tick; tick++) {
      candidate.step();
      if (tick % 1200 === 1199) { $('status').textContent = `재현 중 ${(tick / 60).toFixed(0)} s`; await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    const state = candidate.snapshot();
    if (JSON.stringify(state) !== JSON.stringify(receipt.state) || stateDigest(state) !== receipt.digest) throw new Error('Full-state replay mismatch; current world preserved');
    clearProbe(); world = candidate; modelId = receipt.model; $('model').value = modelId; $('seed').value = world.seed;
    $('field').hidden = modelId !== 'A'; $('law').textContent = laws[modelId];
    $('receipt').textContent = `Full-state verified · ${receipt.digest}`; $('status').textContent = '동일 초기 조건과 입력으로 전체 상태 재현 확인.'; draw();
    return record();
  } finally { busy = false; }
}
function reportError(error) { $('status').textContent = error.message || String(error); }
$('run').addEventListener('click', () => { if (busy) return; running = !running; accumulator = 0; $('run').textContent = running ? '일시정지' : '실행'; });
for (const id of ['reset', 'model']) $(id).addEventListener(id === 'model' ? 'change' : 'click', () => { if (!busy) try { select(); } catch (error) { reportError(error); } });
for (const id of ['diagnostic', 'field']) $(id).addEventListener('change', draw);
$('probe').addEventListener('click', () => { try { probe(); } catch (error) { reportError(error); } });
$('listen').addEventListener('click', () => listen().catch(reportError));
$('sample').addEventListener('change', drawWave);
$('record').addEventListener('click', () => {
  const receipt = record(), url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `material-${modelId}-${world.seed}-${world.tick}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('receipt').textContent = `Recorded · ${receipt.digest}`;
});
$('replay').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 2_000_000) throw new Error('Record exceeds 2 MB'); await restore(JSON.parse(await file.text())); }
  catch (error) { reportError(error); }
  finally { event.target.value = ''; }
});
function frame(now) {
  const elapsed = lastFrame === undefined ? 0 : Math.min((now - lastFrame) / 1000, .1); lastFrame = now;
  if (running && !busy) {
    accumulator += elapsed * Number($('speed').value);
    while (accumulator >= STEP && world.tick < MAX_TICKS) { world.step(); accumulator -= STEP; }
    if (world.tick === MAX_TICKS) { pause(); $('status').textContent = 'v0 관찰 한도 1시간. 현재 기록을 저장하거나 초기화하세요.'; }
    draw();
  }
  requestAnimationFrame(frame);
}
window.materialSketchbook = {
  select, advance, record, restore, probe,
  state: () => world.snapshot(), view: () => world.view(), graphs: () => world.mechanics(),
  response: index => responses[index], running: () => running, audioCreated: () => Boolean(context)
};
select(); requestAnimationFrame(frame);
