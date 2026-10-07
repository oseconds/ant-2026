/** Observation-only encounters between collision disks; this class never acts on agents. */
export class DynamicSocialGraph {
  constructor({ distanceMultiplier = 2 } = {}) {
    if (!Number.isFinite(distanceMultiplier) || distanceMultiplier <= 0) {
      throw new RangeError('distanceMultiplier must be finite and positive');
    }
    this.distanceMultiplier = distanceMultiplier;
    this.timeSeconds = null;
    this.finished = false;
    this.nodes = new Map();
    this.knownIds = new Set();
    this.activeEncounters = new Map();
    // ponytail: replay retains full history with O(N^2) pair scans and O(E) window reads; add paging or a spatial index only if long runs or populations make this costly.
    this.encounters = [];
    this.events = [];
    this.nextEncounterId = 1;
  }

  observe(timeSeconds, ants) {
    if (this.finished) throw new Error('Cannot observe a finished graph');
    if (!Number.isFinite(timeSeconds)) throw new RangeError('timeSeconds must be finite');
    if (this.timeSeconds !== null && timeSeconds < this.timeSeconds) {
      throw new RangeError('timeSeconds cannot decrease');
    }
    if (!Array.isArray(ants)) throw new TypeError('ants must be an array');

    const nextNodes = new Map();
    for (const ant of ants) {
      if (!ant || typeof ant.id !== 'string' || !ant.id.trim()) {
        throw new TypeError('ant id must be a nonempty string');
      }
      if (!Number.isFinite(ant.x) || !Number.isFinite(ant.y)) {
        throw new RangeError('ant coordinates must be finite');
      }
      if (!Number.isFinite(ant.radius) || ant.radius <= 0) {
        throw new RangeError('radius must be finite and positive');
      }
      if (nextNodes.has(ant.id)) throw new TypeError('duplicate ID: ' + ant.id);
      if (this.knownIds.has(ant.id) && !this.nodes.has(ant.id)) {
        throw new Error('Cannot reuse retired ID: ' + ant.id);
      }
      nextNodes.set(ant.id, {
        id: ant.id, x: ant.x, y: ant.y, radius: ant.radius,
        bornSeconds: this.nodes.get(ant.id)?.bornSeconds ?? timeSeconds
      });
    }

    const pairs = new Map();
    const orderedNodes = [...nextNodes.values()].sort((a, b) => compareIds(a.id, b.id));
    for (let i = 0; i < orderedNodes.length; i += 1) {
      const a = orderedNodes[i];
      for (let j = i + 1; j < orderedNodes.length; j += 1) {
        const b = orderedNodes[j];
        const radiusSum = a.radius + b.radius;
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        if (!Number.isFinite(radiusSum) || !Number.isFinite(distance)) {
          throw new RangeError('ant pair distance must be finite');
        }
        const threshold = this.distanceMultiplier * radiusSum;
        const boundaryTolerance = Number.EPSILON * Math.max(distance, threshold) * 4;
        if (distance <= threshold + boundaryTolerance) {
          const antA = a.id < b.id ? a.id : b.id;
          const antB = a.id < b.id ? b.id : a.id;
          pairs.set(pairKey(antA, antB), {
            antA, antB, distance, normalizedDistance: distance / radiusSum
          });
        }
      }
    }

    const entered = [...nextNodes.keys()].filter(id => !this.nodes.has(id)).sort(compareIds);
    const exited = [...this.nodes.keys()].filter(id => !nextNodes.has(id)).sort(compareIds);
    for (const id of entered) this.events.push({ type: 'NODE_ENTER', timeSeconds, antId: id });
    for (const id of exited) this.events.push({ type: 'NODE_EXIT', timeSeconds, antId: id });

    for (const [key, encounter] of [...this.activeEncounters].sort(([a], [b]) => compareIds(a, b))) {
      if (pairs.has(key)) continue;
      const endReason = nextNodes.has(encounter.antA) && nextNodes.has(encounter.antB)
        ? 'distance' : 'node-exit';
      this.#closeEncounter(encounter, timeSeconds, endReason);
      this.activeEncounters.delete(key);
    }

    for (const [key, pair] of [...pairs].sort(([a], [b]) => compareIds(a, b))) {
      let encounter = this.activeEncounters.get(key);
      if (!encounter) {
        encounter = {
          encounterId: 'encounter-' + this.nextEncounterId++, key,
          antA: pair.antA, antB: pair.antB,
          startSeconds: timeSeconds, endSeconds: null, durationSeconds: 0,
          minDistance: pair.distance, minNormalizedDistance: pair.normalizedDistance,
          endReason: null, lastSupportSeconds: timeSeconds
        };
        this.encounters.push(encounter);
        this.activeEncounters.set(key, encounter);
        this.events.push({ type: 'ENCOUNTER_START', timeSeconds, ...encounterFields(encounter),
          distance: pair.distance, normalizedDistance: pair.normalizedDistance });
      } else {
        encounter.minDistance = Math.min(encounter.minDistance, pair.distance);
        encounter.minNormalizedDistance = Math.min(encounter.minNormalizedDistance, pair.normalizedDistance);
        encounter.lastSupportSeconds = timeSeconds;
        encounter.durationSeconds = timeSeconds - encounter.startSeconds;
      }
    }

    for (const id of entered) this.knownIds.add(id);
    this.nodes = nextNodes;
    this.timeSeconds = timeSeconds;
  }

  getSnapshot(windowSeconds) {
    if (!Number.isFinite(windowSeconds) || windowSeconds < 0) {
      throw new RangeError('windowSeconds must be finite and nonnegative');
    }
    const timeSeconds = this.timeSeconds;
    const windowStart = timeSeconds === null ? null : timeSeconds - windowSeconds;
    const edges = [];
    if (timeSeconds !== null && windowStart !== null) {
      const windows = new Map();
      for (const encounter of this.encounters) {
        if (!this.nodes.has(encounter.antA) || !this.nodes.has(encounter.antB)) continue;
        const end = encounter.endSeconds ?? timeSeconds;
        const weight = Math.max(0, Math.min(end, timeSeconds) - Math.max(encounter.startSeconds, windowStart));
        if (weight <= 0) continue;
        let edge = windows.get(encounter.key);
        if (!edge) {
          edge = {
            key: encounter.key, antA: encounter.antA, antB: encounter.antB,
            weightSeconds: 0, lastSupportSeconds: -Infinity,
            minDistance: Infinity, minNormalizedDistance: Infinity
          };
          windows.set(encounter.key, edge);
        }
        edge.weightSeconds += weight;
        edge.lastSupportSeconds = Math.max(edge.lastSupportSeconds,
          encounter.endSeconds ?? encounter.lastSupportSeconds);
        edge.minDistance = Math.min(edge.minDistance, encounter.minDistance);
        edge.minNormalizedDistance = Math.min(edge.minNormalizedDistance, encounter.minNormalizedDistance);
      }
      for (const edge of [...windows.values()].sort((a, b) => compareIds(a.key, b.key))) {
        edges.push({ ...edge, activeEncounter: this.activeEncounters.has(edge.key) });
      }
    }
    return {
      timeSeconds, windowSeconds, distanceMultiplier: this.distanceMultiplier,
      nodes: [...this.nodes.values()].sort((a, b) => compareIds(a.id, b.id)).map(node => ({ ...node })),
      edges, activeEncounterCount: this.activeEncounters.size
    };
  }

  getEvents() { return this.events.map(event => ({ ...event })); }

  getEncounters() { return this.encounters.map(encounter => ({ ...encounter })); }

  finish(timeSeconds = this.timeSeconds) {
    if (this.finished) throw new Error('Graph is already finished');
    if (this.timeSeconds === null) throw new Error('Cannot finish before the first observation');
    if (!Number.isFinite(timeSeconds)) throw new RangeError('timeSeconds must be finite');
    if (timeSeconds < this.timeSeconds) throw new RangeError('timeSeconds cannot decrease');
    for (const encounter of [...this.activeEncounters.values()].sort((a, b) => compareIds(a.key, b.key))) {
      this.#closeEncounter(encounter, timeSeconds, 'right-censored');
    }
    this.activeEncounters.clear();
    this.timeSeconds = timeSeconds;
    this.finished = true;
  }

  #closeEncounter(encounter, timeSeconds, endReason) {
    encounter.endSeconds = timeSeconds;
    encounter.durationSeconds = timeSeconds - encounter.startSeconds;
    encounter.lastSupportSeconds = timeSeconds;
    encounter.endReason = endReason;
    this.events.push({ type: 'ENCOUNTER_END', timeSeconds, ...encounterFields(encounter) });
  }
}

function pairKey(antA, antB) { return JSON.stringify([antA, antB]); }
function encounterFields(encounter) {
  return {
    encounterId: encounter.encounterId, key: encounter.key,
    antA: encounter.antA, antB: encounter.antB,
    startSeconds: encounter.startSeconds, endSeconds: encounter.endSeconds,
    durationSeconds: encounter.durationSeconds,
    minDistance: encounter.minDistance,
    minNormalizedDistance: encounter.minNormalizedDistance,
    endReason: encounter.endReason
  };
}
function compareIds(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
