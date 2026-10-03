import './style.css';
import { Lab, StringInspectorRenderer, SPHERE_MATERIALS } from './lib/index.js';
import { CanvasInteraction } from './demo/CanvasInteraction.js';
import { demoDefinitions, readPath, patchPath } from './demo/definitions.js';

export function mountLab(root) {
  root.innerHTML = `
    <div class="lab-shell">
      <header class="topbar"><a class="brand" href="./"><span class="brand-dot"></span> PHYSICAL AUDIO LAB</a><span class="edition">SIMULATION STUDIES / 01</span></header>
      <nav class="model-tabs" aria-label="물리 모델 선택"></nav>
      <main>
        <section class="instrument" aria-labelledby="model-title">
          <div class="instrument-heading"><p id="model-subtitle" class="eyebrow"></p><h1 id="model-title"></h1></div>
          <div id="scene" class="scene"></div>
          <p id="interaction-hint" class="hint"></p>
          <div class="scene-actions"><button data-action="strike" class="primary">중앙 타격</button><button data-action="stop">울림 멈추기</button><button data-action="pickup" aria-pressed="false">Pickup 이동</button></div>
          <p class="legend"><span class="exciter-dot"></span> EXCITER <span class="pickup-dot"></span> PICKUP</p>
        </section>
        <aside class="parameters"><p class="eyebrow">PARAMETERS</p><div id="controls"></div><div id="string-preset" hidden><button data-action="strange-preset">A2 · Strange String</button></div><p id="physical-info" class="physical-info"></p><p id="pickup-info" class="hint"></p></aside>
      </main>
      <section class="analysis-panel" aria-label="상태 및 분석"><div class="status-row"><span id="status-light" class="status-light"></span><p id="status" role="status" aria-live="polite"></p><span id="audio-info" class="mono"></span></div><div id="analysis" class="readouts"></div></section>
      <section id="string-inspector" class="inspector" hidden>
        <div class="inspector-heading"><div><p class="eyebrow">INSPECT / DELAY BUFFER</p><h2>한 샘플씩, 진동의 안쪽으로</h2></div><div class="inspector-actions"><button data-action="reset-inspector">Noise reset</button><button data-action="step">1 sample</button><button data-action="cycle">1 cycle</button></div></div>
        <p class="hint">재생 직전의 잡음을 복제한 별도 버퍼입니다. stepping은 현재 재생 중인 오디오를 변경하지 않습니다.</p>
        <canvas id="buffer-overview" height="170" aria-label="전체 지연 버퍼와 현재 커서"></canvas>
        <canvas id="buffer-detail" height="190" aria-label="현재 샘플과 이웃 샘플 상세"></canvas>
        <p id="buffer-info" class="mono"></p><p id="buffer-change" class="mono"></p>
        <div class="pattern-row"><span class="eyebrow">8-STEP PATTERN</span><div><button data-action="generate-pattern">새 패턴</button><button data-action="play-pattern">패턴 재생</button><button data-action="stop-pattern">패턴 정지</button></div></div><p id="pattern-notes" class="pattern-notes"></p>
      </section>
      <details class="state-panel"><summary>STATE / JSON</summary><pre id="state-json"></pre></details>
      <footer>NOISE → EXCITATION → RESONANCE <span>브라우저에서 생성되는 물리 모델 사운드</span></footer>
    </div>`;
  const query = (selector) => root.querySelector(selector);
  const lab = new Lab({ workletBaseUrl: `${import.meta.env.BASE_URL}worklets/` });
  const savedStates = new Map();
  const events = new AbortController();
  let renderer = null, interaction = null, inspectorRenderer = null, resizeObserver = null;
  let frameId = null, selectionVersion = 0, disposed = false, errorMessage = null;
  let definition = null;

  for (const [name, item] of Object.entries(demoDefinitions)) {
    const button = document.createElement('button');
    button.dataset.model = name;
    button.textContent = item.label;
    button.setAttribute('aria-pressed', 'false');
    query('.model-tabs').append(button);
  }

  function reportError(error) {
    errorMessage = error.message || String(error);
    query('#status').textContent = errorMessage;
    query('#status-light').dataset.status = 'error';
  }
  function run(action) {
    errorMessage = null;
    try { Promise.resolve(action()).catch((error) => { if (!disposed) reportError(error); }); }
    catch (error) { reportError(error); }
  }
  function resizeCanvas(canvas, height = null) {
    const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round((height || width) * ratio);
  }
  function unmountScene() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    resizeObserver?.disconnect(); resizeObserver = null;
    interaction?.destroy(); interaction = null;
    renderer?.destroy(); renderer = null;
    inspectorRenderer?.destroy(); inspectorRenderer = null;
    query('#scene').replaceChildren();
  }
  function mountScene(name) {
    const canvas = document.createElement('canvas');
    canvas.id = 'simulation-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', demoDefinitions[name].hint);
    query('#scene').append(canvas);
    renderer = new demoDefinitions[name].Renderer(canvas);
    interaction = new CanvasInteraction(canvas, {
      modelName: name, getState: () => lab.getState(),
      onStrike: (position) => run(() => lab.strike({ position })),
      onPickup: (position) => run(() => lab.setPickup(position))
    });
    if (name === 'string') inspectorRenderer = new StringInspectorRenderer(query('#buffer-overview'), query('#buffer-detail'));
    const resize = () => {
      resizeCanvas(canvas);
      if (name === 'string') {
        resizeCanvas(query('#buffer-overview'), 170);
        resizeCanvas(query('#buffer-detail'), 190);
      }
      const snapshot = lab.getSnapshot();
      if (snapshot) inspectorRenderer?.render(snapshot);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(query('#scene'));
    if (name === 'string') resizeObserver.observe(query('#string-inspector'));
    resize();
    const draw = (time) => {
      if (disposed || !renderer) return;
      const snapshot = lab.getSnapshot();
      if (snapshot) renderer.render(snapshot, { time, view: interaction?.getView() });
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
  }
  function mountControls() {
    const container = query('#controls');
    container.replaceChildren();
    definition.controls.forEach((control, index) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'control';
      const title = document.createElement('span');
      title.className = 'control-label'; title.textContent = control.label;
      const output = document.createElement('output');
      output.id = `output-${index}`;
      const input = document.createElement(control.options ? 'select' : 'input');
      input.id = `control-${index}`;
      input.dataset.path = control.path;
      if (control.options) {
        for (const [value, text] of control.options) {
          const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
        }
      } else {
        input.type = 'range'; input.min = control.min; input.max = control.max; input.step = control.step;
      }
      output.setAttribute('for', input.id);
      wrapper.append(title, output, input); container.append(wrapper);
    });
  }
  function readout(label, value) {
    const item = document.createElement('div'); item.className = 'readout';
    const name = document.createElement('span'); name.textContent = label;
    const number = document.createElement('strong'); number.textContent = value;
    item.append(name, number); return item;
  }
  function refresh() {
    const snapshot = lab.getSnapshot();
    if (!snapshot || !definition || disposed) return;
    const { state, status, analysis } = snapshot;
    definition.controls.forEach((control, index) => {
      const value = readPath(state, control.path);
      const input = query(`#control-${index}`), output = query(`#output-${index}`);
      if (input) input.value = value;
      if (output) output.value = control.format ? control.format(value) : String(value).toUpperCase();
    });
    const statusText = { idle: '연주 준비 완료', ready: '연주 준비 완료', loading: '오디오 준비 중…', playing: '현 재생 중', active: '공진 중', error: snapshot.error || '오디오 오류' };
    query('#status').textContent = errorMessage || statusText[status] || status;
    query('#status-light').dataset.status = errorMessage ? 'error' : status;
    query('#audio-info').textContent = lab.audio.context ? `${lab.audio.context.sampleRate.toLocaleString()} Hz / ${lab.audio.context.state}` : '첫 타격에서 오디오 시작';
    query('#state-json').textContent = JSON.stringify(state, null, 2);
    const pickup = state.pickup.position;
    query('#pickup-info').textContent = `Pickup: ${typeof pickup === 'number' ? pickup.toFixed(2) : Object.values(pickup).map(v => v.toFixed(3)).join(', ')}`;
    const items = [];
    if (state.model === 'string') {
      items.push(readout('DELAY LENGTH', `${analysis.delayLength} samples`), readout('ESTIMATED PITCH', `${analysis.estimatedFrequency?.toFixed(1)} Hz`), readout('FEEDBACK', state.feedback.toFixed(5)));
      query('#physical-info').textContent = '짧은 잡음을 순환 지연선에 넣고, 이웃 샘플과 평균내며 감쇠시킵니다.';
      const inspected = snapshot.inspector;
      if (inspected) {
        const next = (inspected.cursor + 1) % inspected.values.length;
        const before = inspected.values[inspected.cursor], neighbor = inspected.values[next];
        query('#buffer-info').textContent = `${inspected.values.length} samples · ${inspected.delayMs.toFixed(2)} ms · cursor ${inspected.cursor} · ${inspected.steps} steps\n다음 계산: ${state.feedback.toFixed(5)} × (${before.toFixed(3)} + ${neighbor.toFixed(3)}) ÷ 2 = ${(state.feedback * (before + neighbor) / 2).toFixed(3)}`;
        const change = inspected.lastChange;
        query('#buffer-change').textContent = change ? `x[${change.index}]: ${change.before.toFixed(4)} + 이웃 ${change.next.toFixed(4)} → ${change.after.toFixed(4)}` : '현재 샘플: red · 이웃: blue · 마지막으로 갱신한 샘플: green';
      }
      query('#pattern-notes').textContent = state.pattern.notes.map((note, index) => `${index + 1}. ${note?.name || 'REST'}`).join('  /  ') || '새 패턴을 만들거나 패턴 재생을 누르세요.';
      inspectorRenderer?.render(snapshot);
    } else if (state.model === 'plate') {
      const size = { low: 13, normal: 17, high: 21 }[state.quality];
      items.push(readout('GRID', `${analysis.size || size} × ${analysis.size || size}`), readout('ACTIVE NODES', analysis.nodes ?? '오디오 시작 전'), readout('STIFFNESS', state.physical.stiffness.toFixed(2)));
      query('#physical-info').textContent = 'Laplacian과 biharmonic stencil로 계산한 원형 판. 청록색은 양의 변위, 주황색은 음의 변위입니다.';
    } else {
      const material = SPHERE_MATERIALS[state.physical.material];
      const mass = material.density * 4 / 3 * Math.PI * (state.physical.diameter / 2) ** 3;
      items.push(readout('MODES', analysis.modes ?? '오디오 시작 전'), readout('P / S SPEED', analysis.longitudinalSpeed ? `${analysis.longitudinalSpeed} / ${analysis.shearSpeed} m/s` : '오디오 시작 전'), readout('MASS', `${(mass / 1000).toFixed(2)} t`));
      query('#physical-info').textContent = `${material.name} · ${material.density.toLocaleString()} kg/m³ · E ${(material.youngModulus / 1e9).toFixed(1)} GPa · ν ${material.poisson}\n구 표면 마커는 물체의 로컬 좌표를 따릅니다.`;
    }
    query('#analysis').replaceChildren(...items);
  }

  async function selectModel(name) {
    const version = ++selectionVersion;
    if (lab.modelName && !lab.switching) savedStates.set(lab.modelName, lab.getState());
    unmountScene();
    definition = null; errorMessage = null;
    query('#status').textContent = '모델 전환 중…';
    query('#string-inspector').hidden = true;
    query('#controls').replaceChildren();
    try {
      const model = await lab.setModel(name, savedStates.get(name));
      if (!model || disposed || version !== selectionVersion) return;
      definition = demoDefinitions[name];
      query('#model-title').textContent = definition.title;
      query('#model-subtitle').textContent = definition.subtitle;
      query('#interaction-hint').textContent = definition.hint;
      query('#string-inspector').hidden = name !== 'string';
      query('#string-preset').hidden = name !== 'string';
      query('[data-action="pickup"]').hidden = name === 'string';
      query('[data-action="pickup"]').setAttribute('aria-pressed', 'false');
      query('.legend').hidden = name === 'string';
      query('.legend').dataset.model = name;
      for (const tab of root.querySelectorAll('[data-model]')) tab.setAttribute('aria-pressed', String(tab.dataset.model === name));
      mountControls(); mountScene(name); refresh();
    } catch (error) { if (version === selectionVersion && !disposed) reportError(error); }
  }

  const unsubscribe = lab.subscribe((event) => {
    if (event.type === 'error') reportError(event.payload);
    else if (event.type === 'update') refresh();
  });
  root.addEventListener('input', (event) => {
    const path = event.target.dataset.path;
    if (path && lab.model && !lab.switching) run(() => lab.configure(patchPath(path, event.target.tagName === 'SELECT' ? event.target.value : Number(event.target.value))));
  }, { signal: events.signal });
  root.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.model) { void selectModel(target.dataset.model); return; }
    if (!lab.model || lab.switching) return;
    run(() => {
      switch (target.dataset.action) {
        case 'strike': return lab.strike({ position: interaction?.center() });
        case 'stop': return lab.stop();
        case 'pickup': {
          const active = target.getAttribute('aria-pressed') !== 'true';
          target.setAttribute('aria-pressed', String(active)); interaction?.setMode(active ? 'pickup' : 'strike'); return;
        }
        case 'step': return lab.model.step(1);
        case 'cycle': return lab.model.step(lab.getSnapshot().inspector.values.length);
        case 'reset-inspector': return lab.model.resetInspector();
        case 'generate-pattern': return lab.model.generatePattern();
        case 'play-pattern': return lab.model.playPattern();
        case 'stop-pattern': return lab.stop();
        case 'strange-preset': return lab.configure({ physical: { frequency: 110 }, feedback: .99996, duration: 4.6, excitation: { strength: .52 } });
      }
    });
  }, { signal: events.signal });
  const destroy = async () => {
    if (disposed) return;
    disposed = true; selectionVersion++;
    events.abort(); unsubscribe(); unmountScene();
    await lab.destroy();
  };
  globalThis.addEventListener('pagehide', () => { void destroy(); }, { once: true, signal: events.signal });
  const ready = selectModel('string');
  return { lab, ready, selectModel, destroy };
}

export const app = mountLab(document.getElementById('app'));
if (import.meta.hot) import.meta.hot.dispose(() => { void app.destroy(); });
