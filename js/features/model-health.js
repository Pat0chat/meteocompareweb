import { buildCityDiagnostics } from './diagnostics.js';
import { fetchJsonResource } from '../network.js';
import { NETWORK_ENDPOINTS } from '../network-config.js';

const METADATA_PROXY_PATH=NETWORK_ENDPOINTS.firstParty.modelMetadata;
const DELAY_TOLERANCE_MIN=20;
const HISTORY_RETENTION_MS=7*24*3600_000;
const HISTORY_MIN_INTERVAL_MS=15*60_000;

function finiteDate(value){const ms=Date.parse(value||'');return Number.isFinite(ms)?ms:null;}
function isIncidentStatus(status){return ['DELAYED','MISSED_RUNS','DEGRADED'].includes(status);}
function metadataKeyFor(model){return Object.prototype.hasOwnProperty.call(model||{},'metadataKey')?model.metadataKey:model?.openDataKey;}
async function fetchOne(model,{timeoutMs=10000}={}){
  const metadataKey=metadataKeyFor(model);
  if(!metadataKey)return {modelId:model?.id,error:'METADATA_NOT_PUBLISHED',responseMs:null,skipped:true};
  const started=globalThis.performance?.now?.()??Date.now();
  try{
    const json=await fetchJsonResource(`${METADATA_PROXY_PATH}?key=${encodeURIComponent(metadataKey)}`,{timeoutMs,cache:'no-store'});
    const responseMs=Math.round((globalThis.performance?.now?.()??Date.now())-started);
    if(json?.unavailable)return {modelId:model.id,error:String(json.error||'METADATA_UNAVAILABLE'),responseMs,forecastFallback:Boolean(json.forecastFallback||json.previewFallback)};
    return {modelId:model.id,responseMs,completed:json?.completed!==false,referenceTime:json?.reference_time||null,lastModifiedTime:json?.last_modified_time||null,validTimes:Array.isArray(json?.valid_times)?json.valid_times:[],variables:Array.isArray(json?.variables)?json.variables:[]};
  }catch(err){
    const error=err?.code==='HTTP_ERROR'?`HTTP_${err.status}`:err?.name==='AbortError'?'TIMEOUT':'FETCH_FAILED';
    return {modelId:model.id,error,responseMs:Math.round((globalThis.performance?.now?.()??Date.now())-started)};
  }
}
async function mapLimit(items,limit,worker){const out=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const i=cursor++;out[i]=await worker(items[i]);}}));return out;}
export async function fetchModelRunMetadata(models,{concurrency=4,timeoutMs=10000}={}){const rows=await mapLimit(models,concurrency,m=>fetchOne(m,{timeoutMs}));return Object.fromEntries(rows.map(x=>[x.modelId,x]));}

function missingVariables(row){return Object.entries(row?.variables||{}).filter(([k,v])=>['temperature','precipitation','wind'].includes(k)&&!(Number(v?.count)>0)).map(([k])=>k);}
function cadenceBase(meta,diag=null){const modified=finiteDate(meta?.lastModifiedTime);if(modified!=null)return {ms:modified,source:'MODIFIED'};const reference=finiteDate(meta?.referenceTime);if(reference!=null)return {ms:reference,source:'REFERENCE'};const forecastRun=finiteDate(diag?.runTimestamp);return forecastRun==null?null:{ms:forecastRun,source:'FORECAST'};}
function healthStatus(diag,meta,model,nowMs){
  if(!diag.active)return 'DISABLED';
  if(diag.status==='OUT_OF_DOMAIN_OR_UNAVAILABLE')return 'OUT_OF_DOMAIN';
  if(['UNAVAILABLE','PARTIAL','VARIABLE_MISSING'].includes(diag.status))return 'DEGRADED';
  if(meta?.skipped)return diag.status==='RECOVERED'?'RECOVERED':'OK';
  const base=cadenceBase(meta,diag);if(!base)return diag.status==='RECOVERED'?'RECOVERED':'METADATA_UNAVAILABLE';
  const interval=Number(model.updateMinutes)||60,expected=base.ms+interval*60_000,delay=Math.max(0,(nowMs-expected)/60_000);
  if(delay>interval+DELAY_TOLERANCE_MIN)return 'MISSED_RUNS';
  if(delay>DELAY_TOLERANCE_MIN)return 'DELAYED';
  return diag.status==='RECOVERED'?'RECOVERED':'OK';
}
export function buildModelHealthReport(forecast,models,enabledIds,metadata={},history=[],nowMs=Date.now()){
  const diag=buildCityDiagnostics(forecast,models,enabledIds),rows=diag.rows.map(d=>{
    const model=models.find(m=>m.id===d.modelId),meta=metadata?.[d.modelId]||null,status=healthStatus(d,meta,model,nowMs),base=cadenceBase(meta,d),interval=Number(model?.updateMinutes)||60,expectedRunAt=base?new Date(base.ms+interval*60_000).toISOString():null,delayMinutes=base?Math.max(0,Math.round((nowMs-(base.ms+interval*60_000))/60_000)):null;
    return {...d,healthStatus:status,metadataAvailable:Boolean(meta&&!meta.error&&!meta.skipped),metadataError:meta?.skipped?null:(meta?.error||null),metadataFallback:Boolean(meta?.forecastFallback),referenceTime:meta?.referenceTime||d.runTimestamp||null,lastModifiedTime:meta?.lastModifiedTime||null,cadenceBase:base?.source||null,expectedRunAt,delayMinutes,responseMs:Number.isFinite(meta?.responseMs)?meta.responseMs:null,missingVariables:missingVariables(d),incident24h:0,incident7d:0};
  });
  for(const row of rows){row.incident24h=countIncidentEpisodes(history,row.modelId,24*3600_000,nowMs);row.incident7d=countIncidentEpisodes(history,row.modelId,7*24*3600_000,nowMs);}
  const active=rows.filter(r=>r.active),summary={healthy:active.filter(r=>['OK','RECOVERED'].includes(r.healthStatus)).length,delayed:active.filter(r=>r.healthStatus==='DELAYED').length,incidents:active.filter(r=>['MISSED_RUNS','DEGRADED'].includes(r.healthStatus)).length,unavailable:active.filter(r=>['OUT_OF_DOMAIN','METADATA_UNAVAILABLE'].includes(r.healthStatus)).length,total:active.length};
  return {generatedAt:nowMs,rows,summary};
}
export function appendHealthSnapshot(history,report,nowMs=Date.now()){
  const current=Array.isArray(history)?history.filter(x=>x&&Number.isFinite(x.capturedAt)&&nowMs-x.capturedAt<=HISTORY_RETENTION_MS):[];
  const lastAudited=[...current].reverse().find(x=>x.qualityVersion===2);
  if(lastAudited&&nowMs-lastAudited.capturedAt<HISTORY_MIN_INTERVAL_MS)return current;
  const rows=(report?.rows||[]).filter(r=>r.active).map(r=>({modelId:r.modelId,status:r.healthStatus,referenceTime:r.referenceTime,delayMinutes:r.delayMinutes,responseMs:r.responseMs,missingVariables:r.missingVariables||[],fallback:Boolean(r.recoveredFromBatch),coverage:{temperature:r.variables?.temperature?.lastTimestamp||null,precipitation:r.variables?.precipitation?.lastTimestamp||null,wind:r.variables?.wind?.lastTimestamp||null}}));
  return [...current,{capturedAt:nowMs,qualityVersion:2,rows}].slice(-800);
}
export function countIncidentEpisodes(history,modelId,windowMs,nowMs=Date.now()){
  const snaps=(history||[]).filter(x=>x?.qualityVersion===2&&x?.capturedAt>=nowMs-windowMs).sort((a,b)=>a.capturedAt-b.capturedAt);let count=0,prevIncident=false;
  for(const snap of snaps){const row=snap.rows?.find(r=>r.modelId===modelId),incident=Boolean(row&&isIncidentStatus(row.status));if(incident&&!prevIncident)count++;prevIncident=incident;}
  return count;
}
export { isIncidentStatus };
