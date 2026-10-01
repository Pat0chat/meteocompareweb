import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_UNIT_SYSTEM,
  UNIT_SYSTEMS,
  normalizeUnitSystem,
  convertTemperature,
  convertWind,
  convertPrecipitation,
  convertDistance,
  convertLength,
  convertPressure,
  unitSymbol,
  chartMetricUnitFor,
} from '../../../js/units.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../js/data/contracts.js';

const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≉ ${expected}`);

assert.equal(DEFAULT_UNIT_SYSTEM,'METRIC');
assert.deepEqual(UNIT_SYSTEMS,['METRIC','IMPERIAL']);
assert.equal(normalizeUnitSystem('IMPERIAL'),'IMPERIAL');
assert.equal(normalizeUnitSystem('metric'),'METRIC');
assert.equal(normalizeUnitSystem(' imperial '),'IMPERIAL');
assert.equal(DEFAULT_SETTINGS.unitSystem,'METRIC');
assert.equal(normalizeSettings({}).unitSystem,'METRIC');
assert.equal(normalizeSettings({unitSystem:'IMPERIAL'}).unitSystem,'IMPERIAL');
assert.equal(normalizeSettings({unitSystem:'UNKNOWN'}).unitSystem,'METRIC');

assert.equal(convertTemperature(0,'IMPERIAL'),32);
assert.equal(convertTemperature(100,'IMPERIAL'),212);
assert.equal(convertTemperature(10,'IMPERIAL',{delta:true}),18);
close(convertWind(100,'IMPERIAL'),62.1371192237334,1e-10);
close(convertPrecipitation(25.4,'IMPERIAL'),1,1e-12);
close(convertDistance(1,'IMPERIAL'),0.621371192237334,1e-12);
close(convertLength(1,'IMPERIAL'),3.28083989501312,1e-12);
close(convertPressure(1013.25,'IMPERIAL'),29.9213,1e-4);

assert.equal(unitSymbol('temperature','METRIC'),'°C');
assert.equal(unitSymbol('temperature','IMPERIAL'),'°F');
assert.equal(unitSymbol('wind','IMPERIAL'),'mph');
assert.equal(unitSymbol('precipitation','IMPERIAL'),'in');
assert.equal(unitSymbol('distance','IMPERIAL'),'mi');
assert.equal(unitSymbol('length','IMPERIAL'),'ft');
assert.equal(unitSymbol('pressure','IMPERIAL'),'inHg');
assert.equal(chartMetricUnitFor('TEMPERATURE','IMPERIAL'),'°F');
assert.equal(chartMetricUnitFor('PRECIPITATION','IMPERIAL'),'in');
assert.equal(chartMetricUnitFor('WIND','IMPERIAL'),'mph');

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
assert.match(app,/data-unit-system="\$\{id\}"/,'Settings must expose the unit system selector');
assert.match(app,/state\.settings\.unitSystem=target\.dataset\.unitSystem/,'unit selection must persist through the central settings state');
assert.match(app,/measurement\('length',e\.value,\{digits:2\}\)/,'marine tide rows must respect the selected unit system and preserve tide precision');
assert.match(app,/modelResolutionLabel\(m\.resolutionKm\)/,'model resolution must use the selected distance unit');
assert.match(app,/chartDisplayUnit\(metric\)/,'chart units must follow the selected unit system');

console.log('tests/settings/unit/units.test.mjs: OK');
