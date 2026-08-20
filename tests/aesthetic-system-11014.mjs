import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('js/app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=fs.readFileSync('VERSION','utf8').trim();

assert.ok(version.localeCompare('1.10.14',undefined,{numeric:true,sensitivity:'base'})>=0);
assert.match(sw,/APP_VERSION = '\d+\.\d+\.\d+'/);
assert.match(sw,/CACHE_VERSION = 'v\d+-[a-z0-9-]+'/);

// Mes villes: normal navigation remains, quick hover/focus menu adds direct routes.
assert.match(app,/class="nav-cities-menu"/);
assert.match(app,/class="nav-cities-popover"/);
assert.match(app,/data-action="quick-city" data-city-id=/);
assert.match(app,/else if\(action==='home'\)go\('#\/'\)/);
assert.match(app,/else if\(action==='quick-city'\)/);
assert.match(css,/\.nav-cities-menu:hover \.nav-cities-popover/);
assert.match(css,/\.nav-cities-menu:focus-within \.nav-cities-popover/);
assert.match(css,/@media \(hover:none\), \(max-width:860px\)/);

// Formal design tokens and semantic status palette.
for(const token of ['--space-1','--space-4','--space-8','--radius-xs','--radius-md','--radius-xl','--shadow-1','--shadow-2','--shadow-4','--semantic-success','--semantic-warning','--semantic-danger','--semantic-info']){
  assert.ok(css.includes(token),`missing design token ${token}`);
}
assert.match(css,/--good:\s*var\(--semantic-success\)/);
assert.match(css,/--medium:\s*var\(--semantic-warning\)/);
assert.match(css,/--low:\s*var\(--semantic-danger\)/);
assert.match(css,/\.status-pill\.high[^}]*var\(--semantic-success\)/s);

// Main forecast cards are foldable, persisted and reopened by sidebar navigation.
assert.match(app,/collapsedSections/);
assert.match(app,/function enhanceCollapsibleCards/);
assert.match(app,/dataCollapseSection|dataset\.collapseSection/);
assert.match(app,/setSectionCollapsed\(sectionId,collapsed\)/);
assert.match(app,/if\(sectionCollapsed\(sectionId\)\)/);
assert.match(css,/\.collapsible-card\[data-collapsed="true"\]/);
assert.match(css,/\.collapse-card-btn/);
for(const id of ['today-summary','timeline','agreement','evolution','reliability','details','marine','diagnostics']) assert.ok(app.includes(`['${id}'`),`missing collapsible spec ${id}`);
assert.match(app,/state\.route\.name==='settings'/);
assert.match(app,/data-backup/);
assert.match(app,/about-method/);

for(const lang of ['fr','en','es','de','it']){
  const locale=fs.readFileSync(`js/locales/${lang}.js`,'utf8');
  assert.match(locale,/collapseSection/);
  assert.match(locale,/expandSection/);
}
console.log('MeteoCompare Web aesthetic system 1.10.14: OK');
