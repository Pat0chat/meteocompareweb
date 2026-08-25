import { forecastEnginePrecipitation, DEFAULT_FORECAST_ENGINE } from '../forecast-engines.js';
import { isWetPrecipitation } from '../consensus.js';
const RADAR_META_URL='https://api.rainviewer.com/public/weather-maps.json';
const OSM_TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const RADAR_META_TTL_MS=5*60_000;
const RADAR_COLOR_SCHEME=2;
const RADAR_OPTIONS='0_1';
export const RADAR_RANGE_CONFIG={
  near:{mapZoom:9,radarZoom:7,radarScale:4},
  regional:{mapZoom:8,radarZoom:7,radarScale:2},
  wide:{mapZoom:6,radarZoom:5,radarScale:2}
};
const ANALYSIS_SIZE=512;
export const RADAR_ANALYSIS_ZOOM=7;
const ANALYSIS_MIN_CELL_PIXELS=180;
export const RADAR_PROJECTION_HORIZONS=Object.freeze([15,30,45,60]);
const NOWCAST_HORIZONS=RADAR_PROJECTION_HORIZONS;
export const RADAR_CELL_COLORS=Object.freeze(['#0ea5e9','#8b5cf6','#f97316','#10b981','#e11d48','#eab308','#14b8a6','#6366f1']);
let metaCache=null;
let metaCacheAt=0;
let controller=null;

function esc(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clampLat(value){return clamp(Number(value),-85.05112878,85.05112878);}
function wrapTileX(x,z){const n=2**z;return ((x%n)+n)%n;}
function project(lat,lon,z){
  const n=2**z*256,latitude=clampLat(lat),rad=latitude*Math.PI/180;
  return {x:(Number(lon)+180)/360*n,y:(1-Math.asinh(Math.tan(rad))/Math.PI)/2*n};
}
function timeText(epochSeconds,locale='fr-FR',timezone='UTC'){
  try{return new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',timeZone:timezone}).format(new Date(epochSeconds*1000));}
  catch{return new Date(epochSeconds*1000).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});}
}
function hourText(epochMs,locale='fr-FR',timezone='UTC'){
  try{return new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',timeZone:timezone}).format(new Date(epochMs));}
  catch{return new Date(epochMs).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});}
}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function mean(values){const a=values.filter(Number.isFinite);return a.length?a.reduce((sum,v)=>sum+v,0)/a.length:null;}
function maskCount(mask){let count=0;for(const value of mask)if(value)count++;return count;}
function rgbToHue(r,g,b){const rn=r/255,gn=g/255,bn=b/255,max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn),delta=max-min;if(delta<=1e-6)return null;let hue;if(max===rn)hue=((gn-bn)/delta)%6;else if(max===gn)hue=(bn-rn)/delta+2;else hue=(rn-gn)/delta+4;const degrees=hue*60;return degrees<0?degrees+360:degrees;}
export function isRainRadarPixel(r,g,b,a,{alphaMin=36,chromaMin=26,saturationMin=.24,valueMin=.20}={}){if(a<alphaMin)return false;const max=Math.max(r,g,b),min=Math.min(r,g,b),chroma=max-min,value=max/255;if(value<valueMin||chroma<chromaMin)return false;const saturation=max?chroma/max:0;if(saturation<saturationMin)return false;const hue=rgbToHue(r,g,b);if(hue===null)return false;return (hue>=175&&hue<=260)||(hue>=85&&hue<175)||(hue>=0&&hue<=70)||(hue>=260&&hue<=330);}


export function extractRainCells(mask,width=ANALYSIS_SIZE,height=ANALYSIS_SIZE,{minPixels=ANALYSIS_MIN_CELL_PIXELS,maxCells=16}={}){
  if(!mask||mask.length!==width*height)return [];
  const visited=new Uint8Array(mask.length),cells=[],neighbors=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||visited[start])continue;
    const queue=[start],pixels=[];visited[start]=1;let q=0,sx=0,sy=0,minX=width,minY=height,maxX=0,maxY=0;
    while(q<queue.length){
      const index=queue[q++],x=index%width,y=Math.floor(index/width);pixels.push(index);sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const [ox,oy] of neighbors){const nx=x+ox,ny=y+oy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const ni=ny*width+nx;if(mask[ni]&&!visited[ni]){visited[ni]=1;queue.push(ni);}}
    }
    if(pixels.length<minPixels)continue;
    const set=new Set(pixels),boundary=[];
    for(const index of pixels){const x=index%width,y=Math.floor(index/width);if(x===0||y===0||x===width-1||y===height-1||!set.has(index-1)||!set.has(index+1)||!set.has(index-width)||!set.has(index+width))boundary.push(index);}
    cells.push({id:`cell-${cells.length+1}`,pixels,boundary,count:pixels.length,width,height,centroid:{x:sx/pixels.length,y:sy/pixels.length},bbox:{minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1}});
  }
  return cells.sort((a,b)=>b.count-a.count).slice(0,maxCells);
}

function cellMatchScore(reference,candidate,width,height){
  if(!reference||!candidate)return -Infinity;
  const distance=Math.hypot(reference.centroid.x-candidate.centroid.x,reference.centroid.y-candidate.centroid.y),diagonal=Math.hypot(width,height),areaRatio=Math.min(reference.count,candidate.count)/Math.max(reference.count,candidate.count),distanceScore=1-clamp(distance/(diagonal*.28),0,1),widthRatio=Math.min(reference.bbox.width,candidate.bbox.width)/Math.max(reference.bbox.width,candidate.bbox.width),heightRatio=Math.min(reference.bbox.height,candidate.bbox.height)/Math.max(reference.bbox.height,candidate.bbox.height),shapeScore=(widthRatio+heightRatio)/2;
  return distanceScore*.58+areaRatio*.24+shapeScore*.18;
}

function regressionVelocity(points,key){
  if(points.length<2)return 0;const base=points.at(-1).time,ts=points.map(row=>(row.time-base)/60),meanT=mean(ts),meanV=mean(points.map(row=>row[key]));let num=0,den=0;for(let i=0;i<points.length;i++){const dt=ts[i]-meanT;num+=dt*(points[i][key]-meanV);den+=dt*dt;}return den?num/den:0;
}
function trackPoint(cell,time){return {time,x:cell.centroid.x,y:cell.centroid.y,count:cell.count,bboxWidth:cell.bbox.width,bboxHeight:cell.bbox.height,logCount:Math.log(Math.max(1,cell.count)),logWidth:Math.log(Math.max(1,cell.bbox.width)),logHeight:Math.log(Math.max(1,cell.bbox.height))};}

export function estimateRainCellTranslation(previousCell,nextCell,{searchRadius=6}={}){
  if(!previousCell?.pixels?.length||!nextCell?.pixels?.length||previousCell.width!==nextCell.width||previousCell.height!==nextCell.height)return null;
  const width=previousCell.width,height=previousCell.height,nextMask=new Uint8Array(width*height);for(const index of nextCell.pixels)if(index>=0&&index<nextMask.length)nextMask[index]=1;
  const expectedDx=Math.round(nextCell.centroid.x-previousCell.centroid.x),expectedDy=Math.round(nextCell.centroid.y-previousCell.centroid.y),radius=Math.max(2,Math.min(10,Math.round(searchRadius))),stride=Math.max(1,Math.floor(previousCell.pixels.length/5000));let best=null;
  for(let dy=expectedDy-radius;dy<=expectedDy+radius;dy++)for(let dx=expectedDx-radius;dx<=expectedDx+radius;dx++){let intersection=0,sampled=0;for(let pos=0;pos<previousCell.pixels.length;pos+=stride){const index=previousCell.pixels[pos],x=index%width,y=Math.floor(index/width),nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;sampled++;if(nextMask[ny*width+nx])intersection++;}if(!sampled)continue;const overlap=intersection/sampled,centroidPenalty=Math.hypot(dx-expectedDx,dy-expectedDy)/(radius*2+1),score=overlap-centroidPenalty*.035;if(!best||score>best.score)best={dx,dy,score,overlap,expectedDx,expectedDy};}
  return best&&best.overlap>=.12?best:null;
}

function weightedMotion(vectors){if(!vectors.length)return null;const weights=vectors.map((row,index)=>Math.max(.05,row.score||row.overlap||.2)*(.55+.45*(index+1)/vectors.length)),total=weights.reduce((sum,value)=>sum+value,0);return {vx:vectors.reduce((sum,row,index)=>sum+row.vx*weights[index],0)/total,vy:vectors.reduce((sum,row,index)=>sum+row.vy*weights[index],0)/total,confidence:clamp(mean(vectors.map(row=>row.score||row.overlap))||0,0,1),vectors};}

export function estimateRainCellMotions(samples,{width=ANALYSIS_SIZE,height=ANALYSIS_SIZE,minPixels=ANALYSIS_MIN_CELL_PIXELS,maxCells=8}={}){
  const rows=(samples||[]).filter(row=>row?.mask?.length===width*height&&Number.isFinite(row.time)).slice(-7).map(row=>({...row,cells:extractRainCells(row.mask,width,height,{minPixels,maxCells:maxCells*2})}));
  if(rows.length<2)return [];
  const latest=rows.at(-1),states=latest.cells.slice(0,maxCells).map(cell=>({cell,reference:cell,history:[{cell,time:latest.time}],used:[]}));
  for(let rowIndex=rows.length-2;rowIndex>=0;rowIndex--){
    const candidates=rows[rowIndex].cells,proposals=[];
    for(let stateIndex=0;stateIndex<states.length;stateIndex++)for(let candidateIndex=0;candidateIndex<candidates.length;candidateIndex++){const score=cellMatchScore(states[stateIndex].reference,candidates[candidateIndex],width,height);if(score>=.38)proposals.push({stateIndex,candidateIndex,score});}
    proposals.sort((a,b)=>b.score-a.score);const claimedStates=new Set(),claimedCandidates=new Set();
    for(const proposal of proposals){if(claimedStates.has(proposal.stateIndex)||claimedCandidates.has(proposal.candidateIndex))continue;const state=states[proposal.stateIndex],candidate=candidates[proposal.candidateIndex];claimedStates.add(proposal.stateIndex);claimedCandidates.add(proposal.candidateIndex);state.reference=candidate;state.used.push(proposal.score);state.history.push({cell:candidate,time:rows[rowIndex].time});}
  }
  const result=[];
  for(const state of states){const cell=state.cell,history=state.history.sort((a,b)=>a.time-b.time),track=history.map(row=>trackPoint(row.cell,row.time));if(track.length<2)continue;
    const centroidVx=regressionVelocity(track,'x'),centroidVy=regressionVelocity(track,'y'),spanMinutes=(track.at(-1).time-track[0].time)/60;if(spanMinutes<=0)continue;
    const advectionVectors=[];for(let index=1;index<history.length;index++){const previous=history[index-1],next=history[index],dtMinutes=(next.time-previous.time)/60;if(dtMinutes<=0)continue;const translation=estimateRainCellTranslation(previous.cell,next.cell,{searchRadius:6});if(!translation)continue;advectionVectors.push({vx:translation.dx/dtMinutes,vy:translation.dy/dtMinutes,score:translation.overlap,dtMinutes,dx:translation.dx,dy:translation.dy});}
    const advection=weightedMotion(advectionVectors),matchConfidence=mean(state.used)||.45,historyConfidence=clamp((track.length-1)/4,0,1);let vx=centroidVx,vy=centroidVy,motionMethod='centroid';
    if(advection&&advection.confidence>=.18){const advectionWeight=clamp(.48+advection.confidence*.42,0.52,.90);vx=centroidVx*(1-advectionWeight)+advection.vx*advectionWeight;vy=centroidVy*(1-advectionWeight)+advection.vy*advectionWeight;motionMethod='cell-advection';}
    const residuals=track.map(point=>{const dt=(point.time-track.at(-1).time)/60;return Math.hypot(point.x-(cell.centroid.x+vx*dt),point.y-(cell.centroid.y+vy*dt));}),speed=Math.hypot(vx,vy),residual=mean(residuals)||0,residualConfidence=clamp(1-residual/(2.5+speed*8),0,1),advectionConfidence=advection?.confidence||0,confidence=clamp(matchConfidence*.30+historyConfidence*.22+residualConfidence*.18+advectionConfidence*.30,0,1);
    const logWidthRate=regressionVelocity(track,'logWidth'),logHeightRate=regressionVelocity(track,'logHeight'),logAreaRate=regressionVelocity(track,'logCount'),evolutionVariation=mean(track.slice(1).map((point,index)=>Math.abs((point.logCount-track[index].logCount)/Math.max(1,(point.time-track[index].time)/60)-logAreaRate)))||0,evolutionConfidence=clamp(historyConfidence*(1-evolutionVariation/(Math.abs(logAreaRate)+.035)),.2,1);
    result.push({...cell,motion:{vx,vy,confidence,history:track.length,spanMinutes,method:motionMethod,centroid:{vx:centroidVx,vy:centroidVy},advection:advection?{vx:advection.vx,vy:advection.vy,confidence:advection.confidence,vectors:advection.vectors}:null,evolution:{logWidthRate,logHeightRate,logAreaRate,confidence:evolutionConfidence}},track});
  }
  return result;
}

export function projectRainCell(cell,horizonMinutes){
  if(!cell?.motion||!Number.isFinite(horizonMinutes))return null;
  const {vx,vy,confidence,evolution={}}=cell.motion,resolutionScale=(cell.width||ANALYSIS_SIZE)/320,evolutionConfidence=clamp(Number(evolution.confidence)||0,0,1),evolutionWeight=clamp(confidence*.6+evolutionConfidence*.4,0,1),cap=Math.min(1,Math.max(0,horizonMinutes)/60),rawScaleX=Math.exp(clamp((Number(evolution.logWidthRate)||0)*horizonMinutes*evolutionWeight,-.5,.55)),rawScaleY=Math.exp(clamp((Number(evolution.logHeightRate)||0)*horizonMinutes*evolutionWeight,-.5,.55)),rawAreaFactor=Math.exp(clamp((Number(evolution.logAreaRate)||0)*horizonMinutes*evolutionWeight,-1.15,.8)),targetAreaFactor=clamp(rawAreaFactor,.32,2.1),shapeArea=Math.max(.01,rawScaleX*rawScaleY),areaCorrection=Math.sqrt(targetAreaFactor/shapeArea),scaleX=clamp(rawScaleX*areaCorrection,.58,1.55),scaleY=clamp(rawScaleY*areaCorrection,.58,1.55),areaFactor=clamp(scaleX*scaleY,.34,2.2),survivalProbability=clamp(areaFactor<1?.35+.65*areaFactor:1,0,1),dissipating=areaFactor<.72&&Number(evolution.logAreaRate)<-.004,developing=areaFactor>1.22&&Number(evolution.logAreaRate)>.003,uncertaintyPx=resolutionScale*(1.25+(horizonMinutes/15)*(1.15+(1-confidence)*2.15)+cap*Math.abs(scaleX-scaleY)*2.2);
  return {horizon:horizonMinutes,dx:vx*horizonMinutes,dy:vy*horizonMinutes,x:cell.centroid.x+vx*horizonMinutes,y:cell.centroid.y+vy*horizonMinutes,uncertaintyPx,confidence,scaleX,scaleY,areaFactor,survivalProbability,dissipating,developing};
}

function pointSegmentDistance(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,lengthSq=dx*dx+dy*dy;if(!lengthSq)return Math.hypot(px-ax,py-ay);const t=clamp(((px-ax)*dx+(py-ay)*dy)/lengthSq,0,1),x=ax+t*dx,y=ay+t*dy;return Math.hypot(px-x,py-y);}
function pointInLoop(point,loop){let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j],cross=((a.y>point.y)!==(b.y>point.y))&&(point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y||1e-9)+a.x);if(cross)inside=!inside;}return inside;}
function pointToCellDistance(cell,x,y){const loops=rainCellContours(cell);if(!loops.length)return Infinity;if(loops.some(loop=>pointInLoop({x,y},loop)))return 0;let best=Infinity;for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];best=Math.min(best,pointSegmentDistance(x,y,a.x,a.y,b.x,b.y));}return best;}

export function evaluateRainCellLocalityImpact(cell,{cityX=(cell?.width||ANALYSIS_SIZE)/2,cityY=(cell?.height||ANALYSIS_SIZE)/2,horizons=RADAR_PROJECTION_HORIZONS,localityRadiusPx=2}={}){
  if(!cell?.motion)return {kind:'unavailable',relevanceScore:0,windowStart:null,windowEnd:null};
  const currentDistance=pointToCellDistance(cell,cityX,cityY),rows=[];
  for(const horizon of horizons){const projection=projectRainCell(cell,horizon);if(!projection)continue;const sx=Math.max(.01,projection.scaleX||1),sy=Math.max(.01,projection.scaleY||1),sourceX=cell.centroid.x+(cityX-projection.x)/sx,sourceY=cell.centroid.y+(cityY-projection.y)/sy,distance=pointToCellDistance(cell,sourceX,sourceY)*Math.min(sx,sy),threshold=localityRadiusPx+projection.uncertaintyPx,closeness=clamp(1-distance/Math.max(1,threshold*1.8),0,1),probability=clamp(closeness*(.52+.48*projection.confidence)*projection.survivalProbability,0,1);rows.push({horizon,distance,threshold,probability,impact:distance<=threshold&&projection.survivalProbability>=.34,projection});}
  if(!rows.length)return {kind:'unavailable',relevanceScore:0,windowStart:null,windowEnd:null};
  const hits=rows.filter(row=>row.impact),minRow=rows.reduce((best,row)=>row.distance<best.distance?row:best,rows[0]),lastDistance=rows.at(-1).distance,approachGain=currentDistance-minRow.distance,approachShare=Number.isFinite(currentDistance)&&currentDistance>0?clamp(approachGain/currentDistance,0,1):0,movingToward=lastDistance<currentDistance;
  if(hits.length){const windowStart=hits[0].horizon,windowEnd=hits.at(-1).horizon,maxProbability=Math.max(...hits.map(row=>row.probability));return {kind:currentDistance<=localityRadiusPx?'current':'impact',windowStart,windowEnd,maxProbability,minDistancePx:minRow.distance,currentDistancePx:currentDistance,movingToward:true,relevanceScore:clamp(.78+maxProbability*.22,0,1),rows};}
  if(currentDistance<=localityRadiusPx)return {kind:'current-leaving',windowStart:0,windowEnd:0,maxProbability:Math.max(...rows.map(row=>row.probability)),minDistancePx:minRow.distance,currentDistancePx:currentDistance,movingToward:false,relevanceScore:.9,rows};
  if(movingToward&&approachShare>.08)return {kind:'approaching',windowStart:null,windowEnd:null,maxProbability:Math.max(...rows.map(row=>row.probability)),minDistancePx:minRow.distance,currentDistancePx:currentDistance,movingToward:true,relevanceScore:clamp(.28+approachShare*.5,0,0.76),rows};
  return {kind:'away',windowStart:null,windowEnd:null,maxProbability:Math.max(...rows.map(row=>row.probability)),minDistancePx:minRow.distance,currentDistancePx:currentDistance,movingToward:false,relevanceScore:.12,rows};
}

function radarCellGeoSignature(cell,{latitude=0,radarZoom=7,time=0}={}){const pixelKm=mapResolutionKm(latitude,radarZoom),xKm=(cell.centroid.x-(cell.width||ANALYSIS_SIZE)/2)*pixelKm,yKm=(cell.centroid.y-(cell.height||ANALYSIS_SIZE)/2)*pixelKm,areaKm2=Math.max(.01,cell.count*pixelKm*pixelKm),vxKm=(cell.motion?.vx||0)*pixelKm,vyKm=(cell.motion?.vy||0)*pixelKm;return {xKm,yKm,areaKm2,vxKm,vyKm,time};}
export function stabilizeRainCellIdentities(cells,registry=[],{latitude=0,radarZoom=7,time=0,nextId=1,maxMisses=2}={}){
  const current=(cells||[]).map(cell=>({cell,signature:radarCellGeoSignature(cell,{latitude,radarZoom,time})})),previous=(registry||[]).filter(row=>(row.misses||0)<=maxMisses),proposals=[];
  for(let currentIndex=0;currentIndex<current.length;currentIndex++)for(let previousIndex=0;previousIndex<previous.length;previousIndex++){
    const now=current[currentIndex].signature,old=previous[previousIndex],dtMinutes=Math.max(0,(Number(time)-Number(old.time||time))/60),predX=old.xKm+(old.vxKm||0)*dtMinutes,predY=old.yKm+(old.vyKm||0)*dtMinutes,distance=Math.hypot(now.xKm-predX,now.yKm-predY),radiusKm=Math.max(6,Math.sqrt(Math.max(now.areaKm2,old.areaKm2||now.areaKm2)/Math.PI)*2.8+(Math.hypot(old.vxKm||0,old.vyKm||0)*dtMinutes*.7)),distanceScore=1-clamp(distance/radiusKm,0,1),areaRatio=Math.min(now.areaKm2,old.areaKm2||now.areaKm2)/Math.max(now.areaKm2,old.areaKm2||now.areaKm2),velocityScale=Math.max(.08,Math.hypot(now.vxKm,now.vyKm)+Math.hypot(old.vxKm||0,old.vyKm||0)),velocityDelta=Math.hypot(now.vxKm-(old.vxKm||0),now.vyKm-(old.vyKm||0)),velocityScore=1-clamp(velocityDelta/(velocityScale*1.8),0,1),score=distanceScore*.62+areaRatio*.25+velocityScore*.13;if(score>=.30)proposals.push({currentIndex,previousIndex,score});
  }
  proposals.sort((a,b)=>b.score-a.score);const claimedCurrent=new Set(),claimedPrevious=new Set(),matches=new Map();for(const proposal of proposals){if(claimedCurrent.has(proposal.currentIndex)||claimedPrevious.has(proposal.previousIndex))continue;claimedCurrent.add(proposal.currentIndex);claimedPrevious.add(proposal.previousIndex);matches.set(proposal.currentIndex,previous[proposal.previousIndex]);}
  let idCounter=Math.max(1,nextId,...previous.map(row=>(Number(row.stableId)||0)+1));const assigned=current.map((row,index)=>{const prior=matches.get(index),stableId=prior?.stableId||idCounter++,colorIndex=prior?.colorIndex??((stableId-1)%RADAR_CELL_COLORS.length);return {...row.cell,stableId,colorIndex,stableLabel:`Z${stableId}`};});
  const activeRegistry=assigned.map(cell=>({...radarCellGeoSignature(cell,{latitude,radarZoom,time}),stableId:cell.stableId,colorIndex:cell.colorIndex,misses:0})),carried=previous.filter((_,index)=>!claimedPrevious.has(index)).map(row=>({...row,misses:(row.misses||0)+1})).filter(row=>row.misses<=maxMisses);
  return {cells:assigned,registry:[...activeRegistry,...carried],nextId:idCounter};
}

export function filterPeripheralRainCells(cells,{latitude=0,radarZoom=5,primaryZoom=RADAR_ANALYSIS_ZOOM,margin=.88}={}){const primaryHalfKm=ANALYSIS_SIZE*.5*mapResolutionKm(latitude,primaryZoom);return (cells||[]).filter(cell=>{const pixelKm=mapResolutionKm(latitude,radarZoom),cx=(cell.centroid.x-ANALYSIS_SIZE/2)*pixelKm,cy=(cell.centroid.y-ANALYSIS_SIZE/2)*pixelKm,radius=.58*Math.max(cell.bbox?.width||1,cell.bbox?.height||1)*pixelKm;return Math.hypot(cx,cy)-radius>primaryHalfKm*margin;});}

export function radarForecastHours(forecast,now=Date.now(),limit=4,options={}){
  const series=Object.entries(forecast?.seriesByModel||{}),epochs=new Set();
  for(const [,row] of series){const h=row?.hourly||{},ts=h.timestamps||[],axis=Array.isArray(h.timestampEpochMs)&&h.timestampEpochMs.length===ts.length?h.timestampEpochMs:[];for(const value of axis)if(Number.isFinite(value)&&value>=now-30*60_000)epochs.add(value);}
  const selected=[...epochs].sort((a,b)=>a-b).slice(0,limit),engine=options?.forecastEngine||DEFAULT_FORECAST_ENGINE,localWeights=options?.weightsByVariable?.precipitation||{},calibration={};
  return selected.map(epochMs=>{
    const rows=[];
    for(const [modelId,row] of series){const h=row?.hourly||{},axis=h.timestampEpochMs||[],index=axis.indexOf(epochMs);if(index<0)continue;const amount=h.precipitation?.[index],probability=h.precipitationProbability?.[index];if(Number.isFinite(amount)||Number.isFinite(probability))rows.push({modelId,amount,probability});}
    const result=forecastEnginePrecipitation(rows,{engine,localWeights,calibration});
    const wet=rows.filter(row=>isWetPrecipitation(row.amount)).length,wetShare=rows.length?wet/rows.length*100:null;
    return {epochMs,amountMm:result.centralAmountMm,conditionalAmountMm:result.conditionalAmountMm,probabilityPercent:result.probabilityPercent,wetSharePercent:wetShare,modelCount:result.count,forecastEngine:engine,effectiveEngine:result.effectiveEngine};
  });
}

export function radarForecastTrend(hours){
  const usable=(hours||[]).filter(row=>Number.isFinite(row.probabilityPercent));if(usable.length<2)return 'uncertain';
  const first=usable[0].probabilityPercent,later=Math.max(...usable.slice(1,3).map(row=>row.probabilityPercent));
  const last=usable[Math.min(usable.length-1,2)].probabilityPercent;
  if(first<35&&later>=55)return 'approaching';
  if(first>=55&&last<35)return 'leaving';
  if(first>=50&&last>=50)return 'persistent';
  if(first<35&&later<35)return 'quiet';
  return 'uncertain';
}

export function estimateRadarTranslation(previous,next,width,height,maxShift=12){
  if(!previous||!next||previous.length!==next.length||previous.length!==width*height)return null;
  const previousCount=maskCount(previous),nextCount=maskCount(next);
  if(previousCount<12||nextCount<12)return null;
  let best=null;
  for(let dy=-maxShift;dy<=maxShift;dy++)for(let dx=-maxShift;dx<=maxShift;dx++){
    let intersection=0,compared=0;
    const x0=Math.max(0,dx),x1=Math.min(width,width+dx),y0=Math.max(0,dy),y1=Math.min(height,height+dy);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const nextValue=next[y*width+x],prevValue=previous[(y-dy)*width+(x-dx)];
      if(nextValue&&prevValue)intersection++;
      if(nextValue||prevValue)compared++;
    }
    if(!compared)continue;
    const overlap=intersection/Math.max(1,Math.min(previousCount,nextCount));
    const iou=intersection/compared;
    const score=overlap*.65+iou*.35;
    if(!best||score>best.score)best={dx,dy,score,intersection};
  }
  return best;
}

export function estimateRadarMotion(samples,{width=ANALYSIS_SIZE,height=ANALYSIS_SIZE,maxShift=18}={}){
  const rows=(samples||[]).filter(row=>row?.mask?.length===width*height&&Number.isFinite(row?.time)).slice(-6);
  if(rows.length<2)return null;
  const vectors=[];
  for(let index=1;index<rows.length;index++){
    const dtMinutes=(rows[index].time-rows[index-1].time)/60;if(dtMinutes<=0)continue;
    const translation=estimateRadarTranslation(rows[index-1].mask,rows[index].mask,width,height,maxShift);if(!translation)continue;
    vectors.push({vx:translation.dx/dtMinutes,vy:translation.dy/dtMinutes,score:translation.score,dtMinutes});
  }
  if(!vectors.length)return null;
  const weights=vectors.map((row,index)=>Math.max(.05,row.score)*(.6+.4*(index+1)/vectors.length)),weightTotal=weights.reduce((sum,value)=>sum+value,0);
  const vx=vectors.reduce((sum,row,index)=>sum+row.vx*weights[index],0)/weightTotal,vy=vectors.reduce((sum,row,index)=>sum+row.vy*weights[index],0)/weightTotal;
  const baseConfidence=mean(vectors.map(row=>row.score))||0;
  let consistency=1;
  if(vectors.length>1){const variation=mean(vectors.map(row=>Math.hypot(row.vx-vx,row.vy-vy)))||0,speed=Math.hypot(vx,vy);consistency=clamp(1-variation/(speed*1.75+.06),0,1);}
  const confidence=clamp(baseConfidence*.72+consistency*.28,0,1);
  if(baseConfidence<.16)return null;
  return {vx,vy,confidence,score:baseConfidence,vectors};
}

function centerProbability(mask,width,height,vx,vy,horizonMinutes,uncertaintyPx){
  const targetX=width/2-vx*horizonMinutes,targetY=height/2-vy*horizonMinutes,radius=Math.max(1,Math.ceil(uncertaintyPx));
  let best=0;
  for(let y=Math.floor(targetY-radius);y<=Math.ceil(targetY+radius);y++)for(let x=Math.floor(targetX-radius);x<=Math.ceil(targetX+radius);x++){
    if(x<0||y<0||x>=width||y>=height||!mask[y*width+x])continue;
    const distance=Math.hypot(x-targetX,y-targetY);best=Math.max(best,clamp(1-distance/(radius+1),0,1));
  }
  return best;
}

export function radarNowcastEta(mask,motion,{width=ANALYSIS_SIZE,height=ANALYSIS_SIZE,maxMinutes=60}={}){
  if(!mask||!motion)return {kind:'unavailable'};
  const current=centerProbability(mask,width,height,motion.vx,motion.vy,0,1.5);
  const points=[];
  for(let minute=5;minute<=maxMinutes;minute+=5){
    const uncertainty=1.1+(minute/15)*(1.0+(1-motion.confidence)*1.7),raw=centerProbability(mask,width,height,motion.vx,motion.vy,minute,uncertainty),probability=raw*(.94-minute*.004)*(.55+.45*motion.confidence);points.push({minute,probability});
  }
  if(current>=.45){const clear=points.find(point=>point.probability<.16);if(clear)return {kind:'leaving',minute:clear.minute,uncertaintyMinutes:Math.round(5+(1-motion.confidence)*15+clear.minute*.10),current,points};return {kind:'persistent',minute:maxMinutes,current,points};}
  const arrival=points.find(point=>point.probability>=.24);if(arrival)return {kind:'approaching',minute:arrival.minute,uncertaintyMinutes:Math.round(5+(1-motion.confidence)*15+arrival.minute*.12),current,points};
  return {kind:'quiet',minute:maxMinutes,current,points};
}

async function fetchMetadata(fetchImpl=fetch,{forceRefresh=false}={}){
  if(!forceRefresh&&metaCache&&Date.now()-metaCacheAt<RADAR_META_TTL_MS)return metaCache;
  const response=await fetchImpl(RADAR_META_URL,{credentials:'omit',cache:forceRefresh?'no-store':'default',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error(`RADAR_HTTP_${response.status}`);
  const payload=await response.json(),host=String(payload?.host||'');
  if(!/^https:\/\/[a-z0-9.-]+\.rainviewer\.com$/i.test(host))throw new Error('RADAR_INVALID_HOST');
  const past=(payload?.radar?.past||[]).filter(frame=>Number.isFinite(frame?.time)&&/^\/v2\/radar\/\d+/.test(String(frame?.path||''))).slice(-13);
  if(!past.length)throw new Error('RADAR_NO_FRAMES');
  metaCache={host,past,generated:payload.generated||null};metaCacheAt=Date.now();return metaCache;
}

export function radarImageUrl(meta,frame,city,zoom){
  const lat=Number(city?.latitude),lon=Number(city?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return '';
  return `${meta.host}${frame.path}/512/${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`;
}

function renderBaseTiles(stage,city,mapZoom){
  const layer=stage.querySelector('[data-radar-base]');if(!layer)return;
  const width=Math.max(280,stage.clientWidth||512),height=Math.max(180,stage.clientHeight||360),center=project(city.latitude,city.longitude,mapZoom),left=center.x-width/2,top=center.y-height/2,startX=Math.floor(left/256),endX=Math.floor((left+width)/256),startY=Math.max(0,Math.floor(top/256)),endY=Math.min(2**mapZoom-1,Math.floor((top+height)/256));
  let html='';
  for(let y=startY;y<=endY;y++)for(let x=startX;x<=endX;x++){
    const tileX=wrapTileX(x,mapZoom),px=x*256-left,py=y*256-top,url=OSM_TILE_URL.replace('{z}',mapZoom).replace('{x}',tileX).replace('{y}',y);
    html+=`<img class="radar-base-tile" src="${url}" alt="" draggable="false" style="left:${px}px;top:${py}px" referrerpolicy="strict-origin-when-cross-origin">`;
  }
  layer.innerHTML=html;
}

function applyRadarGeometry(image,rangeConfig){
  if(!image||!rangeConfig)return;
  const size=512*rangeConfig.radarScale;
  image.style.width=`${size}px`;
  image.style.height=`${size}px`;
  image.style.left='50%';
  image.style.top='50%';
  image.style.transform='translate(-50%,-50%)';
}

function renderForecast(container,forecast,{t,locale,forecastOptions=null}){
  const hours=radarForecastHours(forecast,Date.now(),4,forecastOptions||{}),timezone=forecast?.city?.timezone||forecast?.timezone||'UTC',trend=radarForecastTrend(hours),trendKey={approaching:'radarTrendApproaching',leaving:'radarTrendLeaving',persistent:'radarTrendPersistent',quiet:'radarTrendQuiet',uncertain:'radarTrendUncertain'}[trend];
  const cards=hours.map(row=>`<div class="radar-forecast-hour"><span>${esc(hourText(row.epochMs,locale,timezone))}</span><strong>${Number.isFinite(row.probabilityPercent)?Math.round(row.probabilityPercent)+' %':'—'}</strong><small>${Number.isFinite(row.amountMm)?row.amountMm.toLocaleString(locale,{maximumFractionDigits:1})+' mm':'—'} · ${row.modelCount} ${esc(t(row.modelCount===1?'modelSingular':'models'))}</small></div>`).join('');
  container.innerHTML=`<div class="radar-trend ${trend}"><span class="radar-trend-dot" aria-hidden="true"></span><div><strong>${esc(t(trendKey))}</strong><small>${esc(t('radarTrendModelNote'))}</small></div></div>${hours.length?`<div class="radar-forecast-hours">${cards}</div>`:`<div class="radar-empty-small">${esc(t('radarForecastUnavailable'))}</div>`}`;
}

async function imageMask(url,signal){
  const response=await fetch(url,{credentials:'omit',cache:'force-cache',referrerPolicy:'no-referrer',signal});if(!response.ok)throw new Error(`RADAR_IMAGE_HTTP_${response.status}`);
  const blob=await response.blob();let bitmap=null,image=null,objectUrl='';
  try{
    if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(blob);
    else{objectUrl=URL.createObjectURL(blob);image=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=reject;node.src=objectUrl;});}
    const canvas=document.createElement('canvas');canvas.width=ANALYSIS_SIZE;canvas.height=ANALYSIS_SIZE;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,ANALYSIS_SIZE,ANALYSIS_SIZE);ctx.drawImage(bitmap||image,0,0,ANALYSIS_SIZE,ANALYSIS_SIZE);
    const pixels=ctx.getImageData(0,0,ANALYSIS_SIZE,ANALYSIS_SIZE).data,mask=new Uint8Array(ANALYSIS_SIZE*ANALYSIS_SIZE);
    for(let index=0,pixel=0;index<mask.length;index++,pixel+=4){const r=pixels[pixel],g=pixels[pixel+1],b=pixels[pixel+2],alpha=pixels[pixel+3];if(isRainRadarPixel(r,g,b,alpha))mask[index]=1;}
    return mask;
  }finally{bitmap?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);}
}

function mapResolutionKm(lat,zoom){return 156543.03392*Math.cos(clampLat(lat)*Math.PI/180)/(2**zoom)/1000;}
export function radarNowcastDisplayGeometry(rangeKey,width=512,height=360,analysisZoom=RADAR_ANALYSIS_ZOOM){const rangeConfig=RADAR_RANGE_CONFIG[rangeKey]||RADAR_RANGE_CONFIG.near,zoom=Number.isInteger(analysisZoom)?analysisZoom:RADAR_ANALYSIS_ZOOM,sourceScale=2**(rangeConfig.mapZoom-zoom),sourceSize=ANALYSIS_SIZE*sourceScale;return {sourceLeft:(width-sourceSize)/2,sourceTop:(height-sourceSize)/2,sourceScale,sourceSize,analysisZoom:zoom,mapZoom:rangeConfig.mapZoom};}
function roundedLabel(ctx,text,x,y,color,width,height,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.font='750 11px system-ui, sans-serif';const metrics=ctx.measureText(text),padding=6,w=metrics.width+padding*2,h=22,left=clamp(x-w/2,6,width-w-6),top=clamp(y-h/2,6,height-h-6);ctx.fillStyle='rgba(15,23,42,.84)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(left,top,w,h,7);else ctx.rect(left,top,w,h);ctx.fill();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,left+padding,top+h/2);ctx.restore();}
const contourCache=new WeakMap();
function maskForCell(cell,expandPx=0){
  const width=cell?.width||ANALYSIS_SIZE,height=cell?.height||ANALYSIS_SIZE,mask=new Uint8Array(width*height),radius=Math.max(0,Math.ceil(expandPx));
  for(const index of cell?.pixels||[])if(index>=0&&index<mask.length)mask[index]=1;
  if(!radius)return mask;
  const seeds=cell?.boundary?.length?cell.boundary:cell?.pixels||[],radiusSq=radius*radius;
  for(const index of seeds){const cx=index%width,cy=Math.floor(index/width);for(let oy=-radius;oy<=radius;oy++){const y=cy+oy;if(y<0||y>=height)continue;const span=Math.floor(Math.sqrt(Math.max(0,radiusSq-oy*oy)));for(let ox=-span;ox<=span;ox++){const x=cx+ox;if(x>=0&&x<width)mask[y*width+x]=1;}}}
  return mask;
}
function edgeDirection(sx,sy,ex,ey){if(ex>sx)return 0;if(ey>sy)return 1;if(ex<sx)return 2;return 3;}
function contourLoopsFromMask(mask,width,height){
  const edges=[],byStart=new Map(),push=(sx,sy,ex,ey)=>{const edge={sx,sy,ex,ey,dir:edgeDirection(sx,sy,ex,ey),used:false},idx=edges.push(edge)-1,key=`${sx}:${sy}`;if(!byStart.has(key))byStart.set(key,[]);byStart.get(key).push(idx);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const index=y*width+x;if(!mask[index])continue;if(y===0||!mask[index-width])push(x,y,x+1,y);if(x===width-1||!mask[index+1])push(x+1,y,x+1,y+1);if(y===height-1||!mask[index+width])push(x+1,y+1,x,y+1);if(x===0||!mask[index-1])push(x,y+1,x,y);}
  const rank=new Map([[1,0],[0,1],[3,2],[2,3]]),loops=[];
  for(let startIndex=0;startIndex<edges.length;startIndex++){
    if(edges[startIndex].used)continue;let edge=edges[startIndex],startX=edge.sx,startY=edge.sy,points=[],guard=0;
    while(edge&&!edge.used&&guard++<edges.length+4){edge.used=true;points.push({x:edge.sx,y:edge.sy});const endX=edge.ex,endY=edge.ey;if(endX===startX&&endY===startY)break;const candidates=(byStart.get(`${endX}:${endY}`)||[]).map(index=>edges[index]).filter(row=>!row.used);if(!candidates.length)break;candidates.sort((a,b)=>(rank.get((a.dir-edge.dir+4)%4)??9)-(rank.get((b.dir-edge.dir+4)%4)??9));edge=candidates[0];}
    if(points.length<4)continue;
    const reduced=[];for(let i=0;i<points.length;i++){const prev=points[(i-1+points.length)%points.length],cur=points[i],next=points[(i+1)%points.length],cross=(cur.x-prev.x)*(next.y-cur.y)-(cur.y-prev.y)*(next.x-cur.x);if(cross!==0)reduced.push(cur);}if(reduced.length<4)continue;
    const smooth=[];for(let i=0;i<reduced.length;i++){const a=reduced[i],b=reduced[(i+1)%reduced.length];smooth.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25},{x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75});}loops.push(smooth);
  }
  return loops;
}
export function rainCellContours(cell,expandPx=0){
  if(!cell)return [];let cache=contourCache.get(cell);if(!cache){cache=new Map();contourCache.set(cell,cache);}const radius=Math.max(0,Math.round(expandPx*2)/2),key=String(radius);if(cache.has(key))return cache.get(key);const width=cell.width||ANALYSIS_SIZE,height=cell.height||ANALYSIS_SIZE,loops=contourLoopsFromMask(maskForCell(cell,radius),width,height);cache.set(key,loops);return loops;
}
export function rainCellDisplayMode(cell,sourceScale=1,{minTrajectoryPixels=26}={}){const projection=projectRainCell(cell,60);const displacement=projection?Math.hypot(projection.dx,projection.dy)*Math.max(.01,sourceScale):0;return {lowMotion:!projection||displacement<minTrajectoryPixels,displacementPixels:displacement};}
function traceCellPath(ctx,cell,{dx=0,dy=0,scaleX=1,scaleY=1,sourceLeft,sourceTop,sourceScale,expandPx=0}){const loops=rainCellContours(cell,expandPx),cx=cell.centroid.x,cy=cell.centroid.y;ctx.beginPath();for(const loop of loops){if(!loop.length)continue;const point=(row)=>({x:cx+(row.x-cx)*scaleX+dx,y:cy+(row.y-cy)*scaleY+dy}),first=point(loop[0]);ctx.moveTo(sourceLeft+first.x*sourceScale,sourceTop+first.y*sourceScale);for(let i=1;i<loop.length;i++){const next=point(loop[i]);ctx.lineTo(sourceLeft+next.x*sourceScale,sourceTop+next.y*sourceScale);}ctx.closePath();}return loops.length>0;}
function drawCellShape(ctx,cell,geometry,{dx=0,dy=0,scaleX=1,scaleY=1,expandPx=0,color,fillAlpha=0,strokeAlpha=1,lineWidth=1.6,dash=[]}={}){ctx.save();ctx.lineJoin='round';ctx.lineCap='round';if(!traceCellPath(ctx,cell,{...geometry,dx,dy,scaleX,scaleY,expandPx})){ctx.restore();return;}if(fillAlpha>0){ctx.fillStyle=color;ctx.globalAlpha=fillAlpha;try{ctx.fill('evenodd');}catch{ctx.fill();}}ctx.globalAlpha=strokeAlpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ctx.stroke();ctx.restore();}
function cellVisible(cell,dx,dy,sourceLeft,sourceTop,sourceScale,width,height,padding=60,scaleX=1,scaleY=1){const x=sourceLeft+(cell.centroid.x+dx)*sourceScale,y=sourceTop+(cell.centroid.y+dy)*sourceScale,r=Math.max(cell.bbox.width*Math.abs(scaleX),cell.bbox.height*Math.abs(scaleY))*sourceScale*.65;return x+r>=-padding&&y+r>=-padding&&x-r<=width+padding&&y-r<=height+padding;}
function drawArrow(ctx,from,to,color,alpha=1){
  const distance=Math.hypot(to.y-from.y,to.x-from.x);if(distance<5)return;const angle=Math.atan2(to.y-from.y,to.x-from.x),head=8;ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(15,23,42,.78)';ctx.lineWidth=4.6;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.strokeStyle='rgba(15,23,42,.78)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(to.x-head*Math.cos(angle-Math.PI/6),to.y-head*Math.sin(angle-Math.PI/6));ctx.lineTo(to.x,to.y);ctx.lineTo(to.x-head*Math.cos(angle+Math.PI/6),to.y-head*Math.sin(angle+Math.PI/6));ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(to.x-head*Math.cos(angle-Math.PI/6),to.y-head*Math.sin(angle-Math.PI/6));ctx.lineTo(to.x,to.y);ctx.lineTo(to.x-head*Math.cos(angle+Math.PI/6),to.y-head*Math.sin(angle+Math.PI/6));ctx.stroke();ctx.restore();
}
function drawLeadText(ctx,text,x,y,color,width,height,alpha=1){if(x<-20||y<-20||x>width+20||y>height+20)return;ctx.save();ctx.globalAlpha=alpha;ctx.font='800 10px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3.5;ctx.strokeStyle='rgba(15,23,42,.86)';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();}
function drawObservedMotion(ctx,cell,geometry,color,alpha=1){
  const track=(cell?.track||[]).slice(-4);if(track.length<2)return false;const {sourceLeft,sourceTop,sourceScale}=geometry,points=track.map(point=>({x:sourceLeft+point.x*sourceScale,y:sourceTop+point.y*sourceScale})),from=points[0],to=points.at(-1);if(Math.hypot(to.x-from.x,to.y-from.y)<4)return false;ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(15,23,42,.66)';ctx.lineWidth=3.8;ctx.beginPath();ctx.moveTo(from.x,from.y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(from.x,from.y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<points.length-1;i++){ctx.globalAlpha=alpha*(.45+.12*i);ctx.fillStyle=color;ctx.beginPath();ctx.arc(points[i].x,points[i].y,2.2,0,Math.PI*2);ctx.fill();}ctx.restore();return true;
}
function drawProjectionTrajectory(ctx,cell,geometry,horizon,color,alpha=1){
  const {sourceLeft,sourceTop,sourceScale}=geometry,steps=[0,.33,.66,1],points=steps.map(fraction=>{const projection=fraction?projectRainCell(cell,horizon*fraction):null;return projection?{x:sourceLeft+projection.x*sourceScale,y:sourceTop+projection.y*sourceScale}:{x:sourceLeft+cell.centroid.x*sourceScale,y:sourceTop+cell.centroid.y*sourceScale};});
  const from=points[0],to=points.at(-1),distance=Math.hypot(to.x-from.x,to.y-from.y);if(distance<8)return false;
  ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(15,23,42,.72)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(from.x,from.y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(from.x,from.y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();
  for(let i=1;i<points.length-1;i++){ctx.globalAlpha=alpha*(.48+i*.14);ctx.fillStyle=color;ctx.beginPath();ctx.arc(points[i].x,points[i].y,2.6,0,Math.PI*2);ctx.fill();}
  ctx.restore();drawArrow(ctx,points.at(-2),to,color,alpha);return true;
}

function paintNowcast(){
  if(!controller)return;const canvas=controller.root.querySelector('[data-radar-nowcast]'),stage=controller.root.querySelector('[data-radar-stage]');if(!canvas||!stage)return;
  const visible=Boolean(controller.mode==='projection'&&controller.nowcast&&controller.index===controller.frames.length-1),badge=controller.root.querySelector('.radar-nowcast-badge');canvas.classList.toggle('active',visible);badge?.classList.toggle('active',visible);if(badge&&visible)badge.textContent=`${controller.t('radarNowcastProjection')} · +${controller.horizon} min`;if(!visible)return;
  const {cells}=controller.nowcast,width=stage.clientWidth||512,height=stage.clientHeight||360,dpr=Math.min(2.5,window.devicePixelRatio||1),horizon=controller.horizon;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=false;
  const cellGeometry=cell=>radarNowcastDisplayGeometry(controller.range,width,height,cell.analysisZoom||controller.nowcast.analysisZoom||RADAR_ANALYSIS_ZOOM),drawn=cells.map(cell=>({cell,projection:projectRainCell(cell,horizon)})).filter(row=>{if(!row.projection)return false;const {sourceLeft,sourceTop,sourceScale}=cellGeometry(row.cell),p=row.projection;return cellVisible(row.cell,0,0,sourceLeft,sourceTop,sourceScale,width,height)||cellVisible(row.cell,p.dx,p.dy,sourceLeft,sourceTop,sourceScale,width,height,70,p.scaleX,p.scaleY);}).sort((a,b)=>(a.cell.impact?.relevanceScore||0)-(b.cell.impact?.relevanceScore||0));
  for(let index=0;index<drawn.length;index++){
    const {cell,projection}=drawn[index],{sourceLeft,sourceTop,sourceScale}=cellGeometry(cell),geometry={sourceLeft,sourceTop,sourceScale},label=cell.stableLabel||`Z${Math.max(1,cells.indexOf(cell)+1)}`,color=RADAR_CELL_COLORS[(cell.colorIndex??cells.indexOf(cell))%RADAR_CELL_COLORS.length],relevance=clamp(cell.impact?.relevanceScore??.35,0,1),priority=index>=Math.max(0,drawn.length-4)||relevance>=.62,emphasis=priority?(.72+.28*relevance):(.42+.28*relevance),current={x:sourceLeft+cell.centroid.x*sourceScale,y:sourceTop+cell.centroid.y*sourceScale},destination={x:sourceLeft+projection.x*sourceScale,y:sourceTop+projection.y*sourceScale},display=rainCellDisplayMode({...cell,motion:{...cell.motion,vx:cell.motion.vx*horizon/60,vy:cell.motion.vy*horizon/60}},sourceScale,{minTrajectoryPixels:18});
    drawCellShape(ctx,cell,geometry,{dx:projection.dx,dy:projection.dy,scaleX:projection.scaleX,scaleY:projection.scaleY,expandPx:projection.uncertaintyPx,color,fillAlpha:.035+.035*emphasis,strokeAlpha:.56+.34*emphasis,lineWidth:1.7+.5*emphasis,dash:[7,5]});
    drawCellShape(ctx,cell,geometry,{dx:projection.dx,dy:projection.dy,scaleX:projection.scaleX,scaleY:projection.scaleY,color,fillAlpha:.045+.045*emphasis,strokeAlpha:.76+.22*emphasis,lineWidth:2.1+.6*emphasis});
    if(priority)drawObservedMotion(ctx,cell,geometry,color,.34+.30*emphasis);
    if(!display.lowMotion)drawProjectionTrajectory(ctx,cell,geometry,horizon,color,priority?.68+.28*emphasis:.20+.18*emphasis);
    else if(priority)drawLeadText(ctx,controller.t('radarLowMotionShort'),destination.x,destination.y-16,color,width,height,.72);
    if(priority&&current.x>=0&&current.x<=width&&current.y>=0&&current.y<=height)roundedLabel(ctx,label,current.x,current.y+18,color,width,height,.76);
    if(priority)drawLeadText(ctx,`+${horizon}`,destination.x,destination.y-13,color,width,height,.86);
  }
}
function syncRecalculateButton(){
  if(!controller)return;const button=controller.root.querySelector('[data-radar-recalculate]');if(!button)return;const busy=Boolean(controller.nowcastBusy||controller.recalculateBusy||controller.coverageBusy?.size);button.disabled=busy;button.setAttribute('aria-busy',String(busy));button.title=controller.t(busy?'radarProjectionRecalculating':'radarProjectionRecalculate');const label=button.querySelector('[data-radar-recalculate-label]');if(label)label.textContent=controller.t(busy?'radarProjectionRecalculating':'radarProjectionRecalculate');
}
function renderNowcastSummary(){
  if(!controller)return;syncRecalculateButton();const node=controller.root.querySelector('[data-radar-nowcast-summary]');if(!node)return;
  if(controller.nowcastBusy||controller.recalculateBusy){node.className='radar-nowcast-summary loading';node.innerHTML=`<span class="loader"></span><span>${esc(controller.t('radarNowcastAnalyzing'))}</span>`;return;}
  const result=controller.nowcast;if(!result){node.className='radar-nowcast-summary unavailable';node.textContent=controller.t(controller.nowcastReason==='uncertain'?'radarNowcastUncertain':'radarNowcastUnavailable');return;}
  const confidence=Math.round((mean(result.cells.map(cell=>cell.motion.confidence))||0)*100),speeds=result.cells.map(cell=>Math.hypot(cell.motion.vx,cell.motion.vy)*mapResolutionKm(controller.city.latitude,cell.analysisZoom||result.analysisZoom||RADAR_ANALYSIS_ZOOM)*(512/ANALYSIS_SIZE)*60).filter(Number.isFinite),speed=Math.round(median(speeds)||0),impacting=result.cells.filter(cell=>['impact','current','current-leaving'].includes(cell.impact?.kind)).sort((a,b)=>(b.impact?.relevanceScore||0)-(a.impact?.relevanceScore||0)),approaching=result.cells.filter(cell=>cell.impact?.kind==='approaching').sort((a,b)=>(b.impact?.relevanceScore||0)-(a.impact?.relevanceScore||0));
  let impactText=controller.t('radarImpactNone');
  if(impacting.length){const cell=impacting[0],impact=cell.impact,zone=cell.stableLabel||'Z?';if(impact.kind==='current-leaving')impactText=controller.t('radarImpactCurrentLeaving',{zone});else if(impact.kind==='current')impactText=controller.t('radarImpactCurrent',{zone,end:impact.windowEnd||60});else if(impact.windowStart===impact.windowEnd)impactText=controller.t('radarImpactAt',{zone,minute:impact.windowStart});else impactText=controller.t('radarImpactWindow',{zone,start:impact.windowStart,end:impact.windowEnd});if(impacting.length>1)impactText+=` ${controller.t('radarImpactOthers',{count:impacting.length-1})}`;}
  else if(approaching.length){const cell=approaching[0];impactText=controller.t('radarImpactApproaching',{zone:cell.stableLabel||'Z?'});}
  node.className='radar-nowcast-summary ready';node.innerHTML=`<strong>${esc(controller.t('radarProjectionCells',{count:result.cells.length}))}</strong><span>${esc(impactText)}</span><small>${esc(controller.t('radarProjectionDetail',{confidence,speed}))}</small>`;
}
export function recentRadarFrameIndices(frameCount,limit=7){const count=Math.max(0,Math.floor(Number(frameCount)||0));if(!count)return [];const take=Math.min(count,Math.max(2,Math.floor(Number(limit)||7)));return Array.from({length:take},(_,index)=>count-take+index);}
async function analyzeNowcast(){
  if(!controller?.meta||controller.frames.length<2)return;controller.nowcastBusy=true;renderNowcastSummary();
  try{
    const sourceFrames=controller.frames,indices=recentRadarFrameIndices(sourceFrames.length,7),candidates=indices.map(index=>sourceFrames[index]).filter(Boolean),samples=[];
    for(const frame of candidates){const mask=await imageMask(radarImageUrl(controller.meta,frame,controller.city,RADAR_ANALYSIS_ZOOM),controller.abortController.signal);samples.push({mask,time:frame.time});}
    if(!controller||controller.abortController.signal.aborted)return;const tracked=estimateRainCellMotions(samples).map(cell=>({...cell,analysisZoom:RADAR_ANALYSIS_ZOOM}));if(!tracked.length){controller.nowcast=null;controller.nowcastReason='uncertain';controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();return;}
    const latestTime=samples.at(-1).time,identity=stabilizeRainCellIdentities(tracked,controller.identityRegistry,{latitude:controller.city.latitude,radarZoom:RADAR_ANALYSIS_ZOOM,time:latestTime,nextId:controller.nextCellId}),cells=identity.cells.map(cell=>({...cell,impact:evaluateRainCellLocalityImpact(cell)}));controller.identityRegistry=identity.registry;controller.nextCellId=identity.nextId;controller.nowcast={mask:samples.at(-1).mask,cells,analysisZoom:RADAR_ANALYSIS_ZOOM};controller.nowcastReason=null;controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();
  }catch(error){if(!controller||controller.abortController.signal.aborted)return;controller.nowcast=null;controller.nowcastReason='error';controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();console.warn('Radar nowcast unavailable:',error?.message||error);}
}
async function augmentNowcastCoverage(range){
  if(!controller?.meta||!controller.nowcast||range!=='wide'||controller.coverageRanges.has(range)||controller.coverageBusy.has(range))return;const rangeConfig=RADAR_RANGE_CONFIG[range];controller.coverageBusy.add(range);
  try{const sourceFrames=controller.frames,indices=recentRadarFrameIndices(sourceFrames.length,7),samples=[];for(const index of indices){const frame=sourceFrames[index];if(!frame)continue;const mask=await imageMask(radarImageUrl(controller.meta,frame,controller.city,rangeConfig.radarZoom),controller.abortController.signal);samples.push({mask,time:frame.time});}if(!controller||controller.abortController.signal.aborted||!samples.length)return;const peripheral=filterPeripheralRainCells(estimateRainCellMotions(samples).map(cell=>({...cell,analysisZoom:rangeConfig.radarZoom})),{latitude:controller.city.latitude,radarZoom:rangeConfig.radarZoom});if(peripheral.length){const latestTime=samples.at(-1).time,identity=stabilizeRainCellIdentities(peripheral,controller.identityRegistry,{latitude:controller.city.latitude,radarZoom:rangeConfig.radarZoom,time:latestTime,nextId:controller.nextCellId}),extra=identity.cells.map(cell=>({...cell,impact:evaluateRainCellLocalityImpact(cell)}));controller.identityRegistry=identity.registry;controller.nextCellId=identity.nextId;const existingIds=new Set(controller.nowcast.cells.map(cell=>cell.stableId));controller.nowcast.cells=[...controller.nowcast.cells,...extra.filter(cell=>!existingIds.has(cell.stableId))];}controller.coverageRanges.add(range);renderNowcastSummary();paintNowcast();}
  catch(error){if(!controller||controller.abortController.signal.aborted)return;console.warn('Radar wide-area supplement unavailable:',error?.message||error);}
  finally{controller?.coverageBusy?.delete(range);syncRecalculateButton();}
}
function cleanup(){
  if(!controller)return;
  if(controller.timer)clearInterval(controller.timer);
  controller.resizeObserver?.disconnect?.();
  controller.abortController?.abort?.();
  controller=null;
}

export function destroyRadarModal(){cleanup();}

export async function mountRadarModal({root,city,forecast,forecastOptions=null,t,locale='fr-FR',initialMode='observation',initialRange='near',initialHorizon=30,initialFullscreen=false,onRangeChange=null,onModeChange=null,onHorizonChange=null,onFullscreenChange=null,onRecalculate=null}){
  cleanup();if(!root||!city)return;
  const abortController=new AbortController(),mode=['observation','projection'].includes(initialMode)?initialMode:'observation',range=initialRange in RADAR_RANGE_CONFIG?initialRange:'near',horizon=RADAR_PROJECTION_HORIZONS.includes(Number(initialHorizon))?Number(initialHorizon):30,fullscreen=Boolean(initialFullscreen);
  controller={root,city,forecast,t,locale,index:0,range,mode,horizon,fullscreen,frames:[],meta:null,timer:null,playing:false,resizeObserver:null,abortController,nowcast:null,nowcastReason:null,nowcastBusy:false,recalculateBusy:false,identityRegistry:[],nextCellId:1,coverageRanges:new Set(),coverageBusy:new Set()};root.dataset.radarMode=mode;root.dataset.radarHorizon=String(horizon);root.dataset.radarFullscreen=String(fullscreen);
  root.querySelectorAll('[data-radar-mode]').forEach(button=>{const active=button.dataset.radarMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  root.querySelectorAll('[data-radar-range]').forEach(button=>{const active=button.dataset.radarRange===range;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  root.querySelectorAll('[data-radar-horizon]').forEach(button=>{const active=Number(button.dataset.radarHorizon)===horizon;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  const modal=root.closest?.('.radar-modal'),fullscreenButton=modal?.querySelector?.('[data-radar-fullscreen]');
  const syncFullscreen=(repaint=true)=>{if(!controller)return;modal?.classList?.toggle('is-fullscreen',controller.fullscreen);root.dataset.radarFullscreen=String(controller.fullscreen);if(fullscreenButton){fullscreenButton.setAttribute('aria-pressed',String(controller.fullscreen));fullscreenButton.setAttribute('aria-label',t(controller.fullscreen?'radarExitFullscreen':'radarEnterFullscreen'));fullscreenButton.title=t(controller.fullscreen?'radarExitFullscreen':'radarEnterFullscreen');}if(repaint)requestAnimationFrame(()=>{if(!controller)return;paintBase();paintFrame();});};
  const status=root.querySelector('[data-radar-status]'),stage=root.querySelector('[data-radar-stage]'),radarImage=root.querySelector('[data-radar-image]'),timeLabel=root.querySelector('[data-radar-time]'),slider=root.querySelector('[data-radar-slider]'),play=root.querySelector('[data-radar-play]'),forecastRoot=root.querySelector('[data-radar-forecast]');
  if(forecastRoot)renderForecast(forecastRoot,forecast,{t,locale,forecastOptions});
  if(!stage||!radarImage)return;
  const paintBase=()=>{const rangeConfig=RADAR_RANGE_CONFIG[controller?.range]||RADAR_RANGE_CONFIG.near;renderBaseTiles(stage,city,rangeConfig.mapZoom);applyRadarGeometry(radarImage,rangeConfig);paintNowcast();};syncFullscreen(false);paintBase();
  if(typeof ResizeObserver!=='undefined'){controller.resizeObserver=new ResizeObserver(paintBase);controller.resizeObserver.observe(stage);}
  fullscreenButton?.addEventListener('click',()=>{if(!controller)return;controller.fullscreen=!controller.fullscreen;syncFullscreen();onFullscreenChange?.(controller.fullscreen);},{signal:abortController.signal});
  const setPlaying=playing=>{if(!controller)return;controller.playing=Boolean(playing)&&controller.mode==='observation';if(controller.timer){clearInterval(controller.timer);controller.timer=null;}if(controller.playing&&controller.index>=controller.frames.length-1)controller.index=0;if(play){play.textContent=controller.playing?'❚❚':'▶';play.setAttribute('aria-label',t(controller.playing?'radarPause':'radarPlay'));play.title=t(controller.playing?'radarPause':'radarPlay');}if(controller.playing&&controller.frames.length>1)controller.timer=setInterval(()=>{if(!controller)return;if(controller.index>=controller.frames.length-1){setPlaying(false);paintFrame();return;}controller.index++;paintFrame();},700);};
  const paintFrame=()=>{
    if(!controller?.meta||!controller.frames.length)return;const frame=controller.frames[controller.index];const rangeConfig=RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near;applyRadarGeometry(radarImage,rangeConfig);radarImage.src=radarImageUrl(controller.meta,frame,city,rangeConfig.radarZoom);radarImage.alt=t('radarFrameAlt',{time:timeText(frame.time,locale,forecast?.city?.timezone||'UTC')});
    if(timeLabel)timeLabel.textContent=timeText(frame.time,locale,forecast?.city?.timezone||'UTC');if(slider){slider.max=String(controller.frames.length-1);slider.value=String(controller.index);}paintNowcast();
  };
  const setMode=mode=>{
    if(!controller||!['observation','projection'].includes(mode)||mode===controller.mode)return;setPlaying(false);controller.mode=mode;root.dataset.radarMode=mode;root.querySelectorAll('[data-radar-mode]').forEach(button=>{const active=button.dataset.radarMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    if(mode==='projection'){controller.index=Math.max(0,controller.frames.length-1);if(status)status.textContent=t(controller.nowcastBusy?'radarNowcastAnalyzing':controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');}
    else if(status)status.textContent=t('radarObservedWindow');paintFrame();renderNowcastSummary();paintNowcast();onModeChange?.(mode);
  };
  const recalculateProjection=async()=>{
    if(!controller||controller.recalculateBusy||controller.nowcastBusy||controller.coverageBusy.size)return;setPlaying(false);if(controller.mode!=='projection')setMode('projection');const previous={meta:controller.meta,frames:controller.frames,index:controller.index,nowcast:controller.nowcast,nowcastReason:controller.nowcastReason,identityRegistry:controller.identityRegistry,nextCellId:controller.nextCellId,coverageRanges:controller.coverageRanges};controller.recalculateBusy=true;controller.nowcast=null;controller.nowcastReason=null;controller.identityRegistry=[];controller.nextCellId=1;controller.coverageRanges=new Set();renderNowcastSummary();if(status)status.innerHTML=`<span class="loader"></span>${esc(t('radarNowcastAnalyzing'))}`;
    try{const meta=await fetchMetadata(fetch,{forceRefresh:true});if(!controller||controller.abortController.signal.aborted)return;controller.meta=meta;controller.frames=meta.past;controller.index=Math.max(0,controller.frames.length-1);root.classList.remove('radar-error');paintFrame();await analyzeNowcast();if(!controller||controller.abortController.signal.aborted)return;if(controller.range==='wide')await augmentNowcastCoverage('wide');if(status)status.textContent=t(controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');onRecalculate?.({success:Boolean(controller.nowcast),frameTime:controller.frames.at(-1)?.time||null});}
    catch(error){if(!controller||controller.abortController.signal.aborted)return;controller.meta=previous.meta;controller.frames=previous.frames;controller.index=previous.index;controller.nowcast=previous.nowcast;controller.nowcastReason=previous.nowcastReason||'error';controller.identityRegistry=previous.identityRegistry;controller.nextCellId=previous.nextCellId;controller.coverageRanges=previous.coverageRanges;controller.nowcastBusy=false;if(status)status.textContent=t(controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');paintFrame();renderNowcastSummary();paintNowcast();console.warn('Radar projection recalculation unavailable:',error?.message||error);onRecalculate?.({success:false,frameTime:controller.frames.at(-1)?.time||null});}
    finally{if(controller){controller.recalculateBusy=false;renderNowcastSummary();syncRecalculateButton();}}
  };
  root.addEventListener('click',event=>{
    if(!controller)return;const target=event.target.closest?.('[data-radar-play],[data-radar-range],[data-radar-mode],[data-radar-horizon],[data-radar-recalculate]');if(!target)return;
    if(target.hasAttribute('data-radar-recalculate')){void recalculateProjection();return;}
    if(target.hasAttribute('data-radar-play')){if(controller.mode!=='observation')setMode('observation');setPlaying(!controller.playing);paintFrame();return;}
    if(target.hasAttribute('data-radar-mode')){setMode(target.dataset.radarMode);return;}
    if(target.hasAttribute('data-radar-horizon')){const next=Number(target.dataset.radarHorizon);if(!RADAR_PROJECTION_HORIZONS.includes(next)||next===controller.horizon)return;controller.horizon=next;root.dataset.radarHorizon=String(next);root.querySelectorAll('[data-radar-horizon]').forEach(button=>{const active=Number(button.dataset.radarHorizon)===next;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});paintNowcast();onHorizonChange?.(next);return;}
    const range=target.dataset.radarRange;if(!(range in RADAR_RANGE_CONFIG)||range===controller.range)return;controller.range=range;root.querySelectorAll('[data-radar-range]').forEach(button=>{const active=button.dataset.radarRange===range;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});paintBase();paintFrame();renderNowcastSummary();if(status&&controller.mode==='projection')status.textContent=t(controller.nowcastBusy?'radarNowcastAnalyzing':controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');if(range==='wide')void augmentNowcastCoverage(range);onRangeChange?.(range);
  },{signal:abortController.signal});
  slider?.addEventListener('input',()=>{if(!controller)return;if(controller.mode!=='observation')setMode('observation');setPlaying(false);controller.index=Math.max(0,Math.min(controller.frames.length-1,Number(slider.value)||0));paintFrame();},{signal:abortController.signal});
  try{
    if(status)status.innerHTML=`<span class="loader"></span>${esc(t('radarLoading'))}`;
    const meta=await fetchMetadata();if(!controller||controller.abortController.signal.aborted)return;controller.meta=meta;controller.frames=meta.past;controller.index=Math.max(0,meta.past.length-1);if(status)status.textContent=t(controller.mode==='projection'?'radarNowcastAnalyzing':'radarObservedWindow');paintFrame();void analyzeNowcast().then(()=>{if(controller?.range==='wide')void augmentNowcastCoverage('wide');if(controller?.mode==='projection'&&status)status.textContent=t(controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');});
    if(controller.frames.length>1&&controller.mode==='observation'){controller.index=0;paintFrame();setPlaying(true);}else{controller.index=Math.max(0,controller.frames.length-1);paintFrame();}
  }catch(error){if(!controller||controller.abortController.signal.aborted)return;if(status)status.textContent=t('radarUnavailable');radarImage.removeAttribute('src');radarImage.alt='';root.classList.add('radar-error');controller.nowcastBusy=false;renderNowcastSummary();console.warn('Rain radar:',error);}
}
