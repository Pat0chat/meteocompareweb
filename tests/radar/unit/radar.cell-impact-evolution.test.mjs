import assert from 'node:assert/strict';
import { extractRainCells, estimateRainCellMotions, projectRainCell, evaluateRainCellLocalityImpact, stabilizeRainCellIdentities } from '../../../js/features/radar.js';

const makeMask=(width,height,cells)=>{const mask=new Uint8Array(width*height);for(const cell of cells)for(let y=cell.y;y<cell.y+cell.h;y++)for(let x=cell.x;x<cell.x+cell.w;x++)if(x>=0&&y>=0&&x<width&&y<height)mask[y*width+x]=1;return mask;};

// Growth and deformation must affect the projected footprint, not only its centroid.
{
  const width=80,height=64,samples=[
    {time:0,mask:makeMask(width,height,[{x:8,y:26,w:8,h:8}])},
    {time:600,mask:makeMask(width,height,[{x:12,y:25,w:10,h:9}])},
    {time:1200,mask:makeMask(width,height,[{x:16,y:24,w:13,h:10}])},
  ];
  const [cell]=estimateRainCellMotions(samples,{width,height,minPixels:10});
  assert.ok(cell?.motion?.evolution,'tracked cells must expose an observed footprint-evolution model');
  const p60=projectRainCell(cell,60);
  assert.ok(p60.scaleX>1&&p60.scaleY>1,'a consistently growing cell must expand in projection');
  assert.ok(p60.areaFactor>1.2&&p60.developing,'sustained footprint growth must be represented as development');
  assert.ok(Math.abs(p60.scaleX-p60.scaleY)>.05,'different width/height trends must allow shape deformation instead of isotropic scaling only');
}

// Dissipation must shrink and de-emphasise a weakening footprint.
{
  const width=80,height=64,samples=[
    {time:0,mask:makeMask(width,height,[{x:12,y:23,w:16,h:14}])},
    {time:600,mask:makeMask(width,height,[{x:16,y:25,w:12,h:11}])},
    {time:1200,mask:makeMask(width,height,[{x:20,y:27,w:8,h:7}])},
  ];
  const [cell]=estimateRainCellMotions(samples,{width,height,minPixels:10});
  const p60=projectRainCell(cell,60);
  assert.ok(p60.areaFactor<.75&&p60.dissipating,'a rapidly shrinking cell must be flagged as dissipating');
  assert.ok(p60.survivalProbability<.9,'dissipation must reduce projected persistence instead of preserving a full-strength outline');
}

// Local impact is assessed against the locality at the radar centre.
{
  const width=100,height=80,samples=[
    {time:0,mask:makeMask(width,height,[{x:5,y:35,w:10,h:10}])},
    {time:600,mask:makeMask(width,height,[{x:10,y:35,w:10,h:10}])},
    {time:1200,mask:makeMask(width,height,[{x:15,y:35,w:10,h:10}])},
  ];
  const [approaching]=estimateRainCellMotions(samples,{width,height,minPixels:10});
  const impact=evaluateRainCellLocalityImpact(approaching);
  assert.equal(impact.kind,'impact','a cell whose projected footprint reaches the map centre must be classified as a locality impact');
  assert.ok([30,45,60].includes(impact.windowStart)&&impact.windowEnd>=impact.windowStart,'impact must expose a coarse +15/+30/+45/+60 time window');
  assert.ok(impact.relevanceScore>.75,'locality-threatening cells must receive high visual relevance');

  const movingAway={...approaching,motion:{...approaching.motion,vx:-Math.abs(approaching.motion.vx)}};
  const away=evaluateRainCellLocalityImpact(movingAway);
  assert.equal(away.kind,'away','a cell moving away from the locality must not be promoted as an impact');
  assert.ok(away.relevanceScore<impact.relevanceScore,'departing cells must be visually subordinate to impacting cells');
}

// Historical matching must be exclusive: two latest cells cannot both inherit one past cell.
{
  const width=64,height=48,samples=[
    {time:0,mask:makeMask(width,height,[{x:20,y:18,w:22,h:10}])},
    {time:600,mask:makeMask(width,height,[{x:18,y:18,w:8,h:10},{x:36,y:18,w:8,h:10}])},
  ];
  const tracked=estimateRainCellMotions(samples,{width,height,minPixels:10,maxCells:4});
  assert.equal(tracked.length,1,'exclusive frame matching must prevent two split cells from claiming the same historical parent');
}

// Stable identities use geographic signatures, so changing radar zoom does not rename the same cell.
{
  const buildCell=(x,y,w,h)=>extractRainCells(makeMask(512,512,[{x,y,w,h}]),512,512,{minPixels:1})[0];
  const nearCell={...buildCell(300,240,20,16),motion:{vx:.1,vy:.02,confidence:.8}};
  const first=stabilizeRainCellIdentities([nearCell],[],{latitude:48.85,radarZoom:7,time:1200,nextId:1});
  assert.equal(first.cells[0].stableLabel,'Z1');
  const wideCell={...buildCell(267,252,5,4),motion:{vx:.025,vy:.005,confidence:.8}};
  const second=stabilizeRainCellIdentities([wideCell],first.registry,{latitude:48.85,radarZoom:5,time:1200,nextId:first.nextId});
  assert.equal(second.cells[0].stableLabel,'Z1','the same physical cell must keep its identity when switching radar range/zoom');
  assert.equal(second.cells[0].colorIndex,first.cells[0].colorIndex,'stable identity must preserve its visual colour as well as its label');
}

console.log('Radar locality impact, relevance, stable identities and evolving-cell projection: OK');
