import assert from 'node:assert/strict';
import fs from 'node:fs';
import { proxyVigilance } from '../../../worker.js';

const source=fs.readFileSync(new URL('../../../js/features/vigilance.js',import.meta.url),'utf8');
assert.match(source,/X-MeteoCompare-Client['"]?:?['"]web|['"]X-MeteoCompare-Client['"]\s*:\s*['"]web['"]/,'web Vigilance requests must identify the web client explicitly');

const originalCaches=globalThis.caches;
const raw={product:{periods:[],meta:{}}};
globalThis.caches={default:{async match(){return new Response(JSON.stringify(raw),{headers:{'content-type':'application/json'}});},async put(){}}};
const writes=[],tasks=[];
const env={
  METEOFRANCE_API_KEY:'unused-on-cache-hit',
  ANALYTICS:{getByName(){return {fetch:async(_url,options={})=>{writes.push(JSON.parse(options.body));return Response.json({ok:true});}}}},
};
const ctx={waitUntil(task){tasks.push(task);}};
try{
  const response=await proxyVigilance(new Request('https://meteocompare.app/_mcx/vigilance?department=91',{headers:{'X-MeteoCompare-Client':'android','User-Agent':'MeteoCompare Android/2.1'}}),env,ctx);
  assert.equal(response.status,200);
  await Promise.all(tasks);
  assert.equal(writes.length,1);
  assert.deepEqual({service:writes[0].service,client:writes[0].client,cache_status:writes[0].cache_status,ok:writes[0].ok,status:writes[0].status},{service:'vigilance',client:'android',cache_status:'hit',ok:true,status:200});
  const forbiddenKeys=['department','city','latitude','longitude','user-agent','userAgent'];
  for(const key of forbiddenKeys)assert.equal(Object.hasOwn(writes[0],key),false,`operational Vigilance analytics must not persist ${key}`);
  const serialized=JSON.stringify(writes[0]);
  assert.doesNotMatch(serialized,/MeteoCompare Android/i,'operational Vigilance analytics must not persist the raw user agent');
} finally { globalThis.caches=originalCaches; }
console.log('Vigilance operational analytics and Web/Android attribution: OK');
