import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
import { marineAvailabilityFromRaw } from '../js/features/marine.js';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),marine=read('js/features/marine.js');

const city={id:'coast',name:'Coast',latitude:43,longitude:5,timezone:'Europe/Paris'};
const coastal=marineAvailabilityFromRaw({latitude:43.05,longitude:5.05,hourly:{wave_height:Array(12).fill(1)}},city);
const inland=marineAvailabilityFromRaw({latitude:44,longitude:6,hourly:{wave_height:Array(12).fill(1)}},city);
const unresolved=marineAvailabilityFromRaw({latitude:43.05,longitude:5.05,hourly:{wave_height:Array(12).fill(null)}},city);
const deauville={id:'deauville',name:'Deauville',latitude:49.36,longitude:0.074,timezone:'Europe/Paris'};
const deauvilleSeaGrid=marineAvailabilityFromRaw({latitude:49.40,longitude:-0.08,hourly:{wave_height:Array(12).fill(.8)}},deauville);
assert.equal(coastal.available,true,'a nearby sea grid with usable waves must expose marine capability');
assert.equal(inland.available,false,'a distant sea grid must not expose marine capability');
assert.equal(unresolved.available,null,'missing marine values must remain unresolved instead of being persisted as inland');
assert.equal(deauvilleSeaGrid.available,true,'a Deauville-like coastal location must be recognized from a nearby sea grid');

assert.match(marine,/CAPABILITY_MODELS=\['meteofrance_wave','ncep_gfswave025'\]/,'capability detection must use explicit reliable global wave models instead of best_match only');
assert.match(marine,/hourly','wave_height'[\s\S]*forecast_hours','12'[\s\S]*models',model/,'capability detection must use a lightweight rolling wave-only request');
assert.match(app,/function addCityFromSearch[\s\S]*render\(\);void checkMarineCapability\(target\.id\);refreshCity\(target\.id,true\)/,'adding a city must immediately launch marine capability detection');
assert.match(app,/favorite-route-city'[\s\S]*checkMarineCapability\(city\.id\)/,'promoting an SEO city to favorites must also resolve marine capability');
assert.match(app,/scanHomeMarineCapabilities[\s\S]*filter\(city=>marineCapabilityNeedsCheck\(city\)\)[\s\S]*await checkMarineCapability\(city\.id\)/,'home background scan must revalidate unknown and stale negative marine capability with the same resolver');
assert.doesNotMatch(app,/scanHomeMarineCapabilities[\s\S]*await refreshMarineData\(city\.id,false,false,true\)/,'home capability scan must not fetch the full seven-day marine payload');
assert.match(app,/function marineCapabilityNeedsCheck[\s\S]*city\.marineAvailable===false[\s\S]*MARINE_CAPABILITY_FALSE_TTL_MS/,'negative marine capability must expire and be revalidated instead of being permanent');
assert.match(app,/previous===false&&!Number\.isFinite\(checkedAt\)\)city\.marineAvailable=null/,'legacy false capability without a probe timestamp must be cleared if the new probe is inconclusive');

console.log(`MeteoCompare Web ${APP_VERSION} immediate marine capability detection: OK`);
