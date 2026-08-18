import fs from 'node:fs';
import assert from 'node:assert/strict';
import { webTranslationAudit, hasTranslation } from '../js/i18n.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),workflow=read('.github/workflows/pages.yml');

assert.match(app,/app\.addEventListener\('pointermove', handleChartPointerMove/,'chart pointer movement is delegated');
assert.match(app,/data-hover-chart=\"city\"/,'city charts carry hover datasets');
assert.match(app,/data-hover-chart=\"model\"/,'model charts carry hover datasets');
assert.match(app,/data-hover-values=/,'chart series values are aligned for interactive lookup');
assert.match(app,/data-hover-crosshair/,'interactive charts contain a vertical crosshair');
assert.match(app,/data-hover-marker/,'interactive charts contain active series markers');
assert.match(app,/data-hover-series/,'legend items are addressable per series');
assert.match(app,/data-hover-value/,'legend values are updated in place');
assert.match(app,/chartHoverKeyLabel/,'hover timestamp is formatted using the current locale');
assert.match(app,/Math\.round\(ratio\*\(keys\.length-1\)\)/,'nearest forecast point is selected from pointer position');
assert.match(css,/\.hover-chart-shell\.is-hovering \.chart-hover-crosshair/,'crosshair becomes visible while inspecting');
assert.match(css,/\.hover-chart-shell\.is-hovering \.compare-legend\.rich \.legend-live-value/,'legend values appear only while inspecting');
assert.match(css,/touch-action: pan-y/,'touch inspection preserves vertical page scrolling');

for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  assert.ok(hasTranslation(pref,'chartHoverHint'),`chartHoverHint missing in ${pref}`);
  assert.ok(hasTranslation(pref,'chartHoverAt'),`chartHoverAt missing in ${pref}`);
}
const audit=webTranslationAudit();for(const lang of ['fr','en','es','de','it'])assert.deepEqual(audit[lang],[],`missing translations in ${lang}`);
assert.match(workflow,/interactive-legends\.mjs/,'GitHub Pages workflow runs interactive legend tests');
console.log('MeteoCompare Web interactive legend tests: OK');
