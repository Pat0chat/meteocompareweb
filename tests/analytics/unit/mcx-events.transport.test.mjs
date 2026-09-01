import assert from 'node:assert/strict';

const storage=new Map();
const requests=[];
Object.defineProperty(globalThis,'location',{configurable:true,value:{hostname:'meteocompare.app',origin:'https://meteocompare.app',href:'https://meteocompare.app/city'}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{doNotTrack:'0',globalPrivacyControl:false}});
Object.defineProperty(globalThis,'document',{configurable:true,value:{referrer:'https://www.google.com/search?q=private-query'}});
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)}});
Object.defineProperty(globalThis,'dispatchEvent',{configurable:true,value:()=>true});
Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}}});
Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(url,options)=>{requests.push({url,options});return new Response('{}',{status:202,headers:{'content-type':'application/json'}});}});

await import(`../../../js/mcx-events.js?transport-test=${Date.now()}`);
assert.equal(typeof globalThis.plausible,'function');
assert.equal(globalThis.__METEOCOMPARE_ANALYTICS_RUNTIME__.state,'loaded');

const delivered=await new Promise(resolve=>globalThis.plausible('pageview',{
  url:'https://meteocompare.app/city?utm_source=test',
  props:{page_group:'/city',language:'fr'},
  callback:resolve,
}));
assert.equal(delivered.status,202);
assert.equal(requests.length,1);
assert.equal(requests[0].url,'/_mcx/e','browser transport must remain first-party');
assert.equal(requests[0].options.credentials,'omit');
assert.equal(requests[0].options.referrerPolicy,'no-referrer');
assert.equal(requests[0].options.keepalive,true);
const payload=JSON.parse(requests[0].options.body);
assert.equal(payload.n,'pageview');
assert.equal(payload.u,'https://meteocompare.app/city?utm_source=test');
assert.equal(payload.d,'meteocompare.app');
assert.equal(payload.r,'https://www.google.com/','external referrer must be reduced to its origin in-browser');
assert.deepEqual(payload.p,{page_group:'/city',language:'fr'});
assert.ok(!JSON.stringify(requests[0]).includes('plausible.io'),'browser request must not expose the Plausible upstream');

globalThis.__METEOCOMPARE_ANALYTICS_CONTROL__.reportDelivery(delivered);
assert.equal(globalThis.__METEOCOMPARE_ANALYTICS_RUNTIME__.lastDeliveryStatus,202);
assert.equal(globalThis.__METEOCOMPARE_ANALYTICS_RUNTIME__.lastDeliveryError,null);

storage.set('meteocompare.web.analytics.optout.v1','1');
globalThis.__METEOCOMPARE_ANALYTICS_CONTROL__.reconcile();
const disabled=await new Promise(resolve=>globalThis.plausible('pageview',{url:'https://meteocompare.app/',callback:resolve}));
assert.equal(disabled.error,'disabled');
assert.equal(requests.length,1,'opt-out must prevent any network request');
console.log('MeteoCompare first-party analytics browser transport: OK');
