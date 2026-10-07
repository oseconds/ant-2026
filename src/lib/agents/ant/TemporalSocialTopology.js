const EPSILON = 1e-9;
// S1 samples at 20 Hz; a larger gap cannot support continuous topology persistence.
const MAX_SUPPORT_GAP_SECONDS = 0.075;
const EVENT_ORDER = [
  'EDGE_END', 'EDGE_FORM', 'COMPONENT_SPLIT', 'COMPONENT_MERGE',
  'BRIDGE_BREAK', 'BRIDGE_FORM', 'BRIDGE_PERSIST',
  'ARTICULATION_BREAK', 'ARTICULATION_FORM', 'ARTICULATION_PERSIST',
  'CONNECTOR_PERSIST', 'CONNECTOR_END'
];

/** Read-only, window-specific topology derived from DynamicSocialGraph snapshots. */
export class TemporalSocialTopology {
  constructor({ windowSeconds, formationSeconds = 0.1, persistenceSeconds } = {}) {
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
      throw new RangeError('windowSeconds must be finite and positive');
    }
    if (!Number.isFinite(formationSeconds) || formationSeconds < 0) {
      throw new RangeError('formationSeconds must be finite and nonnegative');
    }
    const persistence = persistenceSeconds ?? Math.max(0.25, windowSeconds);
    if (!Number.isFinite(persistence) || persistence < 0) {
      throw new RangeError('persistenceSeconds must be finite and nonnegative');
    }

    this.windowSeconds = windowSeconds;
    this.formationSeconds = formationSeconds;
    this.persistenceSeconds = persistence;
    this.snapshot = null;
    this.finished = false;
    this.events = [];
    this.edgeLifetimes = [];
    this.openEdgeLifetimes = new Map();
    this.bridgeStates = new Map();
    this.articulationStates = new Map();
    this.connectorStates = new Map();
    this.nextLifetimeId = 1;
    this.candidateResets = { bridge: 0, articulation: 0, connector: 0 };
  }

  observe(graphSnapshot) {
    if (this.finished) throw new Error('Cannot observe a finished topology');
    const input = normalizeSnapshot(graphSnapshot, this.windowSeconds);
    const previous = this.snapshot;
    if (previous && input.timeSeconds < previous.timeSeconds) {
      throw new RangeError('timeSeconds cannot decrease');
    }

    const events = [];
    const previousEdges = new Map((previous?.edges || []).map(edge => [edge.key, edge]));
    const currentEdges = new Map(input.edges.map(edge => [edge.key, edge]));
    const formedKeys = new Set([...currentEdges.keys()].filter(key => !previousEdges.has(key)));
    this.updateEdgeLifetimes(previous, input, previousEdges, currentEdges, events);

    const topology = findTopology(input.nodes, input.edges);
    const structural = {
      ...input,
      components: topology.components,
      bridges: topology.bridges,
      articulationNodes: topology.articulationNodes
    };
    const transitions = previous
      ? compareComponents(previous.components, structural.components, previous.nodes, structural.nodes)
      : [];
    for (const transition of transitions) {
      events.push({ timeSeconds: input.timeSeconds, ...transition.event });
    }

    const supportGap = Boolean(previous)
      && input.timeSeconds - previous.timeSeconds > MAX_SUPPORT_GAP_SECONDS + EPSILON;
    this.updateBridgeStates(structural, supportGap, events);
    this.updateArticulationStates(structural, supportGap, events);

    const connectorCandidates = previous
      ? findConnectorCandidates(transitions, previous, structural, formedKeys)
      : [];
    this.updateConnectorStates(structural, connectorCandidates, supportGap, events);

    structural.metrics = this.metrics(structural);
    structural.finished = false;
    this.snapshot = structural;
    this.events.push(...sortEvents(events));
    return this.getSnapshot();
  }

  getSnapshot() {
    return this.snapshot ? clone(this.snapshot) : null;
  }

  getEvents() { return this.events.map(clone); }

  getEdgeLifetimes() { return this.edgeLifetimes.map(clone); }

  finish(timeSeconds = this.snapshot?.timeSeconds) {
    if (this.finished) throw new Error('Topology is already finished');
    if (!this.snapshot) throw new Error('Cannot finish before the first observation');
    if (!Number.isFinite(timeSeconds)) throw new RangeError('timeSeconds must be finite');
    if (timeSeconds < this.snapshot.timeSeconds) throw new RangeError('timeSeconds cannot decrease');

    const events = [];
    const finalMetrics = this.metrics(this.snapshot);
    for (const [key, lifetime] of [...this.openEdgeLifetimes].sort(byKey)) {
      this.closeEdgeLifetime(key, lifetime, timeSeconds, 'RUN_END', true, events);
    }
    this.openEdgeLifetimes.clear();
    this.endRoleStates(this.bridgeStates, 'bridge', timeSeconds, 'RUN_END', events);
    this.endRoleStates(this.articulationStates, 'articulation', timeSeconds, 'RUN_END', events);
    this.endConnectorStates(timeSeconds, 'RUN_END', events);
    this.bridgeStates.clear();
    this.articulationStates.clear();
    this.connectorStates.clear();

    this.finished = true;
    this.snapshot = {
      ...this.snapshot,
      finished: true,
      metrics: finalMetrics
    };
    this.events.push(...sortEvents(events));
    return this.getSnapshot();
  }

  updateEdgeLifetimes(previous, input, previousEdges, currentEdges, events) {
    for (const [key, lifetime] of [...this.openEdgeLifetimes].sort(byKey)) {
      if (currentEdges.has(key)) continue;
      const oldEdge = previousEdges.get(key);
      const endReason = input.nodes.some(node => node.id === oldEdge.antA)
        && input.nodes.some(node => node.id === oldEdge.antB) ? 'weight-expired' : 'node-exit';
      this.closeEdgeLifetime(key, lifetime, input.timeSeconds, endReason, false, events, oldEdge);
    }

    for (const edge of input.edges) {
      let lifetime = this.openEdgeLifetimes.get(edge.key);
      if (!lifetime) {
        lifetime = {
          lifetimeId: 'window-edge-' + this.nextLifetimeId++, key: edge.key,
          antA: edge.antA, antB: edge.antB,
          windowSeconds: this.windowSeconds,
          distanceMultiplier: input.distanceMultiplier,
          startSeconds: input.timeSeconds, endSeconds: null,
          durationSeconds: 0, endReason: null, rightCensored: false,
          baseline: !previous,
          weightSeconds: edge.weightSeconds,
          activeEncounter: edge.activeEncounter,
          lastSupportSeconds: edge.lastSupportSeconds,
          minDistance: edge.minDistance,
          minNormalizedDistance: edge.minNormalizedDistance
        };
        this.openEdgeLifetimes.set(edge.key, lifetime);
        this.edgeLifetimes.push(lifetime);
        events.push({ type: 'EDGE_FORM', timeSeconds: input.timeSeconds,
          onsetSeconds: input.timeSeconds, baseline: !previous, ...edgeFields(edge, this.windowSeconds) });
      }
      lifetime.durationSeconds = input.timeSeconds - lifetime.startSeconds;
      lifetime.weightSeconds = edge.weightSeconds;
      lifetime.activeEncounter = edge.activeEncounter;
      lifetime.lastSupportSeconds = edge.lastSupportSeconds;
      lifetime.minDistance = edge.minDistance;
      lifetime.minNormalizedDistance = edge.minNormalizedDistance;
    }

  }

  closeEdgeLifetime(key, lifetime, timeSeconds, endReason, rightCensored, events, edge = lifetime) {
    lifetime.endSeconds = timeSeconds;
    lifetime.durationSeconds = timeSeconds - lifetime.startSeconds;
    lifetime.endReason = endReason;
    lifetime.rightCensored = rightCensored;
    events.push({
      type: 'EDGE_END', timeSeconds, endReason, rightCensored,
      ...edgeFields(edge, this.windowSeconds),
      lifetimeId: lifetime.lifetimeId,
      startSeconds: lifetime.startSeconds,
      durationSeconds: lifetime.durationSeconds
    });
    this.openEdgeLifetimes.delete(key);
  }

  updateBridgeStates(current, supportGap, events) {
    const edgeByKey = new Map(current.edges.map(edge => [edge.key, edge]));
    const qualifiers = new Map();
    for (const bridge of current.bridges) {
      const edge = edgeByKey.get(bridge.key);
      if (edge?.activeEncounter) qualifiers.set(bridge.key, { ...bridge, edge });
    }
    this.advanceRoleStates({
      kind: 'bridge', previous: this.bridgeStates, qualifiers, supportGap,
      current, events
    });
  }

  updateArticulationStates(current, supportGap, events) {
    const qualifiers = new Map();
    for (const antId of current.articulationNodes) {
      const cutBranchByNode = componentByNodeWithout(current.nodes, current.edges, antId);
      const supportedBranches = new Set();
      const edges = [];
      for (const edge of current.edges) {
        if (!edge.activeEncounter) continue;
        const other = edge.antA === antId ? edge.antB : edge.antB === antId ? edge.antA : null;
        if (other === null) continue;
        const branchId = cutBranchByNode.get(other);
        if (branchId === undefined) continue;
        supportedBranches.add(branchId);
        edges.push(edge);
      }
      if (supportedBranches.size >= 2) {
        edges.sort((a, b) => compareIds(a.key, b.key));
        qualifiers.set(antId, { antId, edges });
      }
    }
    this.advanceRoleStates({
      kind: 'articulation', previous: this.articulationStates, qualifiers, supportGap,
      current, events
    });
  }

  advanceRoleStates({ kind, previous, qualifiers, supportGap, current, events }) {
    const singular = kind === 'bridge';
    const breakType = singular ? 'BRIDGE_BREAK' : 'ARTICULATION_BREAK';
    const formType = singular ? 'BRIDGE_FORM' : 'ARTICULATION_FORM';
    const persistType = singular ? 'BRIDGE_PERSIST' : 'ARTICULATION_PERSIST';
    const next = new Map();

    for (const [key, state] of [...previous].sort(byKey)) {
      if (qualifiers.has(key) && !supportGap) continue;
      if (state.confirmed) {
        events.push({
          type: breakType, timeSeconds: current.timeSeconds,
          onsetSeconds: state.onsetSeconds, confirmedSeconds: state.confirmedSeconds,
          persistentSeconds: state.persistentSeconds ?? null,
          durationSeconds: current.timeSeconds - state.onsetSeconds,
          reason: supportGap ? 'observation-gap' : roleLossReason(kind, key, current),
          ...(singular ? bridgePayload(key, state.value) : { antId: key })
        });
      } else {
        this.candidateResets[kind] += 1;
      }
    }

    for (const [key, value] of [...qualifiers].sort(byKey)) {
      let state = supportGap ? null : previous.get(key);
      if (!state) state = {
        onsetSeconds: current.timeSeconds, confirmedSeconds: null,
        confirmed: false, persistent: false, value
      };
      state.value = value;
      const durationSeconds = current.timeSeconds - state.onsetSeconds;
      if (!state.confirmed && durationSeconds + EPSILON >= this.formationSeconds) {
        state.confirmed = true;
        state.confirmedSeconds = current.timeSeconds;
        events.push({
          type: formType, timeSeconds: current.timeSeconds,
          onsetSeconds: state.onsetSeconds, confirmedSeconds: current.timeSeconds,
          durationSeconds,
          ...(singular ? bridgePayload(key, value) : { antId: key })
        });
      }
      if (state.confirmed && !state.persistent
        && durationSeconds + EPSILON >= this.persistenceSeconds) {
        state.persistent = true;
        state.persistentSeconds = current.timeSeconds;
        events.push({
          type: persistType, timeSeconds: current.timeSeconds,
          onsetSeconds: state.onsetSeconds,
          confirmedSeconds: state.confirmedSeconds,
          persistentSeconds: state.persistentSeconds,
          durationSeconds,
          ...(singular ? bridgePayload(key, value) : { antId: key })
        });
      }
      next.set(key, state);
    }

    if (singular) this.bridgeStates = next;
    else this.articulationStates = next;
  }

  updateConnectorStates(current, candidates, supportGap, events) {
    const currentArticulations = new Set(current.articulationNodes);
    const next = new Map();
    const candidatesById = new Map(candidates.map(candidate => [candidate.candidateId, candidate]));

    for (const [id, state] of [...this.connectorStates].sort(byKey)) {
      const qualifies = !supportGap
        && currentArticulations.has(state.antId)
        && supportsAcrossCutBranches(state.antId, state.supportByComponent, current);
      if (!qualifies) {
        if (state.persistent) events.push({
          type: 'CONNECTOR_END', timeSeconds: current.timeSeconds,
          onsetSeconds: state.onsetSeconds, confirmedSeconds: state.confirmedSeconds,
          durationSeconds: current.timeSeconds - state.onsetSeconds,
          reason: supportGap ? 'observation-gap' : connectorLossReason(state, current, currentArticulations),
          ...connectorPayload(state)
        });
        else this.candidateResets.connector += 1;
        continue;
      }
      state.durationSeconds = current.timeSeconds - state.onsetSeconds;
      if (!state.persistent && state.durationSeconds + EPSILON >= this.persistenceSeconds) {
        state.persistent = true;
        state.confirmedSeconds = current.timeSeconds;
        events.push({
          type: 'CONNECTOR_PERSIST', timeSeconds: current.timeSeconds,
          onsetSeconds: state.onsetSeconds, confirmedSeconds: current.timeSeconds,
          durationSeconds: state.durationSeconds,
          ...connectorPayload(state)
        });
      }
      next.set(id, state);
      candidatesById.delete(id);
    }

    for (const [id, candidate] of [...candidatesById].sort(byKey)) {
      const state = {
        ...candidate, onsetSeconds: current.timeSeconds,
        confirmedSeconds: null, durationSeconds: 0, persistent: false
      };
      if (this.persistenceSeconds <= EPSILON) {
        state.persistent = true;
        state.confirmedSeconds = current.timeSeconds;
        events.push({
          type: 'CONNECTOR_PERSIST', timeSeconds: current.timeSeconds,
          onsetSeconds: current.timeSeconds, confirmedSeconds: current.timeSeconds,
          durationSeconds: 0, ...connectorPayload(state)
        });
      }
      next.set(id, state);
    }
    this.connectorStates = next;
  }

  endRoleStates(states, kind, timeSeconds, reason, events) {
    const singular = kind === 'bridge';
    const type = singular ? 'BRIDGE_BREAK' : 'ARTICULATION_BREAK';
    for (const [key, state] of [...states].sort(byKey)) {
      if (!state.confirmed) {
        this.candidateResets[kind] += 1;
        continue;
      }
      events.push({
        type, timeSeconds, onsetSeconds: state.onsetSeconds,
        confirmedSeconds: state.confirmedSeconds,
        persistentSeconds: state.persistentSeconds ?? null,
        durationSeconds: timeSeconds - state.onsetSeconds,
        reason, rightCensored: true,
        ...(singular ? bridgePayload(key, state.value) : { antId: key })
      });
    }
  }

  endConnectorStates(timeSeconds, reason, events) {
    for (const state of this.connectorStates.values()) {
      if (!state.persistent) {
        this.candidateResets.connector += 1;
        continue;
      }
      events.push({
        type: 'CONNECTOR_END', timeSeconds,
        onsetSeconds: state.onsetSeconds, confirmedSeconds: state.confirmedSeconds,
        durationSeconds: timeSeconds - state.onsetSeconds,
        reason, rightCensored: true, ...connectorPayload(state)
      });
    }
  }

  metrics(current) {
    const nodeCount = current.nodes.length;
    const edgeCount = current.edges.length;
    const possibleEdges = nodeCount * (nodeCount - 1) / 2;
    const weightedDegrees = new Map(current.nodes.map(node => [node.id, 0]));
    for (const edge of current.edges) {
      weightedDegrees.set(edge.antA, weightedDegrees.get(edge.antA) + edge.weightSeconds);
      weightedDegrees.set(edge.antB, weightedDegrees.get(edge.antB) + edge.weightSeconds);
    }
    const largest = current.components.reduce((size, component) => Math.max(size, component.members.length), 0);
    const confirmedBridgeCount = [...this.bridgeStates.values()].filter(state => state.confirmed).length;
    const persistentBridgeCount = [...this.bridgeStates.values()].filter(state => state.persistent).length;
    const confirmedArticulationCount = [...this.articulationStates.values()].filter(state => state.confirmed).length;
    const persistentArticulationCount = [...this.articulationStates.values()].filter(state => state.persistent).length;
    return {
      nodeCount, edgeCount,
      edgeDensity: possibleEdges ? edgeCount / possibleEdges : 0,
      componentCount: current.components.length,
      largestComponentRatio: nodeCount ? largest / nodeCount : 0,
      weightedDegrees: [...weightedDegrees].sort(([a], [b]) => compareIds(a, b))
        .map(([id, weightSeconds]) => ({ id, weightSeconds })),
      bridgeFraction: edgeCount ? current.bridges.length / edgeCount : 0,
      articulationFraction: nodeCount ? current.articulationNodes.length / nodeCount : 0,
      confirmedBridgeCount, persistentBridgeCount,
      confirmedArticulationCount, persistentArticulationCount,
      pendingBridgeCount: this.bridgeStates.size - confirmedBridgeCount,
      pendingArticulationCount: this.articulationStates.size - confirmedArticulationCount,
      pendingConnectorCount: [...this.connectorStates.values()].filter(state => !state.persistent).length,
      persistentConnectorCount: [...this.connectorStates.values()].filter(state => state.persistent).length,
      bridgeCandidateResetCount: this.candidateResets.bridge,
      articulationCandidateResetCount: this.candidateResets.articulation,
      connectorCandidateResetCount: this.candidateResets.connector
    };
  }
}

function normalizeSnapshot(snapshot, expectedWindow) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('graphSnapshot must be an object');
  if (!Number.isFinite(snapshot.timeSeconds)) throw new RangeError('timeSeconds must be finite');
  if (snapshot.windowSeconds !== expectedWindow) {
    throw new RangeError('windowSeconds must match the configured topology window');
  }
  if (!Number.isFinite(snapshot.distanceMultiplier) || snapshot.distanceMultiplier <= 0) {
    throw new RangeError('distanceMultiplier must be finite and positive');
  }
  if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    throw new TypeError('graphSnapshot requires nodes and edges arrays');
  }

  const nodes = [];
  const nodeIds = new Set();
  for (const input of snapshot.nodes) {
    if (!input || typeof input.id !== 'string' || !input.id.trim()) {
      throw new TypeError('node id must be a nonempty string');
    }
    if (nodeIds.has(input.id)) throw new TypeError('duplicate node ID: ' + input.id);
    if (![input.x, input.y, input.radius, input.bornSeconds].every(Number.isFinite)
      || input.radius <= 0 || input.bornSeconds > snapshot.timeSeconds + EPSILON) {
      throw new RangeError('node coordinates, radius, and bornSeconds must be finite and valid');
    }
    nodeIds.add(input.id);
    nodes.push({ id: input.id, x: input.x, y: input.y,
      radius: input.radius, bornSeconds: input.bornSeconds });
  }
  nodes.sort((a, b) => compareIds(a.id, b.id));

  const edges = [];
  const edgeKeys = new Set();
  for (const input of snapshot.edges) {
    if (!input || typeof input.antA !== 'string' || typeof input.antB !== 'string'
      || input.antA >= input.antB || input.key !== pairKey(input.antA, input.antB)) {
      throw new TypeError('edge endpoints and key must use the canonical pair order');
    }
    if (!nodeIds.has(input.antA) || !nodeIds.has(input.antB)) {
      throw new RangeError('edge endpoint is absent from graph nodes');
    }
    if (edgeKeys.has(input.key)) throw new TypeError('duplicate edge key: ' + input.key);
    if (![input.weightSeconds, input.lastSupportSeconds, input.minDistance,
      input.minNormalizedDistance].every(Number.isFinite)
      || input.weightSeconds <= 0 || input.weightSeconds > expectedWindow + EPSILON
      || input.minDistance < 0 || input.minNormalizedDistance < 0
      || typeof input.activeEncounter !== 'boolean') {
      throw new RangeError('edge support fields must be finite, positive, and within the window');
    }
    if (input.lastSupportSeconds > snapshot.timeSeconds + EPSILON) {
      throw new RangeError('lastSupportSeconds cannot be in the future');
    }
    edgeKeys.add(input.key);
    edges.push({
      key: input.key, antA: input.antA, antB: input.antB,
      weightSeconds: input.weightSeconds, activeEncounter: input.activeEncounter,
      lastSupportSeconds: input.lastSupportSeconds, minDistance: input.minDistance,
      minNormalizedDistance: input.minNormalizedDistance
    });
  }
  edges.sort((a, b) => compareIds(a.key, b.key));
  return {
    timeSeconds: snapshot.timeSeconds, windowSeconds: snapshot.windowSeconds,
    distanceMultiplier: snapshot.distanceMultiplier, nodes, edges
  };
}

function findTopology(nodes, edges) {
  const adjacency = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    adjacency.get(edge.antA).push({ id: edge.antB, key: edge.key });
    adjacency.get(edge.antB).push({ id: edge.antA, key: edge.key });
  }
  for (const neighbors of adjacency.values()) neighbors.sort((a, b) => compareIds(a.id, b.id));

  const components = [];
  const visited = new Set();
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const members = [];
    const stack = [node.id];
    visited.add(node.id);
    while (stack.length) {
      const id = stack.pop();
      members.push(id);
      for (const neighbor of adjacency.get(id)) {
        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          stack.push(neighbor.id);
        }
      }
    }
    members.sort(compareIds);
    components.push({ id: members[0], members });
  }
  components.sort((a, b) => compareIds(a.id, b.id));

  let sequence = 0;
  const discovered = new Map();
  const low = new Map();
  const parent = new Map();
  const articulation = new Set();
  const bridgeKeys = new Set();
  function visit(id) {
    discovered.set(id, ++sequence);
    low.set(id, sequence);
    let children = 0;
    for (const neighbor of adjacency.get(id)) {
      if (!discovered.has(neighbor.id)) {
        parent.set(neighbor.id, id);
        children += 1;
        visit(neighbor.id);
        low.set(id, Math.min(low.get(id), low.get(neighbor.id)));
        if (!parent.has(id) && children > 1) articulation.add(id);
        if (parent.has(id) && low.get(neighbor.id) >= discovered.get(id)) articulation.add(id);
        if (low.get(neighbor.id) > discovered.get(id)) bridgeKeys.add(neighbor.key);
      } else if (neighbor.id !== parent.get(id)) {
        low.set(id, Math.min(low.get(id), discovered.get(neighbor.id)));
      }
    }
  }
  for (const node of nodes) if (!discovered.has(node.id)) visit(node.id);

  const edgeByKey = new Map(edges.map(edge => [edge.key, edge]));
  const bridges = [...bridgeKeys].sort(compareIds).map(key => {
    const { antA, antB } = edgeByKey.get(key);
    return { key, antA, antB };
  });
  return { components, bridges, articulationNodes: [...articulation].sort(compareIds) };
}

function compareComponents(previous, current, previousNodes, currentNodes) {
  const oldByNode = componentByNode(previous);
  const newByNode = componentByNode(current);
  const oldNodes = new Set(previousNodes.map(node => node.id));
  const newNodes = new Set(currentNodes.map(node => node.id));
  const links = new Map();
  for (const id of [...oldNodes].filter(id => newNodes.has(id)).sort(compareIds)) {
    const from = oldByNode.get(id).id;
    const to = newByNode.get(id).id;
    if (!links.has('o:' + from)) links.set('o:' + from, new Set());
    if (!links.has('n:' + to)) links.set('n:' + to, new Set());
    links.get('o:' + from).add('n:' + to);
    links.get('n:' + to).add('o:' + from);
  }

  const oldMap = new Map(previous.map(component => [component.id, component]));
  const newMap = new Map(current.map(component => [component.id, component]));
  const transitions = [];
  const visited = new Set();
  for (const start of [...links.keys()].sort(compareIds)) {
    if (visited.has(start)) continue;
    const tokens = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const token = stack.pop();
      tokens.push(token);
      for (const next of links.get(token) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    const from = tokens.filter(token => token.startsWith('o:'))
      .map(token => oldMap.get(token.slice(2))).sort((a, b) => compareIds(a.id, b.id));
    const to = tokens.filter(token => token.startsWith('n:'))
      .map(token => newMap.get(token.slice(2))).sort((a, b) => compareIds(a.id, b.id));
    if (from.length > 1 && to.length === 1) transitions.push({ kind: 'merge', from, to });
    else if (from.length === 1 && to.length > 1) transitions.push({ kind: 'split', from, to });
    else if (from.length > 1 && to.length > 1) {
      transitions.push({ kind: 'split', from, to });
      transitions.push({ kind: 'merge', from, to });
    }
  }

  const createdIds = [...newNodes].filter(id => !oldNodes.has(id)).sort(compareIds);
  const retiredIds = [...oldNodes].filter(id => !newNodes.has(id)).sort(compareIds);
  for (const transition of transitions) {
    transition.event = {
      type: transition.kind === 'split' ? 'COMPONENT_SPLIT' : 'COMPONENT_MERGE',
      from: transition.from.map(component => [...component.members]),
      to: transition.to.map(component => [...component.members]),
      createdIds: createdIds.filter(id => transition.to.some(component => component.members.includes(id))),
      retiredIds: retiredIds.filter(id => transition.from.some(component => component.members.includes(id))),
      mergedSize: transition.to.reduce((sum, component) => sum + component.members.length, 0),
      mergedSizeDelta: transition.to.reduce((sum, component) => sum + component.members.length, 0)
        - transition.from.reduce((sum, component) => sum + component.members.length, 0)
    };
  }
  return transitions.sort((a, b) => compareIds(a.event.type, b.event.type)
    || compareIds(a.from.map(component => component.id).join(','), b.from.map(component => component.id).join(',')));
}

function findConnectorCandidates(transitions, previous, current, formedKeys) {
  const oldComponentByNode = componentByNode(previous.components);
  const currentArticulations = new Set(current.articulationNodes);
  const edgeByKey = new Map(current.edges.map(edge => [edge.key, edge]));
  const candidates = new Map();
  for (const transition of transitions) {
    if (transition.kind !== 'merge' || transition.from.length < 2 || transition.to.length !== 1) continue;
    const priorIds = new Set(transition.from.map(component => component.id));
    const memberIds = new Set(transition.to[0].members);
    for (const antId of [...currentArticulations].filter(id => memberIds.has(id)).sort(compareIds)) {
      const ownPriorId = oldComponentByNode.get(antId)?.id;
      const cutBranchByNode = componentByNodeWithout(current.nodes, current.edges, antId);
      const supportByComponent = new Map();
      const newIncidentEdges = [];
      const supportedBranches = new Set();
      for (const key of formedKeys) {
        const edge = edgeByKey.get(key);
        if (!edge?.activeEncounter || (edge.antA !== antId && edge.antB !== antId)) continue;
        const other = edge.antA === antId ? edge.antB : edge.antA;
        const prior = oldComponentByNode.get(other)?.id;
        if (!prior || !priorIds.has(prior) || prior === ownPriorId) continue;
        const branchId = cutBranchByNode.get(other);
        if (branchId === undefined) continue;
        if (!supportByComponent.has(prior)) supportByComponent.set(prior, []);
        supportByComponent.get(prior).push(key);
        supportedBranches.add(branchId);
        newIncidentEdges.push(key);
      }
      if (supportByComponent.size < 2 || supportedBranches.size < 2) continue;
      for (const keys of supportByComponent.values()) keys.sort(compareIds);
      const componentIds = [...supportByComponent.keys()].sort(compareIds);
      const candidateId = JSON.stringify([antId, transition.to[0].id, componentIds]);
      candidates.set(candidateId, {
        candidateId, antId,
        componentId: transition.to[0].id,
        originalMemberships: transition.from.map(component => [...component.members]),
        externalComponents: componentIds,
        mergedSize: transition.to[0].members.length,
        mergedSizeDelta: transition.to[0].members.length
          - transition.from.reduce((sum, component) => sum + component.members.length, 0),
        newIncidentEdges: [...new Set(newIncidentEdges)].sort(compareIds),
        supportByComponent: componentIds.map(componentId => ({
          componentId, edgeKeys: supportByComponent.get(componentId)
        }))
      });
    }
  }
  return [...candidates.values()].sort((a, b) => compareIds(a.candidateId, b.candidateId));
}

function supportsAcrossCutBranches(antId, groups, current) {
  const cutBranchByNode = componentByNodeWithout(current.nodes, current.edges, antId);
  const edgesByKey = new Map(current.edges.map(edge => [edge.key, edge]));
  const supportedBranches = new Set();
  for (const group of groups) {
    let groupSupported = false;
    for (const key of group.edgeKeys) {
      const edge = edgesByKey.get(key);
      if (!edge?.activeEncounter) continue;
      const other = edge.antA === antId ? edge.antB : edge.antB === antId ? edge.antA : null;
      if (other === null) continue;
      const branchId = cutBranchByNode.get(other);
      if (branchId === undefined) continue;
      groupSupported = true;
      supportedBranches.add(branchId);
    }
    if (!groupSupported) return false;
  }
  return supportedBranches.size >= 2;
}

function componentByNodeWithout(nodes, edges, removedId) {
  const adjacency = new Map(nodes.filter(node => node.id !== removedId)
    .map(node => [node.id, []]));
  for (const edge of edges) {
    if (edge.antA === removedId || edge.antB === removedId) continue;
    adjacency.get(edge.antA)?.push(edge.antB);
    adjacency.get(edge.antB)?.push(edge.antA);
  }
  for (const neighbors of adjacency.values()) neighbors.sort(compareIds);

  const componentById = new Map();
  for (const node of nodes) {
    if (node.id === removedId || componentById.has(node.id)) continue;
    const stack = [node.id];
    componentById.set(node.id, node.id);
    while (stack.length) {
      const id = stack.pop();
      for (const neighbor of adjacency.get(id)) {
        if (componentById.has(neighbor)) continue;
        componentById.set(neighbor, node.id);
        stack.push(neighbor);
      }
    }
  }
  return componentById;
}

function roleLossReason(kind, key, current) {
  const nodeIds = new Set(current.nodes.map(node => node.id));
  if (kind === 'bridge') {
    const edge = current.edges.find(item => item.key === key);
    if (!nodeIds.has(JSON.parse(key)[0]) || !nodeIds.has(JSON.parse(key)[1])) return 'node-exit';
    if (!edge) return 'edge-lost';
    if (!current.bridges.some(item => item.key === key)) return 'structure-lost';
    return 'support-lost';
  }
  if (!nodeIds.has(key)) return 'node-exit';
  if (!current.articulationNodes.includes(key)) return 'structure-lost';
  return 'support-lost';
}

function connectorLossReason(state, current, currentArticulations) {
  if (!current.nodes.some(node => node.id === state.antId)) return 'node-exit';
  if (!currentArticulations.has(state.antId)) return 'structure-lost';
  if (!supportsAcrossCutBranches(state.antId, state.supportByComponent, current)) return 'support-lost';
  return 'structure-lost';
}

function componentByNode(components) {
  const result = new Map();
  for (const component of components) for (const id of component.members) result.set(id, component);
  return result;
}

function bridgePayload(key, value) {
  const endpoints = value?.edge || value;
  return { key, antA: endpoints.antA, antB: endpoints.antB };
}

function connectorPayload(state) {
  return {
    antId: state.antId, componentId: state.componentId,
    originalMemberships: state.originalMemberships.map(members => [...members]),
    externalComponents: [...state.externalComponents],
    mergedSize: state.mergedSize, mergedSizeDelta: state.mergedSizeDelta,
    newIncidentEdges: [...state.newIncidentEdges]
  };
}

function edgeFields(edge, windowSeconds) {
  return {
    key: edge.key, antA: edge.antA, antB: edge.antB,
    windowSeconds, weightSeconds: edge.weightSeconds,
    activeEncounter: edge.activeEncounter,
    lastSupportSeconds: edge.lastSupportSeconds,
    minDistance: edge.minDistance,
    minNormalizedDistance: edge.minNormalizedDistance
  };
}

function sortEvents(events) {
  return events.sort((a, b) => {
    const rank = EVENT_ORDER.indexOf(a.type) - EVENT_ORDER.indexOf(b.type);
    if (rank) return rank;
    return compareIds(a.key || a.antId || JSON.stringify(a.from || []),
      b.key || b.antId || JSON.stringify(b.from || []));
  });
}

function byKey([a], [b]) { return compareIds(a, b); }
function pairKey(a, b) { return JSON.stringify([a, b]); }
function compareIds(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}
