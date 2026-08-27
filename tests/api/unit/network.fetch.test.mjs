import assert from 'node:assert/strict';
import { fetchNetworkResponse, fetchJsonResource } from '../../../js/network.js';

let captured=null;
const okFetch=async(url,options)=>{captured={url:String(url),options};return {ok:true,status:200,headers:{get:()=>null},json:async()=>({ok:true})};};
const payload=await fetchJsonResource('https://example.test/data',{fetchImpl:okFetch,timeoutMs:1000});
assert.deepEqual(payload,{ok:true});
assert.equal(captured.options.credentials,'omit');
assert.equal(captured.options.referrerPolicy,'no-referrer');
assert.equal(captured.options.headers.Accept,'application/json');

await assert.rejects(
  fetchNetworkResponse('https://example.test/error',{fetchImpl:async()=>({ok:false,status:429,headers:{get:name=>name==='retry-after'?'60':null}})}),
  error=>error.code==='HTTP_ERROR'&&error.status===429&&error.retryAfter==='60'
);

const hanging=(_url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);},{once:true});
});
await assert.rejects(
  fetchNetworkResponse('https://example.test/slow',{fetchImpl:hanging,timeoutMs:5}),
  error=>error.name==='AbortError'&&error.code==='NETWORK_TIMEOUT'
);

console.log('Unified network client defaults, HTTP errors and timeout: OK');
