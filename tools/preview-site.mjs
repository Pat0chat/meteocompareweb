import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePreviewHtml } from './preview-html.mjs';
import { fetchNetworkResponse } from '../js/network.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from '../js/network-config.js';
import { VIGILANCE_DEPARTMENT_PATTERN, normalizeMeteoFranceApiKey, meteoFranceUpstreamError, vigilanceUnavailablePayload, vigilanceDepartmentPayload } from '../js/server/vigilance-shared.js';

const projectRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT)||4173;

const modelMetadataPath=NETWORK_ENDPOINTS.firstParty.modelMetadata;
const modelMetadataUpstream=NETWORK_ENDPOINTS.openMeteo.modelMetadataUpstream;
const modelMetadataKey=/^[a-z0-9_]{1,80}$/i;
const vigilancePath=NETWORK_ENDPOINTS.firstParty.vigilance;
const healthPath=NETWORK_ENDPOINTS.firstParty.health;

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
  const apiKey=normalizeMeteoFranceApiKey(previewSecret('METEOFRANCE_API_KEY'));
  if(!apiKey)throw Object.assign(new Error('METEOFRANCE_NOT_CONFIGURED'),{code:'METEOFRANCE_NOT_CONFIGURED'});
  return apiKey;
}
async function previewVigilanceRaw(force=false){
  if(!force&&vigilanceCache&&Date.now()-vigilanceCacheAt<5*60_000)return vigilanceCache;
  const apiKey=previewMeteoFranceApiKey();
  let response;try{response=await fetchNetworkResponse(NETWORK_ENDPOINTS.meteoFrance.vigilanceCarte,{timeoutMs:NETWORK_TIMEOUTS_MS.workerUpstream,headers:{Accept:'*/*',apikey:apiKey}});}catch(error){if(error?.status===401||error?.status===403)throw meteoFranceUpstreamError(error.status);throw error;}
  vigilanceCache=await response.json();vigilanceCacheAt=Date.now();return vigilanceCache;
}
async function proxyVigilance(url,res){const department=String(url.searchParams.get('department')||'').trim().toUpperCase(),includeCoast=url.searchParams.get('coast')==='1';if(!VIGILANCE_DEPARTMENT_PATTERN.test(department)){res.writeHead(400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({error:'INVALID_DEPARTMENT'}));return;}try{const raw=await previewVigilanceRaw();res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(vigilanceDepartmentPayload(raw,department,includeCoast)));}catch(error){const configured=error?.code!=='METEOFRANCE_NOT_CONFIGURED';res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-meteocompare-vigilance':'unavailable'});res.end(JSON.stringify(vigilanceUnavailablePayload(error,{configured})));}}


function proxySystemHealth(res){
  const payload={ok:true,service:'meteocompare-preview',version:'preview',checkedAt:new Date().toISOString(),capabilities:{forecastProxy:false,modelMetadataProxy:true,vigilanceProxy:true,vigilanceConfigured:Boolean(previewSecret('METEOFRANCE_API_KEY')),analyticsProxy:false}};
  res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-meteocompare-health':'ok'});res.end(JSON.stringify(payload));
}

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
    if(url.pathname===healthPath){proxySystemHealth(res);return;}
    const file=await resolveRequest(url.pathname);
    if(!file){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');return;}
    let body=await readFile(file),type=types[extname(file).toLowerCase()]||'application/octet-stream';
    if(type.startsWith('text/html'))body=Buffer.from(preparePreviewHtml(body.toString('utf8'),{pathname:url.pathname}),'utf8');
    res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});res.end(String(error?.message||error));}
}).listen(port,'127.0.0.1',()=>console.log(`MeteoCompare preview: http://127.0.0.1:${port}`));
