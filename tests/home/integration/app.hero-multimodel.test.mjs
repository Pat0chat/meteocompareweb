import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeI18n, hasTranslation } from '../../../js/i18n.js';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),build=read('tools/build-site.mjs');
const home=app.slice(app.indexOf('function renderHome()'),app.indexOf('function renderCityCard'));
const buildHome=build.slice(build.indexOf('function rootPrerender()'),build.indexOf('function cityPrerender'));

assert.match(home,/class="home-hero"/);
assert.match(home,/class="home-hero-main"/);
assert.doesNotMatch(home,/home-hero-side|home-hero-search-panel|home-hero-pill-row/,'Home hero must not duplicate search/value-proposition UI in secondary blocks');
assert.match(home,/homeModernKicker/);
assert.match(home,/homeModernLead/);
assert.doesNotMatch(home,/homeModernTitle|<h1>/,'Home hero must not render the redundant H1/title');
assert.match(home,/home-hero-actions/);
assert.ok(home.indexOf('${renderForecastExpertiseDisclaimer()}')>home.indexOf('class="home-hero"'),'the expertise disclaimer must be rendered inside the Home hero');
assert.ok(home.indexOf('${renderForecastExpertiseDisclaimer()}')<home.indexOf('</section>${hasCities?'),'the Home disclaimer must remain inside the hero boundary');
assert.doesNotMatch(home,/<\/section>\$\{renderForecastExpertiseDisclaimer\(\)\}/,'Home must not render a detached disclaimer below the hero');

for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['homeModernKicker','homeModernLead']) assert.equal(hasTranslation(pref,key),true,`${pref}.${key} missing`);
  assert.equal(hasTranslation(pref,'homeModernTitle'),false,`${pref}.homeModernTitle should be removed with the redundant hero title`);
  const tr=makeI18n(pref);assert.ok(tr.t('homeModernLead').length>=90,`${pref}: Home hero lead must explain model comparison`);
}
const fr=makeI18n('FRENCH');
assert.match(fr.t('homeModernLead'),/prévisions|modèles/i);
assert.match(fr.t('homeModernLead'),/converge/i);
assert.match(fr.t('homeModernLead'),/diverge/i);

assert.match(css,/\.home-hero\s*\{[\s\S]*?padding:var\(--space-5\)[\s\S]*?border:1px solid var\(--border\)[\s\S]*?surface-raised[\s\S]*?box-shadow:var\(--shadow-1\)/,'Home hero must remain compact and reuse the core surface/border/shadow system');
assert.match(css,/\.home-hero-main\s*\{[^}]*grid-template-columns:minmax\(0,1\.65fr\) minmax\(260px,\.75fr\)[^}]*align-items:center/s,'desktop hero must vertically center its two columns');
assert.match(css,/\.home-hero \.forecast-expertise-disclaimer\s*\{[^}]*align-self:center[^}]*margin:0[^}]*padding:10px 11px/s,'the disclaimer must remain on the right while being vertically centered');
assert.doesNotMatch(css,/\.home-hero h1/,'Home-specific H1 styling must disappear with the redundant title');
assert.match(css,/@media \(max-width: 980px\)[\s\S]*?\.home-hero-main \{ grid-template-columns:1fr;/,'compact hero must collapse cleanly on smaller screens');
assert.match(buildHome,/<span class="home-hero-kicker">Prévision multi-modèles<\/span><p>MeteoCompare rassemble plusieurs prévisions/,'SEO prerender must use the same title-free Home hero structure');
assert.doesNotMatch(buildHome,/<h1>/,'SEO prerender must not restore the removed hero H1');
assert.match(buildHome,/forecast-expertise-disclaimer[\s\S]*?ne remplacera jamais l’expertise humaine/,'SEO prerender must preserve the embedded expertise disclaimer');
assert.doesNotMatch(buildHome,/home-hero-pill-row|home-hero-search-panel/,'SEO prerender must preserve the same compact hero structure');

console.log('Compact title-free Home hero + vertically centered expertise disclaimer: OK');
