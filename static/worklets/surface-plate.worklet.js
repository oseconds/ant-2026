const GRID = 32;
const SOURCE_GRID = 96;
const RATE = 6000;
// Shorten vibration, preserving the relative loss of each frozen material.
const PLATE_DAMPING_MULTIPLIER = 50;
const MAX_LAYERS = 256;
const MAX_NODULES = 32;
const MIX = 1 / Math.sqrt(12);
const NO_NODE = 0xffffffff;
const SLEEP_ENERGY = 1e-10;
const SLEEP_STEPS = RATE * 2;
const WAKE_ENERGY = 1e-10;
const EPS = 1e-20;
const CONTACT_PULSE_STEPS = Math.round(RATE * 0.003);
const CONTACT_RECOVERY_STEPS = RATE * 0.075;
const CONTACT_REFERENCE_DELTA_V = 0.020;
const CONTACT_MAX_COMPLIANCE_LOSS = 0.25;
const CONTACT_ENVELOPE = new Float64Array(CONTACT_PULSE_STEPS);
const SLEEP_DIAGNOSTIC_WAKE_REASONS = Object.freeze([
  'directFootContact', 'intraPlatePropagation', 'zAdjacentCoupling',
  'sphereFoundationCoupling', 'topologyReinstall'
]);
const SLEEP_DIAGNOSTIC_BLOCKERS = Object.freeze([
  'quietEnergy', 'localLinkForce', 'localPlateForce', 'localSphereForce'
]);
const WAKE_REASON = Object.freeze({
  DIRECT_FOOT_CONTACT: 1, INTRA_PLATE: 2, Z_ADJACENT: 3,
  SPHERE_FOUNDATION: 4, TOPOLOGY_REINSTALL: 5
});
let contactEnvelopeSum = 0;
for (let step = 0; step < CONTACT_PULSE_STEPS; step++) {
  CONTACT_ENVELOPE[step] = Math.sin(Math.PI * (step + 0.5) / CONTACT_PULSE_STEPS);
  contactEnvelopeSum += CONTACT_ENVELOPE[step];
}
for (let step = 0; step < CONTACT_PULSE_STEPS; step++) CONTACT_ENVELOPE[step] /= contactEnvelopeSum;

/** Sparse, fixed-rate masked plate solver. Topology is compiled off-thread;
 * process() uses only packed typed arrays and preallocated scratch state. */
class SurfacePlateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.destroyed = false;
    this.topology = null;
    this.current = new Float32Array(0);
    this.previous = new Float32Array(0);
    this.next = new Float32Array(0);
    this.lap = new Float32Array(0);
    this.lapStamp = new Uint32Array(0);
    this.nodeLayer = new Uint16Array(0);
    this.energyQuiet = new Uint16Array(0);
    this.awake = new Uint8Array(0);
    this.pendingWake = new Uint8Array(0);
    this.pendingWakeReason = new Uint8Array(0);
    this.pendingNodes = new Int32Array(0);
    this.pendingCount = 0;
    this.active = new Int32Array(0);
    this.activeCount = 0;
    this.epoch = 1;
    this.phase = 0;
    this.samplesSinceStep = 0;
    this.lastL = 0; this.lastR = 0;
    this.queueL = new Float32Array(64); this.queueR = new Float32Array(64);
    this.queueHead = 0; this.queueLength = 0;
    this.outputL = 0; this.outputR = 0;
    this.contactForces = new Float32Array(0);
    this.contactMemory = new Float32Array(0);
    this.lastContactStep = new Float64Array(0);
    this.contactCursor = 0;
    this.telemetry = { topologies: 0, strikes: 0, dropped: 0, droppedRoutes: 0, nonFinite: 0,
      clipped: 0, wakes: 0, sleeps: 0, truncatedTailEnergy: 0,
      physicsSteps: 0, energyDelta: 0, couplingWorkProxy: 0,
      deepPlateCouplingTransfers: 0, sphereCouplingTransfers: 0, maxOutputAbs: 0,
      requestedContactImpulseSquared: 0, compliantContactImpulseSquared: 0,
      contactPulseNodeSteps: 0, contactAttenuatedNodeContributions: 0 };
    // Opt-in diagnostic state. With sleep diagnostics disabled, the production
    // recurrence and its wake/sleep decisions follow the original path.
    this.sleepDiagnosticsEnabled = false;
    this.sleepDiagnosticLayers = new Map();
    this.sleepDiagnosticLayerByIndex = [];
    this.sleepDiagnosticTrackedNodes = new Uint8Array(0);
    this.sleepDiagnosticCouplingNodes = new Uint8Array(0);
    this.sleepDiagnosticMaxQuiet = new Uint16Array(0);
    this.sleepDiagnosticLocalLinkForce = new Float64Array(0);
    this.sleepDiagnosticLocalPlateForce = new Float64Array(0);
    this.sleepDiagnosticLocalSphereForce = new Float64Array(0);
    this.sleepDiagnosticSphereForceStamp = new Uint32Array(0);
    this.sleepDiagnosticSnapshotStep = null;
    this.sleepDiagnosticFutureEvents = [];
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (!message || typeof message.type !== 'string') return;
    const p = message.payload || {};
    if (message.type === 'topology') {
      if (this.sleepDiagnosticSnapshotStep !== null)
        this.sleepDiagnosticFutureEvents.push({ physicsStep: this.telemetry.physicsSteps,
          type: 'topology', payload: p });
      if (!validTopology(p)) { this.telemetry.dropped++; return; }
      this.installTopology(p);
      return;
    }
    if (message.type === 'strike') {
      if (this.sleepDiagnosticSnapshotStep !== null)
        this.sleepDiagnosticFutureEvents.push({ physicsStep: this.telemetry.physicsSteps,
          type: 'strike', payload: { ...p } });
      if (!this.topology || !applyStrike(this, p)) { this.telemetry.dropped++; this.telemetry.droppedRoutes++; }
      else this.telemetry.strikes++;
    } else if (message.type === 'sleep-diagnostics') {
      this.setSleepDiagnostics(Boolean(p.enabled));
    } else if (message.type === 'sleep-diagnostic-snapshot') {
      this.sleepDiagnosticSnapshotStep = this.telemetry.physicsSteps;
      this.sleepDiagnosticFutureEvents = [];
      this.port.postMessage({ type: 'sleep-diagnostic-snapshot', payload: this.getSleepDiagnosticProcessorState() });
    } else if (message.type === 'sleep-diagnostic-result') {
      this.port.postMessage({ type: 'sleep-diagnostic-result', payload: {
        physicsSteps: this.telemetry.physicsSteps,
        snapshotStep: this.sleepDiagnosticSnapshotStep,
        futureEvents: this.sleepDiagnosticFutureEvents,
        diagnostics: this.getDiagnostics()
      } });
    } else if (message.type === 'stop') {
      this.clearVibration();
      this.phase = 0; this.samplesSinceStep = 0; this.lastL = 0; this.lastR = 0;
      this.queueHead = 0; this.queueLength = 0;
    } else if (message.type === 'diagnostics') {
      this.port.postMessage({ type: 'diagnostics', payload: this.getDiagnostics() });
    } else if (message.type === 'destroy') {
      this.destroyed = true; this.clearVibration(); this.topology = null;
      this.queueHead = 0; this.queueLength = 0;
    }
  }

  installTopology(t) {
    const old = this.topology, oldCurrent = this.current, oldPrevious = this.previous;
    const oldQuiet = this.energyQuiet, oldAwake = this.awake;
    const oldDiagnosticMaxQuiet = this.sleepDiagnosticMaxQuiet;
    const oldContactForces = this.contactForces, oldContactMemory = this.contactMemory;
    const oldLastContactStep = this.lastContactStep, oldNodeCount = this.current.length;
    const oldSphereCurrent = this.sphereCurrent, oldSpherePrevious = this.spherePrevious;
    const oldOffsets = old?.nodeOffsets, oldIndices = old?.nodeGridIndices;
    const n = t.nodeGridIndices.length;
    this.topology = t;
    this.current = new Float32Array(n); this.previous = new Float32Array(n); this.next = new Float32Array(n);
    this.lap = new Float32Array(n); this.lapStamp = new Uint32Array(n);
    this.nodeLayer = new Uint16Array(n); this.energyQuiet = new Uint16Array(n);
    this.awake = new Uint8Array(n); this.active = new Int32Array(n); this.activeCount = 0;
    this.pendingWake = new Uint8Array(n); this.pendingWakeReason = new Uint8Array(n);
    this.pendingNodes = new Int32Array(n); this.pendingCount = 0;
    if (this.sleepDiagnosticsEnabled) {
      this.sleepDiagnosticMaxQuiet = new Uint16Array(n);
      this.sleepDiagnosticLocalLinkForce = new Float64Array(n);
      this.sleepDiagnosticLocalPlateForce = new Float64Array(n);
      this.sleepDiagnosticLocalSphereForce = new Float64Array(n);
      this.sleepDiagnosticSphereForceStamp = new Uint32Array(n);
      this.ensureSleepDiagnosticLayers(t);
    }
    // Add overlapping finite forces in a node/step ring, with no event pool or
    // event dropping. Only topology installation allocates this scratch state.
    this.contactForces = new Float32Array(n * CONTACT_PULSE_STEPS);
    this.contactMemory = new Float32Array(n);
    this.lastContactStep = new Float64Array(n);
    this.buildNodeLinks(t);
    if (this.sleepDiagnosticsEnabled) this.buildSleepDiagnosticCouplingMask();
    for (let l = 0; l < t.layerIds.length; l++) {
      const start = t.nodeOffsets[l], end = t.nodeOffsets[l + 1];
      for (let i = start; i < end; i++) this.nodeLayer[i] = l;
      if (!old) continue;
      let prior = -1;
      for (let j = 0; j < old.layerIds.length; j++) if (old.layerIds[j] === t.layerIds[l]) { prior = j; break; }
      if (prior < 0 || oldOffsets[prior + 1] - oldOffsets[prior] !== end - start) continue;
      let same = true;
      for (let i = 0; i < end - start; i++) if (oldIndices[oldOffsets[prior] + i] !== t.nodeGridIndices[start + i]) { same = false; break; }
      if (!same) continue;
      const priorStart = oldOffsets[prior];
      for (let i = 0; i < end - start; i++) {
        const source = priorStart + i, target = start + i;
        this.current[target] = oldCurrent[source]; this.previous[target] = oldPrevious[source];
        this.energyQuiet[target] = oldQuiet[source];
        if (this.sleepDiagnosticsEnabled) this.sleepDiagnosticMaxQuiet[target] = oldDiagnosticMaxQuiet[source];
        if (this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[target]
          && this.energyQuiet[target] > this.sleepDiagnosticMaxQuiet[target])
          this.sleepDiagnosticMaxQuiet[target] = this.energyQuiet[target];
        this.contactMemory[target] = oldContactMemory[source];
        this.lastContactStep[target] = oldLastContactStep[source];
        for (let step = 0; step < CONTACT_PULSE_STEPS; step++) {
          this.contactForces[step * n + target] = oldContactForces[step * oldNodeCount + source];
        }
        if (oldAwake[source]) this.wakeNode(target, WAKE_REASON.TOPOLOGY_REINSTALL, 0,
          { alreadyAwake: true, suppressTransition: true });
      }
    }
    this.prepareNodules(t, old, oldSphereCurrent, oldSpherePrevious);
    this.telemetry.topologies++;
  }

  buildNodeLinks(t) {
    const n = t.nodeGridIndices.length, pairCount = t.adjacentLinkCoefficients.length;
    const counts = new Uint32Array(n);
    for (let p = 0; p < pairCount; p++) { counts[t.adjacentLinkNodes[p * 2]]++; counts[t.adjacentLinkNodes[p * 2 + 1]]++; }
    this.linkOffsets = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) this.linkOffsets[i + 1] = this.linkOffsets[i] + counts[i];
    this.linkNodes = new Uint32Array(this.linkOffsets[n]);
    this.linkCoefficients = new Float32Array(this.linkOffsets[n]);
    const cursor = this.linkOffsets.slice(0, n);
    for (let p = 0; p < pairCount; p++) {
      const a = t.adjacentLinkNodes[p * 2], b = t.adjacentLinkNodes[p * 2 + 1], k = t.adjacentLinkCoefficients[p];
      let i = cursor[a]++; this.linkNodes[i] = b; this.linkCoefficients[i] = k;
      i = cursor[b]++; this.linkNodes[i] = a; this.linkCoefficients[i] = k;
    }
  }

  prepareNodules(t, old, oldSphereCurrent, oldSpherePrevious) {
    const count = t.noduleIds?.length || 0;
    this.noduleIds = t.noduleIds || [];
    this.sphereCurrent = new Float32Array(count * 12);
    this.spherePrevious = new Float32Array(count * 12);
    this.sphereRadius = new Float32Array(count * 12);
    this.sphereCos = new Float32Array(count * 12);
    this.sphereDamping = new Float32Array(count * 12);
    this.spherePickupL = new Float32Array(count * 12);
    this.spherePickupR = new Float32Array(count * 12);
    this.sphereFoundation = t.noduleCouplingNodeIndices || new Uint32Array(0);
    this.sphereWeight = t.noduleCouplingWeights || new Float32Array(0);
    this.sphereMass = new Float32Array(count);
    this.sphereCouple = new Float32Array(count * 12);
    this.sphereFoundationShape = new Float32Array(count * 12);
    this.sphereLinkOffsets = new Uint32Array(this.current.length + 1);
    const linkCounts = new Uint16Array(this.current.length);
    for (let n = 0; n < count; n++) if (this.sphereFoundation[n] !== NO_NODE && this.sphereFoundation[n] < this.current.length) linkCounts[this.sphereFoundation[n]]++;
    for (let i = 0; i < this.current.length; i++) this.sphereLinkOffsets[i + 1] = this.sphereLinkOffsets[i] + linkCounts[i];
    this.sphereLinkModes = new Uint32Array(this.sphereLinkOffsets[this.current.length]);
    const sphereCursor = this.sphereLinkOffsets.slice(0, this.current.length);
    const rootsS = [4.4934, 2.0816, 2.0816, 2.0816, 3.3421, 3.3421, 3.3421, 3.3421, 3.3421];
    const rootsP = [2.0816, 2.0816, 2.0816];
    const degrees = [0, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1];
    const branch = [0,0,0,0,0,0,0,0,0,1,1,1];
    const alpha = [rootsS[0], ...rootsS.slice(1,4), ...rootsS.slice(4,9), ...rootsP];
    const rho = t.noduleMaterials || new Float32Array(0);
    const radii = t.nodulePhysicalRadiiMeters || new Float32Array(0);
    for (let n = 0; n < count; n++) {
      const density = rho[n * 3], young = rho[n * 3 + 1], nu = rho[n * 3 + 2];
      const radius = radii[n];
      this.sphereMass[n] = density * radius ** 3;
      const shear = Math.sqrt(young / (2 * (1 + nu) * density));
      const longitudinal = Math.sqrt(young * (1 - nu) / ((1 + nu) * (1 - 2 * nu) * density));
      for (let m = 0; m < 12; m++) {
        const frequency = (branch[m] ? longitudinal : shear) * alpha[m] / (2 * Math.PI * radius);
        if (!(frequency > 0 && frequency <= RATE * 0.4)) continue;
        const modalDamping = t.nodules?.[n]?.material?.damping ?? 0.35;
        const seconds = 5.2 / (1 + frequency / 7800) / (0.52 + 3.1 * modalDamping);
        const r = Math.exp(-1 / (Math.max(0.18, seconds) * RATE));
        this.sphereRadius[n * 12 + m] = r;
        this.sphereCos[n * 12 + m] = 2 * r * Math.cos(2 * Math.PI * frequency / RATE);
        this.sphereDamping[n * 12 + m] = r * r;
        const shape = modalShape(degrees[m], modeOrder(m), n, t);
        this.spherePickupL[n * 12 + m] = shape[0];
        this.spherePickupR[n * 12 + m] = shape[1];
        const foundation = this.sphereFoundation[n];
        const layer = t.noduleFoundationLayerIndices[n];
        const fxy = foundation !== NO_NODE && foundation < this.current.length ? [
          t.nodeGridIndices[foundation] % GRID / (GRID - 1),
          Math.floor(t.nodeGridIndices[foundation] / GRID) / (GRID - 1)
        ] : [0.5, 0.5];
        const nxy = [t.nodulePositionsXY[n * 2], t.nodulePositionsXY[n * 2 + 1]];
        const depth = t.nodules?.[n]?.burial?.buriedDepthMeters || 0.04;
        this.sphereFoundationShape[n * 12 + m] = realSH(degrees[m], modeOrder(m),
          nxy[0] - fxy[0], nxy[1] - fxy[1], depth);
      }
      if (this.sphereFoundation[n] !== NO_NODE && this.sphereFoundation[n] < this.current.length)
        this.sphereLinkModes[sphereCursor[this.sphereFoundation[n]]++] = n;
      if (old) {
        let oi = -1;
        for (let j = 0; j < (old.noduleIds?.length || 0); j++) if (old.noduleIds[j] === this.noduleIds[n]) { oi = j; break; }
        if (oi >= 0 && old.nodulePhysicalRadiiMeters[oi] === radius) {
          // Dynamic sphere state is copied only when the same frozen nodule remains.
          if (oldSphereCurrent && oldSpherePrevious) {
            this.sphereCurrent.set(oldSphereCurrent.subarray(oi * 12, oi * 12 + 12), n * 12);
            this.spherePrevious.set(oldSpherePrevious.subarray(oi * 12, oi * 12 + 12), n * 12);
          }
        }
      }
    }
  }

  wakeNode(node, reason = 0, magnitude = 0, options = null) {
    if (node < 0 || node >= this.awake.length) return;
    const alreadyAwake = options?.alreadyAwake ?? Boolean(this.awake[node]);
    if (this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[node] && reason > 0)
      this.recordSleepWakeAttempt(node, reason, magnitude, alreadyAwake, options);
    if (this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[node])
      this.recordSleepQuietMaximum(node, this.energyQuiet[node]);
    this.energyQuiet[node] = 0;
    if (this.awake[node]) return;
    if (this.inPhysicsStep) {
      if (!this.pendingWake[node]) {
        this.pendingWake[node] = 1;
        this.pendingWakeReason[node] = reason;
        this.pendingNodes[this.pendingCount++] = node;
      }
      return;
    }
    this.awake[node] = 1;
    this.active[this.activeCount++] = node; this.telemetry.wakes++;
    if (this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[node]
      && reason > 0 && !options?.suppressTransition)
      this.recordSleepAwakeTransition(node, reason);
  }

  wakeNeighborhood(node, reason = 0, magnitude = 0) {
    const neighbors = this.topology.neighborIndices;
    if (this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[node] && reason > 0) {
      const layerStats = this.sleepDiagnosticLayerByIndex[this.nodeLayer[node]];
      const stat = layerStats?.wakeReasons[SLEEP_DIAGNOSTIC_WAKE_REASONS[reason - 1]];
      if (stat) { stat.thresholdTriggers++; stat.maxTriggerMagnitude = Math.max(stat.maxTriggerMagnitude, Math.abs(magnitude)); }
    }
    for (let k = 0; k < 4; k++) {
      const other = neighbors[node * 4 + k];
      if (other >= 0) this.wakeNode(other, reason, magnitude);
    }
  }

  setSleepDiagnostics(enabled) {
    if (!enabled || this.sleepDiagnosticsEnabled) { this.sleepDiagnosticsEnabled = enabled; return; }
    this.sleepDiagnosticsEnabled = true;
    this.sleepDiagnosticLayers = new Map();
    this.sleepDiagnosticMaxQuiet = new Uint16Array(this.current.length);
    this.sleepDiagnosticLocalLinkForce = new Float64Array(this.current.length);
    this.sleepDiagnosticLocalPlateForce = new Float64Array(this.current.length);
    this.sleepDiagnosticLocalSphereForce = new Float64Array(this.current.length);
    this.sleepDiagnosticSphereForceStamp = new Uint32Array(this.current.length);
    for (let node = 0; node < this.energyQuiet.length; node++)
      this.sleepDiagnosticMaxQuiet[node] = this.energyQuiet[node];
    this.pendingWakeReason = new Uint8Array(this.current.length);
    if (this.topology) {
      this.ensureSleepDiagnosticLayers(this.topology);
      this.buildSleepDiagnosticCouplingMask();
    }
  }

  makeSleepDiagnosticLayer(layerId, nodeCount) {
    const makeCounts = names => Object.fromEntries(names.map(name => [name, {
      occurrences: 0, nonzeroQuietResets: 0, alreadyAwake: 0, asleepToAwake: 0,
      maxMagnitude: 0, thresholdTriggers: 0, maxTriggerMagnitude: 0,
      maxZComponentMagnitude: 0, maxSphereComponentMagnitude: 0, sphereAssistedTriggers: 0
    }]));
    return { layerId, nodeCount, detailedTrackingStartedAtPhysicsStep: this.telemetry.physicsSteps,
      sleepEvaluations: 0, sleeps: 0, zLinkBranchTriggers: 0,
      sphereAssistedZLinkBranchTriggers: 0, maxZLinkBranchMagnitude: 0,
      wakeReasons: makeCounts(SLEEP_DIAGNOSTIC_WAKE_REASONS),
      blockers: makeCounts(SLEEP_DIAGNOSTIC_BLOCKERS) };
  }

  ensureSleepDiagnosticLayers(topology) {
    this.sleepDiagnosticLayerByIndex = new Array(topology.layerIds.length);
    this.sleepDiagnosticTrackedNodes = new Uint8Array(topology.nodeGridIndices.length);
    const selected = new Set(topology.layerIds.length ? [0, Math.floor((topology.layerIds.length - 1) / 2),
      topology.layerIds.length - 1] : []);
    for (let layer = 0; layer < topology.layerIds.length; layer++) {
      if (!selected.has(layer)) continue;
      const id = topology.layerIds[layer], count = topology.nodeOffsets[layer + 1] - topology.nodeOffsets[layer];
      let stat = this.sleepDiagnosticLayers.get(id);
      if (!stat) { stat = this.makeSleepDiagnosticLayer(id, count); this.sleepDiagnosticLayers.set(id, stat); }
      else stat.nodeCount = count;
      this.sleepDiagnosticLayerByIndex[layer] = stat;
      this.sleepDiagnosticTrackedNodes.fill(1, topology.nodeOffsets[layer], topology.nodeOffsets[layer + 1]);
    }
  }

  buildSleepDiagnosticCouplingMask() {
    this.sleepDiagnosticCouplingNodes = new Uint8Array(this.current.length);
    if (!this.sleepDiagnosticsEnabled) return;
    for (let node = 0; node < this.current.length; node++) {
      for (let q = this.linkOffsets[node]; q < this.linkOffsets[node + 1]; q++) {
        const other = this.linkNodes[q];
        if (node < other && (this.sleepDiagnosticTrackedNodes[node] || this.sleepDiagnosticTrackedNodes[other])) {
          this.sleepDiagnosticCouplingNodes[node] = 1;
          this.sleepDiagnosticCouplingNodes[other] = 1;
        }
      }
    }
  }

  recordSleepQuietMaximum(node, value) {
    if (!this.sleepDiagnosticsEnabled || !this.sleepDiagnosticTrackedNodes[node] || !value) return;
    if (value > this.sleepDiagnosticMaxQuiet[node]) this.sleepDiagnosticMaxQuiet[node] = value;
  }

  recordSleepWakeAttempt(node, reason, magnitude, alreadyAwake, options = null) {
    const stat = this.sleepDiagnosticLayerByIndex[this.nodeLayer[node]]?.wakeReasons[SLEEP_DIAGNOSTIC_WAKE_REASONS[reason - 1]];
    if (!stat) return;
    stat.occurrences++;
    if (this.energyQuiet[node] > 0) stat.nonzeroQuietResets++;
    if (alreadyAwake) stat.alreadyAwake++;
    stat.maxMagnitude = Math.max(stat.maxMagnitude, Math.abs(magnitude || 0));
    if (reason === WAKE_REASON.SPHERE_FOUNDATION) {
      stat.thresholdTriggers++;
      stat.maxTriggerMagnitude = Math.max(stat.maxTriggerMagnitude, Math.abs(magnitude || 0));
    }
    if (options) {
      stat.maxZComponentMagnitude = Math.max(stat.maxZComponentMagnitude, Math.abs(options.zComponent || 0));
      stat.maxSphereComponentMagnitude = Math.max(stat.maxSphereComponentMagnitude, Math.abs(options.sphereComponent || 0));
      if (options.sphereAssisted) stat.sphereAssistedTriggers++;
    }
  }

  recordSleepAwakeTransition(node, reason) {
    const stat = this.sleepDiagnosticLayerByIndex[this.nodeLayer[node]]?.wakeReasons[SLEEP_DIAGNOSTIC_WAKE_REASONS[reason - 1]];
    if (stat) stat.asleepToAwake++;
  }

  recordSleepBlocker(layerStats, node, name, magnitude, quietBefore) {
    const stat = layerStats?.blockers[name];
    if (!stat) return;
    stat.occurrences++;
    if (quietBefore > 0) stat.nonzeroQuietResets++;
    if (this.awake[node]) stat.alreadyAwake++;
    stat.maxMagnitude = Math.max(stat.maxMagnitude, Math.abs(magnitude));
  }

  clearSleepDiagnosticCounters() {
    this.sleepDiagnosticLayers = new Map();
    if (this.topology) this.ensureSleepDiagnosticLayers(this.topology);
    this.sleepDiagnosticMaxQuiet.fill(0);
    for (let node = 0; node < this.energyQuiet.length; node++) if (this.sleepDiagnosticTrackedNodes[node])
      this.sleepDiagnosticMaxQuiet[node] = this.energyQuiet[node];
  }

  getSleepDiagnosticProcessorState() {
    const clone = value => value;
    const topology = this.topology;
    const state = {
      topology,
      dynamic: {
        current: clone(this.current), previous: clone(this.previous), next: clone(this.next),
        energyQuiet: clone(this.energyQuiet), awake: clone(this.awake),
        active: clone(this.active.subarray(0, this.activeCount)), activeCount: this.activeCount,
        pendingWake: clone(this.pendingWake), pendingWakeReason: clone(this.pendingWakeReason),
        pendingNodes: clone(this.pendingNodes.subarray(0, this.pendingCount)), pendingCount: this.pendingCount,
        contactForces: clone(this.contactForces), contactMemory: clone(this.contactMemory),
        lastContactStep: clone(this.lastContactStep), contactCursor: this.contactCursor,
        sphereCurrent: clone(this.sphereCurrent), spherePrevious: clone(this.spherePrevious),
        telemetry: { ...this.telemetry }, physicsSteps: this.telemetry.physicsSteps
      },
      diagnostics: this.getSleepDiagnosticsSummary()
    };
    return state;
  }

  getSleepDiagnosticsSummary() {
    if (!this.topology || !this.sleepDiagnosticsEnabled) return null;
    const layerIds = this.topology.layerIds;
    const all = this.makeSleepDiagnosticLayer('__all__', 0);
    for (const layerId of layerIds) {
      const part = this.sleepDiagnosticLayers.get(layerId);
      if (!part) continue;
      all.sleepEvaluations += part.sleepEvaluations;
      all.sleeps += part.sleeps;
      for (const name of SLEEP_DIAGNOSTIC_WAKE_REASONS) for (const key of Object.keys(all.wakeReasons[name]))
        all.wakeReasons[name][key] = key.startsWith('max')
          ? Math.max(all.wakeReasons[name][key], part.wakeReasons[name][key])
          : all.wakeReasons[name][key] + part.wakeReasons[name][key];
      for (const name of SLEEP_DIAGNOSTIC_BLOCKERS) for (const key of Object.keys(all.blockers[name]))
        all.blockers[name][key] = key.startsWith('max')
          ? Math.max(all.blockers[name][key], part.blockers[name][key])
          : all.blockers[name][key] + part.blockers[name][key];
    }
    const summarizeLayer = (index, role) => {
      const id = layerIds[index], start = this.topology.nodeOffsets[index], end = this.topology.nodeOffsets[index + 1];
      const stat = this.sleepDiagnosticLayers.get(id) || this.makeSleepDiagnosticLayer(id, end - start);
      let maxQuiet = 0, sumQuiet = 0, maxCurrentQuiet = 0, ever25 = 0, ever50 = 0, ever75 = 0, ever100 = 0;
      for (let node = start; node < end; node++) {
        const reached = this.sleepDiagnosticMaxQuiet[node];
        maxQuiet = Math.max(maxQuiet, reached); sumQuiet += reached;
        maxCurrentQuiet = Math.max(maxCurrentQuiet, this.energyQuiet[node]);
        if (reached >= SLEEP_STEPS * 0.25) ever25++;
        if (reached >= SLEEP_STEPS * 0.50) ever50++;
        if (reached >= SLEEP_STEPS * 0.75) ever75++;
        if (reached >= SLEEP_STEPS) ever100++;
      }
      const percent = count => stat.sleepEvaluations ? 100 * count / stat.sleepEvaluations : 0;
      return { role, layerId: id, nodeCount: end - start,
        detailedTrackingStartedAtPhysicsStep: stat.detailedTrackingStartedAtPhysicsStep,
        directStrikeResetCount: stat.wakeReasons.directFootContact.occurrences,
        intraPlateResetCount: stat.wakeReasons.intraPlatePropagation.occurrences,
        zResetCount: stat.wakeReasons.zAdjacentCoupling.occurrences,
        sphereResetCount: stat.wakeReasons.sphereFoundationCoupling.occurrences,
        topologyReinstallResetCount: stat.wakeReasons.topologyReinstall.occurrences,
        wakeReasons: stat.wakeReasons, blockers: stat.blockers,
        zLinkBranchTriggers: stat.zLinkBranchTriggers,
        sphereAssistedZLinkBranchTriggers: stat.sphereAssistedZLinkBranchTriggers,
        maxZLinkBranchMagnitude: stat.maxZLinkBranchMagnitude,
        blockerPercentOfActiveNodeSteps: {
          quietEnergy: percent(stat.blockers.quietEnergy.occurrences),
          plateForce: percent(stat.blockers.localPlateForce.occurrences),
          zForce: percent(stat.blockers.localLinkForce.occurrences),
          sphereForce: percent(stat.blockers.localSphereForce.occurrences)
        },
        activeNodeSteps: stat.sleepEvaluations, sleeps: stat.sleeps,
        maxEnergyQuietReached: maxQuiet,
        meanPerNodeMaxEnergyQuietReached: end > start ? sumQuiet / (end - start) : 0,
        maxCurrentEnergyQuiet: maxCurrentQuiet,
        fractionNodesEverReachingSleepSteps: {
          pct25: ever25 / (end - start || 1), pct50: ever50 / (end - start || 1),
          pct75: ever75 / (end - start || 1), pct100: ever100 / (end - start || 1)
        } };
    };
    const layerCount = layerIds.length;
    const selected = layerCount ? [
      summarizeLayer(0, 'oldest'), summarizeLayer(Math.floor((layerCount - 1) / 2), 'middle'),
      summarizeLayer(layerCount - 1, 'newestExposed')
    ] : [];
    return { reasonDefinitions: {
        directFootContact: 'applyStrike -> wakeNode; magnitude is delivered node deltaV',
        intraPlatePropagation: 'next-step energy e > WAKE_ENERGY -> wakeNeighborhood; magnitude is e',
        zAdjacentCoupling: 'abs(combined linkForce) > 1e-8 -> wake linked Plate nodes; max components reported',
        sphereFoundationCoupling: 'advanceNodules modal coupling abs(coupling) > 1e-8 -> wake foundation',
        topologyReinstall: 'installTopology re-wakes a node that was already awake before recompilation'
      },
      diagnosticScope: 'Detailed counters and per-node quiet maxima cover only the current oldest, middle, and newest Plate layers; other layers use the original sleep-check path.',
      blockerDenominator: 'selected-layer active node-step evaluations; each blocker is counted independently',
      detailedLayerIds: [...this.sleepDiagnosticLayers.keys()],
      sleepEvaluations: all.sleepEvaluations, sleeps: all.sleeps,
      zLinkBranchTriggers: layerIds.reduce((sum, id) => sum + (this.sleepDiagnosticLayers.get(id)?.zLinkBranchTriggers || 0), 0),
      sphereAssistedZLinkBranchTriggers: layerIds.reduce((sum, id) => sum
        + (this.sleepDiagnosticLayers.get(id)?.sphereAssistedZLinkBranchTriggers || 0), 0),
      maxZLinkBranchMagnitude: layerIds.reduce((max, id) => Math.max(max,
        this.sleepDiagnosticLayers.get(id)?.maxZLinkBranchMagnitude || 0), 0),
      wakeReasons: all.wakeReasons, blockers: all.blockers,
      selectedLayers: selected };
  }

  process(_inputs, outputs) {
    const channels = outputs[0] || [], left = channels[0], right = channels[1];
    if (!left || !right) return !this.destroyed;
    left.fill(0); right.fill(0);
    if (this.destroyed) return false;
    if (!this.topology) return true;
    for (let frame = 0; frame < left.length; frame++) {
      this.phase += RATE; this.samplesSinceStep++;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.advancePhysics();
        const count = this.samplesSinceStep;
        for (let s = 1; s <= count; s++) {
          const tail = (this.queueHead + this.queueLength) & 63, a = s / count;
          this.queueL[tail] = this.lastL + (this.outputL - this.lastL) * a;
          this.queueR[tail] = this.lastR + (this.outputR - this.lastR) * a;
          this.queueLength++;
        }
        this.lastL = this.outputL; this.lastR = this.outputR; this.samplesSinceStep = 0;
      }
      if (this.queueLength) {
        left[frame] = this.queueL[this.queueHead]; right[frame] = this.queueR[this.queueHead];
        this.queueHead = (this.queueHead + 1) & 63; this.queueLength--;
      }
    }
    return true;
  }

  advancePhysics() {
    const t = this.topology, N = this.current.length;
    this.applyContactForces();
    if (!N) { this.outputL = 0; this.outputR = 0; this.telemetry.physicsSteps++; return; }
    if (!this.activeCount && !this.noduleIds?.length) {
      this.outputL = 0; this.outputR = 0; this.telemetry.physicsSteps++; this.telemetry.activeSphereModes = 0; return;
    }
    this.inPhysicsStep = true;
    const steppingCount = this.activeCount;
    this.epoch = (this.epoch + 1) >>> 0 || 1;
    const stamp = this.lapStamp, lap = this.lap, cur = this.current, neigh = t.neighborIndices;
    // Compute Laplacian only on the active nodes and their one-cell stencil.
    for (let a = 0; a < steppingCount; a++) {
      const node = this.active[a]; this.computeLap(node);
      for (let d = 0; d < 4; d++) { const v = neigh[node * 4 + d]; if (v >= 0) this.computeLap(v); }
    }
    let energyBefore = 0, energyAfter = 0, outL = 0, outR = 0;
    const nodeOffsets = t.nodeOffsets, mats = t.materialCoefficients;
    const couplings = t.adjacentLinkNodes, coeffs = t.adjacentLinkCoefficients;
    for (let a = 0; a < steppingCount; a++) {
      const node = this.active[a], layer = this.nodeLayer[node], mi = layer * 4;
      const diagnosticLayer = this.sleepDiagnosticsEnabled ? this.sleepDiagnosticLayerByIndex[layer] : null;
      const diagnosticCoupling = this.sleepDiagnosticsEnabled && this.sleepDiagnosticCouplingNodes[node] !== 0;
      const value = cur[node], vel = value - this.previous[node];
      energyBefore += value * value + vel * vel;
      let lapOfLap = -4 * lap[node], base = node * 4;
      for (let d = 0; d < 4; d++) { const other = neigh[base + d]; if (other >= 0) lapOfLap += lap[other]; }
      let linkForce = 0, diagnosticZForce = 0, diagnosticSphereForce = 0, diagnosticLocalLinkForce = 0;
      const cell = t.nodeGridIndices[node];
      // Sparse adjacent links are indexed by coarse cell; only links touching this node are precompiled into CSR.
      const lo = this.linkOffsets[node], hi = this.linkOffsets[node + 1];
      for (let q = lo; q < hi; q++) {
        const other = this.linkNodes[q], delta = cur[other] - value;
        const rawZForce = this.linkCoefficients[q] * delta;
        const zForce = rawZForce / mats[mi + 2];
        linkForce += zForce;
        if (diagnosticCoupling) diagnosticZForce += zForce;
        if (diagnosticLayer) {
          diagnosticLocalLinkForce += rawZForce;
        }
        if (node < other) this.telemetry.couplingWorkProxy += Math.abs(this.linkCoefficients[q] * delta
          * ((cur[node] - this.previous[node]) - (cur[other] - this.previous[other])));
        this.telemetry.deepPlateCouplingTransfers++;
      }
      for (let q = this.sphereLinkOffsets[node]; q < this.sphereLinkOffsets[node + 1]; q++) {
        const ni = this.sphereLinkModes[q];
        let modalContact = 0;
        for (let m = 0; m < 12; m++) {
          const modeIndex = ni * 12 + m;
          modalContact += this.sphereFoundationShape[modeIndex] * this.sphereCurrent[modeIndex];
        }
        const rawSphereForce = (this.sphereWeight[ni] || 0) * 0.000025 * (modalContact - value);
        const sphereForce = rawSphereForce / mats[mi + 2];
        linkForce += sphereForce;
        if (diagnosticCoupling) diagnosticSphereForce += sphereForce;
      }
      if (diagnosticLayer) {
        this.sleepDiagnosticLocalLinkForce[node] = diagnosticLocalLinkForce;
        this.sleepDiagnosticLocalPlateForce[node] = mats[mi] * lapOfLap - mats[mi + 1] * lap[node] / mats[mi + 2];
      }
      const bending = mats[mi], tension = mats[mi + 1], density = mats[mi + 2], damping = mats[mi + 3] * PLATE_DAMPING_MULTIPLIER;
      const next = 2 * value - this.previous[node] - bending * lapOfLap
        + tension * lap[node] / density - damping * vel + linkForce;
      if (!Number.isFinite(next)) { this.telemetry.nonFinite++; this.current[node] = this.previous[node] = 0; this.next[node] = 0; continue; }
      this.next[node] = next;
      energyAfter += next * next + (next - value) ** 2;
      if (node === t.pickupNodeIndices[layer * 2]) outL += next;
      if (node === t.pickupNodeIndices[layer * 2 + 1]) outR += next;
      const e = next * next + (next - value) ** 2 + lapOfLap * lapOfLap * 0.0001;
      if (e > WAKE_ENERGY) this.wakeNeighborhood(node, WAKE_REASON.INTRA_PLATE, e);
      if (Math.abs(linkForce) > 1e-8) {
        if (diagnosticLayer) {
          const sourceStats = diagnosticLayer;
          if (sourceStats) {
            sourceStats.zLinkBranchTriggers++;
            sourceStats.maxZLinkBranchMagnitude = Math.max(sourceStats.maxZLinkBranchMagnitude, Math.abs(linkForce));
            if (Math.abs(diagnosticZForce) <= 1e-8) sourceStats.sphereAssistedZLinkBranchTriggers++;
            const zWakeStats = sourceStats.wakeReasons.zAdjacentCoupling;
            zWakeStats.thresholdTriggers++;
            zWakeStats.maxTriggerMagnitude = Math.max(zWakeStats.maxTriggerMagnitude, Math.abs(linkForce));
          }
        }
        const from = this.linkOffsets[node], to = this.linkOffsets[node + 1];
        for (let q = from; q < to; q++) this.wakeNode(this.linkNodes[q], WAKE_REASON.Z_ADJACENT, Math.abs(linkForce), {
          zComponent: diagnosticZForce, sphereComponent: diagnosticSphereForce,
          sphereAssisted: Math.abs(diagnosticZForce) <= 1e-8
        });
      }
    }
    // Update sphere oscillators and reciprocal foundation springs.
    this.advanceNodules();
    for (let n = 0; n < this.noduleIds.length; n++) for (let m = 0; m < 12; m++) {
      const i = n * 12 + m; outL += this.sphereCurrent[i] * this.spherePickupL[i];
      outR += this.sphereCurrent[i] * this.spherePickupR[i];
    }
    for (let a = 0; a < steppingCount; ) {
      const node = this.active[a], value = this.next[node], vel = value - this.current[node];
      const layer = this.nodeLayer[node], bendingPotential = mats[layer * 4] * lap[node] * lap[node];
      const quietEnergy = value * value + vel * vel + bendingPotential;
      const layerStats = this.sleepDiagnosticsEnabled ? this.sleepDiagnosticLayerByIndex[layer] : null;
      if (layerStats) {
        layerStats.sleepEvaluations++;
        const localLinkForce = this.sleepDiagnosticLocalLinkForce[node];
        const localPlateForce = this.sleepDiagnosticLocalPlateForce[node];
        const stepStamp = this.telemetry.physicsSteps + 1;
        const localSphereForce = this.sleepDiagnosticSphereForceStamp[node] === stepStamp
          ? this.sleepDiagnosticLocalSphereForce[node] : 0;
        const quietBefore = this.energyQuiet[node];
        const quietBlocked = quietEnergy >= SLEEP_ENERGY;
        const linkBlocked = Math.abs(localLinkForce) >= 1e-8;
        const plateBlocked = Math.abs(localPlateForce) >= 1e-8;
        const sphereBlocked = Math.abs(localSphereForce) >= 1e-8;
        if (quietBlocked) this.recordSleepBlocker(layerStats, node, 'quietEnergy', quietEnergy, quietBefore);
        if (linkBlocked) this.recordSleepBlocker(layerStats, node, 'localLinkForce', localLinkForce, quietBefore);
        if (plateBlocked) this.recordSleepBlocker(layerStats, node, 'localPlateForce', localPlateForce, quietBefore);
        if (sphereBlocked) this.recordSleepBlocker(layerStats, node, 'localSphereForce', localSphereForce, quietBefore);
        if (!quietBlocked && !linkBlocked && !plateBlocked && !sphereBlocked) {
          if (this.energyQuiet[node] < 65535) this.energyQuiet[node]++;
          this.recordSleepQuietMaximum(node, this.energyQuiet[node]);
          if (this.energyQuiet[node] >= SLEEP_STEPS) {
            this.telemetry.truncatedTailEnergy += quietEnergy;
            this.current[node] = this.previous[node] = this.next[node] = 0;
            this.awake[node] = 0; this.energyQuiet[node] = 0;
            if (layerStats) layerStats.sleeps++;
            this.telemetry.sleeps++;
            a++;
            continue;
          }
        } else {
          this.recordSleepQuietMaximum(node, this.energyQuiet[node]);
          this.energyQuiet[node] = 0;
        }
      } else if (quietEnergy < SLEEP_ENERGY && Math.abs(this.localLinkForce(node)) < 1e-8
        && Math.abs(this.localPlateForce(node)) < 1e-8 && Math.abs(this.localSphereForce(node)) < 1e-8) {
        if (this.energyQuiet[node] < 65535) this.energyQuiet[node]++;
        if (this.energyQuiet[node] >= SLEEP_STEPS) {
          this.telemetry.truncatedTailEnergy += quietEnergy;
          this.current[node] = this.previous[node] = this.next[node] = 0;
          this.awake[node] = 0; this.energyQuiet[node] = 0;
          this.telemetry.sleeps++;
          a++;
          continue;
        }
      } else this.energyQuiet[node] = 0;
      this.previous[node] = this.current[node]; this.current[node] = this.next[node]; this.next[node] = 0;
      a++;
    }
    // Compact sleeping original nodes, then append local wakes for the next physical step.
    let write = 0;
    for (let a = 0; a < steppingCount; a++) if (this.awake[this.active[a]]) this.active[write++] = this.active[a];
    this.activeCount = write;
    this.inPhysicsStep = false;
    for (let i = 0; i < this.pendingCount; i++) {
      const node = this.pendingNodes[i]; this.pendingWake[node] = 0;
      const reason = this.pendingWakeReason[node]; this.pendingWakeReason[node] = 0;
      if (!this.awake[node]) {
        this.awake[node] = 1; this.energyQuiet[node] = 0;
        this.active[this.activeCount++] = node; this.telemetry.wakes++;
        if (this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[node] && reason > 0)
          this.recordSleepAwakeTransition(node, reason);
      }
    }
    this.pendingCount = 0;
    const mixL = outL * MIX, mixR = outR * MIX;
    this.telemetry.maxOutputAbs = Math.max(this.telemetry.maxOutputAbs, Math.abs(mixL), Math.abs(mixR));
    if (Math.abs(mixL) > 1 || Math.abs(mixR) > 1) this.telemetry.clipped++;
    this.outputL = mixL / (1 + Math.abs(mixL)); this.outputR = mixR / (1 + Math.abs(mixR));
    this.telemetry.physicsSteps++;
    this.telemetry.energyDelta = energyAfter - energyBefore;
    let activeSphereModes = 0;
    for (let i = 0; i < this.sphereCurrent.length; i++) if (this.sphereCurrent[i] ** 2 + this.spherePrevious[i] ** 2 >= SLEEP_ENERGY) activeSphereModes++;
    this.telemetry.activeSphereModes = activeSphereModes;
  }

  applyContactForces() {
    const offset = this.contactCursor * this.current.length;
    for (let a = 0; a < this.activeCount; a++) {
      const node = this.active[a], force = this.contactForces[offset + node];
      if (force !== 0) {
        // Integrate this step's force as a velocity increment before the
        // unchanged Plate/Z/Sphere recurrence. Discrete envelope sum is one.
        this.previous[node] -= force;
        this.telemetry.contactPulseNodeSteps++;
        this.contactForces[offset + node] = 0;
      }
    }
    this.contactCursor = (this.contactCursor + 1) % CONTACT_PULSE_STEPS;
  }

  computeLap(node) {
    if (this.lapStamp[node] === this.epoch) return;
    const n = this.topology.neighborIndices, c = this.current, off = node * 4;
    let value = -4 * c[node];
    for (let d = 0; d < 4; d++) { const q = n[off + d]; if (q >= 0) value += c[q]; }
    this.lap[node] = value; this.lapStamp[node] = this.epoch;
  }

  localLinkForce(node) {
    let force = 0, v = this.current[node];
    for (let i = this.linkOffsets[node]; i < this.linkOffsets[node + 1]; i++) force += this.linkCoefficients[i] * (this.current[this.linkNodes[i]] - v);
    return force;
  }

  localPlateForce(node) {
    const t = this.topology, layer = this.nodeLayer[node], mi = layer * 4, off = node * 4;
    let bilap = -4 * this.lap[node];
    for (let d = 0; d < 4; d++) { const q = t.neighborIndices[off + d]; if (q >= 0) bilap += this.lap[q]; }
    const m = t.materialCoefficients;
    return m[mi] * bilap - m[mi + 1] * this.lap[node] / m[mi + 2];
  }

  localSphereForce(node) {
    let force = 0;
    for (let q = this.sphereLinkOffsets[node]; q < this.sphereLinkOffsets[node + 1]; q++) {
      const n = this.sphereLinkModes[q]; let modalContact = 0;
      for (let m = 0; m < 12; m++) modalContact += this.sphereFoundationShape[n * 12 + m] * this.sphereCurrent[n * 12 + m];
      force += (this.sphereWeight[n] || 0) * 0.000025 * (modalContact - this.current[node]);
    }
    return force;
  }

  advanceNodules() {
    if (!this.noduleIds?.length) return;
    const u = this.sphereCurrent, p = this.spherePrevious, r = this.sphereRadius, c = this.sphereCos, d = this.sphereDamping;
    const nodes = this.sphereFoundation, weights = this.sphereWeight;
    const diagnosticStepStamp = this.telemetry.physicsSteps + 1;
    for (let n = 0; n < this.noduleIds.length; n++) {
      const foundation = nodes[n];
      const diagnosticFoundationTracked = this.sleepDiagnosticsEnabled && foundation !== NO_NODE
        && foundation < this.current.length && this.sleepDiagnosticTrackedNodes[foundation] !== 0;
      let modalContact = 0;
      let diagnosticModalContact = 0;
      for (let mode = 0; mode < 12; mode++) modalContact += this.sphereFoundationShape[n * 12 + mode] * u[n * 12 + mode];
      for (let m = 0; m < 12; m++) {
        const i = n * 12 + m, old = u[i];
        let coupling = 0;
        if (foundation !== NO_NODE && foundation < this.current.length) {
          coupling = weights[n] * 0.000025 * this.sphereFoundationShape[i]
            * (this.current[foundation] - modalContact) / Math.max(this.sphereMass[n], 1e-6);
          const force = weights[n] * 0.000025 * this.sphereFoundationShape[i] * (this.current[foundation] - modalContact);
          const modalVelocity = u[i] - p[i], plateVelocity = this.current[foundation] - this.previous[foundation];
          this.telemetry.couplingWorkProxy += Math.abs(force * (plateVelocity - this.sphereFoundationShape[i] * modalVelocity));
        }
        const next = c[i] * old - d[i] * p[i] + coupling;
        p[i] = old; u[i] = Number.isFinite(next) ? next : 0;
        if (diagnosticFoundationTracked)
          diagnosticModalContact += this.sphereFoundationShape[i] * u[i];
        if (foundation !== NO_NODE && Math.abs(coupling) > 1e-8)
          this.wakeNode(foundation, WAKE_REASON.SPHERE_FOUNDATION, Math.abs(coupling));
        if (foundation !== NO_NODE && foundation < this.current.length) this.telemetry.sphereCouplingTransfers++;
      }
      if (diagnosticFoundationTracked) {
        if (this.sleepDiagnosticSphereForceStamp[foundation] !== diagnosticStepStamp) {
          this.sleepDiagnosticSphereForceStamp[foundation] = diagnosticStepStamp;
          this.sleepDiagnosticLocalSphereForce[foundation] = 0;
        }
        this.sleepDiagnosticLocalSphereForce[foundation] += weights[n] * 0.000025
          * (diagnosticModalContact - this.current[foundation]);
      }
    }
  }
  sphereCouplingShape(n, m) { return this.spherePickupL[n * 12 + m]; }

  clearVibration() {
    this.current.fill(0); this.previous.fill(0); this.next.fill(0); this.sphereCurrent?.fill(0); this.spherePrevious?.fill(0);
    this.activeCount = 0; this.awake.fill(0); this.energyQuiet.fill(0);
    this.contactForces.fill(0); this.contactMemory.fill(0); this.lastContactStep.fill(0);
    this.contactCursor = 0;
  }

  getDiagnostics() {
    let awakeLayers = 0;
    let activeSphereModes = 0, integratedSphereModes = 0;
    for (let mode = 0; mode < (this.sphereCurrent?.length || 0); mode++) {
      if (this.sphereRadius[mode] > 0) integratedSphereModes++;
      const velocity = this.sphereCurrent[mode] - this.spherePrevious[mode];
      if (this.sphereCurrent[mode] ** 2 + velocity ** 2 >= SLEEP_ENERGY) activeSphereModes++;
    }
    const flags = new Uint8Array(this.topology?.layerIds.length || 0);
    for (let i = 0; i < this.activeCount; i++) flags[this.nodeLayer[this.active[i]]] = 1;
    for (let i = 0; i < flags.length; i++) awakeLayers += flags[i];
    const result = { ...this.telemetry, layers: this.topology?.layerIds.length || 0,
      activeNodes: this.activeCount, awakeLayers, sleepingLayers: (this.topology?.layerIds.length || 0) - awakeLayers,
      physicsRate: RATE, topologyGeneration: this.topology?.generation ?? null,
      couplingLinks: this.topology?.adjacentLinkCoefficients.length || 0,
      noduleCount: this.noduleIds?.length || 0, activeSphereModes, integratedSphereModes, mix: MIX,
      truncatedTailRiskThreshold: SLEEP_ENERGY, quietStepsThreshold: SLEEP_STEPS,
      contactPulseDurationMs: 1000 * CONTACT_PULSE_STEPS / RATE, contactPulseSteps: CONTACT_PULSE_STEPS,
      contactRecoveryTimeMs: 1000 * CONTACT_RECOVERY_STEPS / RATE,
      contactReferenceDeltaV: CONTACT_REFERENCE_DELTA_V, contactMaximumComplianceLoss: CONTACT_MAX_COMPLIANCE_LOSS };
    if (this.sleepDiagnosticsEnabled) result.sleepDiagnostics = this.getSleepDiagnosticsSummary();
    return result;
  }
}

function validTopology(t) {
  if (!t || t.version !== 1 || t.solverGrid !== GRID || t.sourceGrid !== SOURCE_GRID
    || !Array.isArray(t.layerIds) || t.layerIds.length > MAX_LAYERS
    || !(t.nodeOffsets instanceof Int32Array) || t.nodeOffsets.length !== t.layerIds.length + 1
    || !(t.nodeGridIndices instanceof Uint16Array) || t.nodeOffsets[t.layerIds.length] !== t.nodeGridIndices.length
    || !(t.neighborIndices instanceof Int32Array) || t.neighborIndices.length !== t.nodeGridIndices.length * 4
    || !(t.pickupNodeIndices instanceof Uint32Array) || t.pickupNodeIndices.length !== t.layerIds.length * 2
    || !(t.materialCoefficients instanceof Float32Array) || t.materialCoefficients.length !== t.layerIds.length * 4
    || !(t.routingTopLayerByCell96 instanceof Int16Array) || t.routingTopLayerByCell96.length !== SOURCE_GRID * SOURCE_GRID
    || !(t.adjacentLinkNodes instanceof Uint32Array) || t.adjacentLinkNodes.length % 2
    || !(t.adjacentLinkCoefficients instanceof Float32Array) || t.adjacentLinkCoefficients.length * 2 !== t.adjacentLinkNodes.length
    || !Array.isArray(t.noduleIds) || t.noduleIds.length > MAX_NODULES
    || !(t.noduleFoundationLayerIndices instanceof Int16Array) || t.noduleFoundationLayerIndices.length !== t.noduleIds.length
    || !(t.noduleCouplingNodeIndices instanceof Uint32Array) || t.noduleCouplingNodeIndices.length !== t.noduleIds.length
    || !(t.nodulePositionsXY instanceof Float32Array) || t.nodulePositionsXY.length !== t.noduleIds.length * 2
    || !(t.nodulePhysicalRadiiMeters instanceof Float32Array) || t.nodulePhysicalRadiiMeters.length !== t.noduleIds.length
    || !(t.noduleMaterials instanceof Float32Array) || t.noduleMaterials.length !== t.noduleIds.length * 3
    || !(t.noduleCouplingWeights instanceof Float32Array) || t.noduleCouplingWeights.length !== t.noduleIds.length) return false;
  const n = t.nodeGridIndices.length;
  for (let i = 0; i < t.nodeOffsets.length; i++) if (!Number.isInteger(t.nodeOffsets[i]) || t.nodeOffsets[i] < 0 || t.nodeOffsets[i] > n || (i && t.nodeOffsets[i] < t.nodeOffsets[i-1])) return false;
  for (let i = 0; i < t.neighborIndices.length; i++) if (t.neighborIndices[i] < -1 || t.neighborIndices[i] >= n) return false;
  for (let i = 0; i < t.nodeGridIndices.length; i++) if (t.nodeGridIndices[i] >= GRID * GRID) return false;
  for (let i = 0; i < t.pickupNodeIndices.length; i++) if (t.pickupNodeIndices[i] >= n) return false;
  for (let layer = 0; layer < t.layerIds.length; layer++) {
    const start = t.nodeOffsets[layer], end = t.nodeOffsets[layer + 1];
    for (let side = 0; side < 2; side++) {
      const pickup = t.pickupNodeIndices[layer * 2 + side];
      if (pickup < start || pickup >= end) return false;
    }
    for (let node = start; node < end; node++) for (let direction = 0; direction < 4; direction++) {
      const neighbor = t.neighborIndices[node * 4 + direction];
      if (neighbor !== -1 && (neighbor < start || neighbor >= end)) return false;
    }
  }
  for (let i = 0; i < t.materialCoefficients.length; i++) if (!Number.isFinite(t.materialCoefficients[i]) || t.materialCoefficients[i] < 0) return false;
  for (let i = 0; i < t.routingTopLayerByCell96.length; i++) if (t.routingTopLayerByCell96[i] < -1 || t.routingTopLayerByCell96[i] >= t.layerIds.length) return false;
  for (let i = 0; i < t.adjacentLinkNodes.length; i++) if (t.adjacentLinkNodes[i] >= n) return false;
  for (let i = 0; i < t.adjacentLinkCoefficients.length; i++) if (!Number.isFinite(t.adjacentLinkCoefficients[i]) || t.adjacentLinkCoefficients[i] < 0 || t.adjacentLinkCoefficients[i] > 0.000025001) return false;
  for (let i = 0; i < t.noduleIds.length; i++) {
    const foundation = t.noduleFoundationLayerIndices[i], node = t.noduleCouplingNodeIndices[i];
    if (typeof t.noduleIds[i] !== 'string' || !t.noduleIds[i]
      || (foundation < -1 || foundation >= t.layerIds.length)
      || (node !== NO_NODE && node >= n)
      || !Number.isFinite(t.nodulePhysicalRadiiMeters[i]) || t.nodulePhysicalRadiiMeters[i] <= 0
      || !Number.isFinite(t.noduleCouplingWeights[i]) || t.noduleCouplingWeights[i] < 0 || t.noduleCouplingWeights[i] > 1) return false;
    for (let k = 0; k < 3; k++) if (!Number.isFinite(t.noduleMaterials[i * 3 + k])) return false;
    if (t.noduleMaterials[i * 3] <= 0 || t.noduleMaterials[i * 3 + 1] <= 0 || t.noduleMaterials[i * 3 + 2] < 0 || t.noduleMaterials[i * 3 + 2] >= 0.5) return false;
    if (!validPoint({x:t.nodulePositionsXY[i*2],y:t.nodulePositionsXY[i*2+1]})) return false;
  }
  return true;
}

function applyStrike(proc, p) {
  const t = proc.topology;
  if (!validPoint(p.position) || !Number.isFinite(p.strength) || p.strength <= 0) return false;
  const sx = Math.round(p.position.x * (SOURCE_GRID - 1)), sy = Math.round(p.position.y * (SOURCE_GRID - 1));
  const layer = t.routingTopLayerByCell96[sy * SOURCE_GRID + sx];
  if (layer < 0 || (p.layerId && t.layerIds[layer] !== p.layerId) || (p.plateId && t.layerIds[layer] !== p.plateId)) return false;
  const begin = t.nodeOffsets[layer], end = t.nodeOffsets[layer + 1];
  const radius = Number.isFinite(p.footprintRadius) && p.footprintRadius > 0 ? p.footprintRadius : 0.01;
  const sigma = radius * (GRID - 1);
  const x = p.position.x * (GRID - 1), y = p.position.y * (GRID - 1);
  let normSq = 0;
  for (let node = begin; node < end; node++) {
    const cell = t.nodeGridIndices[node], gx = cell % GRID, gy = Math.floor(cell / GRID);
    const w = integratedGaussian(gx, gy, x, y, sigma); normSq += w * w;
  }
  const norm = Math.sqrt(normSq); if (!(norm > EPS)) return false;
  const impulse = Math.min(0.05, p.strength), density = t.materialCoefficients[layer * 4 + 2];
  const reach = 4 * sigma + 0.5;
  for (let node = begin; node < end; node++) {
    const cell = t.nodeGridIndices[node], gx = cell % GRID, gy = Math.floor(cell / GRID);
    if (Math.abs(gx - x) > reach || Math.abs(gy - y) > reach) continue;
    const w = integratedGaussian(gx, gy, x, y, sigma);
    if (w * w < 1e-12 * normSq) continue;
    const deltaV = impulse * w / norm / Math.sqrt(density);
    const elapsed = Math.max(0, proc.telemetry.physicsSteps - proc.lastContactStep[node]);
    const memory = proc.contactMemory[node] * Math.exp(-elapsed / CONTACT_RECOVERY_STEPS);
    const transfer = 1 - CONTACT_MAX_COMPLIANCE_LOSS * memory;
    // Short local compliance from actual recent loading, independent of all
    // other regions, ant identity, output level and resonator lifecycle.
    proc.contactMemory[node] = memory + (1 - memory) * Math.min(1, Math.abs(deltaV) / CONTACT_REFERENCE_DELTA_V);
    proc.lastContactStep[node] = proc.telemetry.physicsSteps;
    const delivered = deltaV * transfer;
    for (let step = 0; step < CONTACT_PULSE_STEPS; step++) {
      const slot = (proc.contactCursor + step) % CONTACT_PULSE_STEPS;
      proc.contactForces[slot * proc.current.length + node] += delivered * CONTACT_ENVELOPE[step];
    }
    proc.telemetry.requestedContactImpulseSquared += deltaV * deltaV;
    proc.telemetry.compliantContactImpulseSquared += delivered * delivered;
    if (transfer < 1) proc.telemetry.contactAttenuatedNodeContributions++;
    proc.wakeNode(node, WAKE_REASON.DIRECT_FOOT_CONTACT, Math.abs(delivered));
  }
  return true;
}

function integratedGaussian(cx, cy, x, y, sigma) {
  // Three-point quadrature over each node's Voronoi cell keeps the footprint
  // continuous even when the contact lies exactly on a solver node.
  const q = 0.7745966692414834, w0 = 0.5555555555555556, w1 = 0.8888888888888888;
  let total = 0;
  for (let iy = -1; iy <= 1; iy++) {
    const oy = iy === 0 ? 0 : iy * q * 0.5, wy = iy === 0 ? w1 : w0;
    for (let ix = -1; ix <= 1; ix++) {
      const ox = ix === 0 ? 0 : ix * q * 0.5, wx = ix === 0 ? w1 : w0;
      const dx = cx + ox - x, dy = cy + oy - y;
      total += wx * wy * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  return total;
}

function modeOrder(index) { return index === 0 ? 0 : index <= 3 ? index - 2 : index <= 8 ? index - 6 : index - 10; }
function modalShape(degree, m, nodule, topology) {
  const nxy = topology.nodulePositionsXY || [];
  const layer = topology.noduleFoundationLayerIndices?.[nodule] ?? -1;
  const result = [0, 0];
  for (let side = 0; side < 2; side++) {
    let px = nxy[nodule * 2] || 0.5, py = nxy[nodule * 2 + 1] || 0.5;
    if (layer >= 0) {
      const node = topology.pickupNodeIndices[layer * 2 + side], cell = topology.nodeGridIndices[node];
      px = (cell % GRID) / (GRID - 1); py = Math.floor(cell / GRID) / (GRID - 1);
    }
    const z = topology.nodules?.[nodule]?.burial?.buriedDepthMeters || 0.04;
    result[side] = realSH(degree, m, px - nxy[nodule * 2], py - nxy[nodule * 2 + 1], z);
  }
  return result;
}
function realSH(l, m, x, y, z) {
  const norm = Math.sqrt(x*x+y*y+z*z) || 1; x/=norm; y/=norm; z/=norm;
  if (l === 0) return 0.2820947918;
  if (l === 1) return m === -1 ? 0.4886025119*y : m === 0 ? 0.4886025119*z : 0.4886025119*x;
  if (m === -2) return 1.0925484306*x*y;
  if (m === -1) return 1.0925484306*y*z;
  if (m === 0) return 0.3153915653*(3*z*z-1);
  if (m === 1) return 1.0925484306*x*z;
  return 0.5462742153*(x*x-y*y);
}
function validPoint(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1; }

registerProcessor('surface-plate-processor', SurfacePlateProcessor);
