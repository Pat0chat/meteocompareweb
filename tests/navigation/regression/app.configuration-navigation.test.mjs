import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const nav=app.match(/<nav class="topbar-nav"[\s\S]*?<\/nav>/)?.[0]||'';

assert.ok(nav,'topbar navigation must exist');
assert.match(app,/function renderConfigNav\(/,'configuration menu renderer must exist');
assert.match(nav,/\$\{configNav\}/,'configuration menu must be inserted into the topbar');
assert.match(app,/class="nav-config-menu"/);
assert.match(app,/data-action="toggle-config-menu"/);
assert.match(app,/class="nav-config-popover"/);
assert.match(app,/class="config-option \$\{isData\?'active':''\}"[\s\S]*data-action="local-data"/,'local data remains reachable from configuration');
assert.match(app,/class="config-option \$\{isSettings\?'active':''\}"[\s\S]*data-action="settings"/,'settings remain reachable from configuration');
assert.doesNotMatch(nav,/class="nav-btn \$\{isData\?'active':''\}" data-action="local-data"/,'local data must no longer consume a direct topbar slot');
assert.doesNotMatch(nav,/class="nav-btn \$\{isSettings\?'active':''\}" data-action="settings"/,'settings must no longer consume a direct topbar slot');
assert.match(css,/\.nav-config-menu:hover \.nav-config-popover/,'desktop hover opens configuration');
assert.match(css,/\.nav-config-menu:focus-within \.nav-config-popover/,'keyboard focus opens configuration');
assert.match(css,/\.nav-config-menu\.is-open \.nav-config-popover/,'touch\/click can keep configuration open');
assert.match(app,/closeConfigMenus\(\)/,'configuration menu can be closed explicitly');
assert.match(app,/action==='toggle-config-menu'/,'configuration click handling exists');
for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  assert.match(locale,/"configuration":/,'configuration label must exist in every locale');
}
console.log('MeteoCompare Web configuration navigation regression: OK');
