import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');

assert.equal(read('VERSION').trim(),'1.14.0','layout fix must keep version 1.14.0');
const app=read('js/app.js');
const css=read('styles.css');
const sw=read('sw.js');

assert.match(css,/\.seo-city-context-copy\{display:flex;flex-direction:column;gap:12px;max-width:82ch\}/,'SEO city context paragraphs must be stacked vertically');
assert.doesNotMatch(css,/\.seo-city-context-copy\{[^}]*grid-template-columns:repeat\(2/,'SEO city context must not use a two-column layout');

const insights=app.indexOf('${renderInsights(f,evolution,consensusWeights)}');
const context=app.indexOf('${renderSeoCityContext(city)}');
const timeline=app.indexOf('${renderTimeline(f,consensusWeights)}');
const diagnostics=app.indexOf('${renderDataDiagnosticsSection(city,f)}');
const nearby=app.indexOf('${renderSeoNearby(city)}');
assert.ok(context>=0 && insights>context && timeline>insights,'SEO city context must sit immediately before insights and before timeline');
assert.ok(nearby>diagnostics,'nearby SEO links should remain near the end of the detail page');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(fs.readFileSync(new URL('../cache-version.js',import.meta.url),'utf8'),/METEOCOMPARE_CACHE_VERSION = 'v\d+[-a-z0-9]+'/);

console.log('MeteoCompare Web 1.14.0 SEO city context layout: OK');
