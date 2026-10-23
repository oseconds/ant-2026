import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AntController } from '../src/lib/agents/ant/AntController.js';

export const curvatureVariants = {
  baseline: null,
  scoreOff: ['+ (Math.cos(option.offset) - 1) * agent.trailAdherence * ADHERENCE_DIRECTION_SCORE', '+ 0'],
  blendOff: ['agent.trailAdherence * ADHERENCE_HEADING_WEIGHT', 'agent.trailAdherence * 0'],
  dampingOff: ['steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence', 'steeringAngularVelocity * 0 * agent.trailAdherence'],
  explorationUncoupled: ['agent.personality.exploration * (1.2 - confidence)', 'agent.personality.exploration * 1.2']
};

/** A single source-guarded research substitution; production files are never written. */
export async function makeCurvatureController(variant = 'baseline') {
  assert.ok(Object.hasOwn(curvatureVariants, variant), `Unknown research variant: ${variant}`);
  const source = await readFile(new URL('../src/lib/agents/ant/AntController.js', import.meta.url), 'utf8');
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  const change = curvatureVariants[variant];
  if (!change) return { Controller: AntController, variant, sourceSha256: sha256(source), shadowSha256: null };
  const [before, after] = change;
  assert.equal(source.split(before).length, 2, 'Expected exactly one matching production expression.');
  let transformed = source.replace(before, after);
  transformed = transformed.replace(/from '(\.\/[^']+)'/g, (_, path) =>
    `from '${new URL(path, new URL('../src/lib/agents/ant/AntController.js', import.meta.url)).href}'`);
  const { AntController: Controller } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
  return { Controller, variant, sourceSha256: sha256(source), shadowSha256: sha256(transformed), substitution: { before, after } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const variant of Object.keys(curvatureVariants)) {
    const { Controller, ...receipt } = await makeCurvatureController(variant);
    assert.equal(typeof Controller.prototype.tick, 'function');
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  }
}
