/** Demo document templates. These can be replaced without changing the library. */
const slot = (path) => `<div data-control-slot="${path}"></div>`;
const scene = (caption) => `
  <figure>
    <div id="scene" class="scene"></div>
    <figcaption>${caption}</figcaption>
  </figure>
  <div data-audio-status></div>`;
const analysis = (caption) => `
  <table id="analysis"><caption>${caption}</caption><tbody></tbody></table>`;
const pickup = (markers, coordinates) => `
  <fieldset id="pickup-settings">
    <legend>타격 위치와 pickup</legend>
    <p>${markers}</p>
    <p>${coordinates} 타격 위치를 바꿔도 pickup 위치는 유지됩니다.</p>
    <p><button type="button" data-action="pickup" aria-pressed="false" aria-describedby="pickup-help">Pickup 이동</button></p>
    <p id="pickup-help">이동 모드에서 표면을 누르거나 드래그하세요. Shift를 누른 채 조작해도 pickup을 옮길 수 있습니다.</p>
    <p id="exciter-info"></p>
    <p id="pickup-info"></p>
  </fieldset>`;

export const documentViews = {
  string: `
    <h2 id="model-title"></h2>
    <p id="model-description"></p>
    ${scene('현의 재생 상태에 반응하는 Lorenz 궤적입니다. 실제 지연 버퍼는 아래에서 확인할 수 있습니다.')}
    <p id="interaction-hint"></p>
    <fieldset id="string-settings">
      <legend>현 연주</legend>
      ${slot('physical.frequency')}
      ${slot('feedback')}
      ${slot('excitation.strength')}
      ${slot('duration')}
      <p class="actions"><button type="button" data-action="strike">현 튕기기</button><button type="button" data-action="stop">소리 멈추기</button><button type="button" data-action="strange-preset">A2 · Strange String 설정</button></p>
      <p id="physical-info"></p>
      ${analysis('현 설정과 음높이')}
    </fieldset>

    <fieldset id="string-inspector">
      <legend>지연 버퍼 시각화</legend>
      <p>재생 직전의 잡음을 복제한 별도 버퍼입니다. 샘플 단위 조작은 현재 재생 중인 오디오를 변경하지 않습니다.</p>
      <p class="actions"><button type="button" data-action="step">1 sample 진행</button><button type="button" data-action="cycle">1 cycle 진행</button><button type="button" data-action="reset-inspector">잡음으로 초기화</button></p>
      <table id="buffer-metrics"><caption>현재 버퍼 상태</caption><tbody></tbody></table>
      <p id="buffer-info" class="calculation"></p>
      <p id="buffer-change" class="calculation" aria-live="polite"></p>
      <h3>현재 위치의 샘플</h3>
      <p><span class="sample-current">빨강: 현재 샘플</span> · <span class="sample-next">파랑: 이웃 샘플</span> · <span class="sample-changed">초록: 마지막으로 갱신한 샘플</span></p>
      <canvas id="buffer-detail" height="190" role="img" aria-label="현재 샘플과 이웃 샘플 상세">현재 위치 주변의 지연 버퍼 샘플을 그립니다.</canvas>
      <h3>전체 버퍼 파형</h3>
      <p>가로축은 한 주기의 샘플 위치이며, 빨간 선은 다음에 계산할 위치입니다.</p>
      <canvas id="buffer-overview" height="170" role="img" aria-label="전체 지연 버퍼와 현재 커서">전체 지연 버퍼와 현재 계산 위치를 그립니다.</canvas>
    </fieldset>

    <fieldset id="string-pattern">
      <legend>8단계 패턴 생성기</legend>
      <p>펜타토닉 음계로 8개의 8분음표를 만듭니다. 쉼표는 소리를 내지 않는 단계입니다.</p>
      ${slot('pattern.tempo')}
      <p class="actions"><button type="button" data-action="generate-pattern">새 패턴 만들기</button><button type="button" data-action="play-pattern">패턴 재생</button><button type="button" data-action="stop-pattern">패턴 정지</button></p>
      <table id="pattern-table"><caption>패턴의 음과 주파수</caption><thead><tr><th scope="col">단계</th><th scope="col">음</th><th scope="col">주파수</th></tr></thead><tbody id="pattern-steps"></tbody></table>
      <p id="pattern-notes" aria-live="polite"></p>
    </fieldset>
    <details id="model-notes">
      <summary>Karplus–Strong 알고리즘</summary>
      <ol>
        <li>한 주기 길이의 지연 버퍼를 무작위 잡음으로 채웁니다.</li>
        <li>현재 샘플을 출력하고, 이웃 샘플과 평균을 낸 뒤 feedback을 곱합니다.</li>
        <li>계산한 값을 같은 위치에 저장하고 다음 샘플로 이동합니다.</li>
      </ol>
      <p><code>x[i] ← feedback × (x[i] + x[(i + 1) mod N]) / 2</code></p>
      <p>예상 음높이는 <code>sampleRate / (N + 0.5)</code>입니다. 평균 필터와 되먹임이 고주파 성분을 줄이며 울림을 감쇠시킵니다.</p>
    </details>`,

  plate: `
    <h2 id="model-title"></h2>
    <p id="model-description"></p>
    ${scene('고정된 원 둘레 안에서 격자점의 변위를 그립니다. 파랑은 양의 변위, 빨강은 음의 변위입니다.')}
    <p id="interaction-hint"></p>
    <p class="actions"><button type="button" data-action="strike">중앙 두드리기</button><button type="button" data-action="stop">울림 멈추기</button></p>
    <fieldset id="plate-settings">
      <legend>판 설정</legend>
      ${slot('quality')}
      ${slot('physical.stiffness')}
      ${slot('damping')}
      ${slot('excitation.strength')}
    </fieldset>
    ${pickup('빨간 원은 타격 위치, 초록 점은 소리를 읽는 pickup입니다.', '좌표는 반지름이 1인 원을 기준으로 표시합니다.')}
    <p id="physical-info"></p>
    ${analysis('격자와 물리 설정')}
    <details id="model-notes">
      <summary>2D 판 모델의 원리</summary>
      <p>격자에 짧은 충격을 넣고, 각 오디오 샘플마다 이웃 지점으로 진동을 전달합니다. 원 둘레는 고정 경계로 근사하며 장력 항과 판의 굽힘 강성 항을 함께 계산합니다.</p>
      <p><code>uₜₜ = c²∇²u − κ²∇⁴u − 감쇠 · uₜ + 타격</code></p>
      <p>타격 위치마다 서로 다른 진동 모드가 울립니다. 높은 해상도는 더 많은 격자점을 계산하므로 배음과 계산 비용도 달라집니다.</p>
    </details>`,

  sphere: `
    <h2 id="model-title"></h2>
    <p id="model-description"></p>
    ${scene('구의 표면과 로컬 좌표 격자입니다. 표면 마커는 구의 회전을 따릅니다.')}
    <p id="interaction-hint"></p>
    <p class="actions"><button type="button" data-action="strike">중앙 타격</button><button type="button" data-action="stop">울림 멈추기</button></p>
    <fieldset id="sphere-object">
      <legend>구의 크기와 재질</legend>
      ${slot('physical.diameter')}
      ${slot('physical.material')}
    </fieldset>
    <fieldset id="sphere-excitation">
      <legend>타격과 공진 계산</legend>
      ${slot('excitation.strength')}
      ${slot('damping')}
      ${slot('quality')}
    </fieldset>
    ${pickup('빨간 점은 타격 위치, 주황 점은 소리를 읽는 pickup입니다.', '좌표는 회전과 독립적인 단위 구 표면의 (x, y, z)입니다.')}
    <p id="physical-info"></p>
    ${analysis('물성과 공진')}
    <details id="model-notes">
      <summary>모델 가정과 물성</summary>
      <p>실체 구의 저차 탄성 공진을 방사 방향 모드와 구면 각도 모드로 근사합니다. 구면조화함수로 타격 위치와 pickup 위치에 따른 각 모드의 기여를 계산합니다.</p>
      <p>지름은 공진 주파수와 질량에 반영됩니다. 밀도·탄성계수·포아송비는 파동 속도와 질량을 바꿉니다. 선택 재질의 물성은 대표값이며 제품 형상과 열처리에 따라 달라질 수 있습니다.</p>
      <p>현재 그림은 표면 위치와 회전을 표시하며, 실제 모드의 변형을 그리지는 않습니다.</p>
    </details>`,

  ant: `
    <h2 id="model-title"></h2>
    <figure>
      <div id="scene" class="scene"></div>
    </figure>
    <div data-audio-status></div>
    <p class="ant-audio-controls"><button type="button" data-action="ant-audio" aria-pressed="false">Audio Off</button>
      <label for="ant-volume">Volume</label>
      <input id="ant-volume" type="range" data-action="ant-volume" min="0" max="100" step="1" value="100">
      <output id="ant-volume-value" for="ant-volume">100%</output>
      <button type="button" data-action="ant-substrate" aria-pressed="false">Base Substrate Off</button></p>
    <p id="ant-diagnostics" aria-label="Live ANT diagnostics"></p>
    <details id="ant-plate-debug">
      <summary>Plate Debug</summary>
      <p class="ant-debug-note">Read-only diagnostics. Base substrate is an optional quiet legacy Plate and is not part of born material history.</p>
      <fieldset class="ant-debug-overlays">
        <legend>Debug overlay</legend>
        <label><input type="checkbox" data-ant-overlay="surface"> SurfaceField</label>
        <label><input type="checkbox" data-ant-overlay="candidate"> Birth candidate</label>
        <label><input type="checkbox" data-ant-overlay="source"> Source annulus</label>
        <label><input type="checkbox" data-ant-overlay="exposure"> Exposure depth</label>
        <label><input type="checkbox" data-ant-overlay="plateIds"> Plate IDs</label>
        <label><input type="checkbox" data-ant-overlay="pheromone" checked> Pheromone</label>
        <label><input type="checkbox" data-ant-overlay="material" checked> Material</label>
      </fieldset>
      <table class="ant-debug-table"><caption>Material / audio status</caption><tbody>
        <tr><th scope="row">Born Plates</th><td data-ant-debug="plate-count">—</td></tr>
        <tr><th scope="row">Exposed / fully buried Plates</th><td data-ant-debug="plate-exposure">—</td></tr>
        <tr><th scope="row">Nodules</th><td data-ant-debug="nodule-count">—</td></tr>
        <tr><th scope="row">First / latest birth</th><td data-ant-debug="birth-times">—</td></tr>
        <tr><th scope="row">Base substrate input / delivered</th><td data-ant-debug="substrate-events">—</td></tr>
        <tr><th scope="row">Born audio layers awake / sleeping</th><td data-ant-debug="audio-layers">—</td></tr>
        <tr><th scope="row">Surface audio / wall</th><td data-ant-debug="audio-wall">—</td></tr>
      </tbody></table>
      <table class="ant-debug-table"><caption>Strongest current birth candidate</caption><tbody>
        <tr><th scope="row">Chemical</th><td data-ant-debug="candidate-chemical">—</td></tr>
        <tr><th scope="row">Surface support</th><td data-ant-debug="candidate-support">—</td></tr>
        <tr><th scope="row">Persistence</th><td data-ant-debug="candidate-persistence">—</td></tr>
        <tr><th scope="row">Geodesic length</th><td data-ant-debug="candidate-length">—</td></tr>
        <tr><th scope="row">Repeat contacts</th><td data-ant-debug="candidate-contacts">—</td></tr>
        <tr><th scope="row">Corridor refractory</th><td data-ant-debug="candidate-refractory">—</td></tr>
        <tr><th scope="row">Global birth gap</th><td data-ant-debug="candidate-gap">—</td></tr>
        <tr><th scope="row">Birth ready</th><td data-ant-debug="candidate-ready">—</td></tr>
      </tbody></table>
    </details>`
};
