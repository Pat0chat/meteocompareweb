import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalog as fr } from '../../../js/locales/fr.js';
import { catalog as en } from '../../../js/locales/en.js';
import { catalog as es } from '../../../js/locales/es.js';
import { catalog as de } from '../../../js/locales/de.js';
import { catalog as it } from '../../../js/locales/it.js';
import { APP_VERSION } from '../../../js/version.js';

const read = path => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const localeFiles = ['fr', 'en', 'es', 'de', 'it'];
const catalogs = [fr, en, es, de, it];
const expectedKeys = Object.keys(fr).sort();

for (const [index, locale] of localeFiles.entries()) {
  const source = read(`js/locales/${locale}.js`);
  assert.doesNotMatch(source, /Object\.assign\s*\(\s*catalog/, `${locale}: runtime catalogue must stay flattened`);
  assert.deepEqual(Object.keys(catalogs[index]).sort(), expectedKeys, `${locale}: translation keys must stay aligned`);
}

const html = read('index.html');
assert.match(html, /<script type="module" src="js\/plausible-bootstrap\.js"><\/script>/);
assert.match(html, /<script type="module" src="js\/app\.js"><\/script>/);
assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*(?!<\/script>)[\s\S]*?<\/script>/i, 'index.html must not reintroduce inline JavaScript');

const css = read('styles.css');
assert.doesNotMatch(css, /[ \t]+$/m, 'styles.css must not contain trailing whitespace');
assert.doesNotMatch(css, /\n\n\n/, 'styles.css must not accumulate release-era blank-line padding');
assert.doesNotMatch(css, /\/\*[^*]*(?:1\.1[0-9]|v1\.)[^*]*\*\//i, 'styles.css comments must describe purpose, not historical release numbers');

const frSource = read('js/locales/fr.js');
const enSource = read('js/locales/en.js');
assert.doesNotMatch(frSource, /Projection probabiliste/);
assert.doesNotMatch(enSource, /Probabilistic projection/i);
assert.ok(fs.existsSync(new URL('../../../FORECAST_ENGINES.md', import.meta.url)), 'forecast-engine documentation must be present');

console.log(`MeteoCompare Web ${APP_VERSION} source cleanup guard: OK (${expectedKeys.length} i18n keys)`);
