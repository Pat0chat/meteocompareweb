import assert from 'node:assert/strict';
import { FeatureRegistry } from '../../../js/core/feature-registry.js';

let calls = 0;
let release;
const gate = new Promise(resolve => { release = resolve; });
const registry = new FeatureRegistry({
  radar: async () => { calls++; await gate; return { name: 'radar' }; },
  bias: async () => ({ name: 'bias' }),
});

assert.equal(registry.has('radar'), false);
const a = registry.load('radar');
const b = registry.load('radar');
assert.equal(a, b, 'concurrent lazy loads must share the same promise');
release();
const radar = await a;
assert.equal(calls, 1);
assert.deepEqual(radar, { name: 'radar' });
assert.equal(registry.has('radar'), true);
assert.equal(await registry.load('radar'), radar, 'loaded modules must be reused without calling the loader again');
await assert.rejects(registry.load('unknown'), /UNKNOWN_FEATURE:unknown/);

let attempts = 0;
const retryable = new FeatureRegistry({ failing: async () => { attempts++; if (attempts === 1) throw new Error('boom'); return { ok: true }; } });
await assert.rejects(retryable.load('failing'), /boom/);
assert.equal(retryable.pending.has('failing'), false, 'failed loads must leave the registry retryable');
assert.deepEqual(await retryable.load('failing'), { ok: true });
assert.equal(attempts, 2);

console.log('Lazy FeatureRegistry dedupe/retry behavior: OK');
