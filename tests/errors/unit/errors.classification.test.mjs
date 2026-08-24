import assert from 'node:assert/strict';
import { classifyError, storageIssueDescriptor, ErrorCenter, ERROR_ACTIONS } from '../../../js/errors.js';

const abort = new Error('aborted');
abort.name = 'AbortError';
assert.equal(classifyError(abort).code, 'OPEN_METEO_UNAVAILABLE');
assert.deepEqual(classifyError(abort).actions, ['retry']);

const http = new Error('HTTP 503');
http.code = 'HTTP_ERROR';
http.status = 503;
assert.deepEqual(classifyError(http, { hasCache: true }), {
  code: 'HTTP_ERROR', severity: 'error', titleKey: 'errorWeatherServiceTitle', messageKey: 'openMeteoHttpError',
  actions: ['retry','use-cache'], status: 503, technical: 'HTTP 503'
});

const unknown = classifyError(new Error('unexpected'));
assert.equal(unknown.code, 'UNKNOWN');
assert.equal(unknown.severity, 'error');
assert.deepEqual(unknown.actions, ['retry']);

const quota = storageIssueDescriptor({ code: 'STORAGE_QUOTA', detail: { message: 'quota full', bytes: 42 } });
assert.equal(quota.code, 'STORAGE_QUOTA');
assert.equal(quota.technical, 'quota full');
assert.deepEqual(quota.actions, ['local-data','clear-old-data']);
assert.equal(quota.detail.bytes, 42);

const center = new ErrorCenter();
const realNow = Date.now;
let now = 100;
Date.now = () => now;
try {
  center.report('city:a', { code: 'A' });
  now = 200;
  center.report('city:b', { code: 'B' });
  now = 300;
  center.report('global', { code: 'G' });
  assert.deepEqual(center.list('city:').map(item => item.code), ['B','A'], 'errors must be sorted newest-first and filterable by scope');
  center.dismiss('city:b');
  assert.equal(center.get('city:b'), null);
  assert.deepEqual(center.list('city:').map(item => item.code), ['A']);
  center.resolve('city:a');
  assert.equal(center.list('city:').length, 0);
  center.clear();
  assert.equal(center.list().length, 0);
} finally {
  Date.now = realNow;
}

assert.equal(Object.isFrozen(ERROR_ACTIONS), true);
assert.equal(ERROR_ACTIONS.retry, 'errorActionRetry');
assert.equal(ERROR_ACTIONS['local-data'], 'localDataTitle');

console.log('Structured error classification and ErrorCenter: OK');
