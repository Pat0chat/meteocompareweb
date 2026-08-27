import { NETWORK_TIMEOUTS_MS } from './network-config.js';

function httpError(response){
  const error=new Error(`HTTP ${response?.status??'ERROR'}`);
  error.code='HTTP_ERROR';
  error.status=response?.status??null;
  error.retryAfter=response?.headers?.get?.('retry-after')||null;
  return error;
}

function timeoutError(timeoutMs){
  const error=new Error(`Network timeout after ${timeoutMs} ms`);
  error.name='AbortError';
  error.code='NETWORK_TIMEOUT';
  error.timeoutMs=timeoutMs;
  return error;
}

export async function fetchNetworkResponse(url,{
  timeoutMs=NETWORK_TIMEOUTS_MS.defaultJson,
  signal=null,
  fetchImpl=globalThis.fetch,
  method='GET',
  headers=null,
  body=null,
  cache='default',
  credentials='omit',
  referrerPolicy='no-referrer',
  redirect='follow',
}={}){
  if(typeof fetchImpl!=='function'){const error=new Error('FETCH_UNAVAILABLE');error.code='FETCH_UNAVAILABLE';throw error;}
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();else signal?.addEventListener?.('abort',abort,{once:true});
  const timer=Number.isFinite(timeoutMs)&&timeoutMs>0?setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs):null;
  try{
    let response;
    try{response=await fetchImpl(url,{method,headers:headers||undefined,body,cache,credentials,referrerPolicy,redirect,signal:controller.signal});}
    catch(error){if(timedOut)throw timeoutError(timeoutMs);throw error;}
    if(!response?.ok)throw httpError(response);
    return response;
  }finally{
    if(timer)clearTimeout(timer);
    signal?.removeEventListener?.('abort',abort);
  }
}

export async function fetchJsonResource(url,options={}){
  const headers={Accept:'application/json',...(options.headers||{})};
  const response=await fetchNetworkResponse(url,{...options,headers});
  try{return await response.json();}
  catch(cause){const error=new Error('INVALID_JSON_RESPONSE');error.code='INVALID_JSON_RESPONSE';error.cause=cause;throw error;}
}

export async function fetchBlobResource(url,options={}){
  const response=await fetchNetworkResponse(url,options);
  return response.blob();
}
