import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function differenceCounters(before, after) {
  assert.ok(before instanceof Uint32Array && after instanceof Uint32Array);
  assert.equal(before.length, after.length);
  const delta = new Uint32Array(after.length);
  for (let index = 0; index < after.length; index += 1) {
    assert.ok(after[index] >= before[index], `contact counter decreased at cell ${index}`);
    delta[index] = after[index] - before[index];
  }
  return delta;
}

export function createTemporalObserver() {
  const records = [];
  let previous = null, everHadCandidate = false, finished = false;
  let trackedCells = null, eligibilityLossPending = null, relevantEligibilityLossPending = null;
  let eligibilityEverLost = null, zeroIncrementDurationMs = null;
  const priorMatchChanges = { INITIAL: 0, UNCHANGED: 0, CHANGED: 0 };

  function observe(input) {
    assert.ok(!finished, 'observer is finished');
    assert.ok(input && Number.isFinite(input.timeMs) && input.timeMs >= 0);
    assert.ok(Number.isInteger(input.ordinal) && input.ordinal > 0);
    if (previous) assert.ok(input.timeMs > previous.timeMs, 'analysis times must increase');
    const chemicalMemory = typedCopy(input.chemicalMemory, Float32Array, 'chemicalMemory');
    const chemicalQualifiedMask = typedCopy(input.chemicalQualifiedMask, Uint8Array, 'chemicalQualifiedMask');
    const mechanicalSupport = typedCopy(input.mechanicalSupport, Float32Array, 'mechanicalSupport');
    const mechanicalQualifiedMask = typedCopy(input.mechanicalQualifiedMask, Uint8Array, 'mechanicalQualifiedMask');
    const supportedMask = typedCopy(input.supportedMask, Uint8Array, 'supportedMask');
    const productionSupports = typedCopy(input.productionSupports || new Float32Array(chemicalMemory.length),
      Float32Array, 'productionSupports');
    const contactCounts = typedCopy(input.contactCounts, Uint32Array, 'contactCounts');
    const size = chemicalMemory.length;
    for (const [name, values] of Object.entries({ chemicalQualifiedMask, mechanicalSupport,
      mechanicalQualifiedMask, supportedMask, productionSupports, contactCounts })) {
      assert.equal(values.length, size, `${name} length differs from the grid`);
    }
    for (const values of [chemicalMemory, mechanicalSupport, productionSupports]) {
      for (const value of values) assert.ok(Number.isFinite(value), 'field values must be finite');
    }
    for (const values of [chemicalQualifiedMask, mechanicalQualifiedMask, supportedMask]) {
      for (const value of values) assert.ok(value === 0 || value === 1, 'qualification masks must be binary');
    }

    const candidate = copyCandidate(input.candidate, size);
    const priorMatch = copyPriorMatch(input.priorMatch, size);
    const candidateMask = candidate?.mask || new Uint8Array(size);
    const priorMask = priorMatch?.mask || new Uint8Array(size);
    const intervalStart = copyValue(input.intervalStart || {});
    const birthsAtEndBoundary = copyValue(input.birthsAtEndBoundary || []);
    const intervalDurationMs = previous
      ? input.timeMs - previous.timeMs
      : input.timeMs - Number(intervalStart.timeMs ?? 0);
    assert.ok(Number.isFinite(intervalDurationMs) && intervalDurationMs >= 0);
    const contactIncrements = differenceCounters(previous?.contactCounts || new Uint32Array(size), contactCounts);

    if (!trackedCells) {
      trackedCells = new Uint8Array(size);
      trackedCells.fill(1);
      eligibilityLossPending = new Uint8Array(size);
      relevantEligibilityLossPending = new Uint8Array(size);
      eligibilityEverLost = new Uint8Array(size);
      zeroIncrementDurationMs = new Float64Array(size);
    }
    const previousPriorId = previous?.priorMatch?.id ?? null;
    const currentPriorId = priorMatch?.id ?? null;
    if (previous && previousPriorId !== currentPriorId) zeroIncrementDurationMs.fill(0);
    const currentRelevant = unionMasks(candidateMask, priorMask);
    const intervalRelevant = unionMasks(currentRelevant, previous?.relevantMask || new Uint8Array(size));
    const candidateTerritory = unionMasks(candidateMask, previous?.candidate?.mask || new Uint8Array(size));
    let eligibilityLossCellCount = 0, sampledLocalReturnCellCount = 0;
    const eligibilityLossMask = new Uint8Array(size), sampledLocalReturnMask = new Uint8Array(size);
    const eligibleToEligibleMask = new Uint8Array(size), ineligibleToIneligibleMask = new Uint8Array(size),
      ineligibleToEligibleMask = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) {
      if (previous && trackedCells[index]) {
        const wasEligible = previous.supportedMask[index] === 1;
        const isEligible = supportedMask[index] === 1;
        if (intervalRelevant[index] && wasEligible && isEligible) eligibleToEligibleMask[index] = 1;
        else if (intervalRelevant[index] && !wasEligible && !isEligible) ineligibleToIneligibleMask[index] = 1;
        else if (intervalRelevant[index] && !wasEligible && isEligible) ineligibleToEligibleMask[index] = 1;
        if (wasEligible && !isEligible) {
          eligibilityLossPending[index] = 1;
          eligibilityEverLost[index] = 1;
          if (intervalRelevant[index]) {
            relevantEligibilityLossPending[index] = 1;
            eligibilityLossCellCount += 1;
            eligibilityLossMask[index] = 1;
          }
        } else if (!wasEligible && isEligible && eligibilityLossPending[index]) {
          eligibilityLossPending[index] = 0;
          if (relevantEligibilityLossPending[index] && intervalRelevant[index]) {
            sampledLocalReturnCellCount += 1;
            sampledLocalReturnMask[index] = 1;
          }
          relevantEligibilityLossPending[index] = 0;
        }
        if (intervalRelevant[index]) {
          if (contactIncrements[index] === 0) zeroIncrementDurationMs[index] += intervalDurationMs;
          else zeroIncrementDurationMs[index] = 0;
        }
      } else if (currentRelevant[index]) {
        eligibilityLossPending[index] = 0;
        zeroIncrementDurationMs[index] = contactIncrements[index] === 0 ? intervalDurationMs : 0;
      }
    }

    const currentCandidateIdentity = candidate ? candidateIdentity(candidate) : null;
    const previousCandidate = previous?.candidate || null;
    const candidateTransition = candidate
      ? previousCandidate ? (candidate.startedAtMs === previousCandidate.startedAtMs ? 'CONTINUED' : 'RESTARTED')
        : everHadCandidate ? 'RESTARTED' : 'INITIAL'
      : previousCandidate ? 'DISAPPEARED' : 'ABSENT';
    const candidateSwitch = Boolean(candidate && previousCandidate
      && currentCandidateIdentity !== candidateIdentity(previousCandidate));
    const candidateTerritoryLossCellCount = sumInMask(eligibilityLossMask, candidateTerritory);
    const candidateTerritoryReturnCellCount = sumInMask(sampledLocalReturnMask, candidateTerritory);
    const eligibilityLossInsidePriorMask = priorMatch ? sumInMask(eligibilityLossMask, priorMask) : null;
    const sampledLocalReturnInsidePriorMask = priorMatch ? sumInMask(sampledLocalReturnMask, priorMask) : null;
    const candidateRestartWithoutLocalLoss = candidateTransition === 'RESTARTED' && eligibilityLossCellCount === 0;
    const localReturnWithoutCandidateRestart = sampledLocalReturnCellCount > 0
      && candidateTransition !== 'RESTARTED';
    if (candidate) everHadCandidate = true;

    const priorMatchChange = !previous
      ? { kind: 'INITIAL', previousId: null, currentId: currentPriorId }
      : { kind: previousPriorId === currentPriorId ? 'UNCHANGED' : 'CHANGED',
        previousId: previousPriorId, currentId: currentPriorId };
    priorMatchChanges[priorMatchChange.kind] += 1;
    if (currentPriorId && Array.isArray(intervalStart.plateIds)) {
      assert.ok(intervalStart.plateIds.includes(currentPriorId),
        `matched prior Plate ${currentPriorId} is absent from interval-start material`);
    }

    const onsets = previous ? {
      chemical: transitionMask(previous.chemicalQualifiedMask, chemicalQualifiedMask, 0, 1),
      mechanical: transitionMask(previous.mechanicalQualifiedMask, mechanicalQualifiedMask, 0, 1),
      combined: transitionMask(previous.supportedMask, supportedMask, 0, 1)
    } : { chemical: null, mechanical: null, combined: null };
    const losses = previous ? {
      chemical: transitionMask(previous.chemicalQualifiedMask, chemicalQualifiedMask, 1, 0),
      mechanical: transitionMask(previous.mechanicalQualifiedMask, mechanicalQualifiedMask, 1, 0),
      combined: transitionMask(previous.supportedMask, supportedMask, 1, 0)
    } : { chemical: null, mechanical: null, combined: null };
    const eligibilityTransitionMasks = previous ? {
      eligibleToEligible: eligibleToEligibleMask,
      eligibleToIneligible: eligibilityLossMask,
      ineligibleToEligible: ineligibleToEligibleMask,
      ineligibleToIneligible: ineligibleToIneligibleMask
    } : null;
    const priorCount = priorMask.reduce((sum, value) => sum + value, 0);
    const zeroDurationsInPrior = priorMatch ? selectValues(zeroIncrementDurationMs, priorMask) : null;
    const zeroDurationCellIndices = priorMatch ? maskIndices(priorMask) : null;
    const priorContinuouslyEligibleMask = priorMatch ? maskIntersection(priorMask, supportedMask,
      index => eligibilityEverLost[index] === 0) : null;
    const continuouslyEligibleInPrior = priorContinuouslyEligibleMask?.reduce(sumValues) ?? null;
    const row = {
      timeMs: input.timeMs, ordinal: input.ordinal, intervalDurationMs,
      intervalStart, birthsAtEndBoundary,
      materialChangesDuringInterval: copyValue(input.materialChangesDuringInterval || { plates: [], nodules: [] }),
      plateIdsAtIntervalStart: [...(intervalStart.plateIds || [])],
      chemicalMemory, chemicalQualifiedMask, mechanicalSupport, mechanicalQualifiedMask,
      productionSupports, supportedMask, contactCounts, contactIncrements,
      freshContactsInsidePriorMask: priorMatch ? sumInMask(contactIncrements, priorMask) : null,
      freshContactsInsideCandidateMask: candidate ? sumInMask(contactIncrements, candidateMask) : null,
      zeroIncrementDurationMs: zeroDurationsInPrior,
      zeroIncrementDurationCellIndices: zeroDurationCellIndices,
      zeroIncrementDurationSummary: zeroDurationsInPrior ? summarizeValues(zeroDurationsInPrior) : null,
      candidatePresent: Boolean(candidate), candidate, candidateIdentity: currentCandidateIdentity,
      previousCandidateIdentity: previousCandidate ? candidateIdentity(previousCandidate) : null,
      candidateTransition,
      candidateSwitch, candidateDisappearance: candidateTransition === 'DISAPPEARED',
      candidateRestartWithoutLocalLoss, eligibilityLossCellCount, sampledLocalReturnCellCount,
      candidateTerritoryLossCellCount, candidateTerritoryReturnCellCount,
      eligibilityLossInsidePriorMask, sampledLocalReturnInsidePriorMask,
      eligibilityLossInsideCandidateMask: candidate ? sumInMask(eligibilityLossMask, candidateMask) : null,
      sampledLocalReturnInsideCandidateMask: candidate ? sumInMask(sampledLocalReturnMask, candidateMask) : null,
      eligibilityLossMask, sampledLocalReturnMask,
      eligibilityTransitionMasks,
      eligibilityTransitionCounts: eligibilityTransitionMasks ? {
        eligibleToEligible: eligibleToEligibleMask.reduce(sumValues),
        eligibleToIneligible: eligibilityLossMask.reduce(sumValues),
        ineligibleToEligible: ineligibleToEligibleMask.reduce(sumValues),
        ineligibleToIneligible: ineligibleToIneligibleMask.reduce(sumValues)
      } : null,
      priorMaskContinuouslyEligibleMask: priorContinuouslyEligibleMask,
      localReturnWithoutCandidateRestart,
      chemicalQualificationOnsetMask: onsets.chemical,
      mechanicalSupportOnsetMask: onsets.mechanical,
      combinedQualificationOnsetMask: onsets.combined,
      chemicalQualificationLossMask: losses.chemical,
      mechanicalSupportLossMask: losses.mechanical,
      combinedQualificationLossMask: losses.combined,
      chemicalQualificationOnsetCellCount: onsets.chemical?.reduce(sumValues) ?? null,
      chemicalQualificationOnsetInsidePriorMask: onsets.chemical && priorMatch ? sumInMask(onsets.chemical, priorMask) : null,
      chemicalQualificationOnsetInsideCandidateMask: onsets.chemical && candidate ? sumInMask(onsets.chemical, candidateMask) : null,
      mechanicalSupportOnsetCellCount: onsets.mechanical?.reduce(sumValues) ?? null,
      mechanicalSupportOnsetInsidePriorMask: onsets.mechanical && priorMatch ? sumInMask(onsets.mechanical, priorMask) : null,
      mechanicalSupportOnsetInsideCandidateMask: onsets.mechanical && candidate ? sumInMask(onsets.mechanical, candidateMask) : null,
      combinedQualificationOnsetCellCount: onsets.combined?.reduce(sumValues) ?? null,
      combinedQualificationOnsetInsidePriorMask: onsets.combined && priorMatch ? sumInMask(onsets.combined, priorMask) : null,
      combinedQualificationOnsetInsideCandidateMask: onsets.combined && candidate ? sumInMask(onsets.combined, candidateMask) : null,
      chemicalQualificationLossInsidePriorMask: losses.chemical && priorMatch ? sumInMask(losses.chemical, priorMask) : null,
      mechanicalSupportLossInsidePriorMask: losses.mechanical && priorMatch ? sumInMask(losses.mechanical, priorMask) : null,
      combinedQualificationLossInsidePriorMask: losses.combined && priorMatch ? sumInMask(losses.combined, priorMask) : null,
      priorMaskCellCount: priorMatch ? priorCount : null,
      priorMaskContinuouslyEligibleCellCount: continuouslyEligibleInPrior,
      priorMaskNotContinuouslyEligibleCellCount: priorMatch ? priorCount - continuouslyEligibleInPrior : null,
      priorMatch, priorMatchChange,
      boundaryCensoring: { left: previous === null, right: false }
    };
    records.push(row);
    previous = { timeMs: input.timeMs, contactCounts, supportedMask, chemicalQualifiedMask,
      mechanicalQualifiedMask, candidate, priorMatch, relevantMask: currentRelevant };
    return row;
  }

  function finish(horizonMs) {
    assert.ok(!finished, 'observer is already finished');
    assert.ok(Number.isFinite(horizonMs) && horizonMs >= 0);
    assert.ok(!previous || horizonMs >= previous.timeMs, 'run horizon precedes the last observation');
    finished = true;
    const openDomainEligibilityLossCellCount = eligibilityLossPending ? eligibilityLossPending.reduce(sumValues) : 0;
    const openEligibilityLossCellCount = previous?.relevantMask
      ? countMaskCells(previous.relevantMask, index => relevantEligibilityLossPending[index] === 1) : 0;
    const boundary = {
      horizonMs, leftCensored: true, rightCensored: true,
      trailingUnobservedMs: previous ? horizonMs - previous.timeMs : horizonMs,
      openEligibilityLossCellCount,
      openDomainEligibilityLossCellCount,
      candidateRightCensored: Boolean(previous?.candidate)
    };
    if (records.length) records.at(-1).boundaryCensoring.right = true;
    return boundary;
  }

  function summarize() {
    assert.ok(finished, 'finish before summarize');
    return {
      observationCount: records.length,
      candidateTransitions: Object.fromEntries(['INITIAL', 'CONTINUED', 'RESTARTED', 'DISAPPEARED', 'ABSENT']
        .map(kind => [kind, records.filter(row => row.candidateTransition === kind).length])),
      candidateRestartWithoutLocalLossCount: records.filter(row => row.candidateRestartWithoutLocalLoss).length,
      sampledLocalReturnCellCount: records.reduce((sum, row) => sum + row.sampledLocalReturnCellCount, 0),
      localReturnWithoutCandidateRestartCount: records.filter(row => row.localReturnWithoutCandidateRestart).length,
      candidateSwitchCount: records.filter(row => row.candidateSwitch).length,
      candidateDisappearanceCount: records.filter(row => row.candidateDisappearance).length,
      priorMatchChanges,
      matchedPriorObservationCount: records.filter(row => row.priorMatch).length,
      matchedPriorIds: [...new Set(records.map(row => row.priorMatch?.id).filter(Boolean))]
    };
  }

  return Object.freeze({ observe, finish, summarize, records });
}

function typedCopy(value, Type, name) {
  assert.ok(value instanceof Type, `${name} must be ${Type.name}`);
  return new Type(value);
}
function copyCandidate(value, size) {
  if (!value) return null;
  const candidate = copyValue(value);
  candidate.mask = typedCopy(value.mask, Uint8Array, 'candidate.mask');
  assert.equal(candidate.mask.length, size);
  return candidate;
}
function copyPriorMatch(value, size) {
  if (!value) return null;
  const prior = copyValue(value);
  prior.mask = typedCopy(value.mask, Uint8Array, 'priorMatch.mask');
  assert.equal(prior.mask.length, size);
  return prior;
}
function copyValue(value) {
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  }
  return value;
}
function candidateIdentity(candidate) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ source: candidate.source, target: candidate.target, path: candidate.path }));
  hash.update(Buffer.from(candidate.mask.buffer, candidate.mask.byteOffset, candidate.mask.byteLength));
  return hash.digest('hex');
}
function unionMasks(a, b) {
  const union = new Uint8Array(a.length);
  for (let index = 0; index < a.length; index += 1) union[index] = a[index] || b[index] ? 1 : 0;
  return union;
}
function transitionMask(before, after, from, to) {
  const result = new Uint8Array(before.length);
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] === from && after[index] === to) result[index] = 1;
  }
  return result;
}
function maskIntersection(a, b, predicate) {
  const result = new Uint8Array(a.length);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] && b[index] && predicate(index)) result[index] = 1;
  }
  return result;
}
function sumInMask(values, mask) {
  let total = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) total += values[index];
  return total;
}
function selectValues(values, mask) {
  const selected = [];
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) selected.push(values[index]);
  return selected;
}
function maskIndices(mask) {
  const indices = [];
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) indices.push(index);
  return indices;
}
function countMaskCells(mask, predicate) {
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index] && predicate(index)) count += 1;
  return count;
}
function summarizeValues(values) {
  if (!values.length) return { count: 0, minMs: null, medianMs: null, maxMs: null, meanMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, minMs: sorted[0], medianMs: sorted[Math.floor((sorted.length - 1) / 2)],
    maxMs: sorted.at(-1), meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}
function sumValues(total, value) { return total + value; }
