import assert from 'node:assert/strict';
import { proxyModelMetadata } from '../../../worker.js';
import { NETWORK_ENDPOINTS } from '../../../js/network-config.js';

assert.equal(NETWORK_ENDPOINTS.openMeteo.modelMetadataUpstream,'https://map-tiles.open-meteo.com/data_spatial');

const previousFetch=globalThis.fetch;
const previousCaches=globalThis.caches;
const puts=[];
globalThis.caches={default:{match:async()=>null,put:async(req,res)=>puts.push([req,res])}};
try{
  globalThis.fetch=async url=>{
    assert.equal(String(url),'https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json');
    return new Response('Forbidden',{status:403});
  };
  const fallback=await proxyModelMetadata(new Request('https://meteocompare.app/_mcx/model-metadata?key=dwd_icon'),{waitUntil(){}});
  assert.equal(fallback.status,200,'upstream authorization errors must not leak as first-party 403 responses');
  assert.equal(fallback.headers.get('x-meteocompare-model-metadata'),'forecast-run-fallback');
  const fallbackJson=await fallback.json();
  assert.equal(fallbackJson.unavailable,true);
  assert.equal(fallbackJson.forecastFallback,true);
  assert.equal(fallbackJson.error,'UPSTREAM_HTTP_403');
  assert.equal(puts.length,0,'fallback responses must never be cached as successful metadata');

  globalThis.fetch=async()=>new Response(JSON.stringify({completed:true,reference_time:'2026-08-28T00:00:00Z',last_modified_time:'2026-08-28T01:00:00Z',valid_times:[],variables:['temperature_2m']}),{status:200,headers:{'content-type':'application/json'}});
  const ok=await proxyModelMetadata(new Request('https://meteocompare.app/_mcx/model-metadata?key=dwd_icon'),{waitUntil(p){p?.catch?.(()=>{});}});
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).reference_time,'2026-08-28T00:00:00Z');
  assert.equal(puts.length,1,'successful metadata should populate the edge cache');
} finally {
  globalThis.fetch=previousFetch;
  globalThis.caches=previousCaches;
}

console.log('tests/forecast/regression/model-metadata-proxy-fallback.test.mjs: OK');
