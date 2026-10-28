import { AntController } from '../../src/lib/agents/ant/AntController.js';

const CONDITIONS = ['full', 'removeRetired', 'flatRetired'];

/** Replay one frozen intention decision against captured wide-sensor reads. */
export function runFrozenDecision(controller, beforeAgent, agents, occupancy, dt,
  localTrail, wideProfiles, randomTape) {
  const profiles = validateProfiles(wideProfiles, 5);
  const scenarios = CONDITIONS.map(condition => prepareProfiles(profiles, condition));
  const rawBudget = scenarios[2].budget;
  const results = scenarios.map(({ condition, profiles: scenarioProfiles }) => {
    const agent = cloneAgent(beforeAgent);
    let profileIndex = 0, readIndex = 0, randomCalls = 0;
    const signals = [];
    const field = { sample(x, y) {
      skipInvalid();
      const profile = scenarioProfiles[profileIndex];
      const expected = profile?.reads[readIndex];
      if (!expected) throw new Error('Production wide sensor made an unexpected sample call.');
      sameCoordinate(x, y, expected);
      readIndex += 1;
      return expected.value;
      function skipInvalid() {
        while (profileIndex < scenarioProfiles.length) {
          const reads = scenarioProfiles[profileIndex].reads;
          while (readIndex < reads.length && !reads[readIndex].valid) readIndex += 1;
          if (readIndex < reads.length) return;
          profileIndex += 1;
          readIndex = 0;
        }
      }
    } };
    const facade = Object.create(controller);
    facade.field = field;
    facade.random = () => {
      if (randomCalls >= randomTape.length) throw new Error('Random tape exhausted.');
      const value = randomTape[randomCalls++];
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random tape values must be in [0, 1).');
      return value;
    };
    facade.occupancy = controller.occupancy;
    facade.senseTrail = (target, heading) => {
      const signal = AntController.prototype.senseTrail.call(facade, target, heading);
      signals.push({ heading, signal });
      return signal;
    };
    const shadowAgents = agents.map(item => item.id === beforeAgent.id ? agent : cloneAgent(item));
    AntController.prototype.updateIntention.call(facade, agent, shadowAgents, occupancy, dt, localTrail);
    if (randomCalls !== randomTape.length) throw new Error(`Random tape length mismatch: consumed ${randomCalls} of ${randomTape.length}.`);
    if (signals.length !== 5 || signals.some((item, index) => Math.abs(angleDelta(item.heading,
      scenarioProfiles[index].heading)) > 1e-10)) {
      throw new Error('Production wide-sensor calls do not match the five captured headings.');
    }
    while (profileIndex < scenarioProfiles.length) {
      const reads = scenarioProfiles[profileIndex].reads;
      while (readIndex < reads.length && !reads[readIndex].valid) readIndex += 1;
      if (readIndex < reads.length) break;
      profileIndex += 1;
      readIndex = 0;
    }
    if (profileIndex !== scenarioProfiles.length || readIndex !== 0) {
      throw new Error('Captured wide-read profile was not consumed exactly.');
    }
    return { condition, agentAfter: agent, selectedOptionIndex: selectedIndex(agent.intentHeading, signals),
      randomCalls, wideSignals: signals };
  });
  return { conditions: Object.fromEntries(results.map(result => [result.condition, result])), rawBudget };
}

/** Replay the production local sensor and adherence update, separately from wide decisions. */
export function runFrozenLocal(controller, beforeAgent, reads, dt = 1 / 60, condition = 'full') {
  if (!CONDITIONS.includes(condition)) throw new TypeError(`Unknown condition: ${condition}`);
  const [profile] = prepareProfiles([{ heading: null, reads: validateReads(reads) }], condition).profiles;
  let index = 0;
  const field = { sample(x, y) {
    while (index < profile.reads.length && !profile.reads[index].valid) index += 1;
    const read = profile.reads[index++];
    if (!read) throw new Error('Production local sensor made an unexpected sample call.');
    sameCoordinate(x, y, read);
    return read.value;
  } };
  const facade = Object.create(controller);
  facade.field = field;
  const localProfile = AntController.prototype.senseLocalTrail.call(facade, beforeAgent);
  while (index < profile.reads.length && !profile.reads[index].valid) index += 1;
  if (index !== profile.reads.length) throw new Error('Captured local-read profile was not consumed exactly.');
  const agentAfter = cloneAgent(beforeAgent);
  AntController.prototype.updateTrailAdherence.call(facade, agentAfter, localProfile, dt);
  if (![localProfile.left, localProfile.center, localProfile.right, localProfile.strength,
    localProfile.coherence, localProfile.steering, agentAfter.trailAdherence].every(Number.isFinite)) {
    throw new RangeError('Frozen local profile/adherence is numerically undefined.');
  }
  return { condition, profile: localProfile, trailAdherenceAfter: agentAfter.trailAdherence };
}

function prepareProfiles(profiles, condition) {
  const valid = profiles.flatMap(profile => profile.reads.filter(read => read.valid));
  const retiredSum = valid.reduce((sum, read) => sum + read.retired, 0);
  const mean = valid.length ? retiredSum / valid.length : 0;
  const flatSum = mean * valid.length;
  const budget = { validReadCount: valid.length, retiredRawSum: retiredSum,
    flatRetiredRawSum: flatSum, relativeError: retiredSum === 0 ? (flatSum === 0 ? 0 : Infinity)
      : Math.abs(flatSum - retiredSum) / Math.abs(retiredSum),
    note: 'Raw read sum preserved across captured points; not physical field mass or max-operator output.' };
  return { condition, budget, profiles: profiles.map(profile => ({ ...profile, reads: profile.reads.map(read => {
    const value = condition === 'removeRetired' ? read.full - read.retired
      : condition === 'flatRetired' && read.valid ? read.full - read.retired + mean : read.full;
    if (!Number.isFinite(value)) throw new Error('Non-finite transformed wide read.');
    return { ...read, value };
  }) })) };
}

function validateProfiles(profiles, expectedCount) {
  if (!Array.isArray(profiles) || profiles.length !== expectedCount) throw new TypeError(`Expected ${expectedCount} wide profiles.`);
  return profiles.map(profile => {
    if (!Number.isFinite(profile.heading)) throw new TypeError('Wide profile heading must be finite.');
    return { heading: profile.heading, reads: validateReads(profile.reads) };
  });
}

function validateReads(reads) {
  if (!Array.isArray(reads)) throw new TypeError('Reads must be an array.');
  return reads.map(read => {
    const valid = read.x >= 0 && read.x <= 1 && read.y >= 0 && read.y <= 1;
    for (const key of ['x', 'y', 'full', 'self', 'aliveOther', 'retired', 'residual']) {
      if (!Number.isFinite(read[key])) throw new TypeError(`Non-finite captured read ${key}.`);
    }
    if (valid && Math.abs(read.full - read.self - read.aliveOther - read.retired - read.residual) > 1e-7) {
      throw new Error('Captured read components do not reconstruct full signal.');
    }
    return { ...read, valid, value: read.full };
  });
}

function sameCoordinate(x, y, read) {
  if (Math.abs(x - read.x) > 1e-12 || Math.abs(y - read.y) > 1e-12) {
    throw new Error(`Sensor query mismatch: expected ${read.x},${read.y}; got ${x},${y}.`);
  }
}

function cloneAgent(agent) {
  const clone = Object.assign(Object.create(Object.getPrototypeOf(agent)), agent);
  clone.personality = agent.personality;
  return clone;
}

function selectedIndex(heading, signals) {
  const headings = signals.map(item => item.heading);
  const matches = headings.map((value, index) => Math.abs(angleDelta(value, heading)) < 1e-10 ? index : -1)
    .filter(index => index >= 0);
  return matches.length === 1 ? matches[0] : null;
}

function angleDelta(a, b) { return ((a - b + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
