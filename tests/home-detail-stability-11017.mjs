import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const version=read('VERSION').trim(),app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');
assert.equal(version,'1.10.17');
assert.match(sw,/APP_VERSION = '1\.10\.17'/);
assert.match(sw,/CACHE_VERSION = 'v52-home-detail-stability'/);

// Home: parallel headings above the two columns, and clearer dispersion copy.
const home=app.slice(app.indexOf('function homeConsensusWeights'),app.indexOf('function renderCityDetail'));
assert.match(home,/home-cities-section/);
assert.match(home,/home-watch-column/);
assert.match(home,/home-column-heading/);
assert.match(home,/renderHomeWatchlist\(\)/);
const fr=read('js/locales/fr.js');
assert.match(fr,/"homeConsensusTitleShort":"Dispersion de la température par modèle"/);
assert.match(fr,/"homeConsensusCentralShort":"Prévision \{value\}°"/);

// Detail navigation: no horizontal scrolling; back belongs below the nav and fills the sidebar.
assert.match(app,/detail-nav[^]*detail-sidebar-back/);
assert.doesNotMatch(app,/class="detail-back-row"/);
assert.match(css,/\.detail-sidebar-back\s*\{[^}]*width:100%/s);
assert.match(css,/@media \(max-width:1040px\)[^]*\.detail-nav\s*\{[^}]*display:grid[^}]*overflow:visible/s);

// Timeline selector stays right-aligned and disappears with a collapsed timeline card.
assert.match(css,/\.timeline-card \.timeline-mode\s*\{[^}]*margin-left:auto/s);
assert.match(css,/\.timeline-card\[data-collapsed="true"\] \.timeline-mode\s*\{[^}]*display:none/s);

// Targeted model selection rerenders only its inner <details>, never the whole detailed card.
assert.match(app,/function rerenderTargetedComparisonPanel\(\)/);
const compareHandler=app.slice(app.indexOf('if(target.dataset.compareModel)'),app.indexOf('if(target.dataset.exportFormat)'));
assert.match(compareHandler,/rerenderTargetedComparisonPanel\(\)/);
assert.doesNotMatch(compareHandler,/rerenderCitySectionOrPage\('details'\)/);
assert.match(app,/panel\.outerHTML=renderTargetedModelComparison/);

console.log('MeteoCompare Web 1.10.17 home/detail stability polish: OK');
