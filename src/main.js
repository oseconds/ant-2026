import './style.css';
import { Lab, StringInspectorRenderer, SPHERE_MATERIALS } from './lib/index.js';
import { CanvasInteraction } from './demo/CanvasInteraction.js';
import { demoDefinitions, readPath, patchPath } from './demo/definitions.js';
import { documentViews } from './demo/documentViews.js';

export function mountLab(root) {
  root.innerHTML = `
    <main>
      <header>
        <h1>물리 오디오 실험</h1>
        <p>현, 원형 판, 구의 진동을 브라우저에서 듣고 살펴보는 작은 실험 페이지입니다.</p>
        <nav aria-label="물리 모델 선택"></nav>
      </header>
      <hr>
      <article id="experiment" aria-labelledby="model-title"></article>
      <div id="status-home"><div id="audio-status">
        <p id="status" role="status" aria-live="polite">모델 준비 중…</p>
        <p id="audio-info"></p>
      </div></div>
      <hr>
      <details id="state-details"><summary>설정값 보기 (JSON)</summary><pre id="state-json"></pre></details>
      <footer><p><small>오디오는 첫 타격 또는 패턴 재생에서 시작합니다. 스피커나 헤드폰의 음량을 조절해 들으세요.</small></p></footer>
    </main>`;
  const query = (selector) => root.querySelector(selector);
  const audioStatus = query('#audio-status');
  const lab = new Lab({ workletBaseUrl: `${import.meta.env.BASE_URL}worklets/` });
  const savedStates = new Map();
  const events = new AbortController();
  let renderer = null, interaction = null, inspectorRenderer = null, resizeObserver = null;
  let frameId = null, selectionVersion = 0, disposed = false, errorMessage = null;
  let definition = null;

  for (const [name, item] of Object.entries(demoDefinitions)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.model = name;
    button.textContent = item.label;
    button.setAttribute('aria-pressed', 'false');
    query('nav').append(button);
  }

  function reportError(error) {
    errorMessage = error.message || String(error);
    query('#status').textContent = errorMessage;
  }
  function run(action) {
    errorMessage = null;
    try { Promise.resolve(action()).catch((error) => { if (!disposed) reportError(error); }); }
    catch (error) { reportError(error); }
  }
  function canvasSize(element, height = null) {
    const width = Math.max(1, Math.round(element.getBoundingClientRect().width));
    return { width, height: height || width, pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2) };
  }
  function resizeCanvas(canvas, height = null) {
    const size = canvasSize(canvas, height);
    canvas.width = Math.round(size.width * size.pixelRatio);
    canvas.height = Math.round(size.height * size.pixelRatio);
  }
  function unmountScene() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    resizeObserver?.disconnect(); resizeObserver = null;
    interaction?.destroy(); interaction = null;
    renderer?.destroy(); renderer = null;
    inspectorRenderer?.destroy(); inspectorRenderer = null;
    query('#scene')?.replaceChildren();
  }
  async function mountScene(name, version) {
    const item = demoDefinitions[name];
    const canvas = document.createElement('canvas');
    canvas.id = 'simulation-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', item.hint);
    canvas.textContent = item.canvasDescription || '그림을 누르거나 키보드로 물리 모델을 연주하세요.';
    query('#scene').append(canvas);
    const mountedRenderer = renderer = new item.Renderer(canvas);
    if (mountedRenderer.init) {
      const ready = await mountedRenderer.init(canvasSize(query('#scene')));
      if (ready === false || disposed || version !== selectionVersion || renderer !== mountedRenderer) return false;
    }
    if (item.interaction !== false) {
      interaction = new CanvasInteraction(canvas, {
        modelName: name, getState: () => lab.getState(),
        onStrike: (position) => run(() => lab.strike({ position })),
        onPickup: (position) => run(() => lab.setPickup(position))
      });
    }
    if (name === 'string') inspectorRenderer = new StringInspectorRenderer(query('#buffer-overview'), query('#buffer-detail'));
    const resize = () => {
      if (mountedRenderer.resize) {
        // p5 owns the backing canvas; measure its host so it can grow after a resize.
        const size = canvasSize(query('#scene'));
        mountedRenderer.resize(size.width, size.height, size.pixelRatio);
      } else resizeCanvas(canvas);
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
      if (disposed || version !== selectionVersion || renderer !== mountedRenderer) return;
      item.update?.(lab.model, time);
      const snapshot = lab.getSnapshot();
      if (snapshot) mountedRenderer.render(snapshot, { time, view: interaction?.getView() });
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return true;
  }
  function mountControls() {
    definition.controls.forEach((control, index) => {
      const container = query(`[data-control-slot="${control.path}"]`);
      const wrapper = document.createElement('p');
      wrapper.className = 'control';
      const title = document.createElement('label');
      title.textContent = control.label;
      const output = document.createElement('output');
      output.id = `output-${index}`;
      const input = document.createElement(control.options ? 'select' : 'input');
      input.id = `control-${index}`;
      title.htmlFor = input.id;
      input.dataset.path = control.path;
      if (control.options) {
        for (const [value, text] of control.options) {
          const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
        }
      } else {
        input.type = control.type || 'range'; input.min = control.min; input.max = control.max; input.step = control.step;
      }
      output.setAttribute('for', input.id);
      output.hidden = Boolean(control.options);
      wrapper.append(title, input, output); container.append(wrapper);
      if (control.help) {
        const help = document.createElement('small');
        help.id = `help-${index}`; help.textContent = control.help;
        input.setAttribute('aria-describedby', help.id);
        container.append(help);
      }
    });
  }
  function metricRow(label, value) {
    const item = document.createElement('tr');
    const name = document.createElement('th'); name.scope = 'row'; name.textContent = label;
    const number = document.createElement('td'); number.textContent = value;
    item.append(name, number); return item;
  }
  function positionText(position) {
    return typeof position === 'number' ? position.toFixed(2) : Object.values(position).map(value => value.toFixed(3)).join(', ');
  }
  function refresh() {
    const snapshot = lab.getSnapshot();
    if (!snapshot || !definition || disposed) return;
    const { state, status, analysis } = snapshot;
    definition.controls.forEach((control, index) => {
      const value = readPath(state, control.path);
      const input = query(`#control-${index}`), output = query(`#output-${index}`);
      if (input) input.value = value;
      if (output) output.value = control.format ? control.format(value) : String(value);
    });
    const statusText = { idle: '연주 준비 완료', ready: '연주 준비 완료', loading: '오디오 준비 중…', playing: '현 재생 중', active: state.model === 'ant' ? '개미와 공유 흔적 갱신 중' : '공진 중', stopped: '정지', error: snapshot.error || '오디오 오류' };
    query('#status').textContent = errorMessage || statusText[status] || status;
    query('#audio-info').hidden = definition.audio === false;
    query('footer').hidden = definition.audio === false;
    query('#audio-info').textContent = definition.audio === false ? '' : lab.audio.context ? `${lab.audio.context.sampleRate.toLocaleString()} Hz / ${lab.audio.context.state}` : '첫 타격에서 오디오 시작';
    query('#state-json').textContent = JSON.stringify(state, null, 2);
    if (query('#pickup-info')) query('#pickup-info').textContent = `Pickup 위치: (${positionText(state.pickup.position)})`;
    if (query('#exciter-info')) query('#exciter-info').textContent = `타격 위치: (${positionText(state.excitation.position)})`;
    const items = [];
    if (state.model === 'string') {
      items.push(metricRow('설정 주파수', `${state.physical.frequency} Hz`), metricRow('예상 음높이', `${analysis.estimatedFrequency?.toFixed(1)} Hz`), metricRow('피드백', state.feedback.toFixed(5)));
      query('#physical-info').textContent = '피드백과 재생 길이 변경은 다음에 시작하는 소리에 적용됩니다.';
      const inspected = snapshot.inspector;
      if (inspected) {
        const next = (inspected.cursor + 1) % inspected.values.length;
        const before = inspected.values[inspected.cursor], neighbor = inspected.values[next];
        query('#buffer-metrics tbody').replaceChildren(
          metricRow('버퍼 길이 N', `${inspected.values.length} samples`),
          metricRow('지연 시간', `${inspected.delayMs.toFixed(2)} ms`),
          metricRow('샘플레이트', `${inspected.sampleRate.toLocaleString()} Hz`),
          metricRow('다음 계산 위치 p', inspected.cursor),
          metricRow('진행한 샘플 수', inspected.steps)
        );
        query('#buffer-info').textContent = `다음 계산: ${state.feedback.toFixed(5)} × (${before.toFixed(3)} + ${neighbor.toFixed(3)}) ÷ 2 = ${(state.feedback * (before + neighbor) / 2).toFixed(3)}`;
        const change = inspected.lastChange;
        query('#buffer-change').textContent = change ? `최근 갱신 x[${change.index}]: ${change.before.toFixed(4)} + 이웃 ${change.next.toFixed(4)} → ${change.after.toFixed(4)}` : '아직 갱신한 샘플이 없습니다. 1 sample 진행을 눌러 계산을 확인하세요.';
      }
      query('#pattern-steps').replaceChildren(...state.pattern.notes.map((note, index) => {
        const row = metricRow(index + 1, note?.name || '쉼표');
        const frequency = document.createElement('td');
        frequency.textContent = note ? `${note.frequency.toFixed(2)} Hz` : '—';
        row.append(frequency); return row;
      }));
      query('#pattern-table').hidden = !state.pattern.notes.length;
      query('#pattern-notes').textContent = state.pattern.notes.length
        ? `${snapshot.patternIsPlaying ? '패턴 재생 중. ' : ''}${state.pattern.notes.map((note, index) => `${index + 1}. ${note?.name || '쉼표'}`).join(' / ')}`
        : '새 패턴을 만들거나 패턴 재생을 누르세요.';
      inspectorRenderer?.render(snapshot);
    } else if (state.model === 'plate') {
      const size = { low: 13, normal: 17, high: 21 }[state.quality];
      items.push(metricRow('격자 해상도', `${analysis.size || size} × ${analysis.size || size}`), metricRow('활성 격자점', analysis.nodes ?? '오디오 시작 전'), metricRow('강성', state.physical.stiffness.toFixed(2)));
      query('#physical-info').textContent = 'Laplacian과 biharmonic stencil로 계산한 원형 판입니다. 변위의 표시 크기는 현재 진동의 최댓값에 맞추어 조절됩니다.';
    } else if (state.model === 'sphere') {
      const material = SPHERE_MATERIALS[state.physical.material];
      const mass = material.density * 4 / 3 * Math.PI * (state.physical.diameter / 2) ** 3;
      items.push(
        metricRow('재질', material.name),
        metricRow('밀도', `${material.density.toLocaleString()} kg/m³`),
        metricRow('탄성계수 E', `${(material.youngModulus / 1e9).toFixed(1)} GPa`),
        metricRow('포아송비 ν', material.poisson),
        metricRow('질량', `${(mass / 1000).toFixed(2)} t`),
        metricRow('공진 모드 수', analysis.modes ?? '오디오 시작 전'),
        metricRow('P / S 파동 속도', analysis.longitudinalSpeed ? `${analysis.longitudinalSpeed} / ${analysis.shearSpeed} m/s` : '오디오 시작 전')
      );
      query('#physical-info').textContent = '크기와 재질을 바꾸면 공진 주파수와 질량이 달라집니다. 구 표면의 타격 위치와 pickup은 각각 독립적으로 저장됩니다.';
    } else if (state.model === 'ant') {
      items.push(
        metricRow('개체 수', analysis.population),
        metricRow('평균 속도', `${analysis.meanSpeed.toFixed(3)} / s`),
        metricRow('페로몬 총량', analysis.pheromoneMass.toFixed(2))
      );
    }
    query('#analysis tbody').replaceChildren(...items);
  }

  async function selectModel(name) {
    const version = ++selectionVersion;
    if (lab.modelName && !lab.switching) savedStates.set(lab.modelName, lab.getState());
    unmountScene();
    definition = null; errorMessage = null;
    query('#status').textContent = '모델 전환 중…';
    // Preserve the live status region and place it beside each model's canvas.
    query('#status-home').append(audioStatus);
    query('#experiment').replaceChildren();
    try {
      const model = await lab.setModel(name, savedStates.get(name));
      if (!model || disposed || version !== selectionVersion) return;
      definition = demoDefinitions[name];
      query('#experiment').dataset.modelView = name;
      query('#experiment').innerHTML = documentViews[name];
      query('[data-audio-status]').append(audioStatus);
      query('#model-title').textContent = definition.title;
      query('#model-description').textContent = definition.description;
      query('#interaction-hint').textContent = definition.hint;
      for (const tab of root.querySelectorAll('[data-model]')) tab.setAttribute('aria-pressed', String(tab.dataset.model === name));
      mountControls();
      if (await mountScene(name, version)) refresh();
    } catch (error) { if (version === selectionVersion && !disposed) reportError(error); }
  }

  const unsubscribe = lab.subscribe((event) => {
    if (event.type === 'error') reportError(event.payload);
    else if (event.type === 'update') refresh();
  });
  root.addEventListener('input', (event) => {
    const path = event.target.dataset.path;
    if (event.target.type === 'number' && (!event.target.value || !event.target.validity.valid)) return;
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
          target.setAttribute('aria-pressed', String(active));
          target.textContent = active ? '타격으로 돌아가기' : 'Pickup 이동';
          interaction?.setMode(active ? 'pickup' : 'strike'); return;
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
