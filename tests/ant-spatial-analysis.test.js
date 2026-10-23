import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResult } from '../scripts/ant-spatial-analysis.js';

const frame = second => ({ second, ants: { count:1, centroid:{x:.5,y:.5,relativeToNest:{x:0,y:0}}, gyrationRadius:0,
  rmsRadiusFromNest:0,covariance:{xx:0,xy:0,yy:0},majorAxisAngle:null,nestNearFraction:1,
  angularOccupancy:{sectors:Array(16).fill(0)},velocityPolarization:{magnitude:0,angle:null},angularMomentum:{signed:0,absolute:0} },
  pheromone:{mass:0,centroid:{x:.5,y:.5},covariance:{xx:0,xy:0,yy:0},orientation:null},material:{} });

test('summarizes complete 1 Hz run windows and preserves wrapped axes as doubled-angle coherence', () => {
  const frames = Array.from({length:600},(_,i)=>frame(i+1));
  frames[10].ants.majorAxisAngle = Math.PI/2-.01;
  frames[11].ants.majorAxisAngle = -Math.PI/2+.01;
  const run = analyzeResult({schemaVersion:1,seed:7,seconds:600,label:'unit',frames,trajectory10Hz:[],checkpoints:[],receipt:{},sourceHashes:{}},'fixture');
  assert.equal(run.fixedWindows[0].samples,120);
  assert.equal(run.fixedWindows[1].samples,300);
  assert.ok(run.fixedWindows[0].covarianceAxisCoherence < 0);
  assert.equal(run.temporal.autocorrelation.length,72);
  assert.equal(run.temporal.antPheromoneLaggedSpatial.length,6);
});

test('rejects missing or malformed spatial frames before analysis', () => {
  assert.throws(() => analyzeResult({schemaVersion:1,frames:[],trajectory10Hz:[]},'bad'), /missing frames/);
  const bad=frame(1);bad.ants.angularOccupancy.sectors=[];
  assert.throws(() => analyzeResult({schemaVersion:1,frames:[bad],trajectory10Hz:[],checkpoints:[]},'bad'), /16 angular sectors/);
});

test('reads the pheromone directional angle object and keeps missing direction null', () => {
  const value=frame(1); value.pheromone.orientation={angle:Math.PI/2,concentration:.4};
  const result=analyzeResult({schemaVersion:1,seed:2,seconds:1,frames:[value],trajectory10Hz:[],checkpoints:[]},'angle fixture');
  assert.equal(result.rows[0].pheromoneOrientation,Math.PI/2);
  assert.equal(result.rows[0].pheromoneOrientationCoherence,-1);
  assert.equal(result.fixedWindows[0].pheromoneOrientationCoherence,-1);
  const missing=analyzeResult({schemaVersion:1,seed:2,seconds:1,frames:[frame(1)],trajectory10Hz:[],checkpoints:[]},'missing angle');
  assert.equal(missing.rows[0].pheromoneOrientation,null);
  assert.equal(missing.rows[0].pheromoneOrientationCoherence,null);
});

test('analyzes the public candidate object as a path observation, separate from born Plates', () => {
  const straight = [{x:.1,y:.2},{x:.4,y:.2},{x:.8,y:.2}];
  const candidate={source:{x:.1,y:.2,index:1},target:{x:.8,y:.2,index:2},pathPoints:straight,
    geodesicLength:.7,stableSeconds:3,similarity:.8,footContacts:12,meanChemical:.5,meanSupport:.4,qualified:true,birthReady:false};
  const frameValue=frame(1);
  const result=analyzeResult({schemaVersion:1,seed:2,seconds:1,frames:[frameValue],trajectory10Hz:[],checkpoints:[{
    second:1,publicSnapshot:{surfacePlates:{plates:[],candidate},stratigraphy:{stratigraphy:{topLayerByCell:[],layerCountByCell:[]}}}
  }]},'candidate fixture');
  const observation=result.material.find(item=>item.kind==='candidate');
  assert.equal(observation.available,true);
  assert.equal(observation.count,1);
  assert.equal(observation.unionCells,null);
  assert.equal(observation.candidateObservation.qualified,true);
  assert.equal(observation.meanCurvature03,0);
  assert.equal(observation.historyFromPreviousCheckpoint,null);
  assert.equal(result.checkpoints.find(item=>item.kind==='production').count,0);
});
