import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),version=APP_VERSION,versionJs=read('js/version.js'),sw=read('sw.js');
assert.ok(version.localeCompare('1.10.11',undefined,{numeric:true,sensitivity:'base'})>=0,`unexpected release version ${version}`);
assert.ok(versionJs.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.ok(sw.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.doesNotMatch(app,/class="city-context-bar"/);
assert.match(app,/class="detail-hero-actions"/);
assert.match(app,/rainIfWetAmountShort/);
assert.match(app,/rainExpectedAmount/);
assert.match(app,/rainProbabilityShort/);
assert.match(app,/maxProbabilityTitle/);
assert.match(app,/dailyRainProbabilityLegend/);
assert.match(app,/if\(revisions\.length\)chosen\.push\(revisions\[0\]\)/);
assert.match(css,/\.timeline-precip-heat \{[\s\S]*height: 22px;[\s\S]*margin: 2px 0 5px;/);
assert.match(css,/:where\(\.table-wrap table\) tbody tr > \* \{[\s\S]*height: 64px;/);
assert.match(css,/\.forecast-table tbody tr > \* \{ height: 78px; \}/);
for(const lang of ['fr','en','es','de','it']){
  const {catalog}=await import(`../js/locales/${lang}.js?test=${Date.now()}`);
  for(const key of ['onlineData','dataAge','freshness','maxProbability','maxProbabilityTitle','rainExpectedAmount','rainExpectedAmountTitle','rainIfWetAmountShort','dailyRainProbabilityLegend']) assert.ok(catalog[key],`${lang}:${key}`);
}
console.log('MeteoCompare 1.10.11 final clarity tests: OK');
