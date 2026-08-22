import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalog as fr } from '../js/locales/fr.js';
import { catalog as en } from '../js/locales/en.js';
import { consensusGroupFor } from '../js/models.js';
import { APP_VERSION } from '../js/version.js';

const version=APP_VERSION;
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const domain=fs.readFileSync(new URL('../js/domain.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const comparison=fs.readFileSync(new URL('../js/features/comparison.js',import.meta.url),'utf8');

assert.ok(version.localeCompare('1.10.11',undefined,{numeric:true,sensitivity:'base'})>=0,`unexpected release version ${version}`);
assert.match(sw,/const APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(sw,/\.\/js\/consensus\.js/,'consensus engine must be available offline in the PWA shell');

assert.equal(consensusGroupFor('AROME_FRANCE_HD'),consensusGroupFor('AROME_FRANCE'));
assert.equal(consensusGroupFor('ICON_D2'),consensusGroupFor('ICON_GLOBAL'));
assert.notEqual(consensusGroupFor('GFS'),consensusGroupFor('HRRR_CONUS'));

assert.match(domain,/precipitationConsensus\(/,'rain must use the two-stage consensus engine');
assert.match(domain,/familyBalancedWeights\(models\.map\(x=>x\.modelId\)\)/,'scenario ranking must balance model lineages');
assert.match(app,/const engineContext=homeForecastEngineContext\(city\.id\),now=currentConditions\(f,new Date\(\),engineContext\)/,'city cards must use the full selected forecast-engine context');
assert.match(app,/historicalConfidence/,'historical confidence must be displayed separately from convergence');
assert.match(comparison,/metric==='TEMPERATURE'\?a\.tempMax/,'city comparison must reuse unified daily central values');
assert.match(comparison,/\.filter\(x=>x\.key>=today\)\.slice\(0,7\)/,'daily comparison must preserve null gaps instead of filtering them out');

for(const catalog of [fr,en]){
  assert.ok(catalog.modelConvergence);
  assert.ok(catalog.historicalConfidence);
  assert.ok(catalog.weightedMedianCentral);
  assert.ok(catalog.rainCentralHint);
  assert.ok(catalog.agreementNotAccuracyBody);
}

console.log('MeteoCompare Web Consensus v2 1.10.9 release guards: OK');
