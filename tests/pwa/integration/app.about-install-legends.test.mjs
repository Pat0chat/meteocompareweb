import fs from 'node:fs';
import assert from 'node:assert/strict';
import { webTranslationAudit, hasTranslation } from '../../../js/i18n.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),comparison=read('js/features/comparison.js'),css=read('styles.css'),sw=read('sw.js'),html=read('index.html'),workflow=read('.github/workflows/pages.yml');

// Explicit graph legend semantics.
assert.match(comparison,/legendModelHourly/,'model comparison explains what the legend values mean');
assert.match(comparison,/legendCityTemperature/,'city comparison explains temperature aggregation');
assert.match(comparison,/legendCityPrecipitation/,'city comparison explains precipitation aggregation');
assert.match(comparison,/legendCityWind/,'city comparison explains wind aggregation');
assert.match(comparison,/legendCityAgreement/,'city comparison explains agreement semantics');
assert.match(comparison,/data-hover-chart=\"model\"/,'model comparison exposes an interactive hover chart');
assert.match(comparison,/data-hover-chart=\"city\"/,'city comparison exposes an interactive hover chart');
assert.match(app,/chartHoverAt/,'comparison legends expose the selected forecast date/time');
assert.match(css,/\.compare-legend-explainer/,'comparison legend explainer styling exists');
assert.match(css,/\.legend-live-value/,'interactive legend values have dedicated styling');

// About + support navigation.
assert.match(app,/parts\[0\]==='about'/,'about route exists');
assert.match(app,/function renderAbout\(/,'about page renderer exists');
assert.match(app,/data-action="about"/,'About is exposed in the main navigation');
assert.match(app,/data-action="donate"/,'Support is exposed in the main navigation');
assert.match(app,/play\.google\.com\/store\/apps\/details\?id=com\.meteocompare\.app/,'About page links to the Android Play Store app');
for (const host of ['liberapay.com/Pat0chat','github.com/sponsors/Pat0chat','ko-fi.com/pat0chat']) assert.ok(app.includes(host),`support overlay includes ${host}`);
assert.match(css,/\.about-hero/,'About page has dedicated layout styling');
assert.match(css,/\.donation-grid/,'support overlay has dedicated donation layout styling');

// PWA install UX: custom prompt where available, honest manual fallback elsewhere.
assert.match(html,/<meta name="mobile-web-app-capable" content="yes" \/>/,'modern Chromium PWA capability meta is present');
assert.match(app,/beforeinstallprompt/,'app captures the install prompt when supported');
assert.match(app,/event\.preventDefault\(\)/,'browser prompt is deferred for the in-app install control');
assert.match(app,/data-action="install-pwa"/,'About page exposes an install action when supported');
assert.match(app,/promptEvent\.prompt\(\)/,'install action invokes the browser install prompt');
assert.match(app,/appinstalled/,'installed state is observed');
assert.match(app,/pwaInstallFirefoxWindows/,'Firefox Windows native web-app guidance is handled');
assert.match(app,/pwaInstallIos/,'iOS manual installation guidance is handled');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');

// New strings remain complete in all supported languages.
const audit=webTranslationAudit();
for(const lang of ['fr','en','es','de','it']) assert.deepEqual(audit[lang],[],`missing web translations in ${lang}`);
for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']) for(const key of ['aboutTitle','helpTitle','pwaTitle','installPwa','legendHowToRead','supportBodyDetailed','donationDisclaimer']) assert.ok(hasTranslation(pref,key),`${key} missing in ${pref}`);

assert.match(workflow,/(?:npm run tests|pwa-about-legends\.mjs|tests\/\*\.mjs)/,'GitHub Pages workflow runs the PWA/About/legends regression suite');
console.log('MeteoCompare Web PWA + About + legend semantics tests: OK');
