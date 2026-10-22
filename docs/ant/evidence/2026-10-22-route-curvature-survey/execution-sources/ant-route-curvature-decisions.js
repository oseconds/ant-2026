import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { makeCurvatureController } from './ant-route-curvature-shadows.js';

const DT = 1 / 60;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Repeated matched-state decisions; no trajectory or reinforcement claim. */
export async function decisionAssay({ trials = 4000 } = {}) {
  assert.ok(Number.isInteger(trials) && trials > 0);
  const out = [];
  for (const variant of ['baseline', 'scoreOff', 'explorationUncoupled']) {
    const { Controller, ...source } = await makeCurvatureController(variant);
    for (const adherence of [0, 0.5, 1]) {
      const controller = new Controller();
      // A flat strong field isolates directional penalties from gradient preference.
      controller.field = { sample: () => 0.2 };
      const selected = [], intervals = [];
      let lateral = 0, calls = 0;
      for (let trial = 0; trial < trials; trial += 1) {
        let state = (20261005 + trial) >>> 0;
        controller.random = () => {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          calls += 1;
          return state / 2 ** 32;
        };
        const agent = { x: 0.5, y: 0.5, heading: 0, intentHeading: 0,
          trailConfidence: adherence, trailAdherence: adherence, inspectionRemaining: 100,
          decisionRemaining: 0, committedRemaining: 0, hesitationRemaining: 0,
          personality: { pheromoneSensitivity: 1.6, exploration: 0.23, personalSpacing: 0.024 } };
        // Equal local target preserves the prescribed adherence on this one decision.
        controller.updateIntention(agent, [agent], { frontCrowding: 0 }, DT,
          { strength: adherence, coherence: 1, steering: 0 });
        const delta = Math.abs(wrap(agent.intentHeading));
        selected.push(delta);
        intervals.push(agent.decisionRemaining);
        if (delta > 0.3) lateral += 1;
      }
      out.push({ variant, adherence, trials, ...source, randomCalls: calls,
        lateralIntentFraction: lateral / trials,
        meanAbsoluteIntentRadians: selected.reduce((a, b) => a + b, 0) / trials,
        meanDecisionSeconds: intervals.reduce((a, b) => a + b, 0) / trials });
    }
  }
  return out;
}

async function main() {
  const output = resolve(process.argv[2] || 'docs/ant/evidence/2026-10-22-route-curvature-survey/decisions');
  await assert.rejects(access(output), 'Refuse to overwrite an existing evidence directory.');
  const rows = await decisionAssay();
  const self = await readFile(fileURLToPath(import.meta.url));
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'assay.json'), JSON.stringify({
    method: 'One production updateIntention per freshly reset agent/RNG trial. Flat scalar field=0.2, no neighbors. Local target equals prescribed adherence. Chosen intent only; no movement. Matched initial random state per trial/variant, not common random sequence after branch divergence.',
    seedRule: '20261005 + trial; production LCG, 4000 trials; default DT 1/60',
    diagnosticThreshold: 'lateral iff abs(intent-current)>0.3 rad, separating center from ±.47/±.92 candidates',
    sourceSha256: createHash('sha256').update(self).digest('hex'), rows
  }, null, 2) + '\n');
  console.log(JSON.stringify(rows.map(({ variant, adherence, lateralIntentFraction, meanAbsoluteIntentRadians }) =>
    ({ variant, adherence, lateralIntentFraction, meanAbsoluteIntentRadians }))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
