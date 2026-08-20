import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim(), app=read('js/app.js'), css=read('styles.css'), sw=read('sw.js');

assert.equal(version,'1.10.17');
assert.match(sw,/APP_VERSION = '1\.10\.17'/);
assert.match(sw,/CACHE_VERSION = 'v54-final-clean-polish'/);

// Detail workspace: wider desktop canvas, narrower rail, no inherited min-width overflow.
assert.match(css,/--detail-content-max:\s*1780px/);
assert.match(css,/\.detail-page\s*\{[^}]*width:min\(var\(--detail-content-max\),100%\)[^}]*padding-inline:24px/s);
assert.match(css,/\.detail-workspace\s*\{[^}]*grid-template-columns:200px minmax\(0,1fr\)[^}]*min-width:0/s);
assert.match(css,/\.detail-main\s*\{\s*min-width:0;\s*\}/);

// Only the chevron owns data-collapse-section. Card content cannot collapse its parent by bubbling/closest().
assert.doesNotMatch(app,/card\.dataset\.collapseSection\s*=/);
assert.match(app,/btn\.dataset\.collapseSection=sectionId/);
assert.match(app,/if\(target\.dataset\.collapseSection\)\{/);

// The targeted comparison remains a controlled panel, not a nested native details element.
assert.match(app,/rerenderTargetedComparisonPanel\(\);return;/);
assert.match(app,/action==='toggle-target-compare'/);
assert.doesNotMatch(css,/\.target-compare\s*>\s*summary/);

// Back action on configuration/info pages is larger and sticky below the topbar.
assert.match(app,/sticky=\['data','settings','about'\]\.includes\(state\.route\.name\)/);
assert.match(css,/\.page-back-shell\.is-sticky\s*\{[^}]*position:sticky[^}]*top:calc\(var\(--topbar-height,66px\) \+ var\(--space-2\)\)[^}]*z-index:24/s);
assert.match(css,/\.page-back-shell\.is-sticky \.page-back-button\s*\{[^}]*min-height:48px[^}]*font-size:\.84rem/s);

// Cleanup: no obsolete floating back row or old horizontal detail-nav override.
assert.doesNotMatch(css,/\.detail-back-row\s*\{/);
assert.doesNotMatch(css,/\.detail-nav\s*\{\s*display:flex;\s*overflow-x:auto;\s*\}/);

console.log('MeteoCompare Web 1.10.17 final clean polish: OK');
