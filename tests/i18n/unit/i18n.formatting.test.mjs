import assert from 'node:assert/strict';
import { languageCode, makeI18n, hasTranslation, webTranslationAudit } from '../../../js/i18n.js';

assert.equal(languageCode('FRENCH'),'fr');
assert.equal(languageCode('ENGLISH'),'en');
assert.equal(languageCode('SPANISH'),'es');
assert.equal(languageCode('GERMAN'),'de');
assert.equal(languageCode('ITALIAN'),'it');

const fr=makeI18n('FRENCH');
const en=makeI18n('ENGLISH');
assert.equal(fr.lang,'fr');
assert.equal(en.lang,'en');
assert.match(fr.locale,/^fr-/);
assert.match(en.locale,/^en-/);
assert.equal(fr.t('modelHorizon',{hours:72}).includes('72'),true,'named placeholders must be interpolated');
assert.equal(fr.t('settings_about_version','1.2.3').includes('1.2.3'),true,'Android-style %s placeholders must still be supported');
assert.equal(fr.t('__missing_key__'),'__missing_key__','missing keys must stay diagnosable instead of becoming blank');
assert.equal(hasTranslation('FRENCH','forecastExpertiseDisclaimerBody'),true);
assert.equal(hasTranslation('ENGLISH','forecastExpertiseDisclaimerBody'),true);
const audit=webTranslationAudit();
for(const lang of ['fr','en','es','de','it']) assert.deepEqual(audit[lang],[],`${lang} must remain complete against the French base catalog`);

console.log('i18n language mapping, formatting and catalog completeness: OK');
