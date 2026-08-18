import fs from 'node:fs';
import assert from 'node:assert/strict';
import { webTranslationAudit, hasTranslation } from '../js/i18n.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),comparison=read('js/features/comparison.js'),css=read('styles.css'),workflow=read('.github/workflows/pages.yml');

assert.match(app,/app\.addEventListener\('pointermove', handleChartPointerMove/,'chart pointer movement is delegated');
assert.match(comparison,/data-hover-chart=\"city\"/,'city charts carry hover datasets');
assert.match(comparison,/data-hover-chart=\"model\"/,'model charts carry hover datasets');
assert.match(app,/data-hover-chart=\"agreement-band\"/,'hourly agreement band uses the same interactive hover engine');
assert.match(app,/data-band-hover-agreement/,'agreement band exposes a live agreement value instead of a static end value');
assert.match(app,/data-band-hover-range/,'agreement band exposes the hovered min-max range');
assert.match(app,/data-band-hover-models/,'agreement band exposes the hovered model count');
assert.match(app,/svg\.dataset\.hoverChart==='agreement-band'/,'hover handler has agreement-band specific value formatting');
assert.match(app,/querySelectorAll\('\[data-hover-value\]'\)/,'comparison legend values reset when pointer leaves the graph');
assert.match(css,/\.agreement-band-hover \.chart-hover-marker\.mean/,'agreement band hover markers are styled');
assert.match(app,/data-hover-values=/,'chart series values are aligned for interactive lookup');
assert.match(app,/data-hover-crosshair/,'interactive charts contain a vertical crosshair');
assert.match(app,/data-hover-marker/,'interactive charts contain active series markers');
assert.match(comparison,/data-hover-series/,'legend items are addressable per series');
assert.match(comparison,/data-hover-value/,'legend values are updated in place');
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
