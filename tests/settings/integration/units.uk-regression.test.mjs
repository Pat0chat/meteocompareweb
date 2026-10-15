import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeSettings} from '../../../js/data/contracts.js';
import {convertUnitValue,unitDigits,unitSymbol,chartMetricUnitFor} from '../../../js/units.js';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
assert.match(app,/\['UK',t\('ukUnits'\)\]/);
assert.match(app,/UK:'ukUnitsHint'/);
assert.match(app,/UK:'ukUnits'/);
assert.match(app,/cacheKey=`[^`]*activeUnitSystem\(\)/,'Home cached cards must refresh when units change');
const settings=normalizeSettings({unitSystem:'UK',language:'ENGLISH',timeFormat:'H12'});
assert.equal(settings.unitSystem,'UK');
for(const language of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN','SYSTEM']){
  const updated=normalizeSettings({...settings,language});
  assert.equal(updated.unitSystem,'UK',`language ${language} must not override UK`);
  assert.equal(updated.timeFormat,'H12');
}
for(const lang of ['fr','en','es','de','it']){
  const locale=fs.readFileSync(new URL(`../../../js/locales/${lang}.js`,import.meta.url),'utf8');
  assert.match(locale,/"ukUnits":/);
  assert.match(locale,/"ukUnitsHint":/);
}
assert.equal(convertUnitValue('temperature',10,'UK'),10);
assert.equal(convertUnitValue('precipitation',1,'UK'),1);
assert.equal(convertUnitValue('length',1,'UK'),1);
assert.equal(convertUnitValue('pressure',1010,'UK'),1010);
assert.ok(convertUnitValue('wind',100,'UK')>62 && convertUnitValue('wind',100,'UK')<63);
assert.ok(convertUnitValue('distance',100,'UK')>62 && convertUnitValue('distance',100,'UK')<63);
assert.equal(unitSymbol('precipitationRate','UK'),'mm/h');
assert.equal(unitDigits('precipitation','UK'),1);
assert.equal(chartMetricUnitFor('WIND','UK'),'mph');
assert.equal(chartMetricUnitFor('PRECIPITATION','UK'),'mm');
console.log('UK mixed units: OK');
