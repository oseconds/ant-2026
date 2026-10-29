#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const INPUTS = {
  census: 'docs/ant/evidence/2026-10-29-peak-saddle-domain-reproducibility/data/domain-audit.json.gz',
  frozen: 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz',
  structures: 'docs/ant/evidence/2026-10-29-materialization-scope-exploration/data/frozen-structures.json.gz',
  source: 'src/lib/agents/ant/TrailPlateBirth.js'
};
const OUTPUTS = {
  data: 'docs/ant/evidence/2026-10-29-peak-saddle-domain-set-audit/data/domain-set-analysis.json.gz',
  atlas: 'docs/ant/evidence/2026-10-29-peak-saddle-domain-set-audit/domain-ensemble-atlas.svg'
};
const GRID = 96;
const CELL_COUNT = GRID * GRID;
const RELATIONS = [
  ['reciprocalBestIntersection', 'intersection'],
  ['reciprocalBestJaccard', 'jaccard']
];

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function readJsonGzip(path) { return JSON.parse(gunzipSync(readFileSync(path))); }
function indices(mask) {
  assert.equal(mask.length, CELL_COUNT);
  const out = [];
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) out.push(i);
  return out;
}
function sortedSet(values) { return [...new Set(values)].sort((a, b) => a - b); }
function sameValues(a, b) { return JSON.stringify(sortedSet(a)) === JSON.stringify(sortedSet(b)); }
function quantiles(values) {
  if (!values.length) return { n: 0, min: null, q1: null, median: null, q3: null, p90: null, p95: null, p99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0], q1: at(0.25), median: at(0.5), q3: at(0.75), p90: at(0.9), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}
function histogram(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => Number(a[0]) - Number(b[0])));
}
function intersectCount(a, b) {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  let count = 0;
  for (const value of small) if (large.has(value)) count += 1;
  return count;
}
function relationOf(left, right) {
  const intersection = intersectCount(left, right);
  return {
    intersection,
    union: left.size + right.size - intersection,
    leftWithinRight: intersection === left.size,
    rightWithinLeft: intersection === right.size,
    disjoint: intersection === 0
  };
}
function summaryOfFractions(values) {
  return quantiles(values);
}
function mapSets(anchor) {
  const maps = anchor.maps;
  return {
    B: maps.B_memory,
    E: new Set(indices(maps.E_qualified)),
    F: new Set(indices(maps.F_skeleton)),
    G: new Set(indices(maps.G_source_connected)),
    H: new Set(indices(maps.H_boundary_length_eligible)),
    I: new Set(indices(maps.I_retained_network))
  };
}
function frameFor(structureEvent, timeMs) {
  const matches = structureEvent.frames.filter(frame => frame.timeMs === timeMs);
  assert.equal(matches.length, 1, `expected one exact structure frame at ${timeMs}`);
  return matches[0];
}

class UnionFind {
  constructor(keys) { this.parent = new Map(keys.map(key => [key, key])); }
  find(key) {
    const parent = this.parent.get(key);
    assert.notEqual(parent, undefined, `unknown correspondence node ${key}`);
    if (parent !== key) this.parent.set(key, this.find(parent));
    return this.parent.get(key);
  }
  union(a, b) {
    const left = this.find(a), right = this.find(b);
    if (left === right) return;
    if (left < right) this.parent.set(right, left);
    else this.parent.set(left, right);
  }
  groups() {
    const groups = new Map();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(key);
    }
    return [...groups.values()].map(group => group.sort()).sort((a, b) => a[0].localeCompare(b[0]));
  }
}

function buildData() {
  const census = readJsonGzip(INPUTS.census);
  const frozen = readJsonGzip(INPUTS.frozen);
  const structures = readJsonGzip(INPUTS.structures);
  assert.equal(census.method.adjacencyPrimary, 8);
  assert.equal(census.states.length, 10);
  assert.equal(Object.keys(frozen.events).length, 2);
  assert.equal(Object.keys(structures.events).length, 2);

  const stateRecords = [];
  const nodeRecords = new Map();
  const eventStates = new Map();
  for (const eventInput of Object.values(frozen.events).sort((a, b) => Number(a.id) - Number(b.id))) {
    const eventName = `P${eventInput.id}`;
    const structureEvent = Object.values(structures.events).find(event => event.id === `trail-plate-${eventInput.id}`);
    assert.ok(structureEvent, `missing frozen structure event ${eventName}`);
    const eventDomainStates = [];
    for (let stateIndex = 0; stateIndex < eventInput.anchors.length; stateIndex += 1) {
      const anchor = eventInput.anchors[stateIndex];
      const sourceState = census.states.find(state => state.timeMs === anchor.timeMs);
      assert.ok(sourceState, `missing parent census state ${eventName} at ${anchor.timeMs}`);
      assert.equal(sourceState.parentBParity, 'exact peaks, levels, contrasts, winner and winner domain', `parent B parity absent for ${sourceState.key}`);
      const frame = frameFor(structureEvent, anchor.timeMs);
      const maps = mapSets(anchor);
      for (const [name, actual] of [['E', frame.E], ['H', frame.H], ['I', frame.I]]) {
        assert.ok(sameValues([...maps[name]], actual), `${sourceState.key} ${name} mismatch with frozen structure`);
      }
      const path = sortedSet(frame.pathCells);
      assert.ok(path.every(index => maps.I.has(index)), `${sourceState.key} principal path must lie in I`);
      const FminusI = new Set([...maps.F].filter(index => !maps.I.has(index)));
      const HminusI = new Set([...maps.H].filter(index => !maps.I.has(index)));
      const supports = { E: maps.E, F: maps.F, G: maps.G, H: maps.H, I: maps.I, principalPath: new Set(path), FminusI, HminusI };
      const census8 = sourceState.adjacencies['8'];
      assert.equal(census8.adjacency, 8);
      const finite = census8.peaks.filter(peak => peak.finite);
      const essential = census8.peaks.filter(peak => peak.essential);
      assert.equal(finite.length, census8.finitePeakCount);
      assert.equal(essential.length, census8.essentialPeakCount);
      assert.equal(finite.length + essential.length, census8.peaks.length);
      const coverage = new Uint16Array(CELL_COUNT);
      const peakByIndex = new Map(census8.peaks.map(peak => [peak.peakIndex, peak]));
      const domains = finite.map(peak => {
        assert.ok(Array.isArray(peak.domainCellIndices));
        assert.equal(peak.domainCellIndices.length, peak.domainCellCount);
        const cells = sortedSet(peak.domainCellIndices);
        assert.equal(cells.length, peak.domainCellIndices.length, 'duplicate cell in finite domain');
        for (const index of cells) {
          assert.ok(maps.E.has(index), `domain cell ${index} falls outside E`);
          coverage[index] += 1;
        }
        const cellSet = new Set(cells);
        const overlaps = {};
        for (const [supportName, support] of Object.entries(supports)) {
          const n = intersectCount(cellSet, support);
          overlaps[supportName] = { cells: n, fractionOfDomain: n / cells.length };
        }
        const key = `${sourceState.key}-P${peak.peakIndex}`;
        const record = {
          key, stateKey: sourceState.key, event: eventName, stateIndex,
          timeMs: anchor.timeMs, timeSeconds: anchor.timeMs / 1000,
          role: sourceState.role, peakIndex: peak.peakIndex,
          size: cells.length, contrast: peak.contrast,
          birthLevel: peak.birthLevel, deathLevel: peak.deathLevel,
          saddleLevel: peak.saddleLevel, saddleIndices: peak.saddleIndices,
          elderPeakIndex: peak.elderPeakIndex, mergePeakIndices: peak.mergePeakIndices,
          bbox: peak.bbox, overlaps, familyIds: {}, familyAnchorCounts: {},
          essentialAncestorPeakIndex: null, hierarchyDepth: null
        };
        nodeRecords.set(key, { record, cells: cellSet, peak });
        return record;
      });

      const coverageValues = [...maps.E].map(index => coverage[index]);
      const finitePairs = [];
      const overlapDegrees = new Map(domains.map(domain => [domain.key, 0]));
      let containedPairCount = 0, equalPairCount = 0, pairwiseContainmentDirections = 0;
      const overlapJaccard = [], overlapIntersection = [];
      for (let i = 0; i < domains.length; i += 1) {
        const left = nodeRecords.get(domains[i].key).cells;
        for (let j = i + 1; j < domains.length; j += 1) {
          const right = nodeRecords.get(domains[j].key).cells;
          const relation = relationOf(left, right);
          const { intersection, union } = relation;
          if (relation.disjoint) continue;
          const jaccard = intersection / union;
          const { leftWithinRight, rightWithinLeft } = relation;
          if (leftWithinRight && rightWithinLeft) equalPairCount += 1;
          else if (leftWithinRight || rightWithinLeft) {
            containedPairCount += 1;
            pairwiseContainmentDirections += 1;
          }
          overlapDegrees.set(domains[i].key, overlapDegrees.get(domains[i].key) + 1);
          overlapDegrees.set(domains[j].key, overlapDegrees.get(domains[j].key) + 1);
          overlapJaccard.push(jaccard);
          overlapIntersection.push(intersection);
          finitePairs.push({
            sourcePeakIndex: domains[i].peakIndex,
            targetPeakIndex: domains[j].peakIndex,
            intersection, union, jaccard,
            leftWithinRight, rightWithinLeft,
            hierarchyRelated: domains[i].elderPeakIndex === domains[j].peakIndex
              || domains[j].elderPeakIndex === domains[i].peakIndex
          });
        }
      }

      const peakChildren = new Map(census8.peaks.map(peak => [peak.peakIndex, []]));
      const hierarchyDepths = [];
      const directParentKind = { finite: 0, essential: 0, missing: 0 };
      const finiteParentContainment = { childContainedByParent: 0, partialOverlap: 0, disjoint: 0, parentEssential: 0 };
      for (const domain of domains) {
        const peak = peakByIndex.get(domain.peakIndex);
        const parentIndex = peak.elderPeakIndex;
        if (!Number.isInteger(parentIndex) || !peakByIndex.has(parentIndex) || parentIndex === peak.peakIndex) {
          directParentKind.missing += 1;
          domain.essentialAncestorPeakIndex = null;
          domain.hierarchyDepth = null;
          continue;
        }
        const parent = peakByIndex.get(parentIndex);
        peakChildren.get(parentIndex).push(peak.peakIndex);
        directParentKind[parent.essential ? 'essential' : 'finite'] += 1;
        if (parent.essential) finiteParentContainment.parentEssential += 1;
        else {
          const childSet = nodeRecords.get(domain.key).cells;
          const parentDomain = domains.find(item => item.peakIndex === parentIndex);
          if (!parentDomain) finiteParentContainment.disjoint += 1;
          else {
            const parentSet = nodeRecords.get(parentDomain.key).cells;
            const relation = relationOf(childSet, parentSet);
            if (relation.leftWithinRight) finiteParentContainment.childContainedByParent += 1;
            else if (!relation.disjoint) finiteParentContainment.partialOverlap += 1;
            else finiteParentContainment.disjoint += 1;
          }
        }
        let current = peak, depth = 0, seen = new Set();
        while (!current.essential) {
          assert.ok(!seen.has(current.peakIndex), `cycle in elder relation at ${domain.key}`);
          seen.add(current.peakIndex);
          const elder = current.elderPeakIndex;
          if (!Number.isInteger(elder) || !peakByIndex.has(elder) || elder === current.peakIndex) break;
          current = peakByIndex.get(elder);
          depth += 1;
          assert.ok(depth <= census8.peaks.length, `excessive elder depth at ${domain.key}`);
        }
        if (current.essential) {
          domain.essentialAncestorPeakIndex = current.peakIndex;
          domain.hierarchyDepth = depth;
          hierarchyDepths.push(depth);
        } else {
          domain.essentialAncestorPeakIndex = null;
          domain.hierarchyDepth = depth || null;
        }
      }

      const essentialSupports = essential.map(peak => ({
        peakIndex: peak.peakIndex,
        peakCells: peak.peakCells,
        supportCellCount: peak.supportCellCount,
        minimumB: peak.minimumB,
        spanToComponentMinimum: peak.spanToComponentMinimum,
        supportCellIndices: peak.supportCellIndices
      }));
      const essentialCoverage = new Set(essential.flatMap(peak => peak.supportCellIndices || []));
      const essentialSizes = essential.map(peak => peak.supportCellCount ?? 0);
      const essentialMain = [...essentialSupports].sort((a, b) => b.supportCellCount - a.supportCellCount || a.peakIndex - b.peakIndex)[0] || null;

      const structural = {};
      const uniqueCovered = new Set([...maps.E].filter(index => coverage[index] > 0));
      for (const [name, support] of Object.entries(supports)) {
        const domainOverlaps = domains.map(domain => domain.overlaps[name]);
        const uniqueIntersection = intersectCount(uniqueCovered, support);
        structural[name] = {
          supportCellCount: support.size,
          finiteDomainCountWithAnyOverlap: domainOverlaps.filter(item => item.cells > 0).length,
          finiteDomainCountWhollyInsideSupport: domainOverlaps.filter(item => item.fractionOfDomain === 1).length,
          membershipCellIntersectionCount: domainOverlaps.reduce((sum, item) => sum + item.cells, 0),
          medianFractionOfDomain: quantiles(domainOverlaps.map(item => item.fractionOfDomain)).median,
          p90FractionOfDomain: quantiles(domainOverlaps.map(item => item.fractionOfDomain)).p90,
          uniqueFiniteCoverageIntersectionCells: uniqueIntersection,
          uniqueFiniteCoverageFractionInsideSupport: support.size ? uniqueIntersection / support.size : null,
          uniqueFiniteCoverageFractionOfCoverage: uniqueCovered.size ? uniqueIntersection / uniqueCovered.size : null
        };
      }

      const record = {
        key: sourceState.key,
        event: eventName,
        stateIndex,
        role: sourceState.role,
        timeMs: anchor.timeMs,
        timeSeconds: anchor.timeMs / 1000,
        grid: sourceState.grid,
        inputMapHashes: sourceState.mapHashes,
        mapCounts: Object.fromEntries(Object.entries(supports).map(([name, support]) => [name, support.size])),
        finiteCount: finite.length,
        essentialCount: essential.length,
        finiteSizeFrequency: histogram(domains.map(domain => domain.size)),
        finiteSizeDistribution: quantiles(domains.map(domain => domain.size)),
        finiteContrastDistribution: quantiles(domains.map(domain => domain.contrast)),
        totalDomainCellMembership: domains.reduce((sum, domain) => sum + domain.size, 0),
        uniqueECellsCoveredByFiniteDomains: uniqueCovered.size,
        ECellCoverageFraction: maps.E.size ? uniqueCovered.size / maps.E.size : null,
        coverageMultiplicityHistogramIncludingZero: histogram(coverageValues),
        coverageMultiplicityOnCoveredCells: histogram(coverageValues.filter(count => count > 0)),
        domainOverlap: {
          nonzeroPairCount: finitePairs.length,
          properContainmentPairCount: containedPairCount,
          equalSetPairCount: equalPairCount,
          directedContainmentCount: pairwiseContainmentDirections,
          overlapJaccard: quantiles(overlapJaccard),
          overlapIntersectionCells: quantiles(overlapIntersection),
          perDomainOverlapDegree: quantiles([...overlapDegrees.values()]),
          maximumDomainOverlapDegree: Math.max(0, ...overlapDegrees.values())
        },
        mergeHierarchy: {
          directElderParentKind: directParentKind,
          directFiniteElderLobeContainment: finiteParentContainment,
          finiteLobeDepthToEssential: quantiles(hierarchyDepths),
          childCountPerPeak: quantiles([...peakChildren.values()].map(children => children.length)),
          peaksWithFiniteLobeChildren: [...peakChildren.values()].filter(children => children.length > 0).length
        },
        structuralOverlap: structural,
        essentialContext: {
          count: essential.length,
          supportSizeDistribution: quantiles(essentialSizes),
          essentialSupportUnionCells: essentialCoverage.size,
          essentialSupportUnionMatchesE: sameValues([...essentialCoverage], [...maps.E]),
          largestSupport: essentialMain ? {
            peakIndex: essentialMain.peakIndex,
            peakCells: essentialMain.peakCells,
            supportCellCount: essentialMain.supportCellCount,
            fractionOfE: maps.E.size ? essentialMain.supportCellCount / maps.E.size : null,
            minimumB: essentialMain.minimumB,
            spanToComponentMinimum: essentialMain.spanToComponentMinimum
          } : null
        },
        domains,
        essentialPeaks: essentialSupports,
        domainOverlapPairs: finitePairs
      };
      stateRecords.push(record);
      eventDomainStates.push(record);
    }
    eventStates.set(eventName, eventDomainStates);
  }

  const transitionRecords = census.temporalTransitions
    .filter(transition => transition.adjacency === 8)
    .sort((a, b) => a.event.localeCompare(b.event) || a.from.localeCompare(b.from));
  assert.equal(transitionRecords.length, 8, '8-neighbor transitions should cover both five-anchor events');
  const anyOverlapNodeKeys = new Set();
  for (const transition of transitionRecords) {
    for (const pair of transition.domainPairs) {
      anyOverlapNodeKeys.add(`${transition.from}-P${pair.sourcePeakIndex}`);
      anyOverlapNodeKeys.add(`${transition.to}-P${pair.targetPeakIndex}`);
    }
  }
  const familyAnalyses = {};
  for (const [flag, metricName] of RELATIONS) {
    const keys = [...nodeRecords.keys()];
    const union = new UnionFind(keys);
    const linkPairs = [];
    for (const transition of transitionRecords) {
      const matched = transition.domainPairs.filter(pair => pair[flag]);
      const seenSources = new Set(), seenTargets = new Set();
      for (const pair of matched) {
        assert.ok(!seenSources.has(pair.sourcePeakIndex), `${flag} source has multiple reciprocal matches`);
        assert.ok(!seenTargets.has(pair.targetPeakIndex), `${flag} target has multiple reciprocal matches`);
        seenSources.add(pair.sourcePeakIndex);
        seenTargets.add(pair.targetPeakIndex);
        const sourceKey = `${transition.from}-P${pair.sourcePeakIndex}`;
        const targetKey = `${transition.to}-P${pair.targetPeakIndex}`;
        assert.ok(nodeRecords.has(sourceKey) && nodeRecords.has(targetKey), `${flag} points to absent finite lobe`);
        union.union(sourceKey, targetKey);
        linkPairs.push({
          event: transition.event, from: transition.from, to: transition.to,
          sourcePeakIndex: pair.sourcePeakIndex, targetPeakIndex: pair.targetPeakIndex,
          intersection: pair.intersection, jaccard: pair.jaccard
        });
      }
    }
    const families = union.groups().map(nodes => {
      const records = nodes.map(key => nodeRecords.get(key).record).sort((a, b) => a.stateIndex - b.stateIndex || a.peakIndex - b.peakIndex);
      const event = records[0].event;
      assert.ok(records.every(record => record.event === event));
      const anchors = sortedSet(records.map(record => record.stateIndex));
      const countsByState = histogram(records.map(record => record.stateIndex));
      const id = `${event}-${metricName === 'intersection' ? 'RBI' : 'RBJ'}-${String(records[0].stateIndex + 1).padStart(2, '0')}-${records[0].peakIndex}`;
      for (const record of records) {
        assert.equal(record.familyIds[metricName], undefined, 'domain assigned to multiple families under one relation');
        record.familyIds[metricName] = id;
        record.familyAnchorCounts[metricName] = anchors.length;
      }
      return {
        id, event, nodes, anchorIndices: anchors,
        anchorCount: anchors.length,
        domainObservationCount: records.length,
        spanSeconds: records.length ? records.at(-1).timeSeconds - records[0].timeSeconds : 0,
        stateObservationCounts: countsByState,
        startsAtAnchor: anchors[0] + 1,
        endsAtAnchor: anchors.at(-1) + 1,
        reachesCommit: anchors.includes(4),
        hasEarlierAnchorBeforeCommit: anchors.includes(4) && anchors.some(index => index < 4),
        peakIndices: records.map(record => ({ state: record.stateKey, peakIndex: record.peakIndex })),
        sizes: records.map(record => record.size),
        contrasts: records.map(record => record.contrast),
        structuralFractions: Object.fromEntries(['F', 'G', 'H', 'I', 'principalPath', 'FminusI', 'HminusI']
          .map(name => [name, records.map(record => record.overlaps[name].fractionOfDomain)])),
        finiteEssentialAncestry: records.map(record => record.essentialAncestorPeakIndex)
      };
    });
    const familyByNode = new Map();
    for (const family of families) for (const node of family.nodes) familyByNode.set(node, family.id);

    const transitionStats = [];
    const splitMergeNodeKeys = new Set();
    const familyIncidents = new Map(families.map(family => [family.id, new Set()]));
    for (const transition of transitionRecords) {
      const pairs = transition.domainPairs;
      const out = new Map(), into = new Map();
      for (const pair of pairs) {
        out.set(pair.sourcePeakIndex, (out.get(pair.sourcePeakIndex) || 0) + 1);
        into.set(pair.targetPeakIndex, (into.get(pair.targetPeakIndex) || 0) + 1);
      }
      const splitSources = [...out].filter(([, degree]) => degree > 1).map(([peakIndex, degree]) => ({ peakIndex, degree }));
      const mergeTargets = [...into].filter(([, degree]) => degree > 1).map(([peakIndex, degree]) => ({ peakIndex, degree }));
      for (const split of splitSources) {
        const key = `${transition.from}-P${split.peakIndex}`;
        splitMergeNodeKeys.add(key);
        const family = familyByNode.get(key);
        familyIncidents.get(family)?.add(`${transition.from}->${transition.to}:split`);
        for (const pair of pairs.filter(item => item.sourcePeakIndex === split.peakIndex)) {
          const targetFamily = familyByNode.get(`${transition.to}-P${pair.targetPeakIndex}`);
          familyIncidents.get(targetFamily)?.add(`${transition.from}->${transition.to}:split`);
        }
      }
      for (const merge of mergeTargets) {
        const key = `${transition.to}-P${merge.peakIndex}`;
        splitMergeNodeKeys.add(key);
        const family = familyByNode.get(key);
        familyIncidents.get(family)?.add(`${transition.from}->${transition.to}:merge`);
        for (const pair of pairs.filter(item => item.targetPeakIndex === merge.peakIndex)) {
          const sourceFamily = familyByNode.get(`${transition.from}-P${pair.sourcePeakIndex}`);
          familyIncidents.get(sourceFamily)?.add(`${transition.from}->${transition.to}:merge`);
        }
      }
      transitionStats.push({
        event: transition.event, from: transition.from, to: transition.to,
        gapSeconds: transition.gapSeconds,
        sourceDomainCount: transition.sourceDomainCount,
        targetDomainCount: transition.targetDomainCount,
        nonzeroOverlapPairCount: transition.nonzeroPairCount,
        reciprocalBestMatchCount: pairs.filter(pair => pair[flag]).length,
        splitSources, mergeTargets,
        zeroOverlapSources: transition.zeroOverlapSourcePeakIndices.length,
        zeroOverlapTargets: transition.zeroOverlapTargetPeakIndices.length
      });
    }
    const familyIncidentRows = families.map(family => {
      const incidentTransitions = [...(familyIncidents.get(family.id) || [])].sort();
      const distinctTransitions = sortedSet(incidentTransitions.map(value => value.split(':')[0]));
      return {
        id: family.id,
        incidentCount: incidentTransitions.length,
        distinctTransitionCount: distinctTransitions.length,
        incidentTransitions
      };
    });
    const stateLengthRows = [];
    for (let anchorCount = 1; anchorCount <= 5; anchorCount += 1) {
      const group = families.filter(family => family.anchorCount === anchorCount);
      const nodesInGroup = group.flatMap(family => family.nodes.map(key => nodeRecords.get(key).record));
      stateLengthRows.push({
        savedAnchorCount: anchorCount,
        familyCount: group.length,
        domainObservations: nodesInGroup.length,
        sizeDistribution: quantiles(nodesInGroup.map(record => record.size)),
        contrastDistribution: quantiles(nodesInGroup.map(record => record.contrast)),
        sizeOneOrTwoObservations: nodesInGroup.filter(record => record.size <= 2).length,
        structuralOverlapFractions: Object.fromEntries(['F', 'G', 'H', 'I', 'principalPath', 'FminusI', 'HminusI']
          .map(name => [name, summaryOfFractions(nodesInGroup.map(record => record.overlaps[name].fractionOfDomain))]))
      });
    }
    const byEvent = [...eventStates.entries()].map(([event, states]) => {
      const eventFamilies = families.filter(family => family.event === event);
      const commit = states[4];
      const commitFamilyIds = new Set(commit.domains.map(domain => domain.familyId));
      const commitReached = eventFamilies.filter(family => family.reachesCommit);
      const commitFromEarlier = eventFamilies.filter(family => family.hasEarlierAnchorBeforeCommit);
      const isolatedAtCommit = commit.domains.filter(domain => domain.familyAnchorCounts[metricName] === 1).length;
      const singletonFamilies = eventFamilies.filter(family => family.anchorCount === 1);
      const singletonNodes = singletonFamilies.flatMap(family => family.nodes);
      const splitMergeFamilies = eventFamilies.filter(family => (familyIncidents.get(family.id)?.size || 0) > 0);
      const repeatedSplitMergeFamilies = eventFamilies.filter(family =>
        familyIncidentRows.find(row => row.id === family.id)?.distinctTransitionCount > 1);
      const winners = states.map(state => {
        const peakIndex = census.states.find(item => item.key === state.key).adjacencies['8'].winnerPeakIndex;
        const domain = state.domains.find(item => item.peakIndex === peakIndex);
        assert.ok(domain, `missing parent winner ${state.key}`);
        return {
          state: state.key, peakIndex,
          size: domain.size, contrast: domain.contrast,
          sizeMedian: state.finiteSizeDistribution.median,
          sizeP90: state.finiteSizeDistribution.p90,
          familyId: domain.familyIds[metricName],
          familyAnchorCount: domain.familyAnchorCounts[metricName],
          familyAnchorIndices: eventFamilies.find(family => family.id === domain.familyIds[metricName])?.anchorIndices
        };
      });
      return {
        event,
        totalDomains: states.reduce((sum, state) => sum + state.finiteCount, 0),
        familyCount: eventFamilies.length,
        singletonAnchorFamilies: eventFamilies.filter(family => family.anchorCount === 1).length,
        multiAnchorFamilies: eventFamilies.filter(family => family.anchorCount > 1).length,
        familiesByAnchorCount: Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
          const count = index + 1;
          return [count, eventFamilies.filter(family => family.anchorCount === count).length];
        })),
        singletonFamiliesWithAnyNonzeroOverlapCounterpart: singletonNodes.filter(key => anyOverlapNodeKeys.has(key)).length,
        singletonFamiliesWithoutAnyNonzeroOverlapCounterpart: singletonNodes.filter(key => !anyOverlapNodeKeys.has(key)).length,
        familiesReachingCommit: commitReached.length,
        familiesWithEarlierAnchorAtCommit: commitFromEarlier.length,
        commitDomainsWithEarlierReciprocalMatch: commit.domains.length - isolatedAtCommit,
        commitDomainsSingletonByThisRelation: isolatedAtCommit,
        singletonCommitDomainsWithAnyNonzeroPreviousOrNextOverlap: commit.domains.filter(domain =>
          domain.familyAnchorCounts[metricName] === 1 && anyOverlapNodeKeys.has(domain.key)).length,
        splitOrMergeDomainNodes: [...splitMergeNodeKeys].filter(key => key.startsWith(`${event}-S`)).length,
        familiesParticipatingInSplitOrMerge: splitMergeFamilies.length,
        familiesWithSplitOrMergeAcrossMultipleTransitions: repeatedSplitMergeFamilies.length,
        winnerReference: winners
      };
    });
    familyAnalyses[metricName] = {
      rule: flag,
      families,
      byEvent,
      distributionBySavedAnchorCount: stateLengthRows,
      transitionStats,
      familyIncidentRows,
      domainNodeCountWithSplitOrMerge: splitMergeNodeKeys.size,
      familiesWithAnySplitOrMerge: familyIncidentRows.filter(row => row.incidentCount > 0).length,
      familiesWithIncidentsOnMultipleTransitions: familyIncidentRows.filter(row => row.distinctTransitionCount > 1).length,
      links: linkPairs
    };
  }

  const perEventEssentials = [...eventStates.entries()].map(([event, states]) => ({
    event,
    states: states.map(state => ({
      state: state.key, timeMs: state.timeMs, ECellCount: state.mapCounts.E,
      essentialCount: state.essentialCount,
      largestSupportPeakIndex: state.essentialContext.largestSupport?.peakIndex ?? null,
      largestSupportPeakCell: state.essentialContext.largestSupport?.peakCells?.[0] ?? null,
      largestSupportCells: state.essentialContext.largestSupport?.supportCellCount ?? 0,
      largestSupportFractionOfE: state.essentialContext.largestSupport?.fractionOfE ?? null
    }))
  }));

  return {
    schema: 'ant-peak-saddle-domain-set-audit-v1',
    authority: {
      productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
      researchParent: '03e8a68f66392c320bbb67f53be05be7b7f27deb',
      branch: 'codex/ant-peak-saddle-domain-set-audit-20261029'
    },
    inputHashes: Object.fromEntries(Object.entries(INPUTS).map(([key, path]) => [path, digest(readFileSync(path))])),
    representation: {
      connectivity: 8,
      domainConstruction: 'exact parent B finite lobes; no filtering or recomputation with a new construction',
      cellCoordinates: 'row-major 96x96, x=column, y=row, same across frozen inputs',
      correspondence: 'existing parent reciprocal-best-by-intersection and reciprocal-best-by-Jaccard receipts; descriptive only',
      hierarchy: 'existing elderPeakIndex and mergePeakIndices; cell-set containment computed directly',
      structuralSets: ['E', 'F', 'G', 'H', 'I', 'principalPath', 'FminusI', 'HminusI'],
      notes: [
        'No 4-neighbor competition is recomputed; prior audit remains the sensitivity warning.',
        'Finite domains may overlap or nest; membership sum and unique E coverage are separate.',
        'Domain correspondences are not event identity or material identity.'
      ]
    },
    states: stateRecords,
    correspondenceFamilies: familyAnalyses,
    essentialAcrossEvents: perEventEssentials,
    totals: {
      states: stateRecords.length,
      finiteDomainObservations: stateRecords.reduce((sum, state) => sum + state.finiteCount, 0),
      finiteCellMemberships: stateRecords.reduce((sum, state) => sum + state.totalDomainCellMembership, 0),
      uniqueStateECellsCovered: stateRecords.reduce((sum, state) => sum + state.uniqueECellsCoveredByFiniteDomains, 0)
    }
  };
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function cellColor(value) {
  const level = Math.max(0, Math.min(255, Math.round(18 + 224 * Math.max(0, Math.min(1, value)))));
  return `rgb(${level},${level},${level})`;
}
function atlasSvg(data) {
  const input = readJsonGzip(INPUTS.frozen);
  const structure = readJsonGzip(INPUTS.structures);
  const census = readJsonGzip(INPUTS.census);
  const censusStates = new Map(census.states.map(state => [state.key, state]));
  const eventInputs = Object.values(input.events).sort((a, b) => Number(a.id) - Number(b.id));
  const cell = 3.5, mapSize = GRID * cell, panelWidth = 420, panelHeight = 432;
  const margin = 26, gap = 12;
  const width = margin * 2 + panelWidth * 5 + gap * 4;
  const height = 86 + margin + panelHeight * 2 + gap + 36;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,sans-serif;fill:#24323a}.title{font-size:22px;font-weight:700}.subtitle{font-size:12px;fill:#53636a}.panel{fill:#fff;stroke:#aeb9bd}.label{font-size:13px;font-weight:700}.small{font-size:10px}.tiny{font-size:8px}</style>',
    '<rect width="100%" height="100%" fill="#f5f7f7"/>',
    `<text x="${margin}" y="30" class="title">8-neighbor finite-domain ensemble · frozen B/E states</text>`,
    `<text x="${margin}" y="52" class="subtitle">All finite lobes shown with one shared boundary style; gray = B on fixed 0–1 scale, pale tint = E, dots = F, amber = selected I, white line = principal path. No rank coloring.</text>`,
    `<text x="${margin}" y="69" class="subtitle">Full 96×96 frame in every panel. I is a reference overlay; domain membership is a mathematical organization of B within E.</text>`
  ];
  for (let eventOffset = 0; eventOffset < eventInputs.length; eventOffset += 1) {
    const eventInput = eventInputs[eventOffset];
    const eventName = `P${eventInput.id}`;
    const structureEvent = Object.values(structure.events).find(event => event.id === `trail-plate-${eventInput.id}`);
    const states = data.states.filter(state => state.event === eventName).sort((a, b) => a.stateIndex - b.stateIndex);
    for (const state of states) {
      const anchor = eventInput.anchors[state.stateIndex];
      const frame = frameFor(structureEvent, anchor.timeMs);
      const sets = mapSets(anchor);
      const x0 = margin + state.stateIndex * (panelWidth + gap);
      const y0 = 88 + eventOffset * (panelHeight + gap);
      const mapX = x0 + 8, mapY = y0 + 28;
      out.push(`<rect x="${x0}" y="${y0}" width="${panelWidth}" height="${panelHeight}" rx="3" class="panel"/>`);
      out.push(`<text x="${x0 + 8}" y="${y0 + 17}" class="label">${xml(state.key)} · ${state.finiteCount} finite / ${state.essentialCount} essential</text>`);
      out.push(`<text x="${x0 + 8}" y="${y0 + 393}" class="small">${(state.timeMs / 1000).toFixed(6)} s · ${state.uniqueECellsCoveredByFiniteDomains}/${sets.E.size} E cells covered at least once</text>`);
      out.push(`<g shape-rendering="crispEdges">`);
      for (let i = 0; i < CELL_COUNT; i += 1) {
        const px = mapX + (i % GRID) * cell;
        const py = mapY + Math.floor(i / GRID) * cell;
        out.push(`<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${cellColor(sets.B[i])}"/>`);
        if (sets.E.has(i)) out.push(`<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="#b7d2cf" fill-opacity=".28"/>`);
      }
      out.push('</g>');
      const stroke = '#8b4058';
      for (const domain of state.domains) {
        const cells = new Set(nodeDomainCells(state.key, domain.peakIndex));
        const segments = [];
        for (const index of cells) {
          const column = index % GRID, row = Math.floor(index / GRID);
          const left = mapX + column * cell, top = mapY + row * cell;
          if (!cells.has(index - GRID) && row > 0) segments.push(`M${left},${top}h${cell}`);
          if (!cells.has(index + 1) && column < GRID - 1) segments.push(`M${left + cell},${top}v${cell}`);
          if (!cells.has(index + GRID) && row < GRID - 1) segments.push(`M${left + cell},${top + cell}h-${cell}`);
          if (!cells.has(index - 1) && column > 0) segments.push(`M${left},${top + cell}v-${cell}`);
        }
        if (segments.length) out.push(`<path d="${segments.join('')}" fill="none" stroke="${stroke}" stroke-opacity=".48" stroke-width=".7"/>`);
      }
      for (const index of sets.F) {
        const cx = mapX + (index % GRID + 0.5) * cell, cy = mapY + (Math.floor(index / GRID) + 0.5) * cell;
        out.push(`<circle cx="${cx}" cy="${cy}" r=".62" fill="#182f38" fill-opacity=".76"/>`);
      }
      for (const index of sets.I) {
        const cx = mapX + (index % GRID + 0.5) * cell, cy = mapY + (Math.floor(index / GRID) + 0.5) * cell;
        out.push(`<circle cx="${cx}" cy="${cy}" r="1.12" fill="#e29b35" fill-opacity=".9"/>`);
      }
      const pathPoints = frame.pathCells.map(index => `${mapX + (index % GRID + 0.5) * cell},${mapY + (Math.floor(index / GRID) + 0.5) * cell}`).join(' ');
      if (pathPoints) out.push(`<polyline points="${pathPoints}" fill="none" stroke="#fff" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/>`);
      out.push(`<rect x="${mapX}" y="${mapY}" width="${mapSize}" height="${mapSize}" fill="none" stroke="#66767b" stroke-width=".7"/>`);
      out.push(`<text x="${x0 + 8}" y="${y0 + 414}" class="tiny">Domain outlines are unranked; F is a diagnostic skeleton, I/path are production references.</text>`);
    }
  }
  out.push('</svg>');
  return `${out.join('\n')}\n`;

  function nodeDomainCells(stateKey, peakIndex) {
    const sourceState = censusStates.get(stateKey);
    const peak = sourceState.adjacencies['8'].peaks.find(item => item.peakIndex === peakIndex);
    assert.ok(peak?.finite);
    return peak.domainCellIndices;
  }
}

function selfTest() {
  const a = new Set([1, 2, 3]), b = new Set([2, 3]), c = new Set([8]);
  assert.equal(intersectCount(a, b), 2);
  assert.equal(intersectCount(a, c), 0);
  assert.deepEqual(relationOf(a, b), { intersection: 2, union: 3, leftWithinRight: false, rightWithinLeft: true, disjoint: false });
  assert.deepEqual(relationOf(b, new Set([2, 3])), { intersection: 2, union: 2, leftWithinRight: true, rightWithinLeft: true, disjoint: false });
  assert.deepEqual(relationOf(new Set([1, 2]), new Set([2, 3])), { intersection: 1, union: 3, leftWithinRight: false, rightWithinLeft: false, disjoint: false });
  assert.deepEqual(relationOf(a, c), { intersection: 0, union: 4, leftWithinRight: false, rightWithinLeft: false, disjoint: true });
  assert.equal(quantiles([1, 2, 3, 4, 5]).q1, 2);
  const uf = new UnionFind(['a', 'b', 'c']);
  uf.union('a', 'b');
  assert.deepEqual(uf.groups(), [['a', 'b'], ['c']]);
  console.log('ant-peak-saddle-domain-set-audit self-test passed');
}

function writeOutputs() {
  for (const path of Object.values(OUTPUTS)) assert.ok(!existsSync(path), `refusing to overwrite ${path}`);
  const data = buildData();
  const atlas = atlasSvg(data);
  const json = Buffer.from(`${JSON.stringify(data)}\n`, 'utf8');
  writeFileSync(OUTPUTS.data, gzipSync(json, { level: 9, mtime: 0 }));
  writeFileSync(OUTPUTS.atlas, atlas, 'utf8');
  console.log(JSON.stringify({
    states: data.totals.states,
    finiteDomainObservations: data.totals.finiteDomainObservations,
    finiteCellMemberships: data.totals.finiteCellMemberships,
    uniqueStateECellsCovered: data.totals.uniqueStateECellsCovered,
    reciprocalBestIntersection: data.correspondenceFamilies.intersection.byEvent,
    outputs: OUTPUTS
  }, null, 2));
}

function checkOutputs() {
  const data = buildData();
  const expectedJson = gzipSync(Buffer.from(`${JSON.stringify(data)}\n`, 'utf8'), { level: 9, mtime: 0 });
  const expectedAtlas = atlasSvg(data);
  assert.deepEqual(readFileSync(OUTPUTS.data), expectedJson, 'domain-set analysis gzip differs from deterministic rerun');
  assert.equal(readFileSync(OUTPUTS.atlas, 'utf8'), expectedAtlas, 'atlas differs from deterministic rerun');
  console.log('domain-set analysis and ensemble atlas rerun exact');
}

const flag = process.argv[2];
if (flag === '--self-test') selfTest();
else if (flag === '--write') writeOutputs();
else if (flag === '--check') checkOutputs();
else {
  console.error('usage: node scripts/ant-peak-saddle-domain-set-audit.js --self-test|--write|--check');
  process.exitCode = 2;
}
