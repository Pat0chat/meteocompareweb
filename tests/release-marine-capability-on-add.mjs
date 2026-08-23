import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
import { marineAvailabilityFromRaw } from '../js/features/marine.js';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),marine=read('js/features/marine.js');

const city={id:'coast',name:'Coast',latitude:43,longitude:5,timezone:'Europe/Paris'};
const coastal=marineAvailabilityFromRaw({latitude:43.05,longitude:5.05,hourly:{wave_height:Array(24).fill(1)}},city);
const inland=marineAvailabilityFromRaw({latitude:44,longitude:6,hourly:{wave_height:Array(24).fill(1)}},city);
assert.equal(coastal.available,true,'a nearby sea grid with usable waves must expose marine capability');
assert.equal(inland.available,false,'a distant sea grid must not expose marine capability');

assert.match(marine,/hourly','wave_height'[\s\S]*forecast_days','1'/,'capability detection must use a lightweight one-day wave-only request');
assert.match(app,/function addCityFromSearch[\s\S]*render\(\);void checkMarineCapability\(target\.id\);refreshCity\(target\.id,true\)/,'adding a city must immediately launch marine capability detection');
assert.match(app,/favorite-route-city'[\s\S]*checkMarineCapability\(city\.id\)/,'promoting an SEO city to favorites must also resolve marine capability');
assert.match(app,/scanHomeMarineCapabilities[\s\S]*await checkMarineCapability\(city\.id\)/,'home background scan must use the same lightweight capability resolver');
assert.doesNotMatch(app,/scanHomeMarineCapabilities[\s\S]*await refreshMarineData\(city\.id,false,false,true\)/,'home capability scan must not fetch the full seven-day marine payload');

console.log(`MeteoCompare Web ${APP_VERSION} immediate marine capability detection: OK`);
