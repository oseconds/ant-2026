import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { runTransferMatrix } from '../scripts/ant-transfer-matrix.js';

test('small matrix writes matched state receipts and a tick-aligned exact field history', async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'ant-natural-field-transfer-test-'));
  const outputRoot = path.join(temporaryRoot, 'matrix');
  try {
    const receipt = await runTransferMatrix({ seeds: [20261005], sampleSeconds: [1, 2],
      totalSeconds: 2, outputDir: outputRoot });
    assert.equal(receipt.stateCount, 4);
    assert.equal(receipt.historyCount, 2);

    const statePath = path.join(outputRoot, 'states/production-seed-20261005-1s.json.gz');
    const state = JSON.parse(gunzipSync(await readFile(statePath)));
    assert.equal(state.schema, 'ant-natural-field-transfer-state/v1');
    assert.equal(state.tick, 60);
    assert.equal(state.writeStream.throughTick, 60);
    assert.equal(state.previousSecondTravel.startTick, 1);
    assert.equal(state.previousSecondTravel.endTick, 60);
    assert.ok(state.previousSecondTravel.trace.length > 0);
    assert.ok(state.previousSecondTravel.trace.every(event => event.tick >= 1 && event.tick <= 60));
    for (const mode of ['production', 'dtFeedback', 'dampingOff']) {
      const validation = state.replay.modes[mode].validation;
      assert.equal(validation.preStateExact, true);
      assert.equal(validation.preRngExact, true);
      assert.equal(validation.preTickPublicSnapshotEqual, true);
      assert.equal(validation.instrumentedVsPlainPostStateExact, true);
      assert.equal(validation.instrumentedVsPlainPostRngExact, true);
      assert.equal(validation.instrumentedVsPlainPostSnapshotEqual, true);
    }
    assert.equal(state.replay.modes.production.validation.originArmPlainReplayEqual, true);
    assert.equal(state.replay.modes.production.validation.originArmInstrumentedReplayEqual, true);

    const streamPath = path.join(outputRoot, state.writeStream.path);
    const stream = JSON.parse(gunzipSync(await readFile(streamPath)));
    assert.equal(stream.schema, 'ant-natural-field-transfer-write-stream/v1');
    assert.deepEqual(stream.captureChecks.map(check => check.tick), [60, 120]);
    assert.equal(stream.events.filter(event => event.type === 'field-decay').length, 120);
    assert.ok(stream.events.every((event, index) => index === 0
      || stream.events[index - 1].sequence < event.sequence));
    const manifest = JSON.parse(await readFile(receipt.manifestPath, 'utf8'));
    assert.equal(manifest.schema, 'ant-natural-field-transfer-matrix-manifest/v1');
    assert.equal(manifest.protocol.statesExpected, 4);
    assert.equal(manifest.captures.length, 4);
    assert.equal(manifest.histories.length, 2);
  } finally {
    const resolvedTemp = path.resolve(temporaryRoot);
    const resolvedTempBase = path.resolve(tmpdir());
    assert.ok(resolvedTemp.startsWith(`${resolvedTempBase}${path.sep}`),
      'cleanup target must remain under the system temporary directory');
    await rm(resolvedTemp, { recursive: true, force: true });
  }
});
