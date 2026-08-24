import { forecastEnginePrecipitation, DEFAULT_FORECAST_ENGINE } from '../forecast-engines.js';
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
  const distance=Math.hypot(reference.centroid.x-candidate.centroid.x,reference.centroid.y-candidate.centroid.y),diagonal=Math.hypot(width,height),areaRatio=Math.min(reference.count,candidate.count)/Math.max(reference.count,candidate.count),distanceScore=1-clamp(distance/(diagonal*.32),0,1);
  return distanceScore*.72+areaRatio*.28;
}

function regressionVelocity(points,key){
  if(points.length<2)return 0;const base=points.at(-1).time,ts=points.map(row=>(row.time-base)/60),meanT=mean(ts),meanV=mean(points.map(row=>row[key]));let num=0,den=0;for(let i=0;i<points.length;i++){const dt=ts[i]-meanT;num+=dt*(points[i][key]-meanV);den+=dt*dt;}return den?num/den:0;
}

export function estimateRainCellMotions(samples,{width=ANALYSIS_SIZE,height=ANALYSIS_SIZE,minPixels=ANALYSIS_MIN_CELL_PIXELS,maxCells=8}={}){
  const rows=(samples||[]).filter(row=>row?.mask?.length===width*height&&Number.isFinite(row.time)).slice(-6).map(row=>({...row,cells:extractRainCells(row.mask,width,height,{minPixels,maxCells:maxCells*2})}));
  if(rows.length<2)return [];
  const latest=rows.at(-1),result=[];
  for(const cell of latest.cells.slice(0,maxCells)){
    const track=[{time:latest.time,x:cell.centroid.x,y:cell.centroid.y,count:cell.count}],used=[];let reference=cell;
    for(let rowIndex=rows.length-2;rowIndex>=0;rowIndex--){
      const candidates=rows[rowIndex].cells.map(candidate=>({candidate,score:cellMatchScore(reference,candidate,width,height)})).filter(row=>row.score>=.34).sort((a,b)=>b.score-a.score);if(!candidates.length)continue;
      const best=candidates[0];used.push(best.score);reference=best.candidate;track.push({time:rows[rowIndex].time,x:reference.centroid.x,y:reference.centroid.y,count:reference.count});
    }
    track.sort((a,b)=>a.time-b.time);if(track.length<2)continue;
    const vx=regressionVelocity(track,'x'),vy=regressionVelocity(track,'y'),spanMinutes=(track.at(-1).time-track[0].time)/60;if(spanMinutes<=0)continue;
    const residuals=track.map(point=>{const dt=(point.time-track.at(-1).time)/60;return Math.hypot(point.x-(cell.centroid.x+vx*dt),point.y-(cell.centroid.y+vy*dt));}),speed=Math.hypot(vx,vy),residual=mean(residuals)||0,matchConfidence=mean(used)||.45,historyConfidence=clamp((track.length-1)/3,0,1),residualConfidence=clamp(1-residual/(2.5+speed*8),0,1),confidence=clamp(matchConfidence*.45+historyConfidence*.3+residualConfidence*.25,0,1);
    result.push({...cell,motion:{vx,vy,confidence,history:track.length,spanMinutes},track});
  }
  return result;
}

export function projectRainCell(cell,horizonMinutes){
  if(!cell?.motion||!Number.isFinite(horizonMinutes))return null;const {vx,vy,confidence}=cell.motion,resolutionScale=(cell.width||ANALYSIS_SIZE)/320,uncertaintyPx=resolutionScale*(1.25+(horizonMinutes/15)*(1.15+(1-confidence)*2.15));
  return {horizon:horizonMinutes,dx:vx*horizonMinutes,dy:vy*horizonMinutes,x:cell.centroid.x+vx*horizonMinutes,y:cell.centroid.y+vy*horizonMinutes,uncertaintyPx,confidence};
}

export function radarForecastHours(forecast,now=Date.now(),limit=4,options={}){
  const series=Object.entries(forecast?.seriesByModel||{}),epochs=new Set();
  for(const [,row] of series){const h=row?.hourly||{},ts=h.timestamps||[],axis=Array.isArray(h.timestampEpochMs)&&h.timestampEpochMs.length===ts.length?h.timestampEpochMs:[];for(const value of axis)if(Number.isFinite(value)&&value>=now-30*60_000)epochs.add(value);}
  const selected=[...epochs].sort((a,b)=>a-b).slice(0,limit),engine=options?.forecastEngine||DEFAULT_FORECAST_ENGINE,localWeights=options?.weightsByVariable?.precipitation||{},calibration={};
  return selected.map(epochMs=>{
    const rows=[];
    for(const [modelId,row] of series){const h=row?.hourly||{},axis=h.timestampEpochMs||[],index=axis.indexOf(epochMs);if(index<0)continue;const amount=h.precipitation?.[index],probability=h.precipitationProbability?.[index];if(Number.isFinite(amount)||Number.isFinite(probability))rows.push({modelId,amount,probability});}
    const result=forecastEnginePrecipitation(rows,{engine,localWeights,calibration});
    const wet=rows.filter(row=>Number.isFinite(row.amount)&&row.amount>=0.1).length,wetShare=rows.length?wet/rows.length*100:null;
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

async function fetchMetadata(fetchImpl=fetch){
  if(metaCache&&Date.now()-metaCacheAt<RADAR_META_TTL_MS)return metaCache;
  const response=await fetchImpl(RADAR_META_URL,{credentials:'omit',cache:'default',referrerPolicy:'no-referrer'});
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
    for(let index=0,pixel=0;index<mask.length;index++,pixel+=4){const alpha=pixels[pixel+3],max=Math.max(pixels[pixel],pixels[pixel+1],pixels[pixel+2]),min=Math.min(pixels[pixel],pixels[pixel+1],pixels[pixel+2]);if(alpha>=20&&(max-min>=8||max>=80))mask[index]=1;}
    return mask;
  }finally{bitmap?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);}
}

function mapResolutionKm(lat,zoom){return 156543.03392*Math.cos(clampLat(lat)*Math.PI/180)/(2**zoom)/1000;}
function roundedLabel(ctx,text,x,y,color,width,height){ctx.save();ctx.font='750 11px system-ui, sans-serif';const metrics=ctx.measureText(text),padding=6,w=metrics.width+padding*2,h=22,left=clamp(x-w/2,6,width-w-6),top=clamp(y-h/2,6,height-h-6);ctx.fillStyle='rgba(15,23,42,.84)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(left,top,w,h,7);else ctx.rect(left,top,w,h);ctx.fill();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,left+padding,top+h/2);ctx.restore();}
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
function traceCellPath(ctx,cell,{dx=0,dy=0,sourceLeft,sourceTop,sourceScale,expandPx=0}){const loops=rainCellContours(cell,expandPx);ctx.beginPath();for(const loop of loops){if(!loop.length)continue;ctx.moveTo(sourceLeft+(loop[0].x+dx)*sourceScale,sourceTop+(loop[0].y+dy)*sourceScale);for(let i=1;i<loop.length;i++)ctx.lineTo(sourceLeft+(loop[i].x+dx)*sourceScale,sourceTop+(loop[i].y+dy)*sourceScale);ctx.closePath();}return loops.length>0;}
function drawCellShape(ctx,cell,geometry,{dx=0,dy=0,expandPx=0,color,fillAlpha=0,strokeAlpha=1,lineWidth=1.6,dash=[]}={}){ctx.save();ctx.lineJoin='round';ctx.lineCap='round';if(!traceCellPath(ctx,cell,{...geometry,dx,dy,expandPx})){ctx.restore();return;}if(fillAlpha>0){ctx.fillStyle=color;ctx.globalAlpha=fillAlpha;try{ctx.fill('evenodd');}catch{ctx.fill();}}ctx.globalAlpha=strokeAlpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ctx.stroke();ctx.restore();}
function cellVisible(cell,dx,dy,sourceLeft,sourceTop,sourceScale,width,height,padding=60){const x=sourceLeft+(cell.centroid.x+dx)*sourceScale,y=sourceTop+(cell.centroid.y+dy)*sourceScale,r=Math.max(cell.bbox.width,cell.bbox.height)*sourceScale*.65;return x+r>=-padding&&y+r>=-padding&&x-r<=width+padding&&y-r<=height+padding;}
function drawArrow(ctx,from,to,color){
  const distance=Math.hypot(to.y-from.y,to.x-from.x);if(distance<5)return;const angle=Math.atan2(to.y-from.y,to.x-from.x),head=8;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(15,23,42,.78)';ctx.lineWidth=4.6;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.strokeStyle='rgba(15,23,42,.78)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(to.x-head*Math.cos(angle-Math.PI/6),to.y-head*Math.sin(angle-Math.PI/6));ctx.lineTo(to.x,to.y);ctx.lineTo(to.x-head*Math.cos(angle+Math.PI/6),to.y-head*Math.sin(angle+Math.PI/6));ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(to.x-head*Math.cos(angle-Math.PI/6),to.y-head*Math.sin(angle-Math.PI/6));ctx.lineTo(to.x,to.y);ctx.lineTo(to.x-head*Math.cos(angle+Math.PI/6),to.y-head*Math.sin(angle+Math.PI/6));ctx.stroke();ctx.restore();
}
function drawLeadText(ctx,text,x,y,color,width,height){if(x<-20||y<-20||x>width+20||y>height+20)return;ctx.save();ctx.font='800 10px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3.5;ctx.strokeStyle='rgba(15,23,42,.86)';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();}

function paintNowcast(){
  if(!controller)return;const canvas=controller.root.querySelector('[data-radar-nowcast]'),stage=controller.root.querySelector('[data-radar-stage]');if(!canvas||!stage)return;
  const visible=Boolean(controller.mode==='projection'&&controller.nowcast&&controller.index===controller.frames.length-1),badge=controller.root.querySelector('.radar-nowcast-badge');canvas.classList.toggle('active',visible);badge?.classList.toggle('active',visible);if(!visible)return;
  const {cells}=controller.nowcast,width=stage.clientWidth||512,height=stage.clientHeight||360,dpr=Math.min(2.5,window.devicePixelRatio||1),rangeConfig=RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near,sourceSize=512*rangeConfig.radarScale,sourceScale=sourceSize/ANALYSIS_SIZE,sourceLeft=(width-sourceSize)/2,sourceTop=(height-sourceSize)/2,geometry={sourceLeft,sourceTop,sourceScale};canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=false;
  const drawn=cells.filter(cell=>cellVisible(cell,0,0,sourceLeft,sourceTop,sourceScale,width,height)||NOWCAST_HORIZONS.some(h=>{const p=projectRainCell(cell,h);return p&&cellVisible(cell,p.dx,p.dy,sourceLeft,sourceTop,sourceScale,width,height);}));
  for(const cell of drawn){
    const cellIndex=Math.max(0,cells.indexOf(cell)),label=`Z${cellIndex+1}`,color=RADAR_CELL_COLORS[cellIndex%RADAR_CELL_COLORS.length],display=rainCellDisplayMode(cell,sourceScale),current={x:sourceLeft+cell.centroid.x*sourceScale,y:sourceTop+cell.centroid.y*sourceScale},projections=NOWCAST_HORIZONS.map(horizon=>projectRainCell(cell,horizon)).filter(Boolean),last=projections.at(-1);if(!last)continue;
    drawCellShape(ctx,cell,geometry,{color,strokeAlpha:.72,lineWidth:1.35,dash:[3,3]});
    drawCellShape(ctx,cell,geometry,{dx:last.dx,dy:last.dy,expandPx:last.uncertaintyPx,color,fillAlpha:.055,strokeAlpha:.62,lineWidth:1.45,dash:[6,4]});
    if(display.lowMotion){
      drawCellShape(ctx,cell,geometry,{dx:last.dx,dy:last.dy,color,fillAlpha:.055,strokeAlpha:.98,lineWidth:2.15});
      if(current.x>=0&&current.x<=width&&current.y>=0&&current.y<=height)roundedLabel(ctx,`${label} · ${controller.t('radarLowMotionShort')}`,current.x,current.y+20,color,width,height);
      drawLeadText(ctx,'+15 → +60',current.x,current.y-18,color,width,height);continue;
    }
    for(let index=projections.length-1;index>=0;index--){const projection=projections[index],horizon=NOWCAST_HORIZONS[index],alpha=clamp(.98-index*.13,.58,.98);drawCellShape(ctx,cell,geometry,{dx:projection.dx,dy:projection.dy,color,fillAlpha:.018,strokeAlpha:alpha,lineWidth:index===0?1.8:1.55});}
    const lastScreen={x:sourceLeft+last.x*sourceScale,y:sourceTop+last.y*sourceScale};drawArrow(ctx,current,lastScreen,color);
    projections.forEach((projection,index)=>{const x=sourceLeft+projection.x*sourceScale,y=sourceTop+projection.y*sourceScale,offset=index%2===0?-10:10;drawLeadText(ctx,`+${NOWCAST_HORIZONS[index]}`,x,y+offset,color,width,height);});
    if(current.x>=0&&current.x<=width&&current.y>=0&&current.y<=height)roundedLabel(ctx,label,current.x,current.y+18,color,width,height);
  }
}

function renderNowcastSummary(){
  if(!controller)return;const node=controller.root.querySelector('[data-radar-nowcast-summary]');if(!node)return;
  if(controller.nowcastBusy){node.className='radar-nowcast-summary loading';node.innerHTML=`<span class="loader"></span><span>${esc(controller.t('radarNowcastAnalyzing'))}</span>`;return;}
  const result=controller.nowcast;if(!result){node.className='radar-nowcast-summary unavailable';node.textContent=controller.t(controller.nowcastReason==='uncertain'?'radarNowcastUncertain':'radarNowcastUnavailable');return;}
  const confidence=Math.round((mean(result.cells.map(cell=>cell.motion.confidence))||0)*100),rangeConfig=RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near,pixelKm=mapResolutionKm(controller.city.latitude,rangeConfig.radarZoom)*(512/ANALYSIS_SIZE),speeds=result.cells.map(cell=>Math.hypot(cell.motion.vx,cell.motion.vy)*pixelKm*60).filter(Number.isFinite),speed=Math.round(median(speeds)||0);
  node.className='radar-nowcast-summary ready';node.innerHTML=`<strong>${esc(controller.t('radarProjectionCells',{count:result.cells.length}))}</strong><span>${esc(controller.t('radarProjectionDetail',{confidence,speed}))}</span>`;
}

async function analyzeNowcast(){
  if(!controller?.meta||controller.frames.length<2)return;controller.nowcastBusy=true;renderNowcastSummary();
  try{
    const sourceFrames=controller.frames,indices=[...new Set([0,Math.round((sourceFrames.length-1)*.25),Math.round((sourceFrames.length-1)*.5),Math.round((sourceFrames.length-1)*.75),sourceFrames.length-1])],candidates=indices.map(index=>sourceFrames[index]).filter(Boolean),samples=[];
    for(const frame of candidates){const mask=await imageMask(radarImageUrl(controller.meta,frame,controller.city,(RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near).radarZoom),controller.abortController.signal);samples.push({mask,time:frame.time});}
    if(!controller||controller.abortController.signal.aborted)return;const cells=estimateRainCellMotions(samples);if(!cells.length){controller.nowcast=null;controller.nowcastReason='uncertain';controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();return;}controller.nowcast={mask:samples.at(-1).mask,cells};controller.nowcastReason=null;controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();
  }catch(error){if(!controller||controller.abortController.signal.aborted)return;controller.nowcast=null;controller.nowcastReason='error';controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();console.warn('Radar nowcast unavailable:',error?.message||error);}
}

function cleanup(){
  if(!controller)return;
  if(controller.timer)clearInterval(controller.timer);
  controller.resizeObserver?.disconnect?.();
  controller.abortController?.abort?.();
  controller=null;
}

export function destroyRadarModal(){cleanup();}

export async function mountRadarModal({root,city,forecast,forecastOptions=null,t,locale='fr-FR',onRangeChange=null,onModeChange=null}){
  cleanup();if(!root||!city)return;
  const abortController=new AbortController();
  controller={root,city,forecast,t,locale,index:0,range:'near',mode:'observation',frames:[],meta:null,timer:null,playing:false,resizeObserver:null,abortController,nowcast:null,nowcastReason:null,nowcastBusy:false};root.dataset.radarMode='observation';
  const status=root.querySelector('[data-radar-status]'),stage=root.querySelector('[data-radar-stage]'),radarImage=root.querySelector('[data-radar-image]'),timeLabel=root.querySelector('[data-radar-time]'),slider=root.querySelector('[data-radar-slider]'),play=root.querySelector('[data-radar-play]'),forecastRoot=root.querySelector('[data-radar-forecast]');
  if(forecastRoot)renderForecast(forecastRoot,forecast,{t,locale,forecastOptions});
  if(!stage||!radarImage)return;
  const paintBase=()=>{const rangeConfig=RADAR_RANGE_CONFIG[controller?.range]||RADAR_RANGE_CONFIG.near;renderBaseTiles(stage,city,rangeConfig.mapZoom);applyRadarGeometry(radarImage,rangeConfig);paintNowcast();};paintBase();
  if(typeof ResizeObserver!=='undefined'){controller.resizeObserver=new ResizeObserver(paintBase);controller.resizeObserver.observe(stage);}
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
  root.addEventListener('click',event=>{
    if(!controller)return;const target=event.target.closest?.('[data-radar-play],[data-radar-range],[data-radar-mode]');if(!target)return;
    if(target.hasAttribute('data-radar-play')){if(controller.mode!=='observation')setMode('observation');setPlaying(!controller.playing);paintFrame();return;}
    if(target.hasAttribute('data-radar-mode')){setMode(target.dataset.radarMode);return;}
    const range=target.dataset.radarRange;if(!(range in RADAR_RANGE_CONFIG)||range===controller.range)return;controller.range=range;root.querySelectorAll('[data-radar-range]').forEach(button=>{const active=button.dataset.radarRange===range;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});paintBase();paintFrame();controller.nowcast=null;controller.nowcastReason=null;controller.nowcastBusy=true;renderNowcastSummary();if(status&&controller.mode==='projection')status.textContent=t('radarNowcastAnalyzing');void analyzeNowcast().then(()=>{if(controller?.mode==='projection'&&status)status.textContent=t(controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');});onRangeChange?.(range);
  },{signal:abortController.signal});
  slider?.addEventListener('input',()=>{if(!controller)return;if(controller.mode!=='observation')setMode('observation');setPlaying(false);controller.index=Math.max(0,Math.min(controller.frames.length-1,Number(slider.value)||0));paintFrame();},{signal:abortController.signal});
  try{
    if(status)status.innerHTML=`<span class="loader"></span>${esc(t('radarLoading'))}`;
    const meta=await fetchMetadata();if(!controller||controller.abortController.signal.aborted)return;controller.meta=meta;controller.frames=meta.past;controller.index=Math.max(0,meta.past.length-1);if(status)status.textContent=t('radarObservedWindow');paintFrame();void analyzeNowcast().then(()=>{if(controller?.mode==='projection'&&status)status.textContent=t(controller.nowcast?'radarProjectionReady':'radarProjectionWaiting');});
    if(controller.frames.length>1&&controller.mode==='observation'){controller.index=0;paintFrame();setPlaying(true);}else{controller.index=Math.max(0,controller.frames.length-1);paintFrame();}
  }catch(error){if(!controller||controller.abortController.signal.aborted)return;if(status)status.textContent=t('radarUnavailable');radarImage.removeAttribute('src');radarImage.alt='';root.classList.add('radar-error');controller.nowcastBusy=false;renderNowcastSummary();console.warn('Rain radar:',error);}
}
