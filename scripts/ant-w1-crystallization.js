const MAX_GAP_SECONDS = 1 + 1 / 60 + 1e-9;
const MIN_PERSISTENCE_SECONDS = 20;

export function createW1Crystallizer({ width, height }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError('width and height must be positive safe integers');
  }
  const cellCount = width * height;
  if (!Number.isSafeInteger(cellCount)) throw new RangeError('width * height must be a safe integer');

  const fast = new Float64Array(cellCount), slow = new Float64Array(cellCount);
  const records = new Map(), closedRecords = [], discardedRecords = [];
  let previousLabels = new Int32Array(cellCount).fill(-1), previousComponents = [];
  let lastTime = null, frameIndex = 0, nextId = 0;
  let lastSnapshot = null;

  function advance({ timeSeconds, flags }) {
    validateFrame(timeSeconds, flags, lastTime, cellCount);
    const dt = lastTime === null ? 0 : timeSeconds - lastTime;
    const alpha = 1 - Math.exp(-dt / 20), beta = 1 - Math.exp(-dt / 90);
    const q = new Uint8Array(cellCount);
    for (let i = 0; i < cellCount; i += 1) {
      q[i] = Number((flags[i] & 7) === 7);
      fast[i] += alpha * (q[i] - fast[i]);
      slow[i] += beta * (q[i] - slow[i]);
    }
    const active = new Uint8Array(cellCount);
    for (let i = 0; i < cellCount; i += 1) active[i] = Number(fast[i] - slow[i] > alpha - beta);

    const found = components8(active, width, height);
    const previousComponentSets = found.components.map(component => {
      const labels = new Set();
      for (const cell of component.cells) {
        const previousLabel = previousLabels[cell];
        if (previousLabel >= 0) labels.add(previousLabel);
      }
      return labels;
    });
    const descendantsByPreviousComponent = new Map();
    previousComponentSets.forEach((labels, currentLabel) => {
      for (const label of labels) {
        if (!descendantsByPreviousComponent.has(label)) descendantsByPreviousComponent.set(label, new Set());
        descendantsByPreviousComponent.get(label).add(currentLabel);
      }
    });
    for (const [label, descendants] of descendantsByPreviousComponent) {
      if (descendants.size > 1) canonicalEpisode(previousComponents[label].episode).splitCount += 1;
    }

    const closedEpisodes = [], discardedEpisodes = [];
    const currentComponents = found.components.map((component, index) => {
      const labels = [...previousComponentSets[index]];
      const parents = [...new Set(labels.map(label => canonicalEpisode(previousComponents[label].episode)))].sort((a, b) => a.id - b.id);
      let episode = parents[0] ?? makeEpisode(timeSeconds, frameIndex);
      if (parents.length > 1) {
        for (const other of parents.slice(1)) mergeInto(episode, other);
      }
      if (labels.length > 1) episode.mergeCount += 1;
      admit(episode, component.cells, timeSeconds, frameIndex);
      episode.lastActiveTimeSeconds = timeSeconds;
      episode.lastActiveFrameIndex = frameIndex;
      return { cells: component.cells, episode };
    });
    const activeEpisodes = new Set(currentComponents.map(component => component.episode));
    for (const episode of activeEpisodes) episode.activeFrames.add(frameIndex);
    for (const [id, episode] of [...records]) {
      if (episode !== records.get(id)) continue;
      if (!activeEpisodes.has(episode)) {
        records.delete(id);
        const result = finishEpisode(episode, timeSeconds);
        (result.status === 'frozen' ? closedEpisodes : discardedEpisodes).push(result);
        (result.status === 'frozen' ? closedRecords : discardedRecords).push(result);
      }
    }

    const currentLabels = new Int32Array(cellCount).fill(-1);
    currentComponents.forEach((component, label) => {
      for (const cell of component.cells) currentLabels[cell] = label;
    });
    previousLabels = currentLabels;
    previousComponents = currentComponents;
    lastTime = timeSeconds;
    frameIndex += 1;
    lastSnapshot = Object.freeze({
      timeSeconds, frameIndex: frameIndex - 1,
      activeMask: Object.freeze(Array.from(active)),
      activeCellCount: active.reduce((sum, value) => sum + value, 0),
      activeComponentCount: found.components.length,
      openEpisodeCount: records.size,
      stateBounds: stateBounds(fast, slow)
    });
    return Object.freeze({
      timeSeconds, frameIndex: frameIndex - 1,
      closedEpisodes: Object.freeze(closedEpisodes),
      discardedEpisodes: Object.freeze(discardedEpisodes),
      activeComponentCount: found.components.length,
      openEpisodeCount: records.size,
      stateBounds: lastSnapshot.stateBounds
    });
  }

  function makeEpisode(birthTimeSeconds, birthFrameIndex) {
    const episode = {
      id: nextId++, parentIds: new Set(), ancestryIds: new Set(), mergeCount: 0, splitCount: 0,
      birthTimeSeconds, birthFrameIndex, lastActiveTimeSeconds: birthTimeSeconds,
      lastActiveFrameIndex: birthFrameIndex, activeFrames: new Set(), cells: new Map(), redirect: null
    };
    episode.ancestryIds.add(episode.id);
    records.set(episode.id, episode);
    return episode;
  }

  function mergeInto(target, source) {
    target = canonicalEpisode(target);
    source = canonicalEpisode(source);
    if (target === source || !records.has(source.id)) return;
    const ids = new Set([...target.ancestryIds, ...source.ancestryIds, target.id, source.id]);
    const parents = new Set([...target.parentIds, ...source.parentIds, target.id, source.id]);
    parents.delete(target.id);
    target.ancestryIds = ids;
    target.parentIds = parents;
    target.mergeCount += source.mergeCount;
    target.splitCount += source.splitCount;
    for (const frame of source.activeFrames) target.activeFrames.add(frame);
    target.birthTimeSeconds = Math.min(target.birthTimeSeconds, source.birthTimeSeconds);
    target.birthFrameIndex = Math.min(target.birthFrameIndex, source.birthFrameIndex);
    for (const [cell, admission] of source.cells) {
      const old = target.cells.get(cell);
      if (!old || admission.timeSeconds < old.timeSeconds) target.cells.set(cell, admission);
    }
    source.redirect = target;
    records.delete(source.id);
  }

  function canonicalEpisode(episode) {
    while (episode.redirect) episode = episode.redirect;
    return episode;
  }

  function admit(episode, cells, timeSeconds, frame) {
    for (const cell of cells) if (!episode.cells.has(cell)) episode.cells.set(cell, { timeSeconds, frameIndex: frame });
  }

  function finishEpisode(episode, closeTimeSeconds) {
    const durationSeconds = episode.lastActiveTimeSeconds - episode.birthTimeSeconds;
    const status = durationSeconds >= MIN_PERSISTENCE_SECONDS ? 'frozen' : 'discarded';
    const cellIndices = [...episode.cells.keys()].sort((a, b) => a - b);
    return Object.freeze({
      id: episode.id,
      parentIds: Object.freeze([...episode.parentIds].sort((a, b) => a - b)),
      ancestryIds: Object.freeze([...episode.ancestryIds].sort((a, b) => a - b)),
      mergeCount: episode.mergeCount, splitCount: episode.splitCount,
      birthTimeSeconds: episode.birthTimeSeconds, birthFrameIndex: episode.birthFrameIndex,
      lastActiveTimeSeconds: episode.lastActiveTimeSeconds, lastActiveFrameIndex: episode.lastActiveFrameIndex,
      closeTimeSeconds, persistenceSeconds: durationSeconds, activeFrameCount: episode.activeFrames.size,
      status, discardReason: status === 'discarded' ? 'persistence-under-20-seconds' : null,
      cellIndices: Object.freeze(cellIndices),
      firstAdmissionTimeSecondsByCell: Object.freeze(cellIndices.map(cell => episode.cells.get(cell).timeSeconds)),
      firstAdmissionFrameByCell: Object.freeze(cellIndices.map(cell => episode.cells.get(cell).frameIndex))
    });
  }

  function getOpenEpisodes() {
    return Object.freeze([...records.values()].sort((a, b) => a.id - b.id).map(episode => Object.freeze({
      id: episode.id, parentIds: Object.freeze([...episode.parentIds].sort((a, b) => a - b)),
      ancestryIds: Object.freeze([...episode.ancestryIds].sort((a, b) => a - b)),
      mergeCount: episode.mergeCount, splitCount: episode.splitCount,
      birthTimeSeconds: episode.birthTimeSeconds, birthFrameIndex: episode.birthFrameIndex,
      lastActiveTimeSeconds: episode.lastActiveTimeSeconds, lastActiveFrameIndex: episode.lastActiveFrameIndex,
      activeFrameCount: episode.activeFrames.size, status: 'right-censored',
      ...geometry(episode)
    })));
  }

  function geometry(episode) {
    const cellIndices = [...episode.cells.keys()].sort((a, b) => a - b);
    return {
      cellIndices: Object.freeze(cellIndices),
      firstAdmissionTimeSecondsByCell: Object.freeze(cellIndices.map(cell => episode.cells.get(cell).timeSeconds)),
      firstAdmissionFrameByCell: Object.freeze(cellIndices.map(cell => episode.cells.get(cell).frameIndex))
    };
  }

  function stateBounds(f, s) {
    let minFast = Infinity, maxFast = -Infinity, minSlow = Infinity, maxSlow = -Infinity;
    for (let i = 0; i < f.length; i += 1) {
      minFast = Math.min(minFast, f[i]); maxFast = Math.max(maxFast, f[i]);
      minSlow = Math.min(minSlow, s[i]); maxSlow = Math.max(maxSlow, s[i]);
    }
    return Object.freeze({ fast: Object.freeze([minFast, maxFast]), slow: Object.freeze([minSlow, maxSlow]) });
  }

  return Object.freeze({
    advance,
    getOpenEpisodes,
    getClosedEpisodes: () => Object.freeze([...closedRecords]),
    getDiscardedEpisodes: () => Object.freeze([...discardedRecords]),
    getSnapshot: () => lastSnapshot
  });
}

function validateFrame(timeSeconds, flags, lastTime, cellCount) {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError('timeSeconds must be finite and nonnegative');
  if (lastTime !== null && (timeSeconds <= lastTime || timeSeconds - lastTime > MAX_GAP_SECONDS)) {
    throw new RangeError(`timeSeconds must increase by at most ${MAX_GAP_SECONDS} seconds`);
  }
  if ((!Array.isArray(flags) && !ArrayBuffer.isView(flags)) || flags instanceof DataView || flags.length !== cellCount) {
    throw new RangeError(`flags length must equal width * height (${cellCount})`);
  }
  for (let i = 0; i < cellCount; i += 1) {
    if (!Number.isInteger(flags[i]) || flags[i] < 0 || flags[i] > 7) throw new TypeError('flags must contain integers from 0 through 7');
  }
}

function components8(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1), components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] >= 0) continue;
    const label = components.length, cells = [start];
    labels[start] = label;
    for (let head = 0; head < cells.length; head += 1) {
      const cell = cells[head], x = cell % width, y = Math.floor(cell / width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && labels[next] < 0) { labels[next] = label; cells.push(next); }
      }
    }
    components.push({ cells });
  }
  return { components };
}
