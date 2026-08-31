import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),analyticsSchema=read('js/analytics-schema.js');

const nav=app.match(/<nav class="topbar-nav"[\s\S]*?<\/nav>/)?.[0]||'';
assert.ok(nav,'topbar navigation must exist');
assert.match(app,/function renderInstallNav\(/,'topbar install menu renderer must exist');
assert.match(nav,/\$\{installNav\}/,'unified Install control must be inserted in the main navigation');
assert.doesNotMatch(nav,/class="nav-btn android-nav"/,'legacy direct Google Play nav button must be removed');
assert.match(app,/class="nav-btn install-nav"/);
assert.match(app,/data-action="toggle-install-menu"/);
assert.match(app,/class="nav-install-popover"/);
assert.match(app,/href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.meteocompare\.app"/);
assert.match(app,/storeBrandIcon\('google-play',24\)/,'Google Play must use its dedicated brand icon');
assert.match(app,/storeBrandIcon\('fdroid',25\)/,'F-Droid must use its dedicated brand icon');
assert.doesNotMatch(app,/data-action="install-play-store"[\s\S]{0,250}uiIcon\('external'/,'Google Play must not fall back to the generic external-link icon');
assert.match(app,/<strong>F-Droid<\/strong>/);
assert.match(app,/install-option is-disabled[\s\S]*disabled/,'F-Droid must stay visible but disabled');
assert.match(app,/availability\.pwaVisible\?/,'PWA option must be conditional on browser/device capability');
assert.match(app,/install-opportunity-dot/,'install availability dot must be rendered conditionally');
assert.match(app,/installAvailable:android\|\|pwaDirect\|\|pwaManual/,'availability dot must reflect Android or PWA installation opportunity');
assert.match(css,/\.nav-install-menu:hover \.nav-install-popover/,'desktop hover opens the install menu');
assert.match(css,/\.nav-install-menu\.is-open \.nav-install-popover/,'touch/click can keep the install menu open');
assert.match(css,/\.install-opportunity-dot[\s\S]*var\(--semantic-danger\)/,'availability dot uses the semantic red status color');
assert.match(analyticsSchema,/'Install Option Selected':event\(\{source:enumRule\(\['play_store','pwa'\]\)\}\)/,'install source selection is tracked without device or location data');
console.log('MeteoCompare Web unified installation navigation regression: OK');
