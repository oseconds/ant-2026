import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const one = (source, needle, replacement) => {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('Expected exactly one source replacement');
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

export async function loadMultiplicitySelectors(sourceText) {
  const normalized = sourceText.replace(/\r\n/g, '\n');
  const productionText = `${normalized}\nexport { selectCandidate };`;
  const reverseText = `${one(normalized, 'current < parent[adjacent]', 'current > parent[adjacent]')}\nexport { selectCandidate };`;
  const networkLoop = `    for (const endpoint of targetIndices) {
      if (distance[endpoint] / (TRAIL_PLATE_GRID_SIZE - 1) < TRAIL_PLATE_MIN_GEODESIC_LENGTH) continue;
      for (const index of tracePath(endpoint, parent)) network[index] = 1;
    }`;
  const allShortestLoop = `    const queue = [];
    for (const endpoint of targetIndices) {
      if (distance[endpoint] / (TRAIL_PLATE_GRID_SIZE - 1) >= TRAIL_PLATE_MIN_GEODESIC_LENGTH) {
        network[endpoint] = 1;
        queue.push(endpoint);
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      for (const predecessor of neighbors(node)) {
        if (!componentSet[predecessor] || network[predecessor]
          || !(distance[predecessor] < distance[node])
          || Math.abs(distance[predecessor] + (diagonal(predecessor, node) ? SQRT_TWO : 1)
            - distance[node]) > 1e-12) continue;
        network[predecessor] = 1;
        queue.push(predecessor);
      }
    }`;
  const allShortestText = `${one(normalized, networkLoop, allShortestLoop)}\nexport { selectCandidate };`;
  const load = async text => {
    const module = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
    return { selectCandidate: module.selectCandidate,
      TrailPlateBirth: module.TrailPlateBirth, sourceHash: hash(sourceText), transformedHash: hash(text) };
  };
  return { production: await load(productionText), reverseTie: await load(reverseText),
    allShortest: await load(allShortestText) };
}
