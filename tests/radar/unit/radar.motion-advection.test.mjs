import assert from 'node:assert/strict';
import { extractRainCells, estimateRainCellTranslation, estimateRainCellMotions, projectRainCell, recentRadarFrameIndices } from '../../../js/features/radar.js';

const width=120,height=80;
const paint=(rects)=>{const mask=new Uint8Array(width*height);for(const [x,y,w,h] of rects)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&yy>=0&&xx<width&&yy<height)mask[yy*width+xx]=1;return mask;};

// Shape deformation must not erase the underlying eastward advection.
{
  const previous=extractRainCells(paint([[10,30,16,8],[14,26,6,4]]),width,height,{minPixels:1})[0];
  const next=extractRainCells(paint([[14,30,16,8],[18,26,6,4],[10,32,5,3]]),width,height,{minPixels:1})[0];
  const translation=estimateRainCellTranslation(previous,next);
  assert.ok(translation,'a matched rain cell must expose frame-to-frame translation');
  assert.equal(translation.dx,4,'overlap tracking must recover the actual four-pixel eastward shift even when the footprint deforms');
  assert.equal(translation.dy,0);
  assert.ok(translation.overlap>.8,'clean advection should have high overlap confidence');
}

// Use consecutive recent observations rather than a few widely-spaced snapshots.
assert.deepEqual(recentRadarFrameIndices(13,7),[6,7,8,9,10,11,12]);
assert.deepEqual(recentRadarFrameIndices(5,7),[0,1,2,3,4]);

// A realistic evolving cell moving west -> east must project eastward, not stay on its latest footprint.
{
  const samples=Array.from({length:7},(_,i)=>{
    const x=12+i*4,y=32;
    const rects=[[x,y,22,10],[x+5,y-5,7,5]];
    if(i%2)rects.push([x-5,y+3,5,5]); // asymmetric growth changes the footprint while motion continues.
    return {time:i*600,mask:paint(rects)};
  });
  const [cell]=estimateRainCellMotions(samples,{width,height,minPixels:20,maxCells:4});
  assert.ok(cell,'moving cell must remain tracked through the recent observation sequence');
  assert.equal(cell.motion.method,'cell-advection','motion should be driven by frame-to-frame cell advection when overlap is reliable');
  assert.ok(cell.motion.vx>.32,'west-to-east observations must produce a clearly positive eastward velocity');
  assert.ok(Math.abs(cell.motion.vy)<.03,'pure eastward movement must not invent a large north/south component');
  assert.ok(cell.motion.advection?.confidence>.7,'the per-cell overlap motion must contribute explicit confidence');
  const p30=projectRainCell(cell,30),p60=projectRainCell(cell,60);
  assert.ok(p30.dx>9,'+30 min projection must visibly leave the observed footprint toward the east');
  assert.ok(p60.dx>p30.dx*1.8,'+60 min must continue the observed direction rather than collapse back onto the cell');
}


// One bad centroid/shape association must not create a projected jump.
{
  const xs=[10,14,18,30,26,30,34];
  const samples=xs.map((x,i)=>({time:i*600,mask:paint([[x,30,18,10],[x+4,26,6,4]])}));
  const [cell]=estimateRainCellMotions(samples,{width,height,minPixels:20,maxCells:4});
  assert.ok(cell,'the cell must survive one locally inconsistent observation');
  assert.ok(Math.abs(cell.motion.vx-.4)<.08,'robust advection must keep the dominant eastward speed instead of averaging in a bad jump');
  assert.ok((cell.motion.advection?.rejected?.length||0)>=1,'inconsistent frame-to-frame vectors must be explicitly rejected');
  assert.ok(cell.observedTrack?.length>=2,'the displayed observed trajectory must be reconstructed from reliable footprint translations');
  assert.ok(projectRainCell(cell,60).dx<30,'a single bad frame must not generate an excessive +60 minute projection');
}

// A large observation gap is insufficient to assert that two footprints are the same rain cell.
{
  const sparse=[
    {time:0,mask:paint([[10,30,18,10]])},
    {time:600,mask:paint([[14,30,18,10]])},
    {time:2400,mask:paint([[26,30,18,10]])},
  ];
  const tracked=estimateRainCellMotions(sparse,{width,height,minPixels:20,maxCells:4,maxTrackGapMinutes:25});
  assert.equal(tracked.length,0,'tracking must prefer unavailable/uncertain over bridging a 30-minute data hole');
}

console.log('Radar recent-frame per-cell advection, outlier rejection and direction projection: OK');
