import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(){this.map=new Map();}
  getItem(k){return this.map.has(String(k))?this.map.get(String(k)):null;}
  setItem(k,v){this.map.set(String(k),String(v));}
  removeItem(k){this.map.delete(String(k));}
}
globalThis.localStorage=new MemoryStorage();

let calls=0;
let resolver;
globalThis.fetch=async url=>{
  calls++;
  if(String(url).includes('slow')) await new Promise(resolve=>{resolver=resolve;});
  if(String(url).includes('http-error')) return {ok:false,status:503,headers:{get:()=> '120'},json:async()=>({})};
  if(String(url).includes('provider-error')) return {ok:true,status:200,headers:{get:()=>null},json:async()=>({error:true,reason:'bad request'})};
  return {ok:true,status:200,headers:{get:()=>null},json:async()=>({ok:true,calls})};
};

const api=await import(`../../../js/api-budget.js?unit=${Date.now()}`);
api.resetApiUsage();
const first=await api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/forecast?x=1',{category:'forecast'});
assert.equal(first.ok,true);
assert.equal(calls,1);
let snapshot=api.apiUsageSnapshot();
assert.equal(snapshot.minute,1);
assert.equal(snapshot.categories.forecast,1);
assert.equal(snapshot.providerLimits.month,300000);

const cached=await api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/forecast?x=1',{category:'forecast',cacheTtlMs:60_000});
// First request did not request caching, so this one performs a fetch and seeds the cache.
assert.equal(calls,2);
const cachedAgain=await api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/forecast?x=1',{category:'forecast',cacheTtlMs:60_000});
assert.equal(calls,2,'fresh memory cache must avoid network and usage increments');
assert.deepEqual(cachedAgain,cached);

const p1=api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/slow',{category:'forecast'});
const p2=api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/slow',{category:'forecast'});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(calls,3,'same in-flight request must be deduplicated at the network layer');
resolver();
const [slowA,slowB]=await Promise.all([p1,p2]);
assert.deepEqual(slowA,slowB,'deduplicated callers must receive the same payload');
assert.equal(calls,3);

await assert.rejects(api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/http-error'), err=>err.code==='HTTP_ERROR'&&err.status===503&&err.retryAfter==='120');
await assert.rejects(api.fetchOpenMeteoJson('https://api.open-meteo.com/v1/provider-error'), err=>err.code==='OPEN_METEO_ERROR'&&err.reason==='bad request');

snapshot=api.apiUsageSnapshot();
assert.equal(snapshot.minute,5,'successful and failed network attempts both consume the local runaway budget');
api.resetApiUsage();
assert.equal(api.apiUsageSnapshot().minute,0);

console.log('Open-Meteo request budget, cache, dedupe and structured failures: OK');
