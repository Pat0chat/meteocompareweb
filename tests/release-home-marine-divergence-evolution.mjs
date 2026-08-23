import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
import { normalizeCity } from '../js/data/contracts.js';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('js/app.js');
const css=read('styles.css');

const coastal=normalizeCity({id:'coast',name:'Coast',latitude:43,longitude:5,timezone:'Europe/Paris',marineAvailable:true});
const inland=normalizeCity({id:'inland',name:'Inland',latitude:48,longitude:2,timezone:'Europe/Paris',marineAvailable:false});
const enabled=normalizeCity({id:'enabled',name:'Enabled',latitude:43,longitude:5,timezone:'Europe/Paris',marineEnabled:true});
assert.equal(coastal.marineAvailable,true,'known coastal availability must survive city normalization');
assert.equal(inland.marineAvailable,false,'known inland state must survive city normalization');
assert.equal(enabled.marineAvailable,true,'enabled marine mode must always imply availability');

assert.match(app,/home-city-marine-available-dot/,'home city menu must expose the marine-availability marker');
assert.match(app,/city\.marineEnabled\?`<span class="home-city-marine-icon"/,'marine icon next to locality must be conditional on activation');
assert.match(app,/scanHomeMarineCapabilities[\s\S]*marineAvailable[\s\S]*checkMarineCapability\(city\.id\)/,'home must resolve unknown marine capability quietly in the background');
assert.match(css,/\.home-city-marine-available-dot[\s\S]*background:var\(--primary\)/,'marine availability marker must use the application blue primary color');

assert.match(app,/forecastEngineDivergenceForDate/,'engine chart and divergence timeline must share one divergence calculation');
assert.match(app,/forecast-engine-chart-divergence-bg/,'engine comparison graph must render divergence backgrounds');
assert.match(css,/\.forecast-engine-chart-divergence-bg\.low[\s\S]*var\(--good\)/,'low divergence graph background must use the good semantic tone');
assert.match(css,/\.forecast-engine-chart-divergence-bg\.medium[\s\S]*var\(--medium\)/,'medium divergence graph background must use the warning semantic tone');
assert.match(css,/\.forecast-engine-chart-divergence-bg\.high[\s\S]*var\(--low\)/,'high divergence graph background must use the danger semantic tone');

assert.match(app,/temperature:\{label:t\('temperature'\),unit:' °C',threshold:\.5[\s\S]*?icon:/,'temperature evolution must expose its ±0.5 °C stability threshold');
assert.match(app,/precipitation:\{label:t\('precipitation'\),unit:' mm',threshold:1[\s\S]*?icon:/,'precipitation evolution must expose its ±1 mm stability threshold');
assert.match(app,/wind:\{label:t\('wind'\),unit:' km\/h',threshold:3[\s\S]*?icon:/,'wind evolution must expose its ±3 km/h stability threshold');
assert.match(app,/evolution-threshold-band[\s\S]*evolution-threshold-line[\s\S]*evolution-track-y-axis/,'evolution mini charts must render threshold band, threshold axes and a y axis');
assert.match(css,/\.evolution-threshold-band/,'evolution stability band must be styled');
assert.match(css,/\.evolution-threshold-line/,'evolution stability threshold lines must be styled');
assert.match(css,/\.evolution-track-axis/,'evolution y-axis labels must be styled');

console.log(`MeteoCompare Web ${APP_VERSION} marine/divergence/evolution patch: OK`);
