import { ANALYTICS_CONFIG } from './js/analytics-config.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from './js/network-config.js';
import { APP_VERSION } from './js/version.js';
import { sanitizeAnalyticsIngressPayload } from './js/analytics-schema.js';
import { injectBaseHref } from './js/server/html-shell.js';
import { VIGILANCE_DEPARTMENT_PATTERN, normalizeMeteoFranceApiKey, meteoFranceUpstreamError, vigilanceUnavailablePayload, vigilanceDepartmentPayload } from './js/server/vigilance-shared.js';
import { AnalyticsStore } from './js/server/analytics-store.js';
export { AnalyticsStore };
export class VigilanceCache{
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.refreshPromise=null;}
  async current(){return await this.ctx.storage.get('carte');}
  async refresh(){
    if(this.refreshPromise)return await this.refreshPromise;
    this.refreshPromise=(async()=>{
      const started=Date.now(),upstream=await fetchMeteoFranceVigilance(this.env),upstreamMs=Date.now()-started,data=await upstream.json(),storedAt=Math.floor(Date.now()/1000),entry={data,storedAt};
      await this.ctx.storage.put('carte',entry);
      return {data,storedAt,source:'upstream',upstreamMs};
    })();
    try{return await this.refreshPromise;}finally{this.refreshPromise=null;}
  }
  async fetch(request){
    if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');
    const entry=await this.current(),now=Math.floor(Date.now()/1000),storedAt=Number(entry?.storedAt),age=Number.isFinite(storedAt)?Math.max(0,now-storedAt):Infinity;
    const result=entry?.data&&age<VIGILANCE_SHARED_CACHE_TTL_SECONDS?{data:entry.data,storedAt,source:'shared',upstreamMs:null}:await this.refresh();
    return headOrBody(request,jsonResponse(result,200,{'cache-control':'no-store','x-meteocompare-vigilance-cache':'shared'}));
  }
}

const EVENT_PATH=ANALYTICS_CONFIG.endpoint,VIGILANCE_PATH=NETWORK_ENDPOINTS.firstParty.vigilance,HEALTH_PATH=NETWORK_ENDPOINTS.firstParty.health;
const METEOFRANCE_VIGILANCE_URL=NETWORK_ENDPOINTS.meteoFrance.vigilanceCarte,VIGILANCE_EDGE_CACHE_TTL_SECONDS=600,VIGILANCE_SHARED_CACHE_TTL_SECONDS=600,ANALYTICS_MAX_BODY_BYTES=32*1024,ADMIN_COOKIE='mcx_admin';
function jsonResponse(payload,status=200,headers={}){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}});}
function methodNotAllowed(allow){return new Response('Method Not Allowed',{status:405,headers:{allow,'cache-control':'no-store'}});}
async function fetchUpstream(url,options={},timeoutMs=NETWORK_TIMEOUTS_MS.workerUpstream){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
function headOrBody(request,response){return request.method==='HEAD'?new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers}):response;}
function meteoFranceApiKey(env){return normalizeMeteoFranceApiKey(env?.METEOFRANCE_API_KEY);}
function vigilanceUnavailable(error,{configured=true,status=200}={}){return jsonResponse(vigilanceUnavailablePayload(error,{configured}),status,{'cache-control':'no-store','x-meteocompare-vigilance':'unavailable'});}
async function fetchMeteoFranceVigilance(env){const apiKey=meteoFranceApiKey(env);if(!apiKey){const error=new Error('METEOFRANCE_NOT_CONFIGURED');error.code='METEOFRANCE_NOT_CONFIGURED';throw error;}const upstream=await fetchUpstream(METEOFRANCE_VIGILANCE_URL,{method:'GET',headers:{Accept:'*/*',apikey:apiKey},redirect:'follow'});if(!upstream.ok)throw meteoFranceUpstreamError(upstream.status);return upstream;}
function analyticsStub(env){if(!env?.ANALYTICS)return null;return env.ANALYTICS.getByName?env.ANALYTICS.getByName('global'):env.ANALYTICS.get(env.ANALYTICS.idFromName('global'));}
function vigilanceClient(request){
  const explicit=String(request.headers.get('x-meteocompare-client')||'').trim().toLowerCase();
  if(explicit==='web'||explicit==='android')return explicit;
  const requestedWith=String(request.headers.get('x-requested-with')||'').trim().toLowerCase(),ua=String(request.headers.get('user-agent')||'');
  if(requestedWith==='com.meteocompare.app'||/meteocompare[^\n]*android|okhttp\//i.test(ua))return 'android';
  if(/mozilla\/5\.0|chrome\/|safari\/|firefox\/|edg\//i.test(ua))return 'web';
  return 'unknown';
}
function trackWorkerRequest(env,ctx,{service,client,cacheStatus='none',ok,status=null,upstreamMs=null,cacheAgeSeconds=null}){
  const stub=analyticsStub(env);if(!stub)return;
  const now=new Date(),record={ts:Math.floor(now.getTime()/1000),day:now.toISOString().slice(0,10),service,client,cache_status:cacheStatus,ok:Boolean(ok),status:status!=null&&Number.isFinite(Number(status))?Number(status):null,upstream_ms:upstreamMs!=null&&Number.isFinite(Number(upstreamMs))?Math.max(0,Math.round(Number(upstreamMs))):null,cache_age_seconds:cacheAgeSeconds!=null&&Number.isFinite(Number(cacheAgeSeconds))?Math.max(0,Math.round(Number(cacheAgeSeconds))):null};
  const task=stub.fetch('https://analytics.internal/worker-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(record)}).catch(()=>null);
  ctx?.waitUntil?.(task);
}
function vigilanceCacheStub(env){
  const binding=env?.VIGILANCE_CACHE;if(!binding)return null;
  return binding.getByName?binding.getByName('global'):binding.get(binding.idFromName('global'));
}
async function getSharedVigilanceCarte(env){
  const stub=vigilanceCacheStub(env);
  if(!stub){const started=Date.now(),upstream=await fetchMeteoFranceVigilance(env),upstreamMs=Date.now()-started,data=await upstream.json();return {data,storedAt:Math.floor(Date.now()/1000),source:'upstream',upstreamMs};}
  const response=await stub.fetch('https://vigilance-cache.internal/carte',{method:'GET'});
  if(!response.ok)throw new Error(`VIGILANCE_SHARED_CACHE_${response.status}`);
  return await response.json();
}
async function getVigilanceCarte(request,env,ctx){
  const requestUrl=new URL(request.url),cacheKey=new Request(`${requestUrl.origin}/_mcx/.cache/vigilance-carte-v3`,{method:'GET'}),cached=await caches.default.match(cacheKey);
  if(cached){const storedHeader=cached.headers.get('x-meteocompare-cache-stored-at'),storedAt=storedHeader==null?null:Number(storedHeader),cacheAgeSeconds=storedAt!=null&&Number.isFinite(storedAt)?Math.max(0,Math.floor(Date.now()/1000-storedAt)):null;return {data:await cached.json(),cacheStatus:'edge',upstreamMs:null,cacheAgeSeconds};}
  const shared=await getSharedVigilanceCarte(env),storedAt=Number(shared.storedAt),now=Math.floor(Date.now()/1000),cacheAgeSeconds=Number.isFinite(storedAt)?Math.max(0,now-storedAt):0,remaining=Math.max(1,VIGILANCE_SHARED_CACHE_TTL_SECONDS-cacheAgeSeconds),edgeTtl=Math.min(VIGILANCE_EDGE_CACHE_TTL_SECONDS,remaining),cacheResponse=jsonResponse(shared.data,200,{'cache-control':`public, max-age=${edgeTtl}`,'x-meteocompare-cache-stored-at':String(Number.isFinite(storedAt)?storedAt:now)});
  ctx?.waitUntil?.(caches.default.put(cacheKey,cacheResponse.clone()));
  return {data:shared.data,cacheStatus:shared.source==='shared'?'shared':'upstream',upstreamMs:shared.source==='upstream'?shared.upstreamMs:null,cacheAgeSeconds};
}
export async function proxyVigilance(request,env,ctx){
  if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');
  const url=new URL(request.url),department=String(url.searchParams.get('department')||'').trim().toUpperCase(),includeCoast=url.searchParams.get('coast')==='1',client=vigilanceClient(request);
  if(!VIGILANCE_DEPARTMENT_PATTERN.test(department)){trackWorkerRequest(env,ctx,{service:'vigilance',client,cacheStatus:'none',ok:false,status:400});return jsonResponse({error:'INVALID_DEPARTMENT'},400);}
  const started=Date.now();let result;try{result=await getVigilanceCarte(request,env,ctx);}catch(error){const response=vigilanceUnavailable(error,{configured:error?.code!=='METEOFRANCE_NOT_CONFIGURED'});trackWorkerRequest(env,ctx,{service:'vigilance',client,cacheStatus:'error',ok:false,status:response.status,upstreamMs:Date.now()-started});return headOrBody(request,response);}
  const response=jsonResponse(vigilanceDepartmentPayload(result.data,department,includeCoast),200,{'cache-control':'public, max-age=120','x-meteocompare-vigilance':'official'});trackWorkerRequest(env,ctx,{service:'vigilance',client,cacheStatus:result.cacheStatus,ok:true,status:200,upstreamMs:result.upstreamMs,cacheAgeSeconds:result.cacheAgeSeconds});return headOrBody(request,response);
}
function isLocalCloudflareRequest(request){try{const url=new URL(request.url),local=ANALYTICS_CONFIG.localDevelopment||{};return url.protocol==='http:'&&(local.hosts||[]).includes(url.hostname.toLowerCase())&&String(url.port||'')===String(local.port||'');}catch{return false;}}
export function proxySystemHealth(request,env){if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');return headOrBody(request,jsonResponse({ok:true,service:'meteocompare-worker',version:APP_VERSION,checkedAt:new Date().toISOString(),capabilities:{forecastProxy:false,vigilanceProxy:true,vigilanceConfigured:Boolean(meteoFranceApiKey(env)),vigilanceSharedCache:Boolean(env?.VIGILANCE_CACHE),analyticsStorage:Boolean(env?.ANALYTICS),analyticsHashing:Boolean(env?.ANALYTICS_HASH_SECRET),admin:Boolean(env?.ADMIN_PASSWORD&&env?.ADMIN_SESSION_SECRET)}},200,{'cache-control':'no-store','x-meteocompare-health':'ok'}));}
function botUserAgent(ua){return /bot|spider|crawler|headless|preview|slurp|bingpreview/i.test(ua||'');}
function deviceFromUa(ua){if(/ipad|tablet/i.test(ua))return 'tablet';if(/mobile|iphone|android/i.test(ua))return 'mobile';return 'desktop';}
function browserFromUa(ua){if(/edg\//i.test(ua))return 'edge';if(/firefox\//i.test(ua))return 'firefox';if(/chrome\//i.test(ua))return 'chrome';if(/safari\//i.test(ua))return 'safari';return 'other';}
function osFromUa(ua){if(/iphone|ipad|ipod/i.test(ua))return 'ios';if(/android/i.test(ua))return 'android';if(/windows/i.test(ua))return 'windows';if(/macintosh|mac os x/i.test(ua))return 'macos';if(/cros/i.test(ua))return 'chromeos';if(/linux/i.test(ua))return 'linux';return 'other';}
function toHex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return toHex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(value))));}
async function visitorHash(request,env,day){const secret=env?.ANALYTICS_HASH_SECRET;if(!secret)return null;const ip=request.headers.get('cf-connecting-ip')||'',ua=request.headers.get('user-agent')||'';return (await hmac(secret,`${day}|${ip}|${ua}`)).slice(0,24);}
function eventRecord(payload,request,visitor){const url=new URL(payload.url),props=payload.props||{},ref=payload.referrer?new URL(payload.referrer).hostname:null,now=new Date(),day=now.toISOString().slice(0,10),ua=request.headers.get('user-agent')||'';return {ts:Math.floor(now.getTime()/1000),day,name:payload.name,path:url.pathname,visitor,referrer:ref,utm_source:url.searchParams.get('utm_source'),utm_medium:url.searchParams.get('utm_medium'),utm_campaign:url.searchParams.get('utm_campaign'),country:request.cf?.country||null,device:deviceFromUa(ua),browser:browserFromUa(ua),os:osFromUa(ua),language:props.language||null,display_mode:props.display_mode||null,app_version:props.app_version||null,navigation:props.navigation||null,theme:props.effective_theme||null,density:props.density||null,props:Object.keys(props).length?JSON.stringify(props):null};}
export async function storeAnalyticsEvent(request,env){if(request.method!=='POST')return methodNotAllowed('POST');if(!env?.ANALYTICS)return jsonResponse({ok:false,error:'ANALYTICS_STORAGE_NOT_CONFIGURED'},503,{'cache-control':'no-store'});if(!env?.ANALYTICS_HASH_SECRET)return jsonResponse({ok:false,error:'ANALYTICS_HASH_NOT_CONFIGURED'},503,{'cache-control':'no-store'});const ua=request.headers.get('user-agent')||'';if(botUserAgent(ua))return jsonResponse({ok:true,dropped:'bot'},202,{'cache-control':'no-store'});const declared=Number(request.headers.get('content-length'));if(Number.isFinite(declared)&&declared>ANALYTICS_MAX_BODY_BYTES)return new Response('Payload Too Large',{status:413});const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>ANALYTICS_MAX_BODY_BYTES)return new Response('Payload Too Large',{status:413});let parsed;try{parsed=JSON.parse(raw);}catch{return new Response('Invalid analytics payload',{status:400});}const localDev=isLocalCloudflareRequest(request),allowedHosts=localDev?[...ANALYTICS_CONFIG.allowedHosts,...(ANALYTICS_CONFIG.localDevelopment?.hosts||[])]:ANALYTICS_CONFIG.allowedHosts,allowedProtocols=localDev?['https:','http:']:['https:'];const clean=sanitizeAnalyticsIngressPayload(parsed,{allowedHosts,allowedProtocols});if(!clean.ok)return jsonResponse({ok:false,error:clean.error},400,{'cache-control':'no-store'});const day=new Date().toISOString().slice(0,10),visitor=await visitorHash(request,env,day),record=eventRecord(clean.payload,request,visitor),response=await analyticsStub(env).fetch('https://analytics.internal/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(record)});return jsonResponse({ok:response.ok},response.ok?202:503,{'cache-control':'no-store'});}

function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64url(text){const raw=atob(String(text).replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((String(text).length+3)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function constantEqual(a,b){const x=new TextEncoder().encode(String(a)),y=new TextEncoder().encode(String(b));let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0;}
async function signSession(env,payload){const body=b64url(new TextEncoder().encode(JSON.stringify(payload))),sig=await hmac(env.ADMIN_SESSION_SECRET,body);return `${body}.${sig}`;}
async function verifySession(request,env){if(!env?.ADMIN_SESSION_SECRET)return false;const cookie=request.headers.get('cookie')||'',match=cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));if(!match)return false;const [body,sig]=match[1].split('.');if(!body||!sig||!constantEqual(await hmac(env.ADMIN_SESSION_SECRET,body),sig))return false;try{const payload=JSON.parse(new TextDecoder().decode(unb64url(body)));return Number(payload.exp)>Date.now()/1000;}catch{return false;}}
function adminConfigured(env){return Boolean(env?.ADMIN_PASSWORD&&env?.ADMIN_SESSION_SECRET&&env?.ANALYTICS);}
async function adminLogin(request,env){if(request.method!=='POST')return methodNotAllowed('POST');if(!adminConfigured(env))return jsonResponse({ok:false,error:'ADMIN_NOT_CONFIGURED'},503);let body;try{body=await request.json();}catch{return jsonResponse({ok:false},400);}if(!constantEqual(String(body?.password||''),String(env.ADMIN_PASSWORD||'')))return jsonResponse({ok:false,error:'INVALID_CREDENTIALS'},401,{'cache-control':'no-store'});const maxAge=12*3600,token=await signSession(env,{exp:Math.floor(Date.now()/1000)+maxAge}),secure=isLocalCloudflareRequest(request)?'':' Secure;';return jsonResponse({ok:true},200,{'cache-control':'no-store','set-cookie':`${ADMIN_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly;${secure} SameSite=Strict`});}
function adminLogout(request){if(request.method!=='POST')return methodNotAllowed('POST');const secure=isLocalCloudflareRequest(request)?'':' Secure;';return jsonResponse({ok:true},200,{'cache-control':'no-store','set-cookie':`${ADMIN_COOKIE}=; Max-Age=0; Path=/; HttpOnly;${secure} SameSite=Strict`});}
async function requireAdmin(request,env){return await verifySession(request,env);}
async function probe(name,url,options={}){const started=Date.now();try{const response=await fetchUpstream(url,{method:options.method||'GET',headers:options.headers||{},redirect:'follow'},5000);return {name,ok:response.ok,state:response.ok?'ok':'down',status:response.status,latencyMs:Date.now()-started};}catch(error){const reason=error?.name==='AbortError'?'timeout':'network';return {name,ok:false,state:'unknown',status:null,latencyMs:Date.now()-started,error:reason,detail:reason==='timeout'?'Sonde impossible : délai dépassé':'Sonde impossible : erreur réseau'};}}
async function collectServiceStatus(env){
  const services=[{name:'MeteoCompare Worker',ok:true,state:'ok',status:200,latencyMs:0,detail:`Version ${APP_VERSION}`},{name:'Stockage audience',ok:false,state:'unknown',status:null,latencyMs:null,detail:'Sonde interne indisponible'}];
  if(env?.ANALYTICS){const started=Date.now();try{const r=await analyticsStub(env).fetch('https://analytics.internal/health');let health={};try{health=await r.json();}catch{}services[1]={name:'Stockage audience',ok:r.ok,state:r.ok?'ok':'down',status:r.status,latencyMs:Date.now()-started,detail:r.ok?`${Number(health.events||0).toLocaleString('fr-FR')} événements · ${Number(health.workerRequests||0).toLocaleString('fr-FR')} requêtes Worker · ${Number(health.serviceChecks||0).toLocaleString('fr-FR')} sondes · rétention ${health.retentionDays||180} j`:`HTTP ${r.status}`};}catch{services[1]={name:'Stockage audience',ok:false,state:'unknown',status:null,latencyMs:Date.now()-started,detail:'Sonde interne impossible'};}}
  const checks=[probe('Open-Meteo Forecast','https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m'),probe('Open-Meteo Geocoding','https://geocoding-api.open-meteo.com/v1/search?name=Paris&count=1&language=fr&format=json'),probe('Open-Meteo Archive','https://archive-api.open-meteo.com/v1/archive?latitude=48.8566&longitude=2.3522&start_date=2026-01-01&end_date=2026-01-01&daily=temperature_2m_max'),probe('Open-Meteo Marine','https://marine-api.open-meteo.com/v1/marine?latitude=48.39&longitude=-4.49&current=wave_height'),probe('RainViewer','https://api.rainviewer.com/public/weather-maps.json')];
  if(meteoFranceApiKey(env))checks.push(probe('Météo-France Vigilance',METEOFRANCE_VIGILANCE_URL,{headers:{Accept:'*/*',apikey:meteoFranceApiKey(env)}}));else services.push({name:'Météo-France Vigilance',ok:false,state:'down',status:null,latencyMs:null,detail:'Non configuré'});
  return services.concat(await Promise.all(checks));
}
async function recordServiceChecks(env,services,{minimumIntervalSeconds=900}={}){
  const stub=analyticsStub(env);if(!stub||!Array.isArray(services)||!services.length)return;
  try{await stub.fetch('https://analytics.internal/service-checks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({minimumIntervalSeconds,checks:services})});}catch{}
}
const ADMIN_STATUS_MAX_AGE_SECONDS=900;
async function latestRecordedServiceStatus(env){
  const stub=analyticsStub(env);if(!stub)return null;
  try{const response=await stub.fetch('https://analytics.internal/latest-service-checks');if(!response.ok)return null;const snapshot=await response.json(),generatedAt=Date.parse(snapshot?.generatedAt||'');if(!Array.isArray(snapshot?.services)||!snapshot.services.length||!Number.isFinite(generatedAt))return null;return {generatedAt:new Date(generatedAt).toISOString(),ageSeconds:Math.max(0,Math.floor((Date.now()-generatedAt)/1000)),services:snapshot.services};}catch{return null;}
}
async function adminStatus(env){
  const recorded=await latestRecordedServiceStatus(env);
  if(recorded&&recorded.ageSeconds<ADMIN_STATUS_MAX_AGE_SECONDS)return {generatedAt:recorded.generatedAt,appVersion:APP_VERSION,services:recorded.services};
  const services=await collectServiceStatus(env);await recordServiceChecks(env,services,{minimumIntervalSeconds:ADMIN_STATUS_MAX_AGE_SECONDS});return {generatedAt:new Date().toISOString(),appVersion:APP_VERSION,services};
}
async function scheduledServiceSnapshot(env){const services=await collectServiceStatus(env);await recordServiceChecks(env,services,{minimumIntervalSeconds:1200});}
function noStorePrivateResponse(response){const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
async function noStoreAdminAsset(response){const secured=noStorePrivateResponse(response),headers=new Headers(secured.headers);headers.set('x-robots-tag','noindex, nofollow');headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');if(String(headers.get('content-type')||'').toLowerCase().includes('text/html'))headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");return new Response(secured.body,{status:secured.status,statusText:secured.statusText,headers});}
async function serveAdminPage(request,env){return noStoreAdminAsset(await env.ASSETS.fetch(request));}
async function serveAdminAsset(request,env,path){const target=new URL(request.url);target.pathname=path;return noStoreAdminAsset(await env.ASSETS.fetch(new Request(target,request)));}
async function serveApplicationAsset(request,env){const response=await env.ASSETS.fetch(request),url=new URL(request.url);if(request.method!=='GET'||!/^\/meteo\/[^/]+\/?$/i.test(url.pathname)||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;const body=injectBaseHref(await response.text(),'/'),headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');return new Response(body,{status:response.status,statusText:response.statusText,headers});}

export default {async fetch(request,env,ctx){const url=new URL(request.url),path=url.pathname;
  if(path===EVENT_PATH)return storeAnalyticsEvent(request,env);
  if(path===VIGILANCE_PATH)return proxyVigilance(request,env,ctx);
  if(path===HEALTH_PATH)return proxySystemHealth(request,env);
  if(path==='/_mcx/admin/session'){if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');return headOrBody(request,jsonResponse({authenticated:await verifySession(request,env),configured:adminConfigured(env)},200,{'cache-control':'no-store'}));}
  if(path==='/_mcx/admin/login')return adminLogin(request,env);
  if(path==='/_mcx/admin/logout')return adminLogout(request);
  if(path==='/_mcx/admin/analytics'){if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');if(!await requireAdmin(request,env))return jsonResponse({error:'UNAUTHORIZED'},401,{'cache-control':'no-store'});const days=Math.max(1,Math.min(180,Number(url.searchParams.get('days'))||30));const response=await analyticsStub(env).fetch(`https://analytics.internal/summary?days=${days}`);return headOrBody(request,noStorePrivateResponse(response));}
  if(path==='/_mcx/admin/status'){if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');if(!await requireAdmin(request,env))return jsonResponse({error:'UNAUTHORIZED'},401);return headOrBody(request,jsonResponse(await adminStatus(env),200,{'cache-control':'no-store'}));}
  if(path.startsWith('/_mcx/'))return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
  if(path==='/admin')return serveAdminPage(request,env);
  if(path==='/admin/')return Response.redirect(new URL('/admin',request.url),308);
  if(path==='/admin.js')return serveAdminAsset(request,env,'/admin.js');
  if(path==='/admin.css')return serveAdminAsset(request,env,'/admin.css');
  if(path==='/admin.html')return Response.redirect(new URL('/admin',request.url),302);
  return serveApplicationAsset(request,env);
},async scheduled(_controller,env,ctx){ctx.waitUntil(scheduledServiceSnapshot(env));}};
