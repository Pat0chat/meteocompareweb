import assert from 'node:assert/strict';
import { CacheRegistry, OperationRegistry } from '../../../js/core/cache-registry.js';

const cache = new CacheRegistry();
assert.ok(cache.numberFormatters instanceof Map);
assert.ok(cache.forecastViews instanceof WeakMap);
assert.ok(cache.seriesIndexes instanceof WeakMap);
assert.ok(cache.chartHoverData instanceof WeakMap);
assert.ok(cache.routeScrollPositions instanceof Map);

const registry = new OperationRegistry();
const first = registry.begin('paris');
assert.equal(registry.isCurrent('paris', first), true);
const second = registry.begin('paris');
assert.equal(registry.isCurrent('paris', first), false, 'a newer operation must supersede an older token');
assert.equal(registry.isCurrent('paris', second), true);
registry.finish('paris', first);
assert.equal(registry.get('paris'), second, 'finishing a stale operation must not remove the current token');
registry.finish('paris', second);
assert.equal(registry.get('paris'), undefined);
const custom = Symbol('custom');
assert.equal(registry.set('lyon', custom), custom);
registry.delete('lyon');
assert.equal(registry.get('lyon'), undefined);
registry.begin('a'); registry.begin('b'); registry.clear();
assert.equal(registry.tokens.size, 0);

console.log('Runtime cache and operation registry invariants: OK');
