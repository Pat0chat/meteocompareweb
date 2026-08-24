import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeI18n, hasTranslation } from '../../../js/i18n.js';

const read = file => fs.readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
const app = read('js/app.js');
const css = read('styles.css');

assert.match(app, /function renderForecastExpertiseDisclaimer\(\)/, 'the disclaimer must be centralized in one renderer');
assert.match(app, /class="forecast-expertise-disclaimer" role="note" aria-labelledby="forecast-expertise-disclaimer-title"/, 'the disclaimer must expose note semantics and an accessible label');
assert.match(app, /renderAbout\(\)[\s\S]*?about-hero[\s\S]*?\$\{renderForecastExpertiseDisclaimer\(\)\}[\s\S]*?about-method/, 'About must show the disclaimer immediately after its hero');
assert.match(app, /renderHome\(\)[\s\S]*?home-hero[\s\S]*?\$\{renderForecastExpertiseDisclaimer\(\)\}[\s\S]*?hasCities/, 'Home must show the disclaimer before forecast content');
assert.match(app, /renderSettings\(\)[\s\S]*?settings-page-header[\s\S]*?\$\{renderForecastExpertiseDisclaimer\(\)\}<div class="settings-list/, 'Settings must show the disclaimer before controls');

for (const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']) {
  assert.equal(hasTranslation(pref, 'forecastExpertiseDisclaimerTitle'), true, `${pref}: disclaimer title missing`);
  assert.equal(hasTranslation(pref, 'forecastExpertiseDisclaimerBody'), true, `${pref}: disclaimer body missing`);
  const tr = makeI18n(pref);
  assert.ok(tr.t('forecastExpertiseDisclaimerTitle').length >= 24, `${pref}: title is unexpectedly weak`);
  assert.ok(tr.t('forecastExpertiseDisclaimerBody').length >= 120, `${pref}: body must explain both multi-model interpretation and human expertise`);
}

const fr = makeI18n('FRENCH').t('forecastExpertiseDisclaimerBody');
assert.match(fr, /multi-modèles/i);
assert.match(fr, /convergences/i);
assert.match(fr, /divergences/i);
assert.match(fr, /ne remplacera jamais l.expertise humaine/i);
assert.match(fr, /météorologue|professionnel compétent/i);

assert.match(css, /\.forecast-expertise-disclaimer\s*\{[\s\S]*?grid-template-columns:[^;]+;[\s\S]*?border:[^;]+;[\s\S]*?background:/, 'disclaimer must have a distinct but lightweight visual treatment');
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.forecast-expertise-disclaimer/, 'disclaimer must remain compact on mobile');

console.log('Forecast expertise disclaimer on Home/Settings/About: OK');
