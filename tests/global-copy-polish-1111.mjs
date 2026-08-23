import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const langs=['fr','en','es','de','it'];
const catalogs={};
for(const lang of langs) catalogs[lang]=(await import(`../js/locales/${lang}.js`)).catalog;

const baseKeys=Object.keys(catalogs.fr).sort();
for(const lang of langs) assert.deepEqual(Object.keys(catalogs[lang]).sort(),baseKeys,`${lang}: catalog keys must match`);

assert.ok(!app.includes('class="section-eyebrow"'),'redundant internal section eyebrows should be removed');
assert.ok(app.includes("t('apiLocalLimit',{limit})"),'API local limit must be translated');
assert.ok(!app.includes('max local</small>'),'no hard-coded French/English API limit copy');

const terminology={
  fr:/\baccord(s)?\b|confiance historique/i,
  en:/\bagreement\b|historical confidence/i,
  es:/\bacuerdo\b|confianza histórica/i,
  de:/übereinstimmung|historisches vertrauen/i,
  it:/\baccordo\b|fiducia storica/i
};
const convergenceKeys=['agreementAt','agreementBandAria','agreementEvolutionAria','agreementOverTime','minMaxAgreement','analyseAt','historicalConfidence','agreementNotAccuracyBody','disagreementIntro'];
for(const lang of langs){
  for(const key of convergenceKeys) assert.ok(!terminology[lang].test(catalogs[lang][key]),`${lang}.${key} must use convergence/reliability terminology`);
  assert.ok(catalogs[lang].apiLocalLimit.includes('{limit}'),`${lang}.apiLocalLimit must preserve limit placeholder`);
  assert.ok(catalogs[lang].supportBodyDetailed.length<180,`${lang}: support copy should stay concise`);
  assert.ok(catalogs[lang].healthMetadataNote.length<180,`${lang}: health note should stay concise`);
}

assert.match(css,/\.storage-category-main \{[^}]*grid-template-rows:/s,'global copy/layout rules must remain present without historical release comments');
assert.match(css,/\.storage-category-main \{[^}]*grid-template-rows:/s);
assert.match(css,/\.setting-control\{[\s\S]*display:grid;/,'settings controls should use intrinsic grid flow');
assert.match(css,/\.privacy-grid article \{[^}]*display:grid/s);
assert.match(css,/:where\(\.forecast-table,\.diagnostic-table,\.health-table\) tbody td \{ text-align:center;/);

console.log('MeteoCompare Web global copy polish 1.10.11: OK');
