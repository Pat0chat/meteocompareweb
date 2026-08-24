import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webTranslationAudit, hasTranslation } from '../../../js/i18n.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');

for(const token of ['Google Play','F-Droid','PWA']) assert.ok(app.includes(token),`${token} install option missing`);
assert.match(app,/pwaInstalled\|\|pwaDirect\|\|pwaManual/,'PWA menu visibility must be capability-driven');
assert.match(app,/beforeinstallprompt[\s\S]*refreshInstallNav/,'capturing a PWA prompt must refresh the topbar availability state');
assert.match(app,/appinstalled[\s\S]*refreshInstallNav/,'install completion must refresh the topbar availability state');
assert.match(app,/data-action="install-play-store"/);
assert.match(app,/data-action="install-pwa"/);
assert.match(css,/@media \(max-width:860px\)[\s\S]*\.nav-install-popover \{ position:fixed;/,'install menu must remain usable on touch/mobile topbars');

const audit=webTranslationAudit();
for(const lang of ['fr','en','es','de','it']) assert.deepEqual(audit[lang],[],`missing translations in ${lang}`);
for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']) for(const key of ['installNav','installMenuTitle','installPlayStoreBody','installFdroidBody','installPwaReadyShort','installStatusAvailable']) assert.ok(hasTranslation(pref,key),`${key} missing in ${pref}`);

console.log('MeteoCompare Web install menu topbar UX: OK');
