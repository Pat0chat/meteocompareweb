import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim(), app=read('js/app.js'), css=read('styles.css'), sw=read('sw.js');

assert.ok(version.localeCompare('1.10.17',undefined,{numeric:true,sensitivity:'base'})>=0);
assert.match(sw,/APP_VERSION = '\d+\.\d+\.\d+'/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);

// Detail workspace keeps a zero-min-width main area so tables can size without forcing the page wider.
assert.match(css,/\.detail-workspace\s*\{[^}]*min-width:0/s);
assert.match(css,/\.detail-main\s*\{\s*min-width:0;\s*\}/);

// Only the chevron owns data-collapse-section. Card content cannot collapse its parent by bubbling/closest().
assert.doesNotMatch(app,/card\.dataset\.collapseSection\s*=/);
assert.match(app,/btn\.dataset\.collapseSection=sectionId/);
assert.match(app,/if\(target\.dataset\.collapseSection\)\{/);

// The targeted comparison remains a controlled panel, not a nested native details element.
assert.match(app,/rerenderTargetedComparisonPanel\(\);return;/);
assert.match(app,/action==='toggle-target-compare'/);
assert.doesNotMatch(css,/\.target-compare\s*>\s*summary/);

// Back action on long secondary pages is larger and sticky below the topbar.
assert.match(app,/sticky=\['data','settings','about','bias'\]\.includes\(state\.route\.name\)/);
assert.match(css,/\.page-back-shell\.is-sticky\s*\{[^}]*position:sticky[^}]*top:calc\(var\(--topbar-height,66px\) \+ var\(--space-2\)\)[^}]*z-index:24/s);
assert.match(css,/\.page-back-shell\.is-sticky \.page-back-button\s*\{[^}]*min-height:48px[^}]*font-size:\.84rem/s);

// Cleanup: no obsolete floating back row or old horizontal detail-nav override.
assert.doesNotMatch(css,/\.detail-back-row\s*\{/);
assert.doesNotMatch(css,/\.detail-nav\s*\{\s*display:flex;\s*overflow-x:auto;\s*\}/);

console.log('MeteoCompare Web 1.10.17 final clean polish: OK');
