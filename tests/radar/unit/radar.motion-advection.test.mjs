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

console.log('Radar recent-frame per-cell advection and direction projection: OK');
