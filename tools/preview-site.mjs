import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePreviewHtml } from './preview-html.mjs';
import { fetchNetworkResponse } from '../js/network.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from '../js/network-config.js';

const projectRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT)||4173;

const modelMetadataPath=NETWORK_ENDPOINTS.firstParty.modelMetadata;
const modelMetadataUpstream=NETWORK_ENDPOINTS.openMeteo.modelMetadataUpstream;
const modelMetadataKey=/^[a-z0-9_]{1,80}$/i;
const vigilancePath=NETWORK_ENDPOINTS.firstParty.vigilance;
const vigilanceDepartment=/^(?:0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/i;

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json; charset=utf-8'};

function safePath(pathname){
  const decoded=decodeURIComponent(pathname.split('?')[0]||'/');
  const cleaned=normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/,'');
  return resolve(root,cleaned||'index.html');
}
async function existingFile(path){
  try{const info=await stat(path);return info.isFile()?path:null;}catch{return null;}
}
async function resolveRequest(pathname){
  const base=safePath(pathname);
  if(!base.startsWith(root))return null;
  let file=await existingFile(base);if(file)return file;
  file=await existingFile(`${base}.html`);if(file)return file;
  file=await existingFile(join(base,'index.html'));if(file)return file;
  return existingFile(join(root,'index.html'));
}



function parseDevVars(text){const out={};for(const raw of String(text||'').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i<1)continue;const key=line.slice(0,i).trim(),value=line.slice(i+1).trim().replace(/^(["'])(.*)\1$/,'$2');out[key]=value;}return out;}
let previewSecrets={};
try{previewSecrets=parseDevVars(await readFile(join(projectRoot,'.dev.vars'),'utf8'));}catch{}
function previewSecret(name){return String(process.env[name]||previewSecrets[name]||'').trim();}
let vigilanceCache=null,vigilanceCacheAt=0;
function previewMeteoFranceApiKey(){
  const apiKey=previewSecret('METEOFRANCE_API_KEY').replace(/^(?:Bearer\s+|apikey\s*:\s*)/i,'').replace(/^([\"'])(.*)\1$/,'$2').trim();
  if(!apiKey)throw Object.assign(new Error('METEOFRANCE_NOT_CONFIGURED'),{code:'METEOFRANCE_NOT_CONFIGURED'});
  return apiKey;
}
async function previewVigilanceRaw(force=false){
  if(!force&&vigilanceCache&&Date.now()-vigilanceCacheAt<5*60_000)return vigilanceCache;
  const apiKey=previewMeteoFranceApiKey();
  let response;try{response=await fetchNetworkResponse(NETWORK_ENDPOINTS.meteoFrance.vigilanceCarte,{timeoutMs:NETWORK_TIMEOUTS_MS.workerUpstream,headers:{Accept:'*/*',apikey:apiKey}});}catch(error){if(error?.status===401||error?.status===403){error.code='METEOFRANCE_AUTH_FAILED';error.diagnostic=error.status===401?'INVALID_CREDENTIAL':'FORBIDDEN';}throw error;}
  vigilanceCache=await response.json();vigilanceCacheAt=Date.now();return vigilanceCache;
}
function previewExtractPeriod(period,department,includeCoast){const domains=Array.isArray(period?.timelaps?.domain_ids)?period.timelaps.domain_ids:[],selected=domains.filter(d=>{const id=String(d?.domain_id||'').toUpperCase();return id===department||(includeCoast&&id!==department&&id.startsWith(department));}),by=new Map();let max=1,land=1,coast=1;for(const d of selected){const domain=String(d?.domain_id||'').toUpperCase(),scope=domain===department?'department':'coast',dm=Number(d?.max_color_id)||1;max=Math.max(max,dm);if(scope==='department')land=Math.max(land,dm);else coast=Math.max(coast,dm);for(const item of d?.phenomenon_items||[]){const id=String(item?.phenomenon_id||''),row=by.get(id)||{id,maxColorId:1,intervals:[]},itemMax=Number(item?.phenomenon_max_color_id)||1,intervals=item?.timelaps_items||[];row.maxColorId=Math.max(row.maxColorId,itemMax);for(const x of intervals)row.intervals.push({beginTime:x?.begin_time||null,endTime:x?.end_time||null,colorId:Number(x?.color_id)||1,scope,timingApproximate:false});if(!intervals.length&&itemMax>=2&&period?.begin_validity_time&&period?.end_validity_time)row.intervals.push({beginTime:period.begin_validity_time,endTime:period.end_validity_time,colorId:itemMax,scope,timingApproximate:true});by.set(id,row);}}return {term:String(period?.echeance||''),beginTime:period?.begin_validity_time||null,endTime:period?.end_validity_time||null,maxColorId:max,departmentMaxColorId:land,coastMaxColorId:coast,phenomena:[...by.values()]};}
async function proxyVigilance(url,res){const department=String(url.searchParams.get('department')||'').trim().toUpperCase(),includeCoast=url.searchParams.get('coast')==='1';if(!vigilanceDepartment.test(department)){res.writeHead(400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({error:'INVALID_DEPARTMENT'}));return;}try{const raw=await previewVigilanceRaw(),product=raw?.product||raw,periods=(product?.periods||[]).map(p=>previewExtractPeriod(p,department,includeCoast));res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({source:'Météo-France',configured:true,unavailable:false,department,includeCoast,updateTime:product?.update_time||null,productDatetime:product?.meta?.product_datetime||raw?.meta?.product_datetime||null,generationTimestamp:product?.meta?.generation_timestamp||raw?.meta?.generation_timestamp||null,periods}));}catch(error){const configured=error?.code!=='METEOFRANCE_NOT_CONFIGURED';res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-meteocompare-vigilance':'unavailable'});res.end(JSON.stringify({source:'Météo-France',configured,unavailable:true,error:error?.code||'METEOFRANCE_UNAVAILABLE',...(Number.isFinite(error?.status)?{upstreamStatus:error.status}:{}),...(error?.diagnostic?{diagnostic:error.diagnostic}:{}),...(configured?{authMode:'api_key_header'}:{}),periods:[]}));}}

let metadataUpstreamUnavailableUntil=0;
function previewMetadataFallback(res,error='UPSTREAM_UNAVAILABLE'){
  const body=JSON.stringify({unavailable:true,error,forecastFallback:true,previewFallback:true});
  res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-meteocompare-preview-fallback':'forecast-run'});res.end(body);
}
async function proxyModelMetadata(url,res){
  const key=(url.searchParams.get('key')||'').trim();
  if(!modelMetadataKey.test(key)){res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});res.end('Invalid model key');return;}
  if(Date.now()<metadataUpstreamUnavailableUntil){previewMetadataFallback(res);return;}
  try{
    const upstream=await fetchNetworkResponse(`${modelMetadataUpstream}/${encodeURIComponent(key)}/latest.json`,{timeoutMs:Math.min(NETWORK_TIMEOUTS_MS.workerUpstream,4000),headers:{Accept:'application/json'}});
    const body=Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200,{'content-type':upstream.headers.get('content-type')||'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);
  }catch(error){
    metadataUpstreamUnavailableUntil=Date.now()+30_000;
    console.warn(`Preview model metadata unavailable for ${key}; using forecast-run fallback:`,error?.message||error);
    const reason=error?.code==='NETWORK_TIMEOUT'?'UPSTREAM_TIMEOUT':error?.code==='HTTP_ERROR'?`UPSTREAM_HTTP_${error.status}`:'UPSTREAM_UNAVAILABLE';
    previewMetadataFallback(res,reason);
  }
}

createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(url.pathname===modelMetadataPath){await proxyModelMetadata(url,res);return;}
    if(url.pathname===vigilancePath){await proxyVigilance(url,res);return;}
    const file=await resolveRequest(url.pathname);
    if(!file){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');return;}
    let body=await readFile(file),type=types[extname(file).toLowerCase()]||'application/octet-stream';
    if(type.startsWith('text/html'))body=Buffer.from(preparePreviewHtml(body.toString('utf8'),{pathname:url.pathname}),'utf8');
    res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});res.end(String(error?.message||error));}
}).listen(port,'127.0.0.1',()=>console.log(`MeteoCompare preview: http://127.0.0.1:${port}`));
