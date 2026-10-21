import assert from 'node:assert/strict';

// Research-only transformations. Anchors fail closed when production changes.
export function fastWakeSource(source) {
  const before = '    if (node < 0 || node >= this.awake.length) return;';
  assert.equal(source.split(before).length, 2);
  return source.replace(before, `${before}
    if (!this.sleepDiagnosticsEnabled && this.awake[node]) {
      this.energyQuiet[node] = 0;
      return;
    }`);
}

export function withoutZ(topology) {
  return { ...topology, adjacentLinkOffsets: new topology.adjacentLinkOffsets.constructor(topology.adjacentLinkOffsets.length),
    adjacentLinkNodes: new Uint32Array(0), adjacentLinkCoefficients: new Float32Array(0) };
}

export function denseLapSource(source) {
  const before = `    for (let a = 0; a < steppingCount; a++) {
      const node = this.active[a]; this.computeLap(node);
      for (let d = 0; d < 4; d++) { const v = neigh[node * 4 + d]; if (v >= 0) this.computeLap(v); }
    }`;
  assert.equal(source.split(before).length, 2);
  return source.replace(before, `    if (steppingCount === N) {
      for (let node = 0; node < N; node++) this.computeLap(node);
    } else {
${before}
    }`);
}

export function serializable(value) {
  if (ArrayBuffer.isView(value)) return { __typedArray: value.constructor.name, data: Array.from(value) };
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializable(v)]));
  return value;
}
