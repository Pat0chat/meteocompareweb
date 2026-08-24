import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeI18n, hasTranslation } from '../../../js/i18n.js';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),build=read('tools/build-site.mjs');
const home=app.slice(app.indexOf('function renderHome()'),app.indexOf('function renderCityCard'));

assert.match(home,/class="home-hero"/);
assert.match(home,/class="home-hero-main"/);
assert.match(home,/class="home-hero-side"/);
assert.match(home,/homeHeroPillModels/);
assert.match(home,/homeHeroPillConvergence/);
assert.match(home,/homeHeroPillDivergence/);
assert.match(home,/homeHeroSearchTitle/);
assert.match(home,/homeHeroSearchLead/);
assert.ok(home.indexOf('${renderForecastExpertiseDisclaimer()}')>home.indexOf('class="home-hero"'),'the expertise disclaimer must be rendered inside the Home hero');
assert.ok(home.indexOf('${renderForecastExpertiseDisclaimer()}')<home.indexOf('</section>${hasCities?'),'the Home disclaimer must remain inside the hero boundary');
assert.doesNotMatch(home,/<\/section>\$\{renderForecastExpertiseDisclaimer\(\)\}/,'Home must not render a detached disclaimer below the hero');

for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['homeModernKicker','homeModernTitle','homeModernLead','homeHeroPillModels','homeHeroPillConvergence','homeHeroPillDivergence','homeHeroSearchTitle','homeHeroSearchLead']) assert.equal(hasTranslation(pref,key),true,`${pref}.${key} missing`);
  const tr=makeI18n(pref);assert.ok(tr.t('homeModernTitle').length>=40,`${pref}: Home hero title must explain the value proposition`);assert.ok(tr.t('homeModernLead').length>=90,`${pref}: Home hero lead must explain model comparison`);
}
const fr=makeI18n('FRENCH');
assert.match(fr.t('homeModernLead'),/prévisions|modèles/i);
assert.match(fr.t('homeModernLead'),/converge/i);
assert.match(fr.t('homeModernLead'),/diverge/i);

assert.match(css,/\.home-hero\s*\{[\s\S]*?border:1px solid var\(--border\)[\s\S]*?surface-raised[\s\S]*?box-shadow:var\(--shadow-1\)/,'Home hero must reuse the core surface/border/shadow system');
assert.match(css,/\.home-hero \.forecast-expertise-disclaimer\s*\{[^}]*margin:0/s,'the embedded disclaimer must integrate into the hero spacing');
assert.match(build,/rootPrerender\(\)[\s\S]*?Comparez les modèles\. Repérez l’accord\. Comprenez l’incertitude\./,'SEO prerender must share the new Home hero value proposition');
assert.match(build,/rootPrerender\(\)[\s\S]*?forecast-expertise-disclaimer[\s\S]*?ne remplacera jamais l’expertise humaine/,'SEO prerender must preserve the embedded expertise disclaimer');

assert.match(css,/\.home-hero-search-panel\s*\{[\s\S]*?background:color-mix\(in srgb,var\(--surface\)/,'the search rail must remain a themed app surface');

console.log('Home multi-model hero + embedded expertise disclaimer: OK');
