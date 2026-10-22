const TAU = Math.PI * 2;

export function analyzeRouteCurvature(samples, {
  hz = 60, windowSeconds = [1, 2, 5], minimumPathLength = 1e-4,
  lowSpeedThreshold = 0.01, constrainedScale = 0.999
} = {}) {
  if (!Array.isArray(samples) || !Number.isFinite(hz) || hz <= 0) {
    throw new TypeError('Expected samples and a positive finite hz.');
  }
  const byAnt = new Map();
  for (const sample of samples) {
    if (!sample || !Number.isInteger(sample.tick) || typeof sample.id !== 'string'
      || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      throw new TypeError('Each sample needs integer tick, string id, and finite x/y.');
    }
    const rows = byAnt.get(sample.id) || [];
    rows.push(sample);
    byAnt.set(sample.id, rows);
  }
  const windows = windowSeconds.map(seconds => {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new TypeError('Window sizes must be positive.');
    const ticks = Math.round(seconds * hz);
    if (ticks < 1) throw new RangeError('Window sizes must span at least one tick.');
    return { seconds, ticks };
  });
  return Object.fromEntries(windows.map(({ seconds, ticks }) => {
    const measures = [];
    for (const rows of byAnt.values()) {
      rows.sort((a, b) => a.tick - b.tick);
      const byTick = new Map(rows.map(sample => [sample.tick, sample]));
      for (let start = Math.ceil(rows[0].tick / ticks) * ticks; start + ticks <= rows.at(-1).tick; start += ticks) {
        const points = Array.from({ length: ticks + 1 }, (_, offset) => byTick.get(start + offset));
        if (points.every(Boolean)) measures.push(measureWindow(points, minimumPathLength, hz,
          lowSpeedThreshold, constrainedScale));
      }
    }
    return [seconds + 's', summarize(measures)];
  }));
}

function measureWindow(points, minimumPathLength, hz, lowSpeedThreshold, constrainedScale) {
  let pathLength = 0, signedTravelTurn = 0, absoluteTravelTurn = 0;
  let bodyTurn = 0, absoluteBodyTurn = 0, sameSignPairs = 0, signPairs = 0;
  let longestSameSignRun = 0, sameSignRun = 0, previousTravelHeading = null, previousTurnSign = 0;
  let travelAlignmentCosine = 0, alignmentSamples = 0, lowSpeedSamples = 0, speedSamples = 0;
  let constrainedSamples = 0, collisionScaleTotal = 0, collisionSamples = 0;
  const travelTurns = [];
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1], after = points[index];
    const dx = after.x - before.x, dy = after.y - before.y;
    const distance = Math.hypot(dx, dy);
    pathLength += distance;
    if (Number.isFinite(after.speed)) {
      speedSamples += 1;
      if (after.speed < lowSpeedThreshold) lowSpeedSamples += 1;
    }
    if (Number.isFinite(after.collisionScale)) {
      collisionSamples += 1;
      collisionScaleTotal += after.collisionScale;
      if (after.collisionScale < constrainedScale) constrainedSamples += 1;
    }
    if (distance > 1e-12) {
      const travelHeading = Math.atan2(dy, dx);
      if (Number.isFinite(after.heading)) {
        travelAlignmentCosine += Math.cos(signedAngle(travelHeading - after.heading));
        alignmentSamples += 1;
      }
      if (previousTravelHeading !== null) {
        const turn = signedAngle(travelHeading - previousTravelHeading);
        travelTurns.push(turn);
        signedTravelTurn += turn;
        absoluteTravelTurn += Math.abs(turn);
        const sign = Math.sign(turn);
        if (sign && previousTurnSign) {
          signPairs += 1;
          if (sign === previousTurnSign) sameSignPairs += 1;
        }
        sameSignRun = sign && sign === previousTurnSign ? sameSignRun + 1 : sign ? 1 : 0;
        longestSameSignRun = Math.max(longestSameSignRun, sameSignRun);
        previousTurnSign = sign;
      }
      previousTravelHeading = travelHeading;
    } else {
      previousTravelHeading = null;
      previousTurnSign = 0;
      sameSignRun = 0;
    }
    if (Number.isFinite(before.heading) && Number.isFinite(after.heading)) {
      const turn = signedAngle(after.heading - before.heading);
      bodyTurn += turn;
      absoluteBodyTurn += Math.abs(turn);
    }
  }
  const first = points[0], last = points.at(-1);
  const chordLength = Math.hypot(last.x - first.x, last.y - first.y);
  const valid = pathLength >= minimumPathLength;
  return {
    pathLength, chordLength, lowDisplacement: !valid,
    chordToPath: valid ? chordLength / pathLength : null,
    signedTravelTurnRadians: signedTravelTurn,
    absoluteTravelTurnRadians: absoluteTravelTurn,
    signedTravelTurnPerDistance: valid ? signedTravelTurn / pathLength : null,
    absoluteTravelTurnPerDistance: valid ? absoluteTravelTurn / pathLength : null,
    sameSignTurnPairFraction: signPairs ? sameSignPairs / signPairs : null,
    sameSignTurnPairs: sameSignPairs, signPairs,
    longestSameSignTurnRunSeconds: longestSameSignRun / hz,
    pathTurnLag1Correlation: lagCorrelation(travelTurns, 1),
    pathTurnLag3Correlation: lagCorrelation(travelTurns, 3),
    bodyTurnRadians: bodyTurn, absoluteBodyTurnRadians: absoluteBodyTurn,
    bodyTurnCapSamples: points.slice(1).filter(point => point.turnCapSaturated === true).length,
    bodyTurnSamples: points.slice(1).filter(point => Number.isFinite(point.heading)).length,
    travelBodyAlignmentCosine: alignmentSamples ? travelAlignmentCosine / alignmentSamples : null,
    lowSpeedSamples, speedSamples,
    constrainedSamples, collisionSamples, collisionScaleMean: collisionSamples ? collisionScaleTotal / collisionSamples : null
  };
}

function summarize(measures) {
  const valid = measures.filter(item => !item.lowDisplacement);
  const mean = key => valid.length
    ? valid.reduce((sum, item) => sum + item[key], 0) / valid.length : null;
  const finiteMean = key => {
    const values = valid.map(item => item[key]).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const describe = key => {
    const values = valid.map(item => item[key]).filter(Number.isFinite).sort((a, b) => a - b);
    const quantile = p => {
      if (!values.length) return null;
      const index = (values.length - 1) * p, lower = Math.floor(index);
      return values[lower] + (values[Math.min(lower + 1, values.length - 1)] - values[lower]) * (index - lower);
    };
    return { count: values.length, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      p50: quantile(0.5), p90: quantile(0.9) };
  };
  return {
    windowCount: measures.length, validWindowCount: valid.length,
    lowDisplacementWindowCount: measures.length - valid.length,
    meanPathLength: measures.length ? measures.reduce((sum, item) => sum + item.pathLength, 0) / measures.length : null,
    meanChordToPath: finiteMean('chordToPath'),
    meanSignedTravelTurnRadians: mean('signedTravelTurnRadians'),
    meanAbsoluteTravelTurnRadians: mean('absoluteTravelTurnRadians'),
    meanSignedTravelTurnPerDistance: finiteMean('signedTravelTurnPerDistance'),
    meanAbsoluteTravelTurnPerDistance: finiteMean('absoluteTravelTurnPerDistance'),
    meanSameSignTurnPairFraction: finiteMean('sameSignTurnPairFraction'),
    meanLongestSameSignTurnRunSeconds: mean('longestSameSignTurnRunSeconds'),
    meanPathTurnLag1Correlation: finiteMean('pathTurnLag1Correlation'),
    meanPathTurnLag3Correlation: finiteMean('pathTurnLag3Correlation'),
    distributions: Object.fromEntries(['signedTravelTurnRadians', 'absoluteTravelTurnRadians',
      'signedTravelTurnPerDistance', 'absoluteTravelTurnPerDistance', 'chordToPath',
      'sameSignTurnPairFraction'].map(key => [key, describe(key)])),
    meanBodyTurnRadians: mean('bodyTurnRadians'),
    meanAbsoluteBodyTurnRadians: mean('absoluteBodyTurnRadians'),
    turnCapSaturatedSampleCount: measures.reduce((sum, item) => sum + item.bodyTurnCapSamples, 0),
    bodyTurnSampleCount: measures.reduce((sum, item) => sum + item.bodyTurnSamples, 0),
    turnCapSaturatedSampleFraction: measures.reduce((sum, item) => sum + item.bodyTurnCapSamples, 0)
      / Math.max(1, measures.reduce((sum, item) => sum + item.bodyTurnSamples, 0))
    ,meanTravelBodyAlignmentCosine: finiteMean('travelBodyAlignmentCosine'),
    lowSpeedSampleCount: measures.reduce((sum, item) => sum + item.lowSpeedSamples, 0),
    speedSampleCount: measures.reduce((sum, item) => sum + item.speedSamples, 0),
    lowSpeedSampleFraction: measures.reduce((sum, item) => sum + item.lowSpeedSamples, 0)
      / Math.max(1, measures.reduce((sum, item) => sum + item.speedSamples, 0)),
    collisionConstrainedSampleCount: measures.reduce((sum, item) => sum + item.constrainedSamples, 0),
    collisionSampleCount: measures.reduce((sum, item) => sum + item.collisionSamples, 0),
    collisionConstrainedSampleFraction: measures.reduce((sum, item) => sum + item.constrainedSamples, 0)
      / Math.max(1, measures.reduce((sum, item) => sum + item.collisionSamples, 0)),
    meanCollisionScale: finiteMean('collisionScaleMean')
  };
}

function signedAngle(angle) { return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI; }

function lagCorrelation(values, lag) {
  if (values.length <= lag) return null;
  const left = values.slice(lag), right = values.slice(0, -lag);
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0, leftSquares = 0, rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - meanLeft, b = right[index] - meanRight;
    numerator += a * b; leftSquares += a * a; rightSquares += b * b;
  }
  return leftSquares && rightSquares ? numerator / Math.sqrt(leftSquares * rightSquares) : null;
}
