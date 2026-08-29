import assert from 'node:assert/strict';
import { proxySystemHealth } from '../../../worker.js';

const response=proxySystemHealth(new Request('https://meteocompare.example/_mcx/health'),{METEOFRANCE_API_KEY:'secret'});
assert.equal(response.status,200);
assert.equal(response.headers.get('cache-control'),'no-store');
const body=await response.json();
assert.equal(body.ok,true);
assert.equal(body.service,'meteocompare-worker');
assert.equal(body.capabilities.modelMetadataProxy,true);
assert.equal(body.capabilities.vigilanceProxy,true);
assert.equal(body.capabilities.vigilanceConfigured,true);
assert.equal(body.capabilities.analyticsProxy,true);
assert.ok(body.version);
assert.ok(body.checkedAt);
assert.equal(JSON.stringify(body).includes('secret'),false,'health endpoint must never expose secrets');

const noKey=await proxySystemHealth(new Request('https://meteocompare.example/_mcx/health'),{}).json();
assert.equal(noKey.capabilities.vigilanceConfigured,false);
const method=proxySystemHealth(new Request('https://meteocompare.example/_mcx/health',{method:'POST'}),{});
assert.equal(method.status,405);
console.log('First-party Worker health endpoint: OK');
