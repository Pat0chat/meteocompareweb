import assert from 'node:assert/strict';
import { forecastRefreshVerified, forecastCurrentForDisplay } from '../../../js/core/app-state.js';

const now=Date.parse('2026-10-23T09:36:00Z'),startedAt=now-12_000;
const selected=['GFS','ECMWF'];
const response={fetchedAt:new Date(now-4_000).toISOString(),requestedModelIds:selected,seriesByModel:{GFS:{},ECMWF:{}}};
assert.equal(forecastRefreshVerified(response,selected,startedAt,now),true);
assert.equal(forecastCurrentForDisplay(response,selected,60,now),true,
  'a verified refresh must no longer appear overdue for an hourly cadence');
assert.equal(forecastRefreshVerified({...response,fetchedAt:new Date(now-147*60_000).toISOString()},selected,startedAt,now),false,
  'a resolved network promise with an old payload is not proof of a refresh');
assert.equal(forecastRefreshVerified({...response,requestedModelIds:['GFS']},selected,startedAt,now),false,
  'a payload from another model selection is not a refresh');
assert.equal(forecastRefreshVerified({...response,seriesByModel:{}},selected,startedAt,now),false,
  'a model list alone is not a usable forecast');
assert.equal(forecastRefreshVerified({...response,fetchedAt:'invalid'},selected,startedAt,now),false);
assert.equal(forecastRefreshVerified({...response,fetchedAt:new Date(now+61_000).toISOString()},selected,startedAt,now),false,
  'far-future timestamp must not be shown as a successful current sync');
assert.equal(forecastRefreshVerified({...response,fetchedAt:new Date(startedAt-5_001).toISOString()},selected,startedAt,now),false);
assert.equal(forecastRefreshVerified({...response,fetchedAt:new Date(startedAt-5_000).toISOString()},selected,startedAt,now),true,
  'a five-second clock skew at the start of the request is acceptable');
assert.equal(forecastRefreshVerified(null,selected,startedAt,now),false);
console.log('Refresh response verification: recent timestamp, selected models, usable data, invalid/stale responses: OK');
