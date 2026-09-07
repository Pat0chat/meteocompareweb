import { ANALYTICS_CONFIG } from './analytics-config.js';
import { NETWORK_TIMEOUTS_MS } from './network-config.js';

const host=String(globalThis.location?.hostname||'').toLowerCase();
const localDevelopment=ANALYTICS_CONFIG.localDevelopment||{};
const localHost=(localDevelopment.hosts||[]).includes(host)&&String(globalThis.location?.port||'')===String(localDevelopment.port||'')&&String(globalThis.location?.protocol||'')==='http:';
const allowedHost=ANALYTICS_CONFIG.allowedHosts.includes(host)||localHost;
const dnt=String(globalThis.navigator?.doNotTrack||globalThis.doNotTrack||'').toLowerCase();
const privacySignal=globalThis.navigator?.globalPrivacyControl===true||dnt==='1'||dnt==='yes';

function storageOptedOut(){try{return globalThis.localStorage?.getItem(ANALYTICS_CONFIG.optOutStorageKey)==='1';}catch{return false;}}
function shouldLoad(){return allowedHost&&!privacySignal&&!storageOptedOut();}

const runtimeStatus=globalThis.__METEOCOMPARE_ANALYTICS_RUNTIME__={state:'disabled',checkedAt:Date.now(),lastDeliveryAt:null,lastDeliveryStatus:null,lastDeliveryError:null};
function publishRuntimeStatus(state,patch={}){runtimeStatus.state=state;runtimeStatus.checkedAt=Date.now();Object.assign(runtimeStatus,patch);try{globalThis.dispatchEvent?.(new CustomEvent('meteocompare:analytics-runtime',{detail:{...runtimeStatus}}));}catch{}}
function safeReferrer(){const raw=String(globalThis.document?.referrer||'').trim();if(!raw)return null;try{const referrer=new URL(raw),origin=globalThis.location?.origin;return (referrer.protocol==='http:'||referrer.protocol==='https:')&&referrer.origin!==origin?`${referrer.origin}/`:null;}catch{return null;}}
function analyticsPayload(name,options={}){const payload={name:String(name||''),url:String(options.url||globalThis.location?.href||'')};const referrer=safeReferrer();if(referrer)payload.referrer=referrer;if(options.props&&typeof options.props==='object'&&!Array.isArray(options.props))payload.props=options.props;if(name!=='pageview')payload.interactive=options.interactive!==false;return payload;}
function callback(options,result){try{options?.callback?.(result);}catch{}}
async function deliver(name,options={}){
  if(!shouldLoad()){callback(options,{error:'disabled'});return false;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),NETWORK_TIMEOUTS_MS.analyticsEvent);
  try{
    const response=await globalThis.fetch(ANALYTICS_CONFIG.endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(analyticsPayload(name,options)),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:controller.signal});
    callback(options,{status:response.status,ok:response.ok});return response.ok;
  }catch(error){callback(options,{error:error?.name==='AbortError'?'timeout':'network'});return false;}finally{clearTimeout(timer);}
}

globalThis.meteocompareTrack=function meteocompareTrack(name,options={}){void deliver(name,options);};
function reconcile(){publishRuntimeStatus(shouldLoad()?'loaded':'disabled',{lastDeliveryError:null});return {...runtimeStatus};}
function reportDelivery(result){const now=Date.now(),status=Number(result?.status);if(Number.isFinite(status)){if(status>=200&&status<300)publishRuntimeStatus('loaded',{lastDeliveryAt:now,lastDeliveryStatus:status,lastDeliveryError:null});else publishRuntimeStatus('error',{lastDeliveryAt:now,lastDeliveryStatus:status,lastDeliveryError:'http'});return;}if(result?.error&&result.error!=='disabled')publishRuntimeStatus('error',{lastDeliveryAt:now,lastDeliveryStatus:null,lastDeliveryError:'network'});}
globalThis.__METEOCOMPARE_ANALYTICS_CONTROL__={reconcile,retry:reconcile,reportDelivery,status:()=>({...runtimeStatus})};
reconcile();
