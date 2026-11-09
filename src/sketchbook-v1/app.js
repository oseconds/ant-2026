import './styles.css';
import { STEP, DEFAULT_SEED, seedValue, stateDigest } from '../sketchbook/common.js';
import { SubtractiveWorld } from './subtractive.js';
import { LocalTimeWorld } from './local-time.js';
import { INPUT_PATTERNS } from './input.js';

const $ = id => document.getElementById(id);
const models = { S: SubtractiveWorld, T: LocalTimeWorld }, MAX_TICKS = 216000;
const titles = { S: ['활동에 의한 제거 + 내부 이완', '무개입 · 같은 초기 불일치'], T: ['국소적으로 다른 변화율', '같은 평균 변화율 · 공간적으로 균일'] };
const laws = {
  S: '활동은 연결을 약화시킵니다. 남은 연결의 내부 불일치는 이완과 느린 피로를 계속 일으킬 수 있습니다.',
  T: '같은 조직 상태가 서로 다른 국소 시계로 변합니다. 이웃과의 상호작용이 변화에 참여합니다.'
};
let model = 'S', pattern = 'wander', world = new SubtractiveWorld(DEFAULT_SEED), running = false, busy = false, accumulator = 0, lastFrame;
const canvas = $('world'), pen = canvas.getContext('2d');
function pause() { running = false; accumulator = 0; $('run').textContent = '실행'; }
function make(id, seed, inputPattern) {
  if (!Object.hasOwn(models, id) || !INPUT_PATTERNS.includes(inputPattern)) throw new Error('Unknown world or input');
  return new models[id](seedValue(seed), { pattern: inputPattern });
}
function select(id = $('model').value, seed = $('seed').value, inputPattern = $('pattern').value) {
  if (busy) throw new Error('Replay is running');
  if (seed === '') throw new Error('Seed가 필요합니다.');
  const next = make(id, seed, inputPattern);
  pause(); world = next; model = id; pattern = inputPattern;
  $('model').value = model; $('seed').value = world.seed; $('pattern').value = pattern;
  $('field').hidden = model !== 'T'; $('law').textContent = laws[model];
  $('receipt').textContent = ''; $('status').textContent = ''; draw();
}
function line(x, y, xx, yy, width, alpha) {
  pen.strokeStyle = `rgba(38,38,33,${alpha})`; pen.lineWidth = width; pen.beginPath(); pen.moveTo(x, y); pen.lineTo(xx, yy); pen.stroke();
}
function point(x, y, radius) { pen.fillStyle = '#55554c'; pen.beginPath(); pen.arc(x, y, radius, 0, Math.PI * 2); pen.fill(); }
function draw() {
  const view = world.view(), diagnostic = $('diagnostic').checked, time = world.tick * STEP;
  pen.fillStyle = '#f6f5ef'; pen.fillRect(0, 0, 1200, 520);
  $('time').textContent = `${time.toFixed(3)} s`;
  $('phase').textContent = pattern === 'none' ? '입력 없음' : world.tick < 2400 ? '활동 중' : '활동 종료 · 내부 변화 계속';
  view.samples.forEach((sample, n) => {
    const left = 80 + n * 600, top = 60, scale = 420;
    pen.fillStyle = '#505048'; pen.font = '15px system-ui'; pen.fillText(titles[model][n], left - 12, 30);
    if (model === 'S') {
      view.edges.forEach(([i, j], e) => {
        const b = sample.bond[e]; if (b === 0) return;
        const [x, y] = view.positions[i], [xx, yy] = view.positions[j];
        line(left + x * scale, top + y * scale, left + xx * scale, top + yy * scale, .3 + 1.5 * b, .12 + .7 * b);
      });
      view.positions.forEach(([x, y], i) => {
        const cx = left + x * scale, cy = top + y * scale;
        point(cx, cy, 2);
        if (diagnostic) line(cx, cy, cx + 600 * sample.displacement[i], cy, 1, .7);
      });
    } else {
      const cell = scale / view.size;
      sample.phase.forEach((phi, i) => {
        let value = phi;
        if (diagnostic) value = $('field').value === 'rate' ? (1 - sample.rate[i]) / .8 : (time - sample.age[i]) / 80;
        pen.fillStyle = `rgba(38,38,33,${Math.max(0, Math.min(1, value))})`;
        pen.fillRect(left + (i % view.size) * cell + 1, top + Math.floor(i / view.size) * cell + 1, cell - 2, cell - 2);
      });
    }
    if (diagnostic) view.activity.forEach((count, i) => {
      if (!count || (model === 'S' && n === 1)) return;
      const [x, y] = view.positions[i]; pen.strokeStyle = '#55554c'; pen.lineWidth = 1;
      pen.beginPath(); pen.arc(left + x * scale, top + y * scale, 4 + count, 0, Math.PI * 2); pen.stroke();
    });
  });
  $('legend').textContent = model === 'S'
    ? '고정된 질량·위치. 선의 농도와 폭은 남은 결합 0…1. 정확히 0인 연결만 사라집니다.' + (diagnostic ? ' 가로 눈금은 내부 scalar 변위 ×600이며 노드의 공간 이동이 아닙니다. 원은 직전 업데이트에 적용된 입력입니다.' : '')
    : diagnostic ? ($('field').value === 'rate' ? '고정 스케일: 농도 = (1−변화율)/.8. 같은 평균 속도에서 공간적인 차이를 비교합니다.' : '고정 스케일: 농도 = (전역 시간−국소 나이)/80 s. 두 샘플의 평균 국소 나이는 같습니다.') : '조직 상태 0…1을 고정 농도로 표시합니다. 이 상태는 질량이 아니며, 이웃 상태와 함께 이후 변화를 결정합니다.';
  const keys = model === 'S' ? { meanBond: '평균 결합', removedEdges: '제거 연결', components: '연결 성분', energy: '내부 에너지', energyBalanceError: '수지 오차' } : { energy: '조직 에너지', meanPhase: '평균 조직', meanAge: '평균 국소 나이', minRate: '최저 변화율', maxRate: '최고 변화율' };
  $('stats').replaceChildren(...view.samples.map(sample => {
    const list = document.createElement('dl'); list.setAttribute('aria-label', sample.label);
    for (const [key, label] of Object.entries(keys)) {
      const item = document.createElement('div'), term = document.createElement('dt'), value = document.createElement('dd');
      term.textContent = label; value.textContent = sample.stats[key].toPrecision(5); item.append(term, value); list.append(item);
    }
    return list;
  }));
}
function record() {
  const state = world.snapshot();
  return { schema: 'ant-material-sketchbook-v1', model, seed: world.seed, pattern, tick: world.tick, state, digest: stateDigest(state) };
}
function advance(ticks) {
  if (busy || !Number.isSafeInteger(ticks) || ticks < 0 || world.tick + ticks > MAX_TICKS) throw new Error('Observation limit: one hour, whole nonnegative ticks');
  pause(); for (let i = 0; i < ticks; i++) world.step(); draw(); return record();
}
async function restore(saved) {
  if (busy) throw new Error('Replay is running');
  if (saved?.schema !== 'ant-material-sketchbook-v1' || !Number.isSafeInteger(saved.tick) || saved.tick < 0 || saved.tick > MAX_TICKS) throw new Error('Invalid record or replay limit');
  const candidate = make(saved.model, saved.seed, saved.pattern);
  pause(); busy = true;
  try {
    for (let tick = 0; tick < saved.tick; tick++) {
      candidate.step();
      if (tick % 1200 === 1199) { $('status').textContent = `재현 중 ${(tick / 60).toFixed(0)} s`; await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    const state = candidate.snapshot();
    if (JSON.stringify(state) !== JSON.stringify(saved.state) || stateDigest(state) !== saved.digest) throw new Error('Full-state replay mismatch; current world preserved');
    world = candidate; model = saved.model; pattern = saved.pattern;
    $('model').value = model; $('seed').value = world.seed; $('pattern').value = pattern;
    $('field').hidden = model !== 'T'; $('law').textContent = laws[model];
    $('receipt').textContent = `Full-state verified · ${saved.digest}`; $('status').textContent = '동일 입력으로 전체 상태 재현 확인.'; draw();
    return record();
  } finally { busy = false; }
}
const error = failure => { $('status').textContent = failure.message || String(failure); };
$('run').addEventListener('click', () => { if (busy) return; running = !running; accumulator = 0; $('run').textContent = running ? '일시정지' : '실행'; });
for (const id of ['reset', 'model', 'pattern']) $(id).addEventListener(id === 'reset' ? 'click' : 'change', () => { if (!busy) try { select(); } catch (failure) { error(failure); } });
for (const id of ['diagnostic', 'field']) $(id).addEventListener('change', draw);
$('record').addEventListener('click', () => {
  const saved = record(), url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `material-v1-${model}-${world.seed}-${pattern}-${world.tick}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('receipt').textContent = `Recorded · ${saved.digest}`;
});
$('replay').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 2_000_000) throw new Error('Record exceeds 2 MB'); await restore(JSON.parse(await file.text())); }
  catch (failure) { error(failure); } finally { event.target.value = ''; }
});
function frame(now) {
  const elapsed = lastFrame === undefined ? 0 : Math.min((now - lastFrame) / 1000, .1); lastFrame = now;
  if (running && !busy) {
    accumulator += elapsed * Number($('speed').value);
    while (accumulator >= STEP && world.tick < MAX_TICKS) { world.step(); accumulator -= STEP; }
    if (world.tick === MAX_TICKS) { pause(); $('status').textContent = 'v1 관찰 한도 1시간. 기록을 저장하거나 초기화하세요.'; }
    draw();
  }
  requestAnimationFrame(frame);
}
window.materialSketchbookV1 = { select, advance, record, restore, state: () => world.snapshot(), view: () => world.view(), running: () => running };
select(); requestAnimationFrame(frame);
