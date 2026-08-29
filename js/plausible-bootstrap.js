import { ANALYTICS_CONFIG } from './analytics-config.js';

const host=String(globalThis.location?.hostname||'').toLowerCase();
const allowedHost=ANALYTICS_CONFIG.allowedHosts.includes(host);
const dnt=String(globalThis.navigator?.doNotTrack||globalThis.doNotTrack||'').toLowerCase();
const privacySignal=globalThis.navigator?.globalPrivacyControl===true||dnt==='1'||dnt==='yes';

function storageOptedOut(){try{return globalThis.localStorage?.getItem(ANALYTICS_CONFIG.optOutStorageKey)==='1';}catch{return false;}}
function shouldLoad(){return allowedHost&&!privacySignal&&!storageOptedOut();}

globalThis.plausible=globalThis.plausible||function plausibleQueue(){(globalThis.plausible.q=globalThis.plausible.q||[]).push(arguments);};
globalThis.plausible.init=globalThis.plausible.init||function plausibleInit(options){globalThis.plausible.o=options||{};};

globalThis.plausible.init({
  endpoint:ANALYTICS_CONFIG.endpoint,
  autoCapturePageviews:false,
  captureOnLocalhost:false,
  outboundLinks:false,
  fileDownloads:false,
  formSubmissions:false,
  transformRequest(payload){
    if(!payload?.r)return payload;
    try{
      const referrer=new URL(payload.r);
      payload.r=(referrer.protocol==='http:'||referrer.protocol==='https:')&&referrer.origin!==globalThis.location.origin?`${referrer.origin}/`:null;
    }catch{payload.r=null;}
    return payload;
  },
});

const runtimeStatus=globalThis.__METEOCOMPARE_ANALYTICS_RUNTIME__={
  state:'disabled',checkedAt:Date.now(),lastDeliveryAt:null,lastDeliveryStatus:null,lastDeliveryError:null,
};
let scriptNode=null;
function publishRuntimeStatus(state,patch={}){
  runtimeStatus.state=state;runtimeStatus.checkedAt=Date.now();Object.assign(runtimeStatus,patch);
  try{globalThis.dispatchEvent?.(new CustomEvent('meteocompare:analytics-runtime',{detail:{...runtimeStatus}}));}catch{}
}
function ensureScript(force=false){
  if(!shouldLoad()){publishRuntimeStatus('disabled');return false;}
  if(!force&&(runtimeStatus.state==='loaded'||runtimeStatus.state==='loading'))return true;
  if(!force&&scriptNode?.dataset?.meteocompareAnalyticsLoaded==='true'){publishRuntimeStatus('loaded',{lastDeliveryError:null});return true;}
  if(scriptNode){try{scriptNode.remove();}catch{}scriptNode=null;}
  publishRuntimeStatus('loading',{lastDeliveryError:null});
  const script=document.createElement('script');script.async=true;script.src=ANALYTICS_CONFIG.scriptSrc;script.dataset.meteocompareAnalytics='plausible';scriptNode=script;
  script.addEventListener('load',()=>{script.dataset.meteocompareAnalyticsLoaded='true';publishRuntimeStatus('loaded');},{once:true});
  script.addEventListener('error',()=>publishRuntimeStatus('error',{lastDeliveryError:'script'}),{once:true});
  document.head.appendChild(script);return true;
}
function reconcile(){if(shouldLoad())ensureScript(false);else publishRuntimeStatus('disabled');return {...runtimeStatus};}
function reportDelivery(result){
  const now=Date.now(),status=Number(result?.status);
  if(Number.isFinite(status)){
    if(status>=200&&status<300)publishRuntimeStatus('loaded',{lastDeliveryAt:now,lastDeliveryStatus:status,lastDeliveryError:null});
    else publishRuntimeStatus('error',{lastDeliveryAt:now,lastDeliveryStatus:status,lastDeliveryError:'http'});
    return;
  }
  if(result?.error)publishRuntimeStatus('error',{lastDeliveryAt:now,lastDeliveryStatus:null,lastDeliveryError:'network'});
}
function retry(){return ensureScript(true);}

globalThis.__METEOCOMPARE_ANALYTICS_CONTROL__={reconcile,retry,reportDelivery,status:()=>({...runtimeStatus})};
reconcile();
