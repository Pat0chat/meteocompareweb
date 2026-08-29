import { ANALYTICS_CONFIG } from './js/analytics-config.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from './js/network-config.js';
import { APP_VERSION } from './js/version.js';
import { sanitizePlausibleProxyPayload } from './js/analytics-schema.js';

const SCRIPT_PATH = ANALYTICS_CONFIG.scriptSrc;
const EVENT_PATH = ANALYTICS_CONFIG.endpoint;
const MODEL_METADATA_PATH = NETWORK_ENDPOINTS.firstParty.modelMetadata;
const MODEL_METADATA_UPSTREAM = NETWORK_ENDPOINTS.openMeteo.modelMetadataUpstream;
const MODEL_METADATA_KEY = /^[a-z0-9_]{1,80}$/i;
const VIGILANCE_PATH = NETWORK_ENDPOINTS.firstParty.vigilance;
const HEALTH_PATH = NETWORK_ENDPOINTS.firstParty.health;
const METEOFRANCE_VIGILANCE_URL = NETWORK_ENDPOINTS.meteoFrance.vigilanceCarte;
const VIGILANCE_DEPARTMENT = /^(?:0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/i;
const VIGILANCE_CACHE_TTL_SECONDS = 300;
const ANALYTICS_MAX_BODY_BYTES = 64 * 1024;

function upstreamFailure(error,label){
  const timedOut=error?.name==='AbortError' || error?.code==='NETWORK_TIMEOUT';
  return new Response(`${label} unavailable`,{status:timedOut?504:502,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}

async function fetchUpstream(url,options={},timeoutMs=NETWORK_TIMEOUTS_MS.workerUpstream){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  catch(error){if(controller.signal.aborted){const timeout=new Error('UPSTREAM_TIMEOUT');timeout.name='AbortError';timeout.code='NETWORK_TIMEOUT';throw timeout;}throw error;}
  finally{clearTimeout(timer);}
}

function headOrBody(request,response){
  return request.method==='HEAD'?new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers}):response;
}

function cachedJsonHeaders(upstream){
  const headers=new Headers();
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','public, max-age=300');
  headers.set('x-content-type-options','nosniff');
  const etag=upstream.headers.get('etag');if(etag)headers.set('etag',etag);
  const modified=upstream.headers.get('last-modified');if(modified)headers.set('last-modified',modified);
  return headers;
}

function modelMetadataFallbackResponse(error,upstreamStatus=null){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-meteocompare-model-metadata':'forecast-run-fallback'});
  if(Number.isFinite(upstreamStatus))headers.set('x-upstream-status',String(upstreamStatus));
  return new Response(JSON.stringify({unavailable:true,error,forecastFallback:true}),{status:200,headers});
}

export async function proxyModelMetadata(request,ctx){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const url=new URL(request.url),key=(url.searchParams.get('key')||'').trim();
  if(!MODEL_METADATA_KEY.test(key))return new Response('Invalid model key',{status:400,headers:{'cache-control':'no-store'}});

  const cacheKey=new Request(`${url.origin}${MODEL_METADATA_PATH}?key=${encodeURIComponent(key)}`,{method:'GET'}),cached=await caches.default.match(cacheKey);
  if(cached)return headOrBody(request,cached);

  let upstream;
  try{upstream=await fetchUpstream(`${MODEL_METADATA_UPSTREAM}/${encodeURIComponent(key)}/latest.json`,{method:'GET',headers:{Accept:'application/json'},redirect:'follow'});}
  catch(error){const timedOut=error?.name==='AbortError'||error?.code==='NETWORK_TIMEOUT';return modelMetadataFallbackResponse(timedOut?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE');}
  if(!upstream.ok)return modelMetadataFallbackResponse(`UPSTREAM_HTTP_${upstream.status}`,upstream.status);

  const response=new Response(upstream.body,{status:upstream.status,headers:cachedJsonHeaders(upstream)});
  ctx.waitUntil(caches.default.put(cacheKey,response.clone()));
  return headOrBody(request,response);
}


function jsonResponse(payload,status=200,headers={}){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',...headers}});
}
function normalizeMeteoFranceCredential(value){return String(value||'').trim().replace(/^(?:Bearer\s+|apikey\s*:\s*)/i,'').replace(/^([\"'])(.*)\1$/,'$2').trim();}
function meteoFranceApiKey(env){return normalizeMeteoFranceCredential(env?.METEOFRANCE_API_KEY);}
function vigilanceUnavailable(error,{configured=true,status=200}={}){
  const payload={source:'Météo-France',configured,unavailable:true,error:error?.code||error||'METEOFRANCE_UNAVAILABLE',periods:[]};
  if(Number.isFinite(error?.status))payload.upstreamStatus=error.status;
  if(error?.diagnostic)payload.diagnostic=error.diagnostic;
  if(configured)payload.authMode='api_key_header';
  return jsonResponse(payload,status,{'cache-control':'no-store','x-meteocompare-vigilance':'unavailable'});
}
function meteoFranceUpstreamError(status){
  const error=new Error(`METEOFRANCE_VIGILANCE_HTTP_${status}`);
  error.status=status;
  if(status===401){error.code='METEOFRANCE_AUTH_FAILED';error.diagnostic='INVALID_CREDENTIAL';}
  else if(status===403){error.code='METEOFRANCE_AUTH_FAILED';error.diagnostic='FORBIDDEN';}
  else error.code='METEOFRANCE_VIGILANCE_UPSTREAM';
  return error;
}
async function fetchMeteoFranceVigilance(env){
  const apiKey=meteoFranceApiKey(env);
  if(!apiKey){const error=new Error('METEOFRANCE_NOT_CONFIGURED');error.code='METEOFRANCE_NOT_CONFIGURED';throw error;}
  return fetchUpstream(METEOFRANCE_VIGILANCE_URL,{method:'GET',headers:{Accept:'*/*',apikey:apiKey},redirect:'follow'},NETWORK_TIMEOUTS_MS.workerUpstream);
}
async function getVigilanceCarte(request,env,ctx){
  const requestUrl=new URL(request.url),cacheKey=new Request(`${requestUrl.origin}/_mcx/.cache/vigilance-carte-v2`,{method:'GET'}),cached=await caches.default.match(cacheKey);
  if(cached)return cached.json();
  const upstream=await fetchMeteoFranceVigilance(env);
  if(!upstream.ok)throw meteoFranceUpstreamError(upstream.status);
  const data=await upstream.json(),cacheResponse=jsonResponse(data,200,{'cache-control':`public, max-age=${VIGILANCE_CACHE_TTL_SECONDS}`});ctx?.waitUntil?.(caches.default.put(cacheKey,cacheResponse.clone()));return data;
}
function extractVigilancePeriod(period,department,includeCoast){
  const domains=Array.isArray(period?.timelaps?.domain_ids)?period.timelaps.domain_ids:[],selected=domains.filter(domain=>{const id=String(domain?.domain_id||'').toUpperCase();return id===department||(includeCoast&&id!==department&&id.startsWith(department));});
  const byPhenomenon=new Map();let maxColorId=1,departmentMaxColorId=1,coastMaxColorId=1;
  for(const domain of selected){const domainId=String(domain?.domain_id||'').toUpperCase(),scope=domainId===department?'department':'coast',domainMax=Number(domain?.max_color_id)||1;maxColorId=Math.max(maxColorId,domainMax);if(scope==='department')departmentMaxColorId=Math.max(departmentMaxColorId,domainMax);else coastMaxColorId=Math.max(coastMaxColorId,domainMax);
    for(const item of Array.isArray(domain?.phenomenon_items)?domain.phenomenon_items:[]){const id=String(item?.phenomenon_id||''),current=byPhenomenon.get(id)||{id,maxColorId:1,intervals:[]},itemMax=Number(item?.phenomenon_max_color_id)||1,intervals=Array.isArray(item?.timelaps_items)?item.timelaps_items:[];current.maxColorId=Math.max(current.maxColorId,itemMax);for(const interval of intervals){current.intervals.push({beginTime:interval?.begin_time||null,endTime:interval?.end_time||null,colorId:Number(interval?.color_id)||1,scope,timingApproximate:false});}if(!intervals.length&&itemMax>=2&&period?.begin_validity_time&&period?.end_validity_time)current.intervals.push({beginTime:period.begin_validity_time,endTime:period.end_validity_time,colorId:itemMax,scope,timingApproximate:true});byPhenomenon.set(id,current);}
  }
  return {term:String(period?.echeance||''),beginTime:period?.begin_validity_time||null,endTime:period?.end_validity_time||null,maxColorId,departmentMaxColorId,coastMaxColorId,phenomena:[...byPhenomenon.values()]};
}
export async function proxyVigilance(request,env,ctx){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const url=new URL(request.url),department=String(url.searchParams.get('department')||'').trim().toUpperCase(),includeCoast=url.searchParams.get('coast')==='1';
  if(!VIGILANCE_DEPARTMENT.test(department))return jsonResponse({error:'INVALID_DEPARTMENT'},400,{'cache-control':'no-store'});
  let raw;try{raw=await getVigilanceCarte(request,env,ctx);}catch(error){const configured=error?.code!=='METEOFRANCE_NOT_CONFIGURED';const response=vigilanceUnavailable(error,{configured});return headOrBody(request,response);}
  const product=raw?.product||raw,periods=(Array.isArray(product?.periods)?product.periods:[]).map(period=>extractVigilancePeriod(period,department,includeCoast));
  const response=jsonResponse({source:'Météo-France',configured:true,unavailable:false,department,includeCoast,updateTime:product?.update_time||null,productDatetime:product?.meta?.product_datetime||raw?.meta?.product_datetime||null,generationTimestamp:product?.meta?.generation_timestamp||raw?.meta?.generation_timestamp||null,periods},200,{'cache-control':'public, max-age=120','x-meteocompare-vigilance':'official'});
  return headOrBody(request,response);
}


export function proxySystemHealth(request,env){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const response=jsonResponse({
    ok:true,
    service:'meteocompare-worker',
    version:APP_VERSION,
    checkedAt:new Date().toISOString(),
    capabilities:{
      forecastProxy:false,
      modelMetadataProxy:true,
      vigilanceProxy:true,
      vigilanceConfigured:Boolean(meteoFranceApiKey(env)),
      analyticsProxy:Boolean(ANALYTICS_CONFIG.enabled),
    },
  },200,{'cache-control':'no-store','x-meteocompare-health':'ok'});
  return headOrBody(request,response);
}

function cleanProxyHeaders(request){
  const headers=new Headers(request.headers);
  for(const name of ['cookie','host','content-length','cf-connecting-ip','cf-ray','cf-visitor','authorization'])headers.delete(name);
  return headers;
}
function plausibleEventHeaders(request){
  const headers=new Headers();
  const userAgent=request.headers.get('user-agent');if(userAgent)headers.set('user-agent',userAgent);
  const clientIp=request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();if(clientIp)headers.set('x-forwarded-for',clientIp);
  headers.set('content-type','application/json');
  headers.set('accept','application/json');
  return headers;
}

async function proxyPlausibleScript(request,ctx){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const cacheKey=new Request(request.url,{method:'GET'}),cached=await caches.default.match(cacheKey);
  if(cached)return headOrBody(request,cached);

  let upstream;
  try{upstream=await fetchUpstream(ANALYTICS_CONFIG.upstreamScriptSrc,{method:'GET',headers:cleanProxyHeaders(request),redirect:'follow'});}
  catch(error){return upstreamFailure(error,'Analytics script');}
  if(!upstream.ok)return new Response('Analytics script unavailable',{status:502,headers:{'cache-control':'no-store'}});

  const headers=new Headers({'content-type':'application/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'});
  const etag=upstream.headers.get('etag');if(etag)headers.set('etag',etag);
  const response=new Response(upstream.body,{status:upstream.status,headers});
  ctx.waitUntil(caches.default.put(cacheKey,response.clone()));
  return headOrBody(request,response);
}

async function serveApplicationAsset(request,env){
  const response=await env.ASSETS.fetch(request),url=new URL(request.url);
  if(request.method!=='GET'||!/^\/meteo\/[^/]+\/?$/i.test(url.pathname)||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  const html=await response.text();
  if(/<base\s/i.test(html))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const body=html.replace(/(<meta charset="utf-8" \/>)/i,'$1\n  <base href="/" />');
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export async function proxyPlausibleEvent(request){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>ANALYTICS_MAX_BODY_BYTES)return new Response('Payload Too Large',{status:413,headers:{'cache-control':'no-store'}});
  const contentType=String(request.headers.get('content-type')||'').toLowerCase();
  if(contentType&&!contentType.includes('application/json')&&!contentType.includes('text/plain'))return new Response('Unsupported Media Type',{status:415,headers:{'cache-control':'no-store'}});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>ANALYTICS_MAX_BODY_BYTES)return new Response('Payload Too Large',{status:413,headers:{'cache-control':'no-store'}});
  let parsed;try{parsed=JSON.parse(raw);}catch{return new Response('Invalid analytics payload',{status:400,headers:{'cache-control':'no-store'}});}
  const sanitized=sanitizePlausibleProxyPayload(parsed,{domain:ANALYTICS_CONFIG.domain,allowedHosts:ANALYTICS_CONFIG.allowedHosts});
  if(!sanitized.ok)return new Response('Analytics event rejected',{status:400,headers:{'cache-control':'no-store','x-meteocompare-analytics-reject':sanitized.error}});

  let upstream;
  try{upstream=await fetchUpstream(ANALYTICS_CONFIG.upstreamEndpoint,{method:'POST',headers:plausibleEventHeaders(request),body:JSON.stringify(sanitized.payload),redirect:'manual'},NETWORK_TIMEOUTS_MS.analyticsEvent);}
  catch(error){return upstreamFailure(error,'Analytics');}
  const headers=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff','x-meteocompare-analytics-proxy':'forwarded'});
  const upstreamContentType=upstream.headers.get('content-type');if(upstreamContentType)headers.set('content-type',upstreamContentType);
  const dropped=upstream.headers.get('x-plausible-dropped');if(dropped)headers.set('x-plausible-dropped',dropped);
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const pathname=new URL(request.url).pathname;
    if(pathname===SCRIPT_PATH)return proxyPlausibleScript(request,ctx);
    if(pathname===EVENT_PATH)return proxyPlausibleEvent(request);
    if(pathname===MODEL_METADATA_PATH)return proxyModelMetadata(request,ctx);
    if(pathname===VIGILANCE_PATH)return proxyVigilance(request,env,ctx);
    if(pathname===HEALTH_PATH)return proxySystemHealth(request,env);
    if(pathname.startsWith('/_mcx/'))return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
    return serveApplicationAsset(request,env);
  },
};
