import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeModelIds, normalizeSettings, normalizeCity, normalizeCities } from '../../../js/data/contracts.js';
import { DEFAULT_MODEL_IDS } from '../../../js/models.js';

assert.equal(Object.isFrozen(DEFAULT_SETTINGS), true);
assert.equal(Object.isFrozen(DEFAULT_SETTINGS.enabledModelIds), true);
assert.deepEqual(normalizeModelIds(['GFS','GFS','UNKNOWN','ECMWF']), ['GFS','ECMWF']);
assert.deepEqual(normalizeModelIds(['UNKNOWN']), DEFAULT_MODEL_IDS, 'invalid model cohorts must fall back to product defaults');
assert.deepEqual(normalizeModelIds(['UNKNOWN'], { fallback:false }), []);

const normalized = normalizeSettings({
  enabledModelIds:['GFS','GFS','BAD'], theme:'DARK', language:'ITALIAN', refreshInterval:'MINUTES_30', modelSort:'FINESSE',
  detailViewMode:'HOURLY', detailTab:'WIND', confidenceMetric:'PRECIPITATION', chartHorizon:'72', timelineMode:'DAILY', density:'COMPACT',
  localWeightedConsensus:true, forecastEngine:'SCENARIOS', collapsedSections:{ good:true, open:false, bad:'yes', ["x".repeat(161)]:true }, extra:'ignored'
});
assert.deepEqual(normalized.enabledModelIds, ['GFS']);
assert.equal(normalized.theme, 'DARK');
assert.equal(normalized.language, 'ITALIAN');
assert.equal(normalized.chartHorizon, 72);
assert.equal(normalized.localWeightedConsensus, true);
assert.equal(normalized.forecastEngine, 'SCENARIOS');
assert.deepEqual(normalized.collapsedSections, { good:true, open:false });
assert.equal('extra' in normalized, false);
assert.equal(normalizeSettings({confidenceMetric:'PRECIPITATION_PROBABILITY'}).confidenceMetric,'PRECIPITATION_PROBABILITY');
assert.equal(normalizeSettings({confidenceMetric:'CLOUD'}).confidenceMetric,'CLOUD');
assert.equal(normalizeSettings({confidenceMetric:'GUST'}).confidenceMetric,'GUST');

const fallback = normalizeSettings({ theme:'OLED', language:'KLINGON', chartHorizon:48, localWeightedConsensus:1, forecastEngine:'UNKNOWN' });
assert.equal(fallback.theme, DEFAULT_SETTINGS.theme);
assert.equal(fallback.language, DEFAULT_SETTINGS.language);
assert.equal(fallback.chartHorizon, DEFAULT_SETTINGS.chartHorizon);
assert.equal(fallback.localWeightedConsensus, false);
assert.equal(fallback.forecastEngine, DEFAULT_SETTINGS.forecastEngine);

const city = normalizeCity({ id:42, name:'  Paris  ', admin1:'Île-de-France', country:'France', latitude:'48.8566', longitude:'2.3522', timezone:'Europe/Paris', marineEnabled:true, marineAvailable:false, keep:'yes' });
assert.equal(city.id, '42');
assert.equal(city.name, 'Paris');
assert.equal(city.latitude, 48.8566);
assert.equal(city.longitude, 2.3522);
assert.equal(city.timezone, 'Europe/Paris');
assert.equal(city.marineAvailable, true, 'explicit marine mode must imply marine availability');
assert.equal(city.keep, 'yes');

assert.equal(normalizeCity({ id:'x', latitude:91, longitude:0 }), null);
assert.equal(normalizeCity({ id:'x', latitude:0, longitude:-181 }), null);
assert.equal(normalizeCity({ id:'', latitude:0, longitude:0 }), null);
const noTimezone = normalizeCity({ id:'x', latitude:0, longitude:0, timezone:'Not/AZone' });
assert.equal(noTimezone.timezone, null);
assert.equal(noTimezone.name, 'x');

const cities = normalizeCities([
  { id:'a', name:'A', latitude:1, longitude:2, timezone:'UTC' },
  { id:'a', name:'Duplicate', latitude:3, longitude:4, timezone:'UTC' },
  { id:'bad', latitude:100, longitude:0 },
  { id:'b', name:'B', latitude:3, longitude:4, timezone:'UTC' },
]);
assert.deepEqual(cities.map(row=>row.id), ['a','b']);
assert.equal(cities[0].name, 'A');

console.log('Settings/model/city data contracts: OK');
