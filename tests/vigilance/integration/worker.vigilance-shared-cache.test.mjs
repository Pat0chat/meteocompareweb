import assert from 'node:assert/strict';
import { VigilanceCache, proxyVigilance } from '../../../worker.js';

const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
const upstreamPayload={product:{periods:[{timelaps:{domain_id:'FRANCE'}}],meta:{source:'test'}}};
let upstreamCalls=0;
const storageMap=new Map();
const storage={async get(key){return storageMap.get(key);},async put(key,value){storageMap.set(key,value);}};
try{
  globalThis.fetch=async()=>{upstreamCalls++;return new Response(JSON.stringify(upstreamPayload),{status:200,headers:{'content-type':'application/json'}});};
  const shared=new VigilanceCache({storage},{METEOFRANCE_API_KEY:'test-key'});
  const first=await (await shared.fetch(new Request('https://cache.internal/carte'))).json();
  assert.equal(first.source,'upstream');
  assert.equal(upstreamCalls,1);
  const second=await (await shared.fetch(new Request('https://cache.internal/carte'))).json();
  assert.equal(second.source,'shared');
  assert.equal(upstreamCalls,1,'shared Durable Object cache must prevent a second Météo-France call');

  let edgePutResponse=null;
  globalThis.caches={default:{async match(){return undefined;},async put(_key,response){edgePutResponse=response;}}};
  const analyticsWrites=[];
  const env={
    METEOFRANCE_API_KEY:'not-used',
    VIGILANCE_CACHE:{getByName(){return {fetch:(input,init)=>shared.fetch(input instanceof Request?input:new Request(input,init))};}},
    ANALYTICS:{getByName(){return {fetch:async(_url,options={})=>{analyticsWrites.push(JSON.parse(options.body));return Response.json({ok:true});}}}},
  };
  const tasks=[],ctx={waitUntil(task){tasks.push(task);}};
  const response=await proxyVigilance(new Request('https://meteocompare.app/_mcx/vigilance?department=75',{headers:{'X-MeteoCompare-Client':'web'}}),env,ctx);
  assert.equal(response.status,200);
  await Promise.all(tasks);
  assert.equal(analyticsWrites.at(-1)?.cache_status,'shared');
  assert.ok(edgePutResponse,'L2 result must populate L1 edge cache');
  const cacheControl=edgePutResponse.headers.get('cache-control')||'';
  assert.match(cacheControl,/max-age=\d+/);
  const ttl=Number(cacheControl.match(/max-age=(\d+)/)?.[1]);
  assert.ok(ttl>0&&ttl<=600,'edge TTL must never exceed 10 minutes or the remaining shared-cache lifetime');
} finally {
  globalThis.fetch=originalFetch;
  globalThis.caches=originalCaches;
}
console.log('Vigilance two-level edge/shared cache and telemetry: OK');
