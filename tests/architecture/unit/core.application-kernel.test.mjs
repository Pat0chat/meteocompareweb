import assert from 'node:assert/strict';
import { ApplicationKernel } from '../../../js/core/application-kernel.js';

const settings = { theme:'SYSTEM' };
const cities = [{ id:'paris' }];
const route = { name:'home' };
const kernel = new ApplicationKernel({
  settings, cities, route, online:1,
  featureLoaders:{ radar: async()=>({}) },
  analysisLoaders:{ bias:()=>({}), evolution:()=>[], normals:()=>null, health:()=>[] },
});

assert.equal(kernel.state.settings, settings);
assert.equal(kernel.state.cities, cities);
assert.equal(kernel.state.route, route);
assert.equal(kernel.state.online, true);
assert.ok(kernel.state.loading instanceof Set);
assert.ok(kernel.state.marineLoading instanceof Set);
assert.deepEqual(kernel.state.backupOptions, { forecasts:false,normals:true,bias:true,evolution:true,marine:true,health:true });

const weather = kernel.operations.weather.begin('paris');
kernel.operations.bias.begin('paris');
kernel.operations.normals.begin('paris');
kernel.analysis.mark('bias','paris');
kernel.forgetCity('paris');
assert.equal(kernel.operations.weather.isCurrent('paris', weather), false);
assert.equal(kernel.operations.bias.get('paris'), undefined);
assert.equal(kernel.operations.normals.get('paris'), undefined);
assert.equal(kernel.analysis.has('bias','paris'), false);

kernel.operations.weather.begin('lyon');
kernel.operations.bias.begin('lyon');
kernel.resetOperations();
assert.equal(kernel.operations.weather.tokens.size, 0);
assert.equal(kernel.operations.bias.tokens.size, 0);

console.log('ApplicationKernel lifecycle invariants: OK');
