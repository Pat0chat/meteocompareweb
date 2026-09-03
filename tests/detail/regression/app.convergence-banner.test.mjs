import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../../../js/version.js';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../../../sw.js',import.meta.url),'utf8');
const version=APP_VERSION;

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.match(app,/banner info convergence-info-banner[^>]*><b>\$\{esc\(t\('agreementNotAccuracy'\)\)\}<\/b><span>\$\{esc\(t\('agreementNotAccuracyBody'\)\)\}<\/span>/,'top convergence info banner must stack its title and body');
assert.match(app,/banner info convergence-info-banner[^>]*><b>\$\{esc\(t\('reading'\)\)\} :<\/b><span>\$\{esc\(t\('disagreementReading'\)\)\}<\/span>/,'reading banner must stack its title and body');
assert.match(css,/\.convergence-info-banner\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-start;/s,'convergence banners must use a vertical flex layout');
assert.match(css,/\.chart-band-raw \{ fill-opacity: \.16; \}/,'raw dispersion must be visually reinforced');
assert.match(css,/\.chart-band-probable \{ fill-opacity: \.18; \}/,'probable interval must be visually reinforced');
assert.match(css,/\.chart-band-retained \{ fill-opacity: \.22; \}/,'engine-retained interval must be softened without disappearing');
assert.match(css,/\.chart-retained-edge \{[^}]*64%[^}]*stroke-width:1\.25;/,'the retained range edge must follow the softened engine layer');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache must use the centralized generation');
assert.match(fs.readFileSync(new URL('../../../cache-version.js',import.meta.url),'utf8'),/METEOCOMPARE_CACHE_VERSION = 'v\d+[-a-z0-9]+'/);
console.log('tests/detail/regression/app.convergence-banner.test.mjs: OK');
