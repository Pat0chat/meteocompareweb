import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalog as fr } from '../js/locales/fr.js';
import { catalog as en } from '../js/locales/en.js';
import { consensusGroupFor } from '../js/models.js';

const version=fs.readFileSync(new URL('../VERSION',import.meta.url),'utf8').trim();
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const domain=fs.readFileSync(new URL('../js/domain.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const comparison=fs.readFileSync(new URL('../js/features/comparison.js',import.meta.url),'utf8');

assert.ok(/^1\.10\.(?:1[1-9]|[2-9]\d+)$/.test(version),`unexpected release version ${version}`);
assert.match(sw,/const APP_VERSION = '1\.10\.(?:1[1-9]|[2-9]\d+)'/);
assert.match(sw,/const CACHE_VERSION = 'v\d+[-a-z0-9]+'/);
assert.match(sw,/\.\/js\/consensus\.js/,'consensus engine must be available offline in the PWA shell');

assert.equal(consensusGroupFor('AROME_FRANCE_HD'),consensusGroupFor('AROME_FRANCE'));
assert.equal(consensusGroupFor('ICON_D2'),consensusGroupFor('ICON_GLOBAL'));
assert.notEqual(consensusGroupFor('GFS'),consensusGroupFor('HRRR_CONUS'));

assert.match(domain,/precipitationConsensus\(/,'rain must use the two-stage consensus engine');
assert.match(domain,/familyBalancedWeights\(models\.map\(x=>x\.modelId\)\)/,'scenario ranking must balance model lineages');
assert.match(app,/currentConditions\(f,new Date\(\),\{weightsByVariable:consensusWeights\|\|\{\}\}\)/,'city cards must use the same locally weighted central engine');
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
