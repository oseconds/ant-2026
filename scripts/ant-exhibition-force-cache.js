const WORKLET_MARKER = 'class SurfacePlateProcessor extends AudioWorkletProcessor {';

function replaceOnce(source, before, after, name) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`ANT force-cache shadow anchor missing or ambiguous: ${name}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function transformSleepForceCache(source, { plateCache = false, sphereCache = false, zCache = false } = {}) {
  if (typeof source !== 'string' || !source.includes(WORKLET_MARKER)
    || !source.includes("registerProcessor('surface-plate-processor', SurfacePlateProcessor);")) {
    throw new TypeError('Expected the registered ANT surface Plate worklet source.');
  }
  for (const [name, enabled] of Object.entries({ plateCache, sphereCache, zCache })) {
    if (typeof enabled !== 'boolean') throw new TypeError(`${name} must be a boolean.`);
  }
  if (zCache) throw new RangeError('Z force caching is not exact: sleep reads current[] after earlier active nodes commit next values sequentially.');
  if (!plateCache && !sphereCache) return { source, patches: [], definition: { plateCache, sphereCache, zCache } };

  let transformed = source;
  const patches = [];
  if (plateCache) {
    transformed = replaceOnce(transformed, '      let lapOfLap = -4 * lap[node], base = node * 4;',
      '      let lapOfLap = -4 * lap[node], base = node * 4;', 'Plate recurrence declaration');
    transformed = replaceOnce(transformed,
      '    this.lap = new Float32Array(n); this.lapStamp = new Uint32Array(n);',
      '    this.lap = new Float32Array(n); this.lapStamp = new Uint32Array(n);\n'
        + '    this.__sleepForcePlateLapOfLap = new Float64Array(n); this.__sleepForcePlateStamp = new Uint32Array(n);',
      'Plate cache allocation');
    transformed = replaceOnce(transformed,
      '      for (let d = 0; d < 4; d++) { const other = neigh[base + d]; if (other >= 0) lapOfLap += lap[other]; }',
      '      for (let d = 0; d < 4; d++) { const other = neigh[base + d]; if (other >= 0) lapOfLap += lap[other]; }\n'
        + '      this.__sleepForcePlateLapOfLap[node] = lapOfLap; this.__sleepForcePlateStamp[node] = this.epoch;',
      'Plate recurrence cache');
    transformed = replaceOnce(transformed,
      '    let bilap = -4 * this.lap[node];\n'
        + '    for (let d = 0; d < 4; d++) { const q = t.neighborIndices[off + d]; if (q >= 0) bilap += this.lap[q]; }',
      '    const cached = this.__sleepForcePlateStamp[node] === this.epoch;\n'
        + '    let bilap = cached ? this.__sleepForcePlateLapOfLap[node] : -4 * this.lap[node];\n'
        + '    if (!cached) for (let d = 0; d < 4; d++) { const q = t.neighborIndices[off + d]; if (q >= 0) bilap += this.lap[q]; }',
      'Plate sleep reuse');
    patches.push('Plate Lap-of-Lap cache');
  }
  if (sphereCache) {
    transformed = replaceOnce(transformed,
      '    this.sphereLinkOffsets = new Uint32Array(this.current.length + 1);',
      '    this.__sleepForceSphere = new Float64Array(this.current.length);\n'
        + '    this.__sleepForceSphereStamp = new Uint32Array(this.current.length);\n'
        + '    this.sphereLinkOffsets = new Uint32Array(this.current.length + 1);',
      'Sphere cache allocation');
    transformed = replaceOnce(transformed,
      '      const diagnosticFoundationTracked = this.sleepDiagnosticsEnabled && foundation !== NO_NODE\n'
        + '        && foundation < this.current.length && this.sleepDiagnosticTrackedNodes[foundation] !== 0;\n'
        + '      let modalContact = 0;\n'
        + '      let diagnosticModalContact = 0;',
      '      const diagnosticFoundationTracked = this.sleepDiagnosticsEnabled && foundation !== NO_NODE\n'
        + '        && foundation < this.current.length && this.sleepDiagnosticTrackedNodes[foundation] !== 0;\n'
        + '      const sleepCacheFoundationTracked = foundation !== NO_NODE && foundation < this.current.length\n'
        + '        && this.awake[foundation] !== 0;\n'
        + '      const postContactTracked = diagnosticFoundationTracked || sleepCacheFoundationTracked;\n'
        + '      let modalContact = 0;\n'
        + '      let diagnosticModalContact = 0;',
      'Sphere post-advance setup');
    transformed = replaceOnce(transformed,
      '        if (diagnosticFoundationTracked)\n'
        + '          diagnosticModalContact += this.sphereFoundationShape[i] * u[i];',
      '        if (postContactTracked)\n'
        + '          diagnosticModalContact += this.sphereFoundationShape[i] * u[i];',
      'Sphere post-advance accumulation');
    transformed = replaceOnce(transformed,
      '      if (diagnosticFoundationTracked) {\n'
        + '        if (this.sleepDiagnosticSphereForceStamp[foundation] !== diagnosticStepStamp) {\n'
        + '          this.sleepDiagnosticSphereForceStamp[foundation] = diagnosticStepStamp;\n'
        + '          this.sleepDiagnosticLocalSphereForce[foundation] = 0;\n'
        + '        }\n'
        + '        this.sleepDiagnosticLocalSphereForce[foundation] += weights[n] * 0.000025\n'
        + '          * (diagnosticModalContact - this.current[foundation]);\n'
        + '      }',
      '      if (diagnosticFoundationTracked) {\n'
        + '        if (this.sleepDiagnosticSphereForceStamp[foundation] !== diagnosticStepStamp) {\n'
        + '          this.sleepDiagnosticSphereForceStamp[foundation] = diagnosticStepStamp;\n'
        + '          this.sleepDiagnosticLocalSphereForce[foundation] = 0;\n'
        + '        }\n'
        + '        this.sleepDiagnosticLocalSphereForce[foundation] += weights[n] * 0.000025\n'
        + '          * (diagnosticModalContact - this.current[foundation]);\n'
        + '      }\n'
        + '      if (sleepCacheFoundationTracked) {\n'
        + '        if (this.__sleepForceSphereStamp[foundation] !== diagnosticStepStamp) {\n'
        + '          this.__sleepForceSphereStamp[foundation] = diagnosticStepStamp;\n'
        + '          this.__sleepForceSphere[foundation] = 0;\n'
        + '        }\n'
        + '        this.__sleepForceSphere[foundation] += (weights[n] || 0) * 0.000025\n'
        + '          * (diagnosticModalContact - this.current[foundation]);\n'
        + '      }',
      'Sphere post-advance force cache');
    transformed = replaceOnce(transformed,
      '  localSphereForce(node) {\n'
        + '    let force = 0;',
      '  localSphereForce(node) {\n'
        + '    const stepStamp = this.telemetry.physicsSteps + 1;\n'
        + '    if (this.__sleepForceSphereStamp[node] === stepStamp) return this.__sleepForceSphere[node];\n'
        + '    let force = 0;',
      'Sphere sleep reuse');
    patches.push('post-advance Sphere force cache');
  }
  return { source: transformed, patches, definition: { plateCache, sphereCache, zCache: false } };
}

export function forceCacheSource(source) {
  return transformSleepForceCache(source, { plateCache: true, sphereCache: true }).source;
}

export function instrumentSleepForceWork(processor) {
  const counts = { localLinkCalls: 0, localLinkTerms: 0, localPlateCalls: 0,
    localPlateStencilVisits: 0, cachedPlateCalls: 0, localSphereCalls: 0,
    localSphereModeTerms: 0, cachedSphereCalls: 0, spherePostAdvanceCacheModeTerms: 0,
    plateCacheWrites: 0 };
  const originals = [];
  for (const [method, callKey] of [['localLinkForce', 'localLinkCalls'],
    ['localPlateForce', 'localPlateCalls'], ['localSphereForce', 'localSphereCalls']]) {
    const original = processor[method];
    processor[method] = function (node, ...args) {
      counts[callKey]++;
      if (method === 'localLinkForce') counts.localLinkTerms += this.linkOffsets[node + 1] - this.linkOffsets[node];
      if (method === 'localPlateForce') {
        const cached = this.__sleepForcePlateStamp?.[node] === this.epoch;
        if (cached) counts.cachedPlateCalls++;
        else {
          const start = node * 4, neighbors = this.topology.neighborIndices;
          for (let d = 0; d < 4; d++) if (neighbors[start + d] >= 0) counts.localPlateStencilVisits++;
        }
      }
      if (method === 'localSphereForce') {
        const cached = this.__sleepForceSphereStamp?.[node] === this.telemetry.physicsSteps + 1;
        if (cached) counts.cachedSphereCalls++;
        else for (let q = this.sphereLinkOffsets[node]; q < this.sphereLinkOffsets[node + 1]; q++) counts.localSphereModeTerms += 12;
      }
      return original.call(this, node, ...args);
    };
    originals.push(() => { processor[method] = original; });
  }
  const originalAdvance = processor.advancePhysics;
  processor.advancePhysics = function (...args) {
    if (this.__sleepForcePlateStamp) counts.plateCacheWrites += this.activeCount;
    return originalAdvance.apply(this, args);
  };
  originals.push(() => { processor.advancePhysics = originalAdvance; });
  const originalNodules = processor.advanceNodules;
  processor.advanceNodules = function (...args) {
    if (this.__sleepForceSphereStamp) for (let n = 0; n < (this.noduleIds?.length || 0); n++) {
      const foundation = this.sphereFoundation[n];
      if (foundation !== 0xffffffff && foundation < this.current.length && this.awake[foundation]
        && !(this.sleepDiagnosticsEnabled && this.sleepDiagnosticTrackedNodes[foundation])) counts.spherePostAdvanceCacheModeTerms += 12;
    }
    return originalNodules.apply(this, args);
  };
  originals.push(() => { processor.advanceNodules = originalNodules; });
  return { counts, restore() { for (let i = originals.length - 1; i >= 0; i--) originals[i](); } };
}
