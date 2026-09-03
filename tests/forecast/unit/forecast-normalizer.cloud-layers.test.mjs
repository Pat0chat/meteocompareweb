import assert from 'node:assert/strict';
import { combineCloudLayers, normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { getModel } from '../../../js/models.js';

assert.equal(combineCloudLayers(10,20,100),50,'100% high clouds must contribute at most 50% total cover');
assert.equal(combineCloudLayers(70,20,100),70,'low clouds must retain their full influence');
assert.equal(combineCloudLayers(10,80,100),80,'mid clouds must retain their full influence');
assert.equal(combineCloudLayers(10,null,100),null,'a missing layer must not be invented');
assert.equal(combineCloudLayers(undefined,20,100),null,'all three layers are required');
assert.equal(combineCloudLayers(10,20,101),null,'invalid source layers must be rejected');

const model=getModel('AROME_FRANCE_HD');
const city={id:'cloud-test',name:'Paris',latitude:48.85,longitude:2.35,timezone:'Europe/Paris'};
const key=model.apiKey;
const raw={timezone:city.timezone,hourly:{
  time:['2026-09-02T00:00','2026-09-02T01:00','2026-09-02T02:00'],
  [`temperature_2m_${key}`]:[18,18,18],
  [`precipitation_${key}`]:[0,0,0],
  [`cloud_cover_low_${key}`]:[10,10,10],
  [`cloud_cover_mid_${key}`]:[20,null,20],
  [`cloud_cover_high_${key}`]:[100,100,null],
  [`wind_speed_10m_${key}`]:[8,8,8],
},daily:{time:[]}};
const normalized=normalizeBatchedForecast(raw,city,[model],3);
assert.deepEqual(normalized.seriesByModel.AROME_FRANCE_HD.hourly.cloudCover,[50,null,null],'normalization must combine only complete low/mid/high triplets');

console.log('AROME HD cloud-layer normalization: OK');
