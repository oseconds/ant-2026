import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioPlateTimeline, selectTimelineZoomWindows, validateAudioPlateCapture } from '../scripts/ant-audio-plate-timeline.js';

function fixture() {
  const sampleRate = 1024;
  const sampleCount = sampleRate * 10;
  const anchors = [
    { simulationTimeMs: 0, wallElapsedMs: 0, audioContextTimeSeconds: 0, audioSampleIndex: 0 },
    { simulationTimeMs: 10000, wallElapsedMs: 10000, audioContextTimeSeconds: 10, audioSampleIndex: sampleCount }
  ];
  const contact = { type: 'FOOT_CONTACT', simulationTimeMs: 3000,
    payload: { contacts: [{ foot: 'left' }, { foot: 'right' }] } };
  const birth = { type: 'plate-birth', simulationTimeMs: 5000, payload: { id: 'P1' } };
  const evidence = {
    seed: 20261005,
    status: 'completed',
    simulationDurationSeconds: 10,
    wallDurationSeconds: 10,
    startState: { simulationTimeMs: 0, population: 4, activation: { activation: 0.2 }, layerCount: 0 },
    timeline: [{ simulationTimeMs: 10000, population: 5, activation: 0.5, plateCount: 1 }],
    finalState: { simulationTimeMs: 10000, population: 5, activation: { activation: 0.5 }, layerCount: 1 },
    end: { simulationStartMs: 0, simulationEndMs: 10000, audioContextDurationSeconds: 10, contacts: 2,
      rng: { observerCallDelta: 0 } },
    clockAnchors: anchors,
    events: [contact, birth],
    eventCounts: { footContactGroups: 1, individualFootContacts: 2, plateBirths: 1 },
    spatialSnapshots: []
  };
  return { evidence, sampleRate, channels: { left: new Float32Array(sampleCount), right: new Float32Array(sampleCount) } };
}

test('validates synchronized clocks, accumulated births, and read-only observation', () => {
  const { evidence, sampleRate, channels } = fixture();
  assert.equal(validateAudioPlateCapture(evidence, sampleRate, channels.left.length).status, 'passed');
  const invalid = structuredClone(evidence);
  invalid.end.rng.observerCallDelta = 1;
  assert.equal(validateAudioPlateCapture(invalid, sampleRate, channels.left.length).status, 'failed');
  invalid.end.rng.observerCallDelta = 0;
  invalid.finalState.layerCount = 2;
  assert.equal(validateAudioPlateCapture(invalid, sampleRate, channels.left.length).status, 'failed');
  const terminalMismatch = structuredClone(evidence);
  terminalMismatch.clockAnchors.at(-1).audioSampleIndex -= sampleRate * 0.25;
  assert.equal(validateAudioPlateCapture(terminalMismatch, sampleRate, channels.left.length).status, 'failed');
});

test('builds separate group and individual-foot metrics without audio normalization', () => {
  const { evidence, sampleRate, channels } = fixture();
  channels.left.fill(0.25);
  channels.right.fill(-0.5);
  const originalRandom = Math.random;
  let randomCalls = 0;
  let timeline;
  Math.random = () => { randomCalls += 1; throw new Error('Timeline rendering must not consume RNG.'); };
  try { timeline = buildAudioPlateTimeline({ evidence, channels, sampleRate }); }
  finally { Math.random = originalRandom; }
  assert.equal(randomCalls, 0);
  assert.equal(timeline.validation.status, 'passed');
  assert.equal(timeline.contactBuckets[0].groups, 1);
  assert.equal(timeline.contactBuckets[0].individualFeet, 2);
  assert.equal(timeline.audioMetrics.tenSecondBuckets[0].plateCount, 1);
  assert.equal(timeline.audioMetrics.wholeRun.leftRms, 0.25);
  assert.equal(timeline.audioMetrics.wholeRun.rightRms, 0.5);
  assert.equal(timeline.audioMetrics.wholeRun.stereoPeak, 0.5);
  assert.equal(timeline.channels.left.waveform.amplitudeRange[0], -1);
  assert.equal(timeline.channels.left.waveform.amplitudeRange[1], 1);
  assert.equal(timeline.rendering.fftSize, 1024);
  assert.equal(timeline.rendering.hopSize, 256);
  assert.deepEqual(timeline.rendering.waveformAmplitude, [-1, 1]);
  assert.equal(timeline.zooms.length, 1);
  assert.deepEqual(timeline.zooms[0].events.map(event => event.type), ['FOOT_CONTACT', 'PLATE_BIRTH']);
});

test('zoom selection is deterministic and avoids overlapping selections', () => {
  const { evidence } = fixture();
  const { sampleRate } = fixture();
  const first = selectTimelineZoomWindows({ durationSeconds: 30, simulationStartMs: 0,
    events: evidence.events.map(event => ({ ...event, type: event.type.toUpperCase().replaceAll('-', '_') })),
    contactBuckets: [{ startSeconds: 0, groups: 2 }, { startSeconds: 10, groups: 4 }, { startSeconds: 20, groups: 1 }],
    anchors: [
      { simulationTimeMs: 0, audioSampleIndex: 0 },
      { simulationTimeMs: 30000, audioSampleIndex: sampleRate * 30 }
    ], sampleCount: sampleRate * 30, sampleRate });
  const second = selectTimelineZoomWindows({ durationSeconds: 30, simulationStartMs: 0,
    events: evidence.events.map(event => ({ ...event, type: event.type.toUpperCase().replaceAll('-', '_') })),
    contactBuckets: [{ startSeconds: 0, groups: 2 }, { startSeconds: 10, groups: 4 }, { startSeconds: 20, groups: 1 }],
    anchors: [
      { simulationTimeMs: 0, audioSampleIndex: 0 },
      { simulationTimeMs: 30000, audioSampleIndex: sampleRate * 30 }
    ], sampleCount: sampleRate * 30, sampleRate });
  assert.deepEqual(first, second);
  assert.ok(first.length >= 1 && first.length <= 3);
  for (let index = 1; index < first.length; index += 1) {
    assert.ok(first[index].actualSimulationStartMs >= first[index - 1].actualSimulationEndMs
      || first[index].actualSimulationEndMs <= first[index - 1].actualSimulationStartMs);
  }
});
