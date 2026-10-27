export const TEMPORAL_MIN_SEPARATION_PX = 4;
export const TEMPORAL_MIN_MEDIAN_SEPARATION_PX = 12;

/** Build a deterministic cycle-only derangement from event-time-supported positions. */
export function assignTemporalDerangement({ events, isSupported, width = 640, height = 640,
  minSeparationPx = TEMPORAL_MIN_SEPARATION_PX, minMedianSeparationPx = TEMPORAL_MIN_MEDIAN_SEPARATION_PX,
  minimumCoverage = 0.95 }) {
  if (!Array.isArray(events) || typeof isSupported !== 'function' || !(width > 0) || !(height > 0)
    || !(minSeparationPx > 0) || !(minMedianSeparationPx > 0)
    || !(minimumCoverage > 0 && minimumCoverage <= 1)) throw new TypeError('Invalid temporal assignment inputs.');
  const ids = new Set();
  for (const event of events) {
    if (typeof event?.id !== 'string' || !event.id || ids.has(event.id)
      || typeof event.plateId !== 'string' || !Number.isFinite(event.eventTimeMs)
      || !validPoint(event.position)) throw new TypeError('Invalid or duplicate contact event.');
    ids.add(event.id);
  }

  const ordered = [...events].sort((a, b) => compareText(a.plateId, b.plateId)
    || a.eventTimeMs - b.eventTimeMs || compareText(a.id, b.id));
  const mappings = [], byPlate = {};
  for (const plateId of [...new Set(ordered.map(event => event.plateId))].sort(compareText)) {
    const plateEvents = ordered.filter(event => event.plateId === plateId);
    const adjacency = plateEvents.map((source, sourceIndex) => plateEvents
      .flatMap((target, targetIndex) => {
        if (sourceIndex === targetIndex || !isSupported(source, target)) return [];
        const distancePx = Math.hypot((target.position.x - source.position.x) * width,
          (target.position.y - source.position.y) * height);
        if (distancePx < minSeparationPx || nativePixel(source.position, width, height)
          === nativePixel(target.position, width, height)) return [];
        return [{ targetIndex, distancePx, targetId: target.id }];
      })
      .sort((a, b) => b.distancePx - a.distancePx || compareText(a.targetId, b.targetId)));
    const targetSource = new Int32Array(plateEvents.length).fill(-1);
    const sourceTarget = new Int32Array(plateEvents.length).fill(-1);
    const distance = new Int32Array(plateEvents.length);
    function breadthFirstSearch() {
      const queue = [];
      let shortestAugment = Number.POSITIVE_INFINITY;
      for (let sourceIndex = 0; sourceIndex < plateEvents.length; sourceIndex += 1) {
        distance[sourceIndex] = sourceTarget[sourceIndex] < 0 ? 0 : -1;
        if (distance[sourceIndex] === 0) queue.push(sourceIndex);
      }
      for (let head = 0; head < queue.length; head += 1) {
        const sourceIndex = queue[head];
        if (distance[sourceIndex] >= shortestAugment) continue;
        for (const edge of adjacency[sourceIndex]) {
          const displaced = targetSource[edge.targetIndex];
          if (displaced < 0) shortestAugment = distance[sourceIndex] + 1;
          else if (distance[displaced] < 0) {
            distance[displaced] = distance[sourceIndex] + 1;
            queue.push(displaced);
          }
        }
      }
      return shortestAugment;
    }
    function depthFirstSearch(sourceIndex, shortestAugment) {
      for (const edge of adjacency[sourceIndex]) {
        const displaced = targetSource[edge.targetIndex];
        const augmenting = displaced < 0 ? distance[sourceIndex] + 1 === shortestAugment
          : distance[displaced] === distance[sourceIndex] + 1
            && depthFirstSearch(displaced, shortestAugment);
        if (augmenting) {
          sourceTarget[sourceIndex] = edge.targetIndex;
          targetSource[edge.targetIndex] = sourceIndex;
          return true;
        }
      }
      distance[sourceIndex] = -1;
      return false;
    }
    let shortestAugment;
    while ((shortestAugment = breadthFirstSearch()) !== Number.POSITIVE_INFINITY) {
      for (let sourceIndex = 0; sourceIndex < plateEvents.length; sourceIndex += 1) {
        if (sourceTarget[sourceIndex] < 0) depthFirstSearch(sourceIndex, shortestAugment);
      }
    }

    const cycleNodes = new Set(), cycleRows = [];
    const globallyVisited = new Uint8Array(plateEvents.length);
    for (let start = 0; start < plateEvents.length; start += 1) {
      if (globallyVisited[start]) continue;
      const path = [], pathIndex = new Map();
      let current = start;
      while (current >= 0 && !globallyVisited[current] && !pathIndex.has(current)) {
        pathIndex.set(current, path.length);
        path.push(current);
        current = sourceTarget[current];
      }
      for (const node of path) globallyVisited[node] = 1;
      if (current < 0 || !pathIndex.has(current)) continue;
      const cycle = path.slice(pathIndex.get(current));
      if (cycle.length < 2) continue;
      for (const node of cycle) cycleNodes.add(node);
      for (const sourceIndex of cycle) {
        const targetIndex = sourceTarget[sourceIndex];
        const source = plateEvents[sourceIndex], target = plateEvents[targetIndex];
        const distancePx = Math.hypot((target.position.x - source.position.x) * width,
          (target.position.y - source.position.y) * height);
        cycleRows.push({ id: source.id, targetEventId: target.id, plateId,
          sourceEventTimeMs: source.eventTimeMs, targetPosition: target.position, distancePx });
      }
    }
    const distances = cycleRows.map(row => row.distancePx).sort((a, b) => a - b);
    const medianDistancePx = median(distances);
    const sourceCount = plateEvents.length, assignedCount = cycleRows.length;
    const stats = { sourceCount, maximumMatchedCount: sourceTarget.filter(index => index >= 0).length,
      assignedCount, coverage: sourceCount ? assignedCount / sourceCount : 0,
      minimumDistancePx: distances[0] ?? null, medianDistancePx,
      sameNativePixelPairs: 0, cycleCount: countCycles(cycleRows, plateEvents) };
    byPlate[plateId] = stats;
    mappings.push(...cycleRows);
  }
  const distances = mappings.map(row => row.distancePx).sort((a, b) => a - b);
  const sourceCount = ordered.length;
  const assignedCount = mappings.length;
  const summary = { sourceCount, assignedCount, coverage: sourceCount ? assignedCount / sourceCount : 0,
    minimumDistancePx: distances[0] ?? null, medianDistancePx: median(distances),
    sameNativePixelPairs: mappings.reduce((count, row) => count
      + Number(nativePixel(events.find(event => event.id === row.id).position, width, height)
        === nativePixel(row.targetPosition, width, height)), 0), byPlate };
  return { accepted: summary.coverage >= minimumCoverage && summary.sameNativePixelPairs === 0
    && (summary.minimumDistancePx ?? 0) >= minSeparationPx
    && (summary.medianDistancePx ?? 0) >= minMedianSeparationPx,
  events: mappings.sort((a, b) => compareText(a.plateId, b.plateId)
    || a.sourceEventTimeMs - b.sourceEventTimeMs || compareText(a.id, b.id)), summary };
}

function countCycles(rows, events) {
  const next = new Map(rows.map(row => [row.id, row.targetEventId]));
  const visited = new Set(); let count = 0;
  for (const event of events) {
    if (visited.has(event.id) || !next.has(event.id)) continue;
    count += 1;
    let current = event.id;
    while (current && next.has(current) && !visited.has(current)) {
      visited.add(current); current = next.get(current);
    }
  }
  return count;
}

function nativePixel(point, width, height) {
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  return y * width + x;
}

function median(values) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function validPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
