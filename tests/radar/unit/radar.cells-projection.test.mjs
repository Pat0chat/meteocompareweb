import assert from 'node:assert/strict';
import { RADAR_PROJECTION_HORIZONS, RADAR_CELL_COLORS, extractRainCells, estimateRainCellMotions, projectRainCell } from '../../../js/features/radar.js';

const width=48,height=36;
const makeMask=cells=>{const mask=new Uint8Array(width*height);for(const cell of cells)for(let y=cell.y;y<cell.y+cell.h;y++)for(let x=cell.x;x<cell.x+cell.w;x++)mask[y*width+x]=1;return mask;};
const samples=[
  {time:0,mask:makeMask([{x:4,y:7,w:5,h:4},{x:34,y:23,w:4,h:5}])},
  {time:600,mask:makeMask([{x:6,y:7,w:5,h:4},{x:33,y:21,w:4,h:5}])},
  {time:1200,mask:makeMask([{x:8,y:7,w:5,h:4},{x:32,y:19,w:4,h:5}])},
];

assert.deepEqual([...RADAR_PROJECTION_HORIZONS],[15,30,45,60]);
assert.ok(RADAR_CELL_COLORS.length>=8,'projection must provide enough distinct cell colours for complex radar scenes');
assert.equal(new Set(RADAR_CELL_COLORS).size,RADAR_CELL_COLORS.length,'cell identity colours must be unique');
const latestCells=extractRainCells(samples.at(-1).mask,width,height,{minPixels:5});
assert.equal(latestCells.length,2,'distinct rain areas must remain distinct cells');
assert.ok(latestCells.every(cell=>cell.boundary.length>0&&cell.count>=20),'each detected cell must expose a usable outline');

const tracked=estimateRainCellMotions(samples,{width,height,minPixels:5});
assert.equal(tracked.length,2,'each rain area with history must receive its own motion estimate');
const east=tracked.find(cell=>cell.centroid.x<20),northWest=tracked.find(cell=>cell.centroid.x>20);
assert.ok(east.motion.vx>.18&&Math.abs(east.motion.vy)<.01,'the first cell must keep its eastward motion');
assert.ok(northWest.motion.vx<-.08&&northWest.motion.vy<-.18,'the second cell must keep its independent north-west motion');
assert.ok(east.motion.confidence>.7&&northWest.motion.confidence>.7,'clean multi-frame tracks should have useful confidence');

for(const cell of tracked){
  const projections=RADAR_PROJECTION_HORIZONS.map(horizon=>projectRainCell(cell,horizon));
  assert.deepEqual(projections.map(row=>row.horizon),[15,30,45,60]);
  assert.ok(projections.every(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)),'all four horizons must produce coordinates');
  assert.ok(projections[3].uncertaintyPx>projections[0].uncertaintyPx,'probable-area uncertainty must widen with lead time');
  assert.ok(Math.hypot(projections[3].dx,projections[3].dy)>Math.hypot(projections[0].dx,projections[0].dy),'trajectory distance must grow through +60 min');
}

const untracked=estimateRainCellMotions([{time:0,mask:makeMask([])},{time:600,mask:makeMask([{x:10,y:10,w:5,h:5}])}],{width,height,minPixels:5});
assert.equal(untracked.length,0,'a newly appeared cell without observed motion history must not receive a fabricated trajectory');

console.log('Per-cell rain detection, tracking and +15/+30/+45/+60 projection: OK');
