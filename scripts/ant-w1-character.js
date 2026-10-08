const TIME_EPSILON = 1e-9;
const TICK_SECONDS = 1 / 60;
export const W1_CHARACTER_SOURCE = Object.freeze({
  directionalOrder: Object.freeze({
    name: 'cumulative-same-cell-foot-contact-nematic-order',
    definition: 'Travel-weighted nematic order of unique movement segments at actual same-cell FOOT_CONTACTs in [0, episode close] with 1e-9 s endpoint tolerance, including pre-admission contacts.',
    limitation: 'Cumulative contacts may be stale or reused across episodes; this is not an exact causal decomposition of crystallizer EMA.'
  })
});

export class W1CharacterDataGapError extends Error {
  constructor(code, details) {
    super(`W1 material character data gap: ${code}`);
    this.name = 'W1CharacterDataGapError';
    this.code = code;
    this.details = details;
  }
}

export function createW1CharacterContext({ frames, flags, feet, width, height }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError('width and height must be positive safe integers');
  }
  const cellCount = width * height;
  if (!Number.isSafeInteger(cellCount)) throw new RangeError('width * height must be a safe integer');
  if (!Array.isArray(frames) || !frames.length || frames.length >= 65536) {
    throw new RangeError('frames must contain 1 through 65535 observations');
  }
  if ((!Array.isArray(flags) && !ArrayBuffer.isView(flags)) || flags instanceof DataView ||
      flags.length !== frames.length * cellCount) {
    throw new RangeError(`flags length must equal frames * width * height (${frames.length * cellCount})`);
  }
  if (!Array.isArray(feet)) throw new TypeError('feet must be an array');

  const times = frames.map((frame, index) => {
    const time = frame?.timeSeconds;
    if (!Number.isFinite(time) || time < 0 || (index && time <= frames[index - 1].timeSeconds)) {
      throw new RangeError('frame times must be finite, nonnegative, and strictly increasing');
    }
    return time;
  });
  const stride = cellCount;
  const prefix = new Uint16Array((frames.length + 1) * stride);
  for (let frame = 0; frame < frames.length; frame += 1) {
    const prior = frame * stride, next = (frame + 1) * stride, source = frame * stride;
    for (let cell = 0; cell < cellCount; cell += 1) {
      const value = flags[source + cell];
      if (!Number.isInteger(value) || value < 0 || value > 7) throw new TypeError('flags must contain integers from 0 through 7');
      prefix[next + cell] = prefix[prior + cell] + Number((value & 3) === 3);
    }
  }
  for (const [index, foot] of feet.entries()) validateFoot(foot, index, cellCount);

  function measure(episode) {
    if (!episode || episode.status !== 'frozen') throw new TypeError('episode must be frozen');
    if (!Number.isFinite(episode.closeTimeSeconds) || episode.closeTimeSeconds < 0) {
      throw new RangeError('episode closeTimeSeconds must be finite and nonnegative');
    }
    const cells = episode.cellIndices;
    const admissions = episode.firstAdmissionFrameByCell;
    if (!Array.isArray(cells) || !cells.length || !Array.isArray(admissions) || admissions.length !== cells.length) {
      throw new TypeError('episode cellIndices and firstAdmissionFrameByCell must be nonempty aligned arrays');
    }
    const seenCells = new Set();
    let qualified = 0, observations = 0, cellFractionSum = 0;
    const admissionTimes = new Map();
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i], start = admissions[i];
      if (!Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount || seenCells.has(cell)) {
        throw new RangeError('episode cell indices must be unique valid grid indices');
      }
      if (!Number.isSafeInteger(start) || start < 0 || start >= frames.length) {
        throw new RangeError('first admission frame must be a valid frame index');
      }
      seenCells.add(cell);
      admissionTimes.set(cell, times[start]);
      let end = upperBound(times, episode.closeTimeSeconds + TIME_EPSILON) - 1;
      if (end < start) throw new W1CharacterDataGapError('NO_OBSERVED_CELL_SAMPLES', { episodeId: episode.id, cellIndex: cell });
      const count = end - start + 1;
      const cellQualified = prefix[(end + 1) * stride + cell] - prefix[start * stride + cell];
      observations += count;
      qualified += cellQualified;
      cellFractionSum += cellQualified / count;
    }
    if (!observations) throw new W1CharacterDataGapError('NO_OBSERVED_CELL_SAMPLES', { episodeId: episode.id, cells: cells.length });
    const consolidation = cellFractionSum / cells.length;
    const segmentByKey = new Map(), legacyPreAdmissionSegments = new Set();
    let missingDirectionFeet = 0, maxPreAdmissionSeconds = 0, maxPreAdmissionContactSeconds = 0;
    for (const foot of feet) {
      const admittedAt = admissionTimes.get(foot.cellIndex);
      if (admittedAt === undefined) continue;
      // Direction uses actual same-cell contacts from time zero through closure; source motion is one completed 60 Hz tick old.
      if (foot.timeSeconds > episode.closeTimeSeconds + TIME_EPSILON) continue;
      if (!foot.directionAvailable) { missingDirectionFeet += 1; continue; }
      if (foot.segmentEndSeconds > foot.timeSeconds + TIME_EPSILON) {
        throw new RangeError('direction segment must be completed by the foot time');
      }
      const key = `${foot.antId}\u0000${foot.segmentEndSeconds}`;
      const existing = segmentByKey.get(key);
      if (existing) {
        if (!sameNumber(existing.foot.travelDistance, foot.travelDistance) ||
            !sameNumber(existing.foot.nematicX, foot.nematicX) || !sameNumber(existing.foot.nematicY, foot.nematicY) ||
            !sameNumber(existing.foot.segmentStartSeconds, foot.segmentStartSeconds)) {
          throw new TypeError('duplicate ant movement segment has inconsistent direction or travel distance');
        }
      }
      if (foot.travelDistance <= 0) continue;
      const beforeAdmission = foot.timeSeconds < admittedAt;
      if (!existing) segmentByKey.set(key, { foot, preAdmissionContactSeconds: 0 });
      const segment = segmentByKey.get(key);
      if (beforeAdmission) {
        segment.preAdmissionContactSeconds = Math.max(segment.preAdmissionContactSeconds,
          admittedAt - foot.timeSeconds);
        maxPreAdmissionContactSeconds = Math.max(maxPreAdmissionContactSeconds, segment.preAdmissionContactSeconds);
      } else if (foot.segmentStartSeconds < admittedAt) {
        legacyPreAdmissionSegments.add(key);
        maxPreAdmissionSeconds = Math.max(maxPreAdmissionSeconds, admittedAt - foot.segmentStartSeconds);
      }
    }
    let x = 0, y = 0, travelWeight = 0;
    const ants = new Set();
    for (const { foot } of segmentByKey.values()) {
      const magnitude = Math.hypot(foot.nematicX, foot.nematicY);
      x += foot.travelDistance * foot.nematicX / magnitude;
      y += foot.travelDistance * foot.nematicY / magnitude;
      travelWeight += foot.travelDistance;
      ants.add(foot.antId);
    }
    if (!(travelWeight > 0)) {
      throw new W1CharacterDataGapError('NO_VALID_DIRECTIONAL_TRAVEL', {
        episodeId: episode.id, candidateFeet: missingDirectionFeet, missingDirectionFeet,
        cells: cells.length, closeTimeSeconds: episode.closeTimeSeconds,
        characterSource: W1_CHARACTER_SOURCE,
        partialCharacter: { consolidation },
        partialEvidence: { nQualifiedSamples: qualified, nObservations: observations,
          preAdmissionDirectionalSegments: 0, maxPreAdmissionContactSeconds, directionalWindowStartSeconds: 0 }
      });
    }
    return {
      character: {
        consolidation,
        directionalOrder: Math.min(1, Math.hypot(x, y) / travelWeight)
      },
      evidence: {
        nQualifiedSamples: qualified, nObservations: observations,
        uniqueDirectionalSegments: segmentByKey.size, uniqueAnts: ants.size,
        missingDirectionFeet, travelWeight,
        segmentsStartingBeforeAdmission: legacyPreAdmissionSegments.size, maxPreAdmissionSeconds,
        preAdmissionDirectionalSegments: [...segmentByKey.values()].filter(segment => segment.preAdmissionContactSeconds > 0).length,
        maxPreAdmissionContactSeconds, directionalWindowStartSeconds: 0
      },
      characterSource: W1_CHARACTER_SOURCE
    };
  }

  return Object.freeze({ measure });
}

function validateFoot(foot, index, cellCount) {
  if (!foot || !Number.isFinite(foot.timeSeconds) || foot.timeSeconds < 0 ||
      typeof foot.antId !== 'string' || !foot.antId ||
      !Number.isSafeInteger(foot.cellIndex) || foot.cellIndex < 0 || foot.cellIndex >= cellCount ||
      typeof foot.directionAvailable !== 'boolean') {
    throw new TypeError(`invalid foot row at index ${index}`);
  }
  if (!foot.directionAvailable) return;
  if (![foot.nematicX, foot.nematicY, foot.segmentStartSeconds, foot.segmentEndSeconds, foot.travelDistance].every(Number.isFinite) ||
      foot.segmentStartSeconds < 0 || foot.segmentEndSeconds < foot.segmentStartSeconds || foot.travelDistance < 0 ||
      foot.segmentEndSeconds - foot.segmentStartSeconds > TICK_SECONDS + TIME_EPSILON ||
      foot.timeSeconds - foot.segmentEndSeconds > TICK_SECONDS + TIME_EPSILON ||
      Math.hypot(foot.nematicX, foot.nematicY) === 0) {
    throw new TypeError(`invalid directed foot row at index ${index}`);
  }
}

function upperBound(values, target) {
  let low = 0, high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function sameNumber(a, b) { return Math.abs(a - b) <= 1e-12; }

export function summarizeValues(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length || sorted.some(value => !Number.isFinite(value))) throw new TypeError('values must be a nonempty finite array');
  const quantile = p => {
    const position = (sorted.length - 1) * p, lower = Math.floor(position), fraction = position - lower;
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
  };
  const bins = Array(10).fill(0);
  for (const value of sorted) {
    if (value < 0 || value > 1) throw new RangeError('histogram values must be between 0 and 1');
    bins[Math.min(9, Math.floor(value * 10))] += 1;
  }
  return {
    count: sorted.length, min: sorted[0], max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: quantile(0.5), q1: quantile(0.25), q3: quantile(0.75), histogram10: bins
  };
}

export function pearsonCorrelation(left, right) {
  if (left.length !== right.length || left.length < 2 ||
      [...left, ...right].some(value => !Number.isFinite(value))) throw new TypeError('correlation inputs must be equal-length finite arrays with at least two values');
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(left), my = mean(right);
  let covariance = 0, xx = 0, yy = 0;
  for (let i = 0; i < left.length; i += 1) {
    const dx = left[i] - mx, dy = right[i] - my;
    covariance += dx * dy; xx += dx * dx; yy += dy * dy;
  }
  return xx && yy ? covariance / Math.sqrt(xx * yy) : null;
}

export function spearmanCorrelation(left, right) {
  return pearsonCorrelation(averageRanks(left), averageRanks(right));
}

function averageRanks(values) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
    throw new TypeError('Spearman inputs must be finite arrays');
  }
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && order[end].value === order[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let i = start; i < end; i += 1) ranks[order[i].index] = rank;
    start = end;
  }
  return ranks;
}
