import assert from 'node:assert/strict';
import { LocalAnalysisStore } from '../../../js/core/local-analysis-store.js';

const state = { bias:{}, evolution:{}, normals:{}, modelHealthHistory:{} };
const calls = { bias:0, evolution:0, normals:0, health:0 };
const store = new LocalAnalysisStore({ state, loaders: {
  bias: cityId => (calls.bias++, { cityId, forecasts:[1] }),
  evolution: cityId => (calls.evolution++, [{ cityId }]),
  normals: cityId => (calls.normals++, cityId === 'missing' ? null : { cityId }),
  health: cityId => (calls.health++, cityId === 'empty' ? null : [{ cityId }]),
} });

assert.equal(store.has('bias','paris'), false);
assert.deepEqual(store.get('bias','paris'), { cityId:'paris', forecasts:[1] });
assert.equal(store.get('bias','paris').forecasts[0], 1);
assert.equal(calls.bias, 1, 'analysis must hydrate only once until forgotten');
assert.equal(store.has('bias','paris'), true);

assert.deepEqual(store.get('evolution','paris'), [{ cityId:'paris' }]);
assert.deepEqual(store.get('normals','paris'), { cityId:'paris' });
assert.equal(store.get('normals','missing'), null);
assert.deepEqual(store.get('health','paris'), [{ cityId:'paris' }]);
assert.deepEqual(store.get('health','empty'), []);

store.forget('paris');
assert.equal(store.has('bias','paris'), false);
store.get('bias','paris');
assert.equal(calls.bias, 2, 'forget must allow a fresh hydration');
assert.throws(() => store.get('unknown','paris'), /UNKNOWN_ANALYSIS:unknown/);

console.log('LocalAnalysisStore hydration and invalidation: OK');
