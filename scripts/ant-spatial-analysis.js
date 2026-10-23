import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCurvatureAtScale } from './ant-morphology-plates.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WINDOWS = [[0, 120, 'early-0-120'], [300, 600, 'late-300-600']];
const LONG_WINDOWS = [[600,1200,'late-600-1200'],[1200,1800,'late-1200-1800'],
  [1800,3600,'late-1800-3600'],[3600,7200,'late-3600-7200']];
const LAGS = [30, 60, 120];
const GRID = 96;
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const finite = values => values.filter(Number.isFinite);
const mean = values => finite(values).length ? finite(values).reduce((a, b) => a + b, 0) / finite(values).length : null;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function corr(a, b) {
  const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  const xx = pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0), yy = pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0);
  return xx > 0 && yy > 0 ? pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / Math.sqrt(xx * yy) : null;
}

function summarizeFrames(frames) {
  const rows = frames.map(({ second, ants, pheromone }) => ({ second, antCount: ants.count,
    centroidX: ants.centroid.x, centroidY: ants.centroid.y,
    centroidRadius: Math.hypot(ants.centroid.relativeToNest.x, ants.centroid.relativeToNest.y),
    gyrationRadius: ants.gyrationRadius, rmsRadiusFromNest: ants.rmsRadiusFromNest,
    covarianceXX: ants.covariance.xx, covarianceXY: ants.covariance.xy, covarianceYY: ants.covariance.yy,
    covarianceAxisAngle: ants.majorAxisAngle,
    covarianceAxisCoherence: Number.isFinite(ants.majorAxisAngle) ? Math.cos(2 * ants.majorAxisAngle) : null,
    nestNearFraction: ants.nestNearFraction,
    ...Object.fromEntries(ants.angularOccupancy.sectors.map((value, i) => [`angularSector${String(i).padStart(2, '0')}`, value])),
    polarization: ants.velocityPolarization.magnitude, polarizationAngle: ants.velocityPolarization.angle,
    angularMomentumSigned: ants.angularMomentum.signed, angularMomentumAbsolute: ants.angularMomentum.absolute,
    pheromoneMass: pheromone.mass, pheromoneCentroidX: pheromone.centroid?.x ?? null,
    pheromoneCentroidY: pheromone.centroid?.y ?? null, pheromoneCovXX: pheromone.covariance?.xx ?? null,
    pheromoneCovXY: pheromone.covariance?.xy ?? null, pheromoneCovYY: pheromone.covariance?.yy ?? null,
    pheromoneOrientation: pheromone.orientation?.angle ?? null,
    pheromoneOrientationCoherence: Number.isFinite(pheromone.orientation?.angle) ? Math.cos(2 * pheromone.orientation.angle) : null,
    pheromoneCentroidDistance: pheromone.centroid ? Math.hypot(ants.centroid.x - pheromone.centroid.x, ants.centroid.y - pheromone.centroid.y) : null,
    ...Object.fromEntries(Object.entries(frames.find(f => f.second === second)?.material || {}).map(([k, v]) => [`material_${k}`, v])) }));
  return rows;
}

function windowSummary(rows, start, end) {
  const selected = rows.filter(r => r.second > start && r.second <= end);
  const keys = ['antCount','centroidX','centroidY','centroidRadius','gyrationRadius','rmsRadiusFromNest','covarianceXX','covarianceXY','covarianceYY','covarianceAxisCoherence','nestNearFraction','polarization','angularMomentumSigned','angularMomentumAbsolute','pheromoneMass','pheromoneCentroidDistance','pheromoneOrientationCoherence'];
  const result = { startSecond: start, endSecond: end, samples: selected.length };
  for (const key of keys) result[key] = mean(selected.map(r => r[key]));
  for (let sector = 0; sector < 16; sector += 1) result[`angularSector${String(sector).padStart(2,'0')}`] = mean(selected.map(r => r[`angularSector${String(sector).padStart(2,'0')}`]));
  const axes = finite(selected.map(r => r.covarianceAxisAngle));
  result.covarianceAxisMeanAngle = axes.length ? 0.5 * Math.atan2(mean(axes.map(a=>Math.sin(2*a))),mean(axes.map(a=>Math.cos(2*a)))) : null;
  const sectors = Array.from({length:16},(_,i)=>result[`angularSector${String(i).padStart(2,'0')}`] ?? 0);
  result.angularSectorDominant = sectors.indexOf(Math.max(...sectors));
  result.angularSectorPeakFraction = Math.max(...sectors);
  return result;
}

function temporal(rows) {
  const acf = [];
  const series=['centroidX','centroidY','gyrationRadius','angularMomentumSigned','covarianceAxisCoherence','pheromoneMass','pheromoneCentroidX','pheromoneCentroidY', ...Array.from({length:16},(_,i)=>`angularSector${String(i).padStart(2,'0')}`)];
  for (const lag of LAGS) for (const key of series) {
    const index = Math.round(lag); acf.push({ series: key, lagSeconds: lag, correlation: corr(rows.slice(0, -index).map(r => r[key]), rows.slice(index).map(r => r[key])) });
  }
  const laggedSpatial = [];
  for (const lag of [0, 1, 5, 15, 30, 60]) {
    const n = rows.length - lag;
    laggedSpatial.push({ lagSeconds: lag, centroidDistanceMean: mean(rows.slice(0, n).map((r, i) => {
      const later = rows[i + lag]; return Number.isFinite(r.centroidX) && Number.isFinite(later.pheromoneCentroidX)
        ? Math.hypot(r.centroidX - later.pheromoneCentroidX, r.centroidY - later.pheromoneCentroidY) : NaN;
    })), centroidCrossCorrelationX: corr(rows.slice(0,n).map(r=>r.centroidX), rows.slice(lag).map(r=>r.pheromoneCentroidX)),
    centroidCrossCorrelationY: corr(rows.slice(0,n).map(r=>r.centroidY), rows.slice(lag).map(r=>r.pheromoneCentroidY)) });
  }
  return { autocorrelation: acf, antPheromoneLaggedSpatial: laggedSpatial };
}

function materialAtCheckpoint(checkpoint, time, kind) {
  const snapshot = checkpoint.publicSnapshot;
  if(kind==='candidate'){
    const candidate=snapshot.surfacePlates?.candidate;
    if(!candidate)return {second:time,kind,available:false,count:null};
    const points=candidate.pathPoints;
    assert.ok(Array.isArray(points)&&points.length>=2&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),`checkpoint ${time}: malformed candidate path`);
    const c03=analyzeCurvatureAtScale(points,0.03),c10=analyzeCurvatureAtScale(points,0.1);
    return {second:time,kind,available:true,count:1,unionCells:null,topLayerByCell:[],plates:[],localHistoryCondition:null,
      perPlate:[{source:candidate.source,target:candidate.target,geodesicLength:candidate.geodesicLength,stableSeconds:candidate.stableSeconds,
        similarity:candidate.similarity,footContacts:candidate.footContacts,meanChemical:candidate.meanChemical,meanSupport:candidate.meanSupport,
        qualified:candidate.qualified,birthReady:candidate.birthReady,curvature03:c03.meanAbsoluteTurnRadiansPerWorldUnit,
        curvature10:c10.meanAbsoluteTurnRadiansPerWorldUnit,endpointDirection:Math.atan2(points.at(-1).y-points[0].y,points.at(-1).x-points[0].x),pathPoints:points}]};
  }
  const plates = snapshot.surfacePlates?.plates;
  if (!Array.isArray(plates)) return { second: time, kind, available: false, count: null };
  const union = new Set(), perPlate = [], principal = [];
  for (const plate of plates) {
    const byIndex = new Map(plate.centerline.map(n => [n.index, n]));
    const points = plate.principalPath.map(index => byIndex.get(index)).filter(Boolean).map(n => ({x:n.x,y:n.y}));
    const direction = points.length > 1 ? Math.atan2(points.at(-1).y-points[0].y, points.at(-1).x-points[0].x) : null;
    const a = analyzeCurvatureAtScale(plate.principalPath.map(index => {
      const node = byIndex.get(index); return { x: node.x, y: node.y };
    }), 0.03);
    const b = analyzeCurvatureAtScale(plate.principalPath.map(index => {
      const node = byIndex.get(index); return { x: node.x, y: node.y };
    }), 0.1);
    const mask = new Set(); plate.mask.forEach((v, i) => { if (v) { mask.add(i); union.add(i); } });
    principal.push({ id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, mask, direction, principalPoints:plate.principalPath.map(index=>byIndex.get(index)), curvature03: a.meanAbsoluteTurnRadiansPerWorldUnit, curvature10: b.meanAbsoluteTurnRadiansPerWorldUnit });
    perPlate.push({ id: plate.id, direction, curvature03: a.meanAbsoluteTurnRadiansPerWorldUnit, curvature10: b.meanAbsoluteTurnRadiansPerWorldUnit });
  }
  const top = snapshot.stratigraphy?.stratigraphy?.topLayerByCell || [];
  const layerCounts = snapshot.stratigraphy?.stratigraphy?.layerCountByCell || [];
  const localHistoryMultiplier = Array.from(layerCounts, count => 1 - 0.10 * (1 - Math.exp(-count / 4)));
  return { second: time, kind, available: true, count: plates.length, unionCells: union.size,
    topLayerByCell: Array.from(top), perPlate, plates: principal.map(p => ({...p, mask: [...p.mask]})),
    localHistoryCondition: layerCounts.length ? { cells:layerCounts.length, meanLayerCount:mean(layerCounts),
      maximumLayerCount:Math.max(...layerCounts), occupiedCellFraction:layerCounts.filter(v=>v>0).length/layerCounts.length,
      meanDesiredSpeedMultiplier:mean(localHistoryMultiplier), multiplierP10:quantile(localHistoryMultiplier,0.1),
      multiplierP90:quantile(localHistoryMultiplier,0.9), multiplierRange:Math.max(...localHistoryMultiplier)-Math.min(...localHistoryMultiplier),
      definition:'m(L) = 1 - 0.10 * (1 - exp(-L / 4)); public cell layer count including top layer; authored condition proxy, not measured friction.' } : null };
}

function compareMaterialCheckpoints(checkpoints) {
  const byKind = new Map();
  for (const current of checkpoints.filter(c => c.available).sort((a,b)=>a.second-b.second)) {
    if(current.kind==='candidate'){current.historyFromPreviousCheckpoint=null;continue;}
    const previous = byKind.get(current.kind);
    const currentUnion = new Set(current.plates.flatMap(p=>p.mask));
    const priorUnion = previous ? new Set(previous.plates.flatMap(p=>p.mask)) : new Set();
    const intersection = [...currentUnion].filter(i=>priorUnion.has(i)).length;
    const topBefore = previous?.topLayerByCell || [];
    const topChanged = previous ? current.topLayerByCell.reduce((n,id,i)=>n+Number(id!==topBefore[i]),0) : null;
    const angles = current.perPlate.map(p=>p.direction).filter(Number.isFinite);
    current.historyFromPreviousCheckpoint = previous ? {
      previousSecond: previous.second, unionOverlapCells: intersection,
      newlyOccupiedCells: currentUnion.size-intersection,
      unionRetentionFraction: priorUnion.size ? intersection/priorUnion.size : null,
      topIdentityChangedCells: topChanged,
      principalEndpointDirection: angles.length ? Math.atan2(mean(angles.map(Math.sin)),mean(angles.map(Math.cos))) : null,
      principalEndpointDirectionResultant: angles.length ? Math.hypot(mean(angles.map(Math.sin)),mean(angles.map(Math.cos))) : null,
      directionCount: angles.length,
      note: 'Per-Plate endpoint direction is frozen geometry; no Plate identity is tracked as a trajectory.'
    } : null;
    byKind.set(current.kind,current);
  }
  return checkpoints;
}

function validateResult(result, path) {
  assert.equal(result.schemaVersion, 1, `${path}: unsupported result schema`);
  assert.ok(Array.isArray(result.frames) && result.frames.length, `${path}: missing frames`);
  assert.ok(Array.isArray(result.trajectory10Hz), `${path}: missing trajectory10Hz`);
  for (const frame of result.frames) {
    assert.ok(Number.isFinite(frame.second) && frame.ants?.centroid && frame.pheromone, `${path}: malformed frame`);
    assert.ok(Array.isArray(frame.ants.angularOccupancy?.sectors) && frame.ants.angularOccupancy.sectors.length === 16, `${path}: expected 16 angular sectors`);
  }
}

export function analyzeResult(result, inputPath = 'result.json') {
  validateResult(result, inputPath);
  const rows = summarizeFrames(result.frames);
  const windows = [...WINDOWS,...(result.seconds>=7200?LONG_WINDOWS:[])].map(([a,b,label]) => ({ label, ...windowSummary(rows,a,b) }));
  const windows60 = [];
  for (let start = 0; start < result.seconds; start += 60) windows60.push(windowSummary(rows, start, Math.min(start + 60, result.seconds)));
  const checkpoints = compareMaterialCheckpoints(result.checkpoints.flatMap(c => [
    materialAtCheckpoint(c, c.second, 'production'), materialAtCheckpoint(c, c.second, 'candidate')
  ]));
  const trajectory = result.trajectory10Hz.flatMap(frame => frame.agents.map(([id,x,y,heading]) => ({ second: frame.tick / 60, id, x, y, heading })));
  const material = checkpoints.map(c => ({ second:c.second, kind:c.kind, available:c.available, count:c.count, unionCells:c.unionCells,
    meanCurvature03:mean(c.perPlate?.map(p=>p.curvature03)||[]), meanCurvature10:mean(c.perPlate?.map(p=>p.curvature10)||[]),
    candidateObservation:c.kind==='candidate'&&c.available?c.perPlate[0]:null,
    localHistoryCondition:c.localHistoryCondition, historyFromPreviousCheckpoint:c.historyFromPreviousCheckpoint }));
  const finalProduction=result.checkpoints.at(-1)?.publicSnapshot?.surfacePlates?.plates||[];
  const finalDiagnostics=result.checkpoints.at(-1)?.publicSnapshot?.stratigraphy?.diagnostics||{};
  const lastPlateBirthMs=finalProduction.length?Math.max(...finalProduction.map(p=>p.bornAtSimulationTimeMs).filter(Number.isFinite)):null;
  const momentumWindows=windows60.map(w=>w.angularMomentumSigned);
  const signs=momentumWindows.filter(Number.isFinite).map(v=>Math.abs(v)<1e-9?0:Math.sign(v)).filter(Boolean);
  const majority=Math.sign(signs.reduce((a,b)=>a+b,0));
  let longest=0, current=0;
  for(const sign of signs){current=sign===majority?current+1:0;longest=Math.max(longest,current);}
  return { inputPath, label: result.label, seed: result.seed, seconds: result.seconds, receipt: result.receipt,
    sourceHashes: result.sourceHashes, fixedWindows: windows, windows60,
    withinRunDynamics:{ signedAngularMomentumMean:mean(momentumWindows), positiveWindowFraction:signs.length?signs.filter(x=>x>0).length/signs.length:null,
      negativeWindowFraction:signs.length?signs.filter(x=>x<0).length/signs.length:null, majoritySign:majority||null,
      majoritySignWindowFraction:signs.length?signs.filter(x=>x===majority).length/signs.length:null,
      longestConsecutiveMajoritySignWindows:longest, covarianceAxisMeanAngle:windows60.map(w=>w.covarianceAxisMeanAngle),
      angularSectorDominant:windows60.map(w=>w.angularSectorDominant), angularSectorPeakFraction:mean(windows60.map(w=>w.angularSectorPeakFraction)) },
    plateCap:{finalCount:finalProduction.length,maxPlatesReached:finalDiagnostics.maxPlatesReached===true,
      lastImmutablePlateBirthTimeMs:lastPlateBirthMs,lastImmutablePlateBirthTimeSeconds:lastPlateBirthMs===null?null:lastPlateBirthMs/1000},
    temporal: temporal(rows), rows, trajectory, material, checkpoints };
}

function csv(rows) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const q = value => typeof value === 'string' && /[",\n]/.test(value) ? `"${value.replaceAll('"','""')}"` : value ?? '';
  return `${keys.join(',')}\n${rows.map(row => keys.map(k => q(row[k])).join(',')).join('\n')}\n`;
}
function quantile(values,p){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),i=(s.length-1)*p,l=Math.floor(i);return s[l]+(s[Math.min(l+1,s.length-1)]-s[l])*(i-l);}

function plotSvg(run, type) {
  const width=900,height=900,pad=35,scale=width-2*pad;
  const lines=[];
  if (type === 'trajectories') {
    const byId=new Map(); for(const p of run.trajectory){const a=byId.get(p.id)||[];a.push(p);byId.set(p.id,a);}
    for(const [id,pts] of byId){const d=pts.filter((_,i)=>i%3===0).map((p,i)=>`${i?'L':'M'}${(pad+p.x*scale).toFixed(1)},${(pad+(1-p.y)*scale).toFixed(1)}`).join(' '); lines.push(`<path d="${d}" fill="none" stroke="hsl(${hash(id)%360} 65% 42%)" stroke-width="0.7" opacity=".42"/>`);}
  } else if(type==='pheromone') {
    const pts=run.rows.filter(r=>r.pheromoneMass>0); const max=Math.max(1e-12,...pts.map(p=>p.pheromoneMass));
    lines.push(pts.map(p=>`<circle cx="${pad+p.pheromoneCentroidX*scale}" cy="${pad+(1-p.pheromoneCentroidY)*scale}" r="${1+Math.sqrt(p.pheromoneMass/max)*4}" fill="#2768a8" opacity=".22"/>`).join(''));
  } else {
    const [kind, secondText] = type.split('@');
    const cp=run.checkpoints.find(c=>c.kind===kind&&c.available&&c.second===Number(secondText)); if(cp) {
      if(kind==='production'){
        const union=new Set(cp.plates.flatMap(plate=>plate.mask));
        lines.push([...union].map(i=>`<rect x="${pad+(i%GRID)/95*scale}" y="${pad+(1-Math.floor(i/GRID)/95)*scale}" width="${scale/95}" height="${scale/95}" fill="#5b6" opacity=".34"/>`).join(''));
      }else{
        for(const plate of run.checkpoints.find(c=>c.kind==='production'&&c.second===cp.second)?.plates||[]){
          const d=plate.principalPoints.map((p,i)=>`${i?'L':'M'}${pad+p.x*scale},${pad+(1-p.y)*scale}`).join(' ');
          lines.push(`<path d="${d}" fill="none" stroke="#4a7" stroke-width="1.5" opacity=".75"/>`);
        }
        const d=cp.perPlate[0].pathPoints.map((p,i)=>`${i?'L':'M'}${pad+p.x*scale},${pad+(1-p.y)*scale}`).join(' ');
        lines.push(`<path d="${d}" fill="none" stroke="#d23" stroke-width="2.5"/>`);
      }
    }
  }
  const title=type==='trajectories'?'Ant trajectories, 10 Hz':type==='pheromone'?'Pheromone centroid and relative mass':kindTitle(type);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="${pad}" y="22" font-family="sans-serif" font-size="15">${title} · ${esc(run.label)} · seed ${run.seed}</text><rect x="${pad}" y="${pad}" width="${scale}" height="${scale}" fill="none" stroke="#555"/>${lines.join('')}</svg>\n`;
}
function kindTitle(type){const [kind,second]=type.split('@');return kind==='candidate'?`Candidate path red / born principal paths green at ${second} s`:`Production mask union at ${second} s`;}
function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h);}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

function longRunComparisonSvg(runs){
  const panel=510,pad=38,width=panel*3,height=panel*2+50, colors=['#2864a0','#cb512c'];
  const panels=[];
  runs.forEach((run,row)=>{
    const y0=40+row*panel;
    const trajectory=run.trajectory.reduce((m,p)=>{const a=m.get(p.id)||[];a.push(p);m.set(p.id,a);return m;},new Map());
    const trajectoryPaths=[...trajectory.values()].map(points=>{
      const d=points.filter((_,i)=>i%30===0).map((p,i)=>`${i?'L':'M'}${pad+p.x*(panel-pad*2)},${y0+pad+(1-p.y)*(panel-pad*2)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${colors[row]}" stroke-width=".55" opacity=".28"/>`;
    }).join('');
    panels.push(`<text x="${pad}" y="${y0+19}" font-family="sans-serif" font-size="15">${esc(run.label)} · ${run.seed} · 10 Hz paths sampled every 3 s</text><rect x="${pad}" y="${y0+pad}" width="${panel-pad*2}" height="${panel-pad*2}" fill="white" stroke="#555"/>${trajectoryPaths}`);
    for(const [column,second] of [[1,3600],[2,7200]]){
      const cp=run.checkpoints.find(c=>c.kind==='production'&&c.second===second&&c.available), ox=column*panel;
      const cells=new Set(cp?.plates.flatMap(p=>p.mask)||[]);
      const rects=[...cells].map(i=>`<rect x="${ox+pad+(i%GRID)/95*(panel-pad*2)}" y="${y0+pad+(1-Math.floor(i/GRID)/95)*(panel-pad*2)}" width="${(panel-pad*2)/95}" height="${(panel-pad*2)/95}" fill="${colors[row]}" opacity=".42"/>`).join('');
      panels.push(`<text x="${ox+pad}" y="${y0+19}" font-family="sans-serif" font-size="15">Born Plate mask union at ${second/60} min · n=${cp?.count??'missing'}</text><rect x="${ox+pad}" y="${y0+pad}" width="${panel-pad*2}" height="${panel-pad*2}" fill="white" stroke="#555"/>${rects}`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/>${panels.join('')}<text x="${width-430}" y="${height-8}" font-family="sans-serif" font-size="12">Fixed [0,1]² viewport; model +y is drawn upward.</text></svg>\n`;
}

export async function writeAnalysis(inputPaths, outputDir) {
  const out=resolve(outputDir); const runs=[];
  const toolHashes = {};
  for (const path of ['scripts/ant-spatial-analysis.js','scripts/ant-morphology-plates.js']) toolHashes[path]=sha256(await readFile(resolve(ROOT,path)));
  for(const inputPath of inputPaths){const full=resolve(inputPath);const bytes=await readFile(full);const result=JSON.parse(bytes.toString('utf8'));const run=analyzeResult(result,full);run.inputSha256=sha256(bytes);run.toolHashes=toolHashes;runs.push(run);
  }
  await mkdir(out);
  for(const run of runs){
    const folder=resolve(out,`${safe(run.label)}-seed-${run.seed}`);await mkdir(folder);
    await writeFile(resolve(folder,'temporal.csv'),csv(run.rows));await writeFile(resolve(folder,'windows-60s.csv'),csv(run.windows60));
    await writeFile(resolve(folder,'summary.json'),json({inputPath:run.inputPath,inputSha256:run.inputSha256,label:run.label,seed:run.seed,seconds:run.seconds,receipt:run.receipt,sourceHashes:run.sourceHashes,toolHashes:run.toolHashes,fixedWindows:run.fixedWindows,withinRunDynamics:run.withinRunDynamics,plateCap:run.plateCap,temporal:run.temporal,material:run.material}));
    for(const type of ['trajectories','pheromone']) await writeFile(resolve(folder,`${type}.svg`),plotSvg(run,type));
    for(const kind of ['production','candidate']) for(const checkpoint of run.checkpoints.filter(c=>c.kind===kind&&c.available))
      await writeFile(resolve(folder,`${kind==='candidate'?'candidate-overlay':'production'}-${checkpoint.second}s.svg`),plotSvg(run,`${kind}@${checkpoint.second}`));
  }
  await writeFile(resolve(out,'comparison.csv'),csv(runs.flatMap(r=>r.fixedWindows.map(w=>({label:r.label,seed:r.seed,...w})))));
  if(runs.length===2&&runs.every(r=>r.seconds>=7200)) await writeFile(resolve(out,'long-run-fixed-view.svg'),longRunComparisonSvg(runs));
  return runs.map(r=>({label:r.label,seed:r.seed,fixedWindows:r.fixedWindows,output:resolve(out,`${safe(r.label)}-seed-${r.seed}`)}));
}
function safe(value){return String(value||'run').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'');}

async function main(){
  const args=process.argv.slice(2), sep=args.indexOf('--output');
  assert.ok(sep>0&&args[sep+1], 'Usage: node scripts/ant-spatial-analysis.js <result.json>... --output <directory>');
  const inputs=args.slice(0,sep), out=args[sep+1]; assert.ok(inputs.length,'Pass explicit result paths; inputs are never globbed.');
  console.log(json(await writeAnalysis(inputs,out)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
