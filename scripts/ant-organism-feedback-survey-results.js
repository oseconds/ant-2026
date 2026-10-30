import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/ant/evidence/2026-10-30-organism-feedback-candidate-survey/data');
const output = path.join(root, 'RESULTS.json'), arms = ['observe', 'adherence', 'following', 'decision', 'articulation', 'velocity'];
const read = p => JSON.parse((p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p)).toString());
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const median = xs => { const a = xs.filter(Number.isFinite).sort((x,y)=>x-y); return a.length ? a[Math.round((a.length-1)/2)] : null; };
const pct = (a,b) => Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a/b-1)*100 : null;
function collate() {
  const inputs = {}, data = {};
  for (const arm of arms) {
    const dir = path.join(root, arm), names = ['run-summary.json','auxiliary.json.gz','PARITY.json','PROVENANCE.json','seed20261005-G-raw.json.gz', ...(arm === 'observe' ? [] : ['ANALYSIS.json'])];
    for (const name of names) { const p = path.join(dir,name); assert(fs.existsSync(p), `missing ${arm}/${name}`); inputs[`${arm}/${name}`] = hash(p); }
    data[arm] = Object.fromEntries(names.map(name => [name, read(path.join(dir,name))]));
  }
  const summary = a => data[a]['run-summary.json'], aux = a => data[a]['auxiliary.json.gz'], analysis = a => data[a]['ANALYSIS.json'] || {};
  const final = a => summary(a).timeline.at(-1), baseline = summary('observe');
  const proximity = a => {
    const raw = data[a]['seed20261005-G-raw.json.gz'];
    let agentSamples = 0, neighborCount = 0, nearestSum = 0, nearestSamples = 0;
    for (const row of raw.positions) for (const ant of row.agents) {
      agentSamples++; let nearest = Infinity;
      for (const other of row.agents) if (other.id !== ant.id) {
        const distance = Math.hypot(other.x-ant.x,other.y-ant.y);
        nearest=Math.min(nearest,distance); if(distance<.085&&distance>1e-9)neighborCount++;
      }
      if(Number.isFinite(nearest)){nearestSamples++;nearestSum+=nearest;}
    }
    return {sampleRateHz:1,agentSamples,meanNeighborsWithinNativeSenseRadius085:neighborCount/agentSamples,
      meanNearestBodyDistance:nearestSamples?nearestSum/nearestSamples:null,
      meaning:'Post-tick body-center proximity, not exact native same-flow classification or a partner graph'};
  };
  const armTotals = Object.fromEntries(arms.map(a => {
    const s=summary(a), t=final(a), e=s.events||{}, f=s.fieldWrites||{}, g=aux(a).sourceGeometry||{};
    const checkpoint=a==='observe'?summary(a).checkpoints.at(-1):analysis(a).checkpointComparison?.at(-1)?.candidate;
    const raw={ travel:s.movement?.totalDistance, activeAntSeconds:s.movement?.activeAntSeconds, admissions:s.movement?.recruited,
      retirements:s.movement?.retired, sourceAcceptedDose:f.acceptedDose, authoredSourceDoseIntegral:g.authoredDose, sourceDoseAudit:null,
      fieldNodeSum:t.pheromoneNodeSum, reconstructedIntegral:t.reconstructedIntegral, footContacts:e.individualFeet,
      contactGroups:e.contactGroups, Csum:checkpoint?.C?.surfaceSum ?? checkpoint?.surface?.sum,
      plates:t.plateCountFromMaterial, nodules:e.sphereBirths, population:t.population, recruitmentLimit:aux(a).activation.at(-1).recruitmentLimit,
      activation:t.activation, activationEvidence:t.activationEvidence,
      freshDecisions:aux(a).candidates['decision:response'].total.calls,
      travelPerActiveAntSecond:s.movement.travelPerActiveAntSecond,
      sourceDosePerTravel:g.authoredDose/s.movement.totalDistance,
      proximity:proximity(a),
      finalRng:s.finalRng, invariants:s.invariants,
      material:{exposedCells:checkpoint?.material?.exposedCells,buriedLayerCells:checkpoint?.material?.buriedLayerCells,maxLocalLayerCount:checkpoint?.material?.maxLocalLayerCount},
      capTouches:f.capTouchCount,saturatedUpdates:f.saturatedUpdateCount,saturationLoss:f.saturationLoss,
      movementViolations:Object.fromEntries(['finiteViolations','speedCapViolations','turnCapViolations','overlapViolations','populationCeilingViolations'].map(k=>[k,s.movement?.[k]??null])) };
    const b=summary('observe'), bt=final('observe');
    return [a,{...raw, percentagesVsNeutral:a==='observe'?null:Object.fromEntries(Object.entries({travel:[raw.travel,b.movement?.totalDistance],activeAntSeconds:[raw.activeAntSeconds,b.movement?.activeAntSeconds],admissions:[raw.admissions,b.movement?.recruited],footContacts:[raw.footContacts,b.events?.individualFeet],sourceAcceptedDose:[raw.sourceAcceptedDose,b.fieldWrites?.acceptedDose],fieldNodeSum:[raw.fieldNodeSum,bt.pheromoneNodeSum],population:[raw.population,bt.population]}).map(([k,v])=>[k,pct(...v)]))}];
  }));
  const lateStats=a=>[300,600].map(sec=>{const fs=analysis(a).lateFrames.filter(x=>Math.abs(x.timeMs/1000-sec)<=22), ds=analysis(a).lateFrameDetails.filter(x=>fs.some(f=>f.tick===x.tick));
    const tops=fs.map(x=>x.D.separatedCenters015), top=(i,k)=>median(tops.map(x=>x[i]?.[k]));
    const near=fs.map(x=>{const i=x.D.globalMaximumWithinS?.index;return Number.isInteger(i)&&Math.hypot(i%96/95-.5,Math.floor(i/96)/95-.72)<=.037;});
    return {referenceSeconds:sec,anchorCount:fs.length,medianD1:top(0,'value'),medianD2OverD1:median(fs.map(x=>x.D.top2ToTop1)),medianD3OverD1:median(fs.map(x=>x.D.top3ToTop1)),
      medianEntryDistance:top(0,'entryDistance'),medianLayerCount:top(0,'priorLayers'),medianExactFeet20s:top(0,'exactFeet20s'),medianNearbyFeet20s:top(0,'nearbyFeet20sR037'),
      medianXOverlap:median(ds.map(x=>x.candidate?.X?.preexistingMaterialFraction)),entryNear037Count:near.filter(Boolean).length,entryNear037AllWindowAnchors:near.length>0&&near.every(Boolean),
      medianTop2EntryDistance:top(1,'entryDistance'),medianTop3EntryDistance:top(2,'entryDistance')};});
  const activationDiff=a=>{const aa=aux(a).activation,bb=aux('observe').activation,out=Object.fromEntries(['activation','evidence','recruitmentLimit','desiredPopulation'].map(k=>{const xs=aa.map((x,i)=>x[k]-bb[i][k]);const i=xs.findIndex(v=>v!==0);return[k,{firstChangedTimeMs:i<0?null:aa[i].timeMs,samples:xs.length,changedSamples:xs.filter(Boolean).length,maxAbs:Math.max(0,...xs.map(Math.abs))}]}));
    const t=summary(a).timeline,b=baseline.timeline, first=k=>{const i=t.findIndex((x,j)=>x[k]!==b[j][k]);return i<0?null:t[i].simulationTimeSeconds*1000;};
    out.admissions={firstChangedTimeMs:first('recruitedThisSecond')};out.population={firstChangedTimeMs:first('population')};return out;};
  const candidates=Object.fromEntries(arms.slice(1).map(a=>{const an=analysis(a), ax=aux(a), lp=an.locomotionAndPopulation||{}, last=an.checkpointComparison?.at(-1)?.maps||{}, birth=an.actualBirthMasks||[];
    return [a,{candidateAggregates:Object.fromEntries(Object.entries(ax.candidates||{}).map(([k,v])=>[k,{total:v.total,firstBinding:v.firstBinding,firstChanged:v.firstChanged}])),
      motor:ax.motor,actualFreshDecisionCount:ax.candidates['decision:response'].total.calls,organism:{firstPositionDivergence:lp.firstPositionDivergence,firstAdherenceDivergence:lp.firstAdherenceDivergence,firstContactDivergence:lp.firstContactDivergence,
        firstPopulationDifference:activationDiff(a).population.firstChangedTimeMs,firstAdmissionDifference:activationDiff(a).admissions.firstChangedTimeMs},
      firstChanged:{position:lp.firstPositionDivergence,adherence:lp.firstAdherenceDivergence,contact:lp.firstContactDivergence},activationVsNeutral:activationDiff(a),
      pheromoneNormalizedL1:last.pheromone?.normalizedL1??null,occupancyNormalizedL1:last['occupancy.cumulativeAntSeconds']?.normalizedL1??null,
      lateFrameCounts:{frames:an.lateFrames?.length??0,details:an.lateFrameDetails?.length??0}, lateLayerCounts:an.lateFrameDetails?.map(x=>({tick:x.tick,timeMs:x.timeMs,exactParity:x.delta?.preMaterialLayers?.exactParity??null})),
      lateExactParityCounts:Object.fromEntries(['B','C','D','E','F','preMaterialLayers'].map(k=>[k,an.lateFrameDetails.filter(x=>x.delta[k].exactParity).length])),
      plateOrdinalMaskTimeEqualCount:birth.filter(x=>x.exactMaskParity&&x.controlBirthTimeMs===x.candidateBirthTimeMs).length,
      opportunity300_600:lateStats(a),movementViolations:Object.fromEntries(['finiteViolations','speedCapViolations','turnCapViolations','overlapViolations','populationCeilingViolations'].map(k=>[k,summary(a).movement?.[k]??null]))}];}));
  const result={schema:'ant-organism-feedback-survey-results-v1',protocol:{seed:20261005,horizonSeconds:600,tickHz:60,arms,comparison:'saved neutral observation and saved candidate worlds',sourceDoseAudit:null,
      sourceDoseNote:'Authored request-dose integral and accepted field dose are separate; no conservation residual is inferred.'},inputs,armTotals,candidates,
    priorAB:{reference:'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/RESULTS.json',imported:false,note:'A/B source cohorts remain separate; no rerun or imported numeric result.'},
    limits:{savedDataOnly:true,plateOrdinalMaskTimeEqualityIsNotMatchedCausalEvents:true,activationAndAdmissionsSeparated:true,opportunityMedianConvention:'nearest-rank-style middle element using Math.round((n-1)/2)',lateOpportunityWindowSeconds:22}};
  assert(data.observe['PARITY.json'].status==='PASS','neutral parity receipt not PASS');
  for(const a of arms.slice(1)) {
    assert(data[a]['PARITY.json'].status==='PASS',`${a}: parity receipt not PASS`);
    assert(Number.isFinite(candidates[a].actualFreshDecisionCount),`${a}: actual decision count required`);
    assert(candidates[a].opportunity300_600.every(x=>x.anchorCount===20),`${a}: paired 20-anchor windows`);
    assert(candidates[a].lateFrameCounts.details===40,`${a}: complete late arrays`);
    assert(Object.values(armTotals[a].movementViolations).every(x=>x===0),`${a}: native guard/finite violations`);
    assert(Number.isFinite(armTotals[a].Csum)&&Number.isFinite(armTotals[a].recruitmentLimit),`${a}: native C sum and limit required`);
  }
  return `${JSON.stringify(result,null,2)}\n`;
}
const serialized=collate();
if(process.argv.includes('--check')) { assert(fs.existsSync(output),'RESULTS.json missing'); assert(fs.readFileSync(output,'utf8')===serialized,'RESULTS.json differs from deterministic collation'); console.log('RESULTS.json matches saved data.'); }
else { assert(!fs.existsSync(output),'RESULTS.json exists; refusing overwrite'); fs.writeFileSync(output,serialized,{flag:'wx'}); console.log('Wrote RESULTS.json.'); }
