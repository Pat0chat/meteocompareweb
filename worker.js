import { ANALYTICS_CONFIG } from './js/analytics-config.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from './js/network-config.js';

const SCRIPT_PATH = ANALYTICS_CONFIG.scriptSrc;
const EVENT_PATH = ANALYTICS_CONFIG.endpoint;
const MODEL_METADATA_PATH = NETWORK_ENDPOINTS.firstParty.modelMetadata;
const MODEL_METADATA_UPSTREAM = NETWORK_ENDPOINTS.openMeteo.modelMetadataUpstream;
const MODEL_METADATA_KEY = /^[a-z0-9_]{1,80}$/i;
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

function cleanProxyHeaders(request){
  const headers=new Headers(request.headers);
  for(const name of ['cookie','host','content-length','cf-connecting-ip','cf-ray','cf-visitor'])headers.delete(name);
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

async function proxyPlausibleEvent(request){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>ANALYTICS_MAX_BODY_BYTES)return new Response('Payload Too Large',{status:413,headers:{'cache-control':'no-store'}});
  const body=await request.arrayBuffer();
  if(body.byteLength>ANALYTICS_MAX_BODY_BYTES)return new Response('Payload Too Large',{status:413,headers:{'cache-control':'no-store'}});

  let upstream;
  try{upstream=await fetchUpstream(ANALYTICS_CONFIG.upstreamEndpoint,{method:'POST',headers:cleanProxyHeaders(request),body,redirect:'manual'},NETWORK_TIMEOUTS_MS.analyticsEvent);}
  catch(error){return upstreamFailure(error,'Analytics');}
  const headers=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff'});
  const contentType=upstream.headers.get('content-type');if(contentType)headers.set('content-type',contentType);
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const pathname=new URL(request.url).pathname;
    if(pathname===SCRIPT_PATH)return proxyPlausibleScript(request,ctx);
    if(pathname===EVENT_PATH)return proxyPlausibleEvent(request);
    if(pathname===MODEL_METADATA_PATH)return proxyModelMetadata(request,ctx);
    if(pathname.startsWith('/_mcx/'))return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
    return serveApplicationAsset(request,env);
  },
};
