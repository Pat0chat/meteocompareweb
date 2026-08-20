import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('js/app.js');
const css=read('styles.css');

assert.ok(/^1\.10\.(?:1[2-9]|[2-9]\d+)$/.test(read('VERSION').trim()));

// Settings controls fill their row instead of leaving capped empty space.
assert.match(css,/\.settings-control-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)[^}]*width:100%/);
assert.match(css,/\.settings-control-grid-two\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
assert.doesNotMatch(css,/\.settings-control-grid\{[^}]*minmax\(260px,360px\)/);
assert.doesNotMatch(css,/\.settings-control-grid-two\{[^}]*minmax\(300px,420px\)/);

// Marine charts expose denser axes and no longer repeat internal captions.
assert.match(app,/Array\.from\(\{length:5\}/);
assert.match(app,/Array\.from\(\{length:6\}/);
assert.match(app,/chartTickIndices\(ts\.length,7\)/);
assert.match(app,/marineChartDateTick/);
assert.doesNotMatch(app,/class="marine-chart-caption"/);
assert.doesNotMatch(app,/marineNextExtremum/);
assert.doesNotMatch(app,/marineTideRange',\{range:/);
assert.match(app,/marineUpcomingTides/);
assert.match(app,/marine-tide-facts single/);

// All five active locale catalogs include the new compact list heading.
for(const lang of ['fr','en','es','de','it']){
  assert.match(read(`js/locales/${lang}.js`),/marineUpcomingTides/,`${lang}: missing upcoming-tides label`);
}

console.log('MeteoCompare Web final marine/settings polish 1.10.12: OK');
