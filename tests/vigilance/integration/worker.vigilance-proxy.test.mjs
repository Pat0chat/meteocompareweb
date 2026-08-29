import assert from 'node:assert/strict';
import { proxyVigilance } from '../../../worker.js';

const originalFetch=globalThis.fetch;
const originalCaches=globalThis.caches;
let stored=null;
globalThis.caches={default:{
  async match(){return stored?.clone?.()||null;},
  async put(_key,response){stored=response.clone();},
}};
const ctx={waitUntil(promise){return promise;}};
const raw={product:{update_time:'2026-08-28T16:00:45Z',periods:[
  {echeance:'J',begin_validity_time:'2026-08-28T16:00:00Z',end_validity_time:'2026-08-28T23:00:00Z',timelaps:{domain_ids:[
    {domain_id:'91',max_color_id:3,phenomenon_items:[
      {phenomenon_id:'2',phenomenon_max_color_id:3,timelaps_items:[{begin_time:'2026-08-28T16:00:00Z',end_time:'2026-08-28T20:00:00Z',color_id:3},{begin_time:'2026-08-28T20:00:00Z',end_time:'2026-08-28T23:00:00Z',color_id:2}]},
      {phenomenon_id:'4',phenomenon_max_color_id:3,timelaps_items:[]},
    ]}
  ]}},
  {echeance:'J1',begin_validity_time:'2026-08-28T23:00:00Z',end_validity_time:'2026-08-29T23:00:00Z',timelaps:{domain_ids:[{domain_id:'91',max_color_id:1,phenomenon_items:[]}]}},
],meta:{product_datetime:'2026-08-28T16:00:00+00:00',generation_timestamp:'2026-08-28T16:00:45+00:00'}}};
let calls=[];
globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),options});
  assert.equal(options.method,'GET');
  assert.equal(options.headers.apikey,'api-key-secret');
  assert.equal(options.headers.Authorization,undefined,'DPVigilance API Key must not be sent as OAuth Bearer');
  assert.equal(options.headers.Accept,'*/*');
  assert.doesNotMatch(String(url),/api-key-secret/,'API Key must not be placed in the upstream URL');
  assert.doesNotMatch(String(url),/\/token(?:\?|$)/,'API Key flow must not call an OAuth token endpoint');
  return new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const response=await proxyVigilance(new Request('https://meteocompare.example/_mcx/vigilance?department=91'),{METEOFRANCE_API_KEY:'Bearer api-key-secret'},ctx);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.configured,true);
  assert.equal(body.unavailable,false);
  assert.equal(body.department,'91');
  assert.equal(body.periods.length,2);
  assert.equal(body.periods[0].maxColorId,3);
  const rain=body.periods[0].phenomena.find(row=>row.id==='2');
  assert.deepEqual(rain.intervals.map(row=>row.colorId),[3,2]);
  const flood=body.periods[0].phenomena.find(row=>row.id==='4');
  assert.equal(flood.intervals.length,1,'phenomena without detailed timelaps must remain visible');
  assert.equal(flood.intervals[0].timingApproximate,true);
  assert.equal(calls.length,1,'API Key flow must perform only the national vigilance request');

  stored=null;
  const notConfigured=await proxyVigilance(new Request('https://meteocompare.example/_mcx/vigilance?department=29'),{},ctx);
  assert.equal(notConfigured.status,200);
  const fallback=await notConfigured.json();
  assert.equal(fallback.configured,false);
  assert.equal(fallback.unavailable,true);

  stored=null;calls=[];
  globalThis.fetch=async()=>new Response('Forbidden',{status:403});
  const unauthorized=await proxyVigilance(new Request('https://meteocompare.example/_mcx/vigilance?department=75'),{METEOFRANCE_API_KEY:'api-key-secret'},ctx);
  const unauthorizedBody=await unauthorized.json();
  assert.equal(unauthorized.status,200);
  assert.equal(unauthorizedBody.configured,true);
  assert.equal(unauthorizedBody.unavailable,true);
  assert.equal(unauthorizedBody.error,'METEOFRANCE_AUTH_FAILED');
  assert.equal(unauthorizedBody.upstreamStatus,403);
  assert.equal(unauthorizedBody.diagnostic,'FORBIDDEN');
  assert.equal(unauthorizedBody.authMode,'api_key_header');

  stored=null;calls=[];
  globalThis.fetch=async()=>new Response('Invalid credential',{status:401});
  const invalidCredential=await proxyVigilance(new Request('https://meteocompare.example/_mcx/vigilance?department=50'),{METEOFRANCE_API_KEY:'api-key-secret'},ctx);
  const invalidCredentialBody=await invalidCredential.json();
  assert.equal(invalidCredentialBody.error,'METEOFRANCE_AUTH_FAILED');
  assert.equal(invalidCredentialBody.upstreamStatus,401);
  assert.equal(invalidCredentialBody.diagnostic,'INVALID_CREDENTIAL');
} finally {
  globalThis.fetch=originalFetch;
  globalThis.caches=originalCaches;
}
console.log('Météo-France Vigilance Worker proxy, API Key and timeline extraction: OK');
