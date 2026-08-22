import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP_VERSION } from '../js/version.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
const app=read('js/app.js');
const css=read('styles.css');
const sw=read('sw.js');

assert.match(css,/\.detail-seo-context \{/,'SEO city context must be integrated into the detail title instead of a standalone section');
assert.match(app,/function renderSeoDetailTitleContext\(city\)/);
assert.doesNotMatch(app,/renderSeoCityContext\(city\)/,'standalone SEO city context must no longer interrupt the forecast reading flow');

const context=app.indexOf('${renderSeoDetailTitleContext(city)}');
const timeline=app.indexOf('${renderTimeline(f,engineContext)}');
const diagnostics=app.indexOf('${renderDataDiagnosticsSection(city,f)}');
const nearby=app.indexOf('${renderSeoNearby(city)}');
assert.ok(context>=0 && timeline>context,'SEO city context must remain crawlable in the detail title before the timeline');
assert.ok(nearby>diagnostics,'nearby SEO links should remain near the end of the detail page');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(fs.readFileSync(new URL('../cache-version.js',import.meta.url),'utf8'),/METEOCOMPARE_CACHE_VERSION = 'v\d+[-a-z0-9]+'/);

console.log(`MeteoCompare Web ${APP_VERSION} SEO city context layout: OK`);
