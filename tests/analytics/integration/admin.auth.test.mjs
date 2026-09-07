import assert from 'node:assert/strict';
import worker from '../../../worker.js';

const env={
  ADMIN_PASSWORD:'a-very-strong-test-password',
  ADMIN_SESSION_SECRET:'session-secret-long-enough-for-test-only',
  ANALYTICS_HASH_SECRET:'analytics-secret-long-enough-for-test-only',
  ANALYTICS:{getByName(){return {fetch:async()=>new Response('{}',{status:200,headers:{'content-type':'application/json'}})}}},
  ASSETS:{fetch:async()=>new Response('asset')},
};
const ctx={waitUntil(){}};
let response=await worker.fetch(new Request('https://meteocompare.app/_mcx/admin/session'),env,ctx);
assert.equal((await response.json()).authenticated,false);
response=await worker.fetch(new Request('https://meteocompare.app/_mcx/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'wrong'})}),env,ctx);
assert.equal(response.status,401);
response=await worker.fetch(new Request('https://meteocompare.app/_mcx/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})}),env,ctx);
assert.equal(response.status,200);
const cookie=response.headers.get('set-cookie');
assert.match(cookie,/mcx_admin=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
const cookieHeader=cookie.split(';',1)[0];
response=await worker.fetch(new Request('https://meteocompare.app/_mcx/admin/session',{headers:{cookie:cookieHeader}}),env,ctx);
assert.equal((await response.json()).authenticated,true);
response=await worker.fetch(new Request('https://meteocompare.app/_mcx/admin/analytics'),env,ctx);
assert.equal(response.status,401);
response=await worker.fetch(new Request('http://localhost:8787/_mcx/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})}),env,ctx);
assert.equal(response.status,200);
const localCookie=response.headers.get('set-cookie');assert.doesNotMatch(localCookie,/; Secure/,'local HTTP admin cookie must be usable during wrangler dev');assert.match(localCookie,/HttpOnly/);assert.match(localCookie,/SameSite=Strict/);

const assetRequests=[];
const routeEnv={...env,ASSETS:{fetch:async request=>{assetRequests.push(new URL(request.url).pathname);return new Response('<!doctype html><title>Admin</title>',{status:200,headers:{'content-type':'text/html'}});}}};
response=await worker.fetch(new Request('http://127.0.0.1:8787/admin'),routeEnv,ctx);
assert.equal(response.status,200,'/admin must be served directly without redirect loop');
assert.equal(response.headers.get('cache-control'),'no-store');
assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
assert.deepEqual(assetRequests,['/admin'],'the assets binding must receive canonical /admin, not /admin.html');
response=await worker.fetch(new Request('http://127.0.0.1:8787/admin/'),routeEnv,ctx);
assert.equal(response.status,308);
assert.equal(response.headers.get('location'),'http://127.0.0.1:8787/admin');

console.log('Private admin signed-session authentication + canonical route: OK');
