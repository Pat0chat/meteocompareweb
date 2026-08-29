import assert from 'node:assert/strict';
import { proxyPlausibleEvent } from '../../../worker.js';
import { APP_VERSION } from '../../../js/version.js';

const originalFetch=globalThis.fetch;
const forwarded=[];
globalThis.fetch=async (url,options={})=>{
  forwarded.push({url:String(url),options});
  return new Response('{"ok":true}',{status:202,headers:{'content-type':'application/json','x-plausible-dropped':'1'}});
};

try{
  const request=new Request('https://meteocompare.app/_mcx/e',{
    method:'POST',
    headers:{
      'content-type':'text/plain;charset=UTF-8',
      'user-agent':'MeteoCompare-Test/1.0',
      'cf-connecting-ip':'203.0.113.42',
      'x-forwarded-for':'198.51.100.1',
    },
    body:JSON.stringify({
      n:'Forecast View Changed',
      u:'https://meteocompare.app/city?utm_source=test&secret=leak',
      d:'meteocompare.app',
      r:'https://www.google.com/search?q=private',
      p:{
        app_version:APP_VERSION,language:'fr',display_mode:'browser',navigation:'spa',
        control:'tab',value:'wind',city_id:'SECRET',weather_value:'PRIVATE',
      },
      i:false,
      $:{amount:999,currency:'EUR'},
      rogue:'x',
    }),
  });
  const response=await proxyPlausibleEvent(request);
  assert.equal(response.status,202);
  assert.equal(response.headers.get('x-meteocompare-analytics-proxy'),'forwarded');
  assert.equal(response.headers.get('x-plausible-dropped'),'1');
  assert.equal(forwarded.length,1);
  const sent=JSON.parse(forwarded[0].options.body);
  assert.equal(sent.n,'Forecast View Changed');
  assert.equal(sent.u,'https://meteocompare.app/city?utm_source=test');
  assert.equal(sent.d,'meteocompare.app');
  assert.equal(sent.r,'https://www.google.com/');
  assert.deepEqual(sent.p,{
    app_version:APP_VERSION,language:'fr',display_mode:'browser',navigation:'spa',control:'tab',value:'wind',
  });
  assert.equal(sent.i,true,'server schema must enforce interaction semantics');
  assert.equal('$' in sent,false,'revenue payloads are not part of MeteoCompare analytics');
  assert.equal('rogue' in sent,false);
  assert.equal(forwarded[0].options.headers.get('user-agent'),'MeteoCompare-Test/1.0');
  assert.equal(forwarded[0].options.headers.get('x-forwarded-for'),'203.0.113.42','trusted Cloudflare client IP must replace spoofable X-Forwarded-For');
  assert.equal(forwarded[0].options.headers.get('content-type'),'application/json');

  forwarded.length=0;
  const unknown=await proxyPlausibleEvent(new Request('https://meteocompare.app/_mcx/e',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({n:'Arbitrary Event',u:'https://meteocompare.app/',d:'meteocompare.app'})}));
  assert.equal(unknown.status,400);
  assert.equal(unknown.headers.get('x-meteocompare-analytics-reject'),'EVENT_NOT_ALLOWED');
  assert.equal(forwarded.length,0,'rejected analytics must not reach Plausible');

  const wrongDomain=await proxyPlausibleEvent(new Request('https://meteocompare.app/_mcx/e',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({n:'pageview',u:'https://meteocompare.app/',d:'evil.example'})}));
  assert.equal(wrongDomain.status,400);
  assert.equal(wrongDomain.headers.get('x-meteocompare-analytics-reject'),'DOMAIN_NOT_ALLOWED');
} finally {
  globalThis.fetch=originalFetch;
}

console.log('MeteoCompare Plausible proxy payload validation: OK');
