import assert from 'node:assert/strict';
import { BodyPoseController, BODY_POSE_LIMITS, gasterRearPoint } from '../src/lib/agents/ant/BodyPoseController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const articulationFactor = layers => 1 + 0.5 * (1 - Math.exp(-layers / 4));
const relax = (value, target, dt, seconds) => value + (target - value) * -Math.expm1(-dt / seconds);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Research-only material read. `layersByAnt` must be populated before each tick. */
export function attachArticulation(controller, { enabled = false, layersByAnt = new Map(), onSample = null } = {}) {
  if (!(controller instanceof BodyPoseController)) throw new TypeError('controller must be a BodyPoseController.');
  if (!(layersByAnt instanceof Map)) throw new TypeError('layersByAnt must be a Map.');
  const native = controller.advance;
  const wrapper = function (agent, dtSeconds, localTrail) {
    if (!validAgent(agent) || !Number.isFinite(dtSeconds) || dtSeconds <= 0)
      return native.call(controller, agent, dtSeconds, localTrail);
    const beforePose = agent && (typeof agent.id === 'string' || Number.isFinite(agent.id))
      ? controller.ants.get(agent.id) : null;
    const previousYaw = beforePose?.gasterYaw ?? 0;
    native.call(controller, agent, dtSeconds, localTrail);
    const pose = agent && controller.ants.get(agent.id);
    if (!pose || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    const layers = validLayers(layersByAnt.get(agent.id));
    const nativeYaw = pose.gasterYaw;
    const factor = articulationFactor(layers);
    const prospectiveYaw = relax(previousYaw, -pose.turnSignal * BODY_POSE_LIMITS.gasterYaw,
      dtSeconds, BODY_POSE_LIMITS.gasterSeconds * factor);
    const nativeRear = gasterRearPoint(agent, nativeYaw), prospectiveRear = gasterRearPoint(agent, prospectiveYaw);
    const row = { antId: agent.id, dtSeconds, layers, factor, previousYaw, nativeYaw, prospectiveYaw,
      nativeRearX: nativeRear.x, nativeRearY: nativeRear.y, prospectiveRearX: prospectiveRear.x,
      prospectiveRearY: prospectiveRear.y, gasterYawDelta: prospectiveYaw - nativeYaw,
      rearDelta: dist(nativeRear, prospectiveRear),
      enabled: enabled === true };
    if (enabled === true) pose.gasterYaw = prospectiveYaw;
    onSample?.(row);
  };
  controller.advance = wrapper;
  return { finish() { if (controller.advance === wrapper) controller.advance = native; } };
}

function validLayers(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
function validAgent(agent) { return agent && (typeof agent.id === 'string' || Number.isFinite(agent.id))
  && Number.isFinite(agent.x) && Number.isFinite(agent.y); }

function runTrajectory(hz, layers, enabled) {
  const dt = 1 / hz, duration = 12.1, steps = Math.round(duration * hz), speed = 0.036;
  const pose = new BodyPoseController(), deposition = new GasterDeposition({ mode: 'dab', spacing: 0.006 });
  const ant = { id: 7, x: 0.5, y: 0.5, heading: 0, radius: 0.006, angularVelocity: 0 };
  const layersByAnt = new Map([[ant.id, layers]]), samples = [], deposits = [];
  const hook = attachArticulation(pose, { enabled, layersByAnt, onSample: row => samples.push(row) });
  let previousRear = pose.getSnapshot(ant).gasterRear, travelled = 0, turningSamples = 0;
  for (let i = 0; i < steps; i += 1) {
    const t = i * dt;
    const turn = t < 3 ? 0 : t < 6 ? 1 : t < 9 ? -1 : Math.sin((t - 9) * Math.PI * 2);
    ant.heading += turn * 1.1 * dt;
    ant.angularVelocity = turn * 2.2;
    ant.x += Math.cos(ant.heading) * speed * dt;
    ant.y += Math.sin(ant.heading) * speed * dt;
    pose.advance(ant, dt);
    const rear = pose.getSnapshot(ant).gasterRear;
    const chunkTravel = speed * dt;
    deposits.push(...deposition.advance(ant.id, chunkTravel, previousRear, rear, 4.5));
    previousRear = rear;
    travelled += chunkTravel;
    if (Math.abs(turn) > 0.1) turningSamples += 1;
  }
  const pendingBeforeFlush = deposition.ants.get(ant.id)?.amount || 0;
  deposits.push(...deposition.retire(ant.id, previousRear));
  hook.finish();
  const sourceDose = deposits.reduce((sum, item) => sum + (item.type === 'point' ? item.amount
    : dist(item.from, item.to) * item.amountPerUnitDistance), 0);
  const field = new PheromoneField();
  for (const item of deposits) if (item.type === 'point') field.depositPoint(item.position, { amount: item.amount });
  return { hz, layers, enabled, steps, travelled, turningSamples, pendingBeforeFlush, sourceDose,
    dabs: deposits.length, changedPositionDabs: deposits.filter(item => item.type === 'point').length,
    finalRear: previousRear, fieldValues: field.values, samples };
}

function compare(control, conditioned) {
  let nodeL1 = 0, maxNodeDelta = 0;
  for (let i = 0; i < control.fieldValues.length; i += 1) {
    const delta = Math.abs(control.fieldValues[i] - conditioned.fieldValues[i]);
    nodeL1 += delta; maxNodeDelta = Math.max(maxNodeDelta, delta);
  }
  return { sameThoraxTravel: control.travelled === conditioned.travelled,
    sameAuthoredDose: Math.abs(control.sourceDose - conditioned.sourceDose) < 1e-12,
    sourceDoseControl: control.sourceDose, sourceDoseConditioned: conditioned.sourceDose,
    native316FieldNodeCoefficientL1: nodeL1, maxNativeFieldNodeDelta: maxNodeDelta,
    sameDabCount: control.dabs === conditioned.dabs,
    gasterRearDisplacement: dist(control.finalRear, conditioned.finalRear) };
}

export function runProbe() {
  const runs = [];
  for (const hz of [30, 60, 120]) {
    const control = runTrajectory(hz, 0, false), l4 = runTrajectory(hz, 4, true);
    runs.push({ hz, control: summarize(control), L4: summarize(l4), comparison: compare(control, l4) });
  }
  return { law: 'tau_gaster(L)=0.45*(1+0.5*(1-exp(-L/4))) seconds; turnSignal/head/antennae unchanged',
    sourceChain: 'material layer count -> gaster yaw relaxation -> gaster rear source position -> GasterDeposition dab positions; thorax travel sets dose',
    trajectory: 'same interior thorax path, angular schedule: straight 0-3s, +turn 3-6s, -turn 6-9s, sine 9-12.1s',
    runs, naturalLeverage: 'not measured by this fixed-trajectory probe; attachArticulation on the real controller can record it via onSample' };
}

function summarize(run) { const { fieldValues, samples, ...summary } = run; return summary; }

export function selfTest() {
  assert.equal(articulationFactor(0), 1);
  assert(articulationFactor(4) > 1 && articulationFactor(4) < 1.5);
  const pose = new BodyPoseController(), nativePose = new BodyPoseController();
  const ant = { id: 1, x: 0.5, y: 0.5, heading: 0, radius: 0.006, angularVelocity: 2.2 };
  const layers = new Map([[1, 4]]), rows = [], hook = attachArticulation(pose, { enabled: true, layersByAnt: layers, onSample: row => rows.push(row) });
  pose.advance(ant, 1 / 60);
  nativePose.advance(ant, 1 / 60);
  const changed = pose.getSnapshot(ant), row = rows[0];
  assert.equal(row.layers, 4); assert(row.rearDelta > 0);
  const nativeSnapshot = nativePose.getSnapshot(ant);
  assert.equal(changed.turnSignal, nativeSnapshot.turnSignal);
  assert.equal(changed.headYaw, nativeSnapshot.headYaw);
  assert.deepEqual(changed.antennae, nativeSnapshot.antennae);
  hook.finish();
  const control = runTrajectory(60, 0, false), treatment = runTrajectory(60, 4, true);
  assert.equal(control.travelled, treatment.travelled);
  assert.equal(control.sourceDose, treatment.sourceDose);
  assert.equal(control.dabs, treatment.dabs);
  assert(compare(control, treatment).native316FieldNodeCoefficientL1 > 0);
  assert.equal(control.pendingBeforeFlush, treatment.pendingBeforeFlush);
  assert(control.pendingBeforeFlush > 0, 'probe includes a real partial dab flushed at retirement');
  const disabledPose = new BodyPoseController(), disabledRows = [], disabledHook = attachArticulation(disabledPose,
    { layersByAnt: layers, onSample: row => disabledRows.push(row) });
  disabledPose.advance(ant, 1 / 60);
  assert.equal(disabledRows[0].enabled, false);
  assert.equal(disabledPose.getSnapshot(ant).gasterYaw, disabledRows[0].nativeYaw);
  assert.notEqual(disabledRows[0].prospectiveYaw, disabledRows[0].nativeYaw,
    'disabled observer still records the prospective same-state pose');
  disabledHook.finish();
  return { status: 'PASS', checks: ['native-control-state', 'gaster-only-change', 'dose-and-travel-parity',
    'real-dab-position-change', 'disabled-observation', 'restore-wrapper'] };
}

if (process.argv[1]?.endsWith('ant-material-articulation-probe.js')) {
  const result = process.argv.includes('--self-test') ? selfTest() : runProbe();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
