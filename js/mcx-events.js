import { ANALYTICS_CONFIG } from './analytics-config.js';
import { NETWORK_TIMEOUTS_MS } from './network-config.js';

const host=String(globalThis.location?.hostname||'').toLowerCase();
const allowedHost=ANALYTICS_CONFIG.allowedHosts.includes(host);
const dnt=String(globalThis.navigator?.doNotTrack||globalThis.doNotTrack||'').toLowerCase();
const privacySignal=globalThis.navigator?.globalPrivacyControl===true||dnt==='1'||dnt==='yes';

function storageOptedOut(){try{return globalThis.localStorage?.getItem(ANALYTICS_CONFIG.optOutStorageKey)==='1';}catch{return false;}}
function shouldLoad(){return allowedHost&&!privacySignal&&!storageOptedOut();}

const runtimeStatus=globalThis.__METEOCOMPARE_ANALYTICS_RUNTIME__={
  state:'disabled',checkedAt:Date.now(),lastDeliveryAt:null,lastDeliveryStatus:null,lastDeliveryError:null,
};
function publishRuntimeStatus(state,patch={}){
  runtimeStatus.state=state;runtimeStatus.checkedAt=Date.now();Object.assign(runtimeStatus,patch);
  try{globalThis.dispatchEvent?.(new CustomEvent('meteocompare:analytics-runtime',{detail:{...runtimeStatus}}));}catch{}
}

function safeReferrer(){
  const raw=String(globalThis.document?.referrer||'').trim();if(!raw)return null;
  try{
    const referrer=new URL(raw),origin=globalThis.location?.origin;
    return (referrer.protocol==='http:'||referrer.protocol==='https:')&&referrer.origin!==origin?`${referrer.origin}/`:null;
  }catch{return null;}
}
function analyticsPayload(name,options={}){
  const payload={n:String(name||''),u:String(options.url||globalThis.location?.href||''),d:ANALYTICS_CONFIG.domain};
  const referrer=safeReferrer();if(referrer)payload.r=referrer;
  if(options.props&&typeof options.props==='object'&&!Array.isArray(options.props))payload.p=options.props;
  if(name!=='pageview')payload.i=options.interactive!==false;
  return payload;
}
function callback(options,result){try{options?.callback?.(result);}catch{}}
async function deliver(name,options={}){
  if(!shouldLoad()){callback(options,{error:'disabled'});return false;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),NETWORK_TIMEOUTS_MS.analyticsEvent);
  try{
    const response=await globalThis.fetch(ANALYTICS_CONFIG.endpoint,{
      method:'POST',
      headers:{'content-type':'text/plain;charset=UTF-8','accept':'application/json'},
      body:JSON.stringify(analyticsPayload(name,options)),
      cache:'no-store',
      credentials:'omit',
      referrerPolicy:'no-referrer',
      keepalive:true,
      signal:controller.signal,
    });
    callback(options,{status:response.status,ok:response.ok});
    return response.ok;
  }catch(error){
    callback(options,{error:error?.name==='AbortError'?'timeout':'network'});
    return false;
  }finally{clearTimeout(timer);}
}

// Keep the tiny plausible(name, options) API expected by analytics.js, but send
// directly to MeteoCompare's opaque first-party endpoint. The browser never
// loads the provider tracker or connects to its upstream host; only the
// Cloudflare Worker forwards validated payloads server-side.
globalThis.plausible=function meteocompareAnalyticsTransport(name,options={}){void deliver(name,options);};
globalThis.plausible.init=function plausibleInit(options){globalThis.plausible.o=options||{};};
globalThis.plausible.init({endpoint:ANALYTICS_CONFIG.endpoint,autoCapturePageviews:false,outboundLinks:false,fileDownloads:false,formSubmissions:false});

function reconcile(){publishRuntimeStatus(shouldLoad()?'loaded':'disabled',{lastDeliveryError:null});return {...runtimeStatus};}
function reportDelivery(result){
  const now=Date.now(),status=Number(result?.status);
  if(Number.isFinite(status)){
    if(status>=200&&status<300)publishRuntimeStatus('loaded',{lastDeliveryAt:now,lastDeliveryStatus:status,lastDeliveryError:null});
    else publishRuntimeStatus('error',{lastDeliveryAt:now,lastDeliveryStatus:status,lastDeliveryError:'http'});
    return;
  }
  if(result?.error&&result.error!=='disabled')publishRuntimeStatus('error',{lastDeliveryAt:now,lastDeliveryStatus:null,lastDeliveryError:'network'});
}
function retry(){return reconcile();}

globalThis.__METEOCOMPARE_ANALYTICS_CONTROL__={reconcile,retry,reportDelivery,status:()=>({...runtimeStatus})};
reconcile();
