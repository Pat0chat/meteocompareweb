import { forecastEnginePrecipitation, DEFAULT_FORECAST_ENGINE } from '../forecast-engines.js';
const RADAR_META_URL='https://api.rainviewer.com/public/weather-maps.json';
const OSM_TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const RADAR_META_TTL_MS=5*60_000;
const RADAR_COLOR_SCHEME=2;
const RADAR_OPTIONS='1_1';
export const RADAR_RANGE_CONFIG={
  near:{mapZoom:9,radarZoom:7,radarScale:4},
  regional:{mapZoom:8,radarZoom:7,radarScale:2},
  wide:{mapZoom:6,radarZoom:5,radarScale:2}
};
const ANALYSIS_SIZE=96;
const NOWCAST_HORIZONS=[15,30,45,60];
const NOWCAST_COLORS=['#38bdf8','#22c55e','#f59e0b','#e879f9'];
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

function maskCentroid(mask,width,height){let sx=0,sy=0,count=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){sx+=x;sy+=y;count++;}return count?{x:sx/count,y:sy/count,count}:null;}
function mapResolutionKm(lat,zoom){return 156543.03392*Math.cos(clampLat(lat)*Math.PI/180)/(2**zoom)/1000;}
function compass(vx,vy){const labels=['N','NE','E','SE','S','SO','O','NO'];const angle=(Math.atan2(vx,-vy)*180/Math.PI+360)%360;return labels[Math.round(angle/45)%8];}
function roundedLabel(ctx,text,x,y,color,width,height){ctx.save();ctx.font='700 12px system-ui, sans-serif';const metrics=ctx.measureText(text),padding=7,w=metrics.width+padding*2,h=24,left=clamp(x-w/2,6,width-w-6),top=clamp(y-h/2,6,height-h-6);ctx.fillStyle='rgba(15,23,42,.78)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(left,top,w,h,7);else ctx.rect(left,top,w,h);ctx.fill();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,left+padding,top+h/2);ctx.restore();}

function paintNowcast(){
  if(!controller)return;const canvas=controller.root.querySelector('[data-radar-nowcast]'),stage=controller.root.querySelector('[data-radar-stage]');if(!canvas||!stage)return;
  const visible=Boolean(controller.nowcast&&controller.index===controller.frames.length-1),badge=controller.root.querySelector('.radar-nowcast-badge');canvas.classList.toggle('active',visible);badge?.classList.toggle('active',visible);if(!visible)return;
  const {mask,motion}=controller.nowcast,width=stage.clientWidth||512,height=stage.clientHeight||360,dpr=Math.min(2,window.devicePixelRatio||1),rangeConfig=RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near,sourceSize=512*rangeConfig.radarScale,sourceScale=sourceSize/ANALYSIS_SIZE,sourceLeft=(width-sourceSize)/2,sourceTop=(height-sourceSize)/2;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);const centroid=maskCentroid(mask,ANALYSIS_SIZE,ANALYSIS_SIZE);if(!centroid)return;
  const maskCanvas=document.createElement('canvas');maskCanvas.width=ANALYSIS_SIZE;maskCanvas.height=ANALYSIS_SIZE;const maskCtx=maskCanvas.getContext('2d'),image=maskCtx.createImageData(ANALYSIS_SIZE,ANALYSIS_SIZE);for(let index=0,pixel=0;index<mask.length;index++,pixel+=4)if(mask[index]){image.data[pixel]=255;image.data[pixel+1]=255;image.data[pixel+2]=255;image.data[pixel+3]=215;}maskCtx.putImageData(image,0,0);
  const current={x:sourceLeft+centroid.x*sourceScale,y:sourceTop+centroid.y*sourceScale},points=[];
  for(let idx=NOWCAST_HORIZONS.length-1;idx>=0;idx--){const horizon=NOWCAST_HORIZONS[idx],dx=motion.vx*horizon*sourceScale,dy=motion.vy*horizon*sourceScale,uncertainty=1.1+(horizon/15)*(1.0+(1-motion.confidence)*1.7),color=NOWCAST_COLORS[idx],opacity=clamp(.29-horizon*.0025,.10,.24);const tint=document.createElement('canvas');tint.width=ANALYSIS_SIZE;tint.height=ANALYSIS_SIZE;const tintCtx=tint.getContext('2d');tintCtx.drawImage(maskCanvas,0,0);tintCtx.globalCompositeOperation='source-in';tintCtx.fillStyle=color;tintCtx.fillRect(0,0,ANALYSIS_SIZE,ANALYSIS_SIZE);ctx.save();ctx.globalAlpha=opacity;ctx.filter=`blur(${Math.max(2,uncertainty*sourceScale*.62)}px)`;ctx.drawImage(tint,sourceLeft+dx,sourceTop+dy,sourceSize,sourceSize);ctx.restore();points.unshift({horizon,x:current.x+dx,y:current.y+dy,uncertainty:uncertainty*sourceScale,color});}
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.86)';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(current.x,current.y);for(const point of points)ctx.lineTo(point.x,point.y);ctx.stroke();for(const point of points){ctx.beginPath();ctx.strokeStyle=point.color;ctx.globalAlpha=.82;ctx.lineWidth=1.5;ctx.ellipse(point.x,point.y,point.uncertainty*1.35,point.uncertainty,Math.atan2(motion.vy,motion.vx),0,Math.PI*2);ctx.stroke();}ctx.restore();
  const timezone=controller.forecast?.city?.timezone||'UTC',latest=controller.frames.at(-1)?.time||Date.now()/1000;for(const point of points){const label=timeText(latest+point.horizon*60,controller.locale,timezone);roundedLabel(ctx,label,point.x,point.y-point.uncertainty-14,point.color,width,height);}
}

function renderNowcastSummary(){
  if(!controller)return;const node=controller.root.querySelector('[data-radar-nowcast-summary]');if(!node)return;
  if(controller.nowcastBusy){node.className='radar-nowcast-summary loading';node.innerHTML=`<span class="loader"></span><span>${esc(controller.t('radarNowcastAnalyzing'))}</span>`;return;}
  const result=controller.nowcast;if(!result){node.className='radar-nowcast-summary unavailable';node.textContent=controller.t(controller.nowcastReason==='uncertain'?'radarNowcastUncertain':'radarNowcastUnavailable');return;}
  const latest=controller.frames.at(-1)?.time||Date.now()/1000,eta=result.eta,timezone=controller.forecast?.city?.timezone||'UTC',speedPxPerMin=Math.hypot(result.motion.vx,result.motion.vy),pixelKm=mapResolutionKm(controller.city.latitude,(RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near).radarZoom)*(512/ANALYSIS_SIZE),speedKmh=Math.round(speedPxPerMin*pixelKm*60),direction=compass(result.motion.vx,result.motion.vy),confidence=Math.round(result.motion.confidence*100);
  let headline='';
  if(eta.kind==='approaching')headline=controller.t('radarNowcastArrival',{time:timeText(latest+eta.minute*60,controller.locale,timezone),minutes:eta.uncertaintyMinutes});
  else if(eta.kind==='leaving')headline=controller.t('radarNowcastDeparture',{time:timeText(latest+eta.minute*60,controller.locale,timezone),minutes:eta.uncertaintyMinutes});
  else if(eta.kind==='persistent')headline=controller.t('radarNowcastPersistent');
  else headline=controller.t('radarNowcastQuiet');
  node.className=`radar-nowcast-summary ${eta.kind}`;node.innerHTML=`<strong>${esc(headline)}</strong><span>${esc(controller.t('radarNowcastMotion',{speed:speedKmh,direction,confidence}))}</span>`;
}

async function analyzeNowcast(){
  if(!controller?.meta||controller.frames.length<2)return;controller.nowcastBusy=true;renderNowcastSummary();
  try{
    const sourceFrames=controller.frames,indices=[...new Set([0,Math.round((sourceFrames.length-1)*.25),Math.round((sourceFrames.length-1)*.5),Math.round((sourceFrames.length-1)*.75),sourceFrames.length-1])],candidates=indices.map(index=>sourceFrames[index]).filter(Boolean),samples=[];
    for(const frame of candidates){const mask=await imageMask(radarImageUrl(controller.meta,frame,controller.city,(RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near).radarZoom),controller.abortController.signal);samples.push({mask,time:frame.time});}
    if(!controller||controller.abortController.signal.aborted)return;const motion=estimateRadarMotion(samples);if(!motion){controller.nowcast=null;controller.nowcastReason='uncertain';controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();return;}const mask=samples.at(-1).mask,eta=radarNowcastEta(mask,motion);controller.nowcast={mask,motion,eta};controller.nowcastReason=null;controller.nowcastBusy=false;renderNowcastSummary();paintNowcast();
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

export async function mountRadarModal({root,city,forecast,forecastOptions=null,t,locale='fr-FR',onRangeChange=null}){
  cleanup();if(!root||!city)return;
  const abortController=new AbortController();
  controller={root,city,forecast,t,locale,index:0,range:'near',frames:[],meta:null,timer:null,playing:false,resizeObserver:null,abortController,nowcast:null,nowcastReason:null,nowcastBusy:false};
  const status=root.querySelector('[data-radar-status]'),stage=root.querySelector('[data-radar-stage]'),radarImage=root.querySelector('[data-radar-image]'),timeLabel=root.querySelector('[data-radar-time]'),slider=root.querySelector('[data-radar-slider]'),play=root.querySelector('[data-radar-play]'),forecastRoot=root.querySelector('[data-radar-forecast]');
  if(forecastRoot)renderForecast(forecastRoot,forecast,{t,locale,forecastOptions});
  if(!stage||!radarImage)return;
  const paintBase=()=>{const rangeConfig=RADAR_RANGE_CONFIG[controller?.range]||RADAR_RANGE_CONFIG.near;renderBaseTiles(stage,city,rangeConfig.mapZoom);applyRadarGeometry(radarImage,rangeConfig);paintNowcast();};paintBase();
  if(typeof ResizeObserver!=='undefined'){controller.resizeObserver=new ResizeObserver(paintBase);controller.resizeObserver.observe(stage);}
  const setPlaying=playing=>{if(!controller)return;controller.playing=Boolean(playing);if(controller.timer){clearInterval(controller.timer);controller.timer=null;}if(controller.playing&&controller.index>=controller.frames.length-1)controller.index=0;if(play){play.textContent=controller.playing?'❚❚':'▶';play.setAttribute('aria-label',t(controller.playing?'radarPause':'radarPlay'));play.title=t(controller.playing?'radarPause':'radarPlay');}if(controller.playing&&controller.frames.length>1)controller.timer=setInterval(()=>{if(!controller)return;if(controller.index>=controller.frames.length-1){setPlaying(false);paintFrame();return;}controller.index++;paintFrame();},700);};
  const paintFrame=()=>{
    if(!controller?.meta||!controller.frames.length)return;const frame=controller.frames[controller.index];const rangeConfig=RADAR_RANGE_CONFIG[controller.range]||RADAR_RANGE_CONFIG.near;applyRadarGeometry(radarImage,rangeConfig);radarImage.src=radarImageUrl(controller.meta,frame,city,rangeConfig.radarZoom);radarImage.alt=t('radarFrameAlt',{time:timeText(frame.time,locale,forecast?.city?.timezone||'UTC')});
    if(timeLabel)timeLabel.textContent=timeText(frame.time,locale,forecast?.city?.timezone||'UTC');if(slider){slider.max=String(controller.frames.length-1);slider.value=String(controller.index);}paintNowcast();
  };
  root.addEventListener('click',event=>{
    if(!controller)return;const target=event.target.closest?.('[data-radar-play],[data-radar-range]');if(!target)return;
    if(target.hasAttribute('data-radar-play')){setPlaying(!controller.playing);paintFrame();return;}
    const range=target.dataset.radarRange;if(!(range in RADAR_RANGE_CONFIG)||range===controller.range)return;controller.range=range;root.querySelectorAll('[data-radar-range]').forEach(button=>{const active=button.dataset.radarRange===range;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});paintBase();paintFrame();controller.nowcast=null;controller.nowcastReason=null;void analyzeNowcast();onRangeChange?.(range);
  },{signal:abortController.signal});
  slider?.addEventListener('input',()=>{if(!controller)return;setPlaying(false);controller.index=Math.max(0,Math.min(controller.frames.length-1,Number(slider.value)||0));paintFrame();},{signal:abortController.signal});
  try{
    if(status)status.innerHTML=`<span class="loader"></span>${esc(t('radarLoading'))}`;
    const meta=await fetchMetadata();if(!controller||controller.abortController.signal.aborted)return;controller.meta=meta;controller.frames=meta.past;controller.index=Math.max(0,meta.past.length-1);if(status)status.textContent=t('radarObservedWindow');paintFrame();void analyzeNowcast();
    if(controller.frames.length>1){controller.index=0;paintFrame();setPlaying(true);}
  }catch(error){if(!controller||controller.abortController.signal.aborted)return;if(status)status.textContent=t('radarUnavailable');radarImage.removeAttribute('src');radarImage.alt='';root.classList.add('radar-error');controller.nowcastBusy=false;renderNowcastSummary();console.warn('Rain radar:',error);}
}
