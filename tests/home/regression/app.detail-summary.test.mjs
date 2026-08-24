import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../../../js/version.js';
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const version=APP_VERSION,app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
const fr=read('js/locales/fr.js');
assert.match(fr,/"homeModernTitle":"Aujourd’hui, voyez le temps et le niveau d’accord des modèles\."/);
const effectiveTitle=fr.slice(fr.lastIndexOf('Object.assign(catalog'));
assert.doesNotMatch(effectiveTitle,/"homeModernTitle":"[^"]*—[^"]*"/);
const home=app.slice(app.indexOf('function homeForecastEngineContext'),app.indexOf('function renderCityDetail'));
assert.match(home,/home-weather-coherence/);
assert.doesNotMatch(home,/renderHomeConsensusStrip|home-consensus-rail|home-model-dot/);



assert.match(home,/home-dashboard/);
assert.match(home,/home-column-heading/);
assert.match(home,/home-city-grid/);
assert.match(home,/home-watch-column/);
assert.match(css,/\.home-watch-section::before\s*\{[^}]*content:none/s);
assert.match(css,/\.home-column-heading\s*\{[^}]*margin:/s);
const specs=app.slice(app.indexOf('function collapsibleCitySpecs'),app.indexOf('function decorateCollapsibleCard'));
assert.match(specs,/\['details'/);
assert.doesNotMatch(specs,/\['today-summary'/);
assert.doesNotMatch(specs,/\['diagnostics'/);
assert.match(css,/\.timeline-card\[data-collapsed="true"\] \.timeline-mode\s*\{[^}]*display:none/s);
assert.doesNotMatch(app,/class="detail-back-row"/);
assert.match(app,/class="detail-back-button detail-sidebar-back" data-action="back"/);
assert.match(app,/function renderPageBack\(\)/,'Secondary pages must use a page-level back control');
assert.doesNotMatch(app,/class="topbar-back"/,'Back control must not overlap the topbar');
assert.match(css,/\.detail-back-button\s*\{/);
console.log('tests/home/regression/app.detail-summary.test.mjs: OK');
