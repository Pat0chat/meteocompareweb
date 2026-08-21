import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js'),app=read('js/app.js'),css=read('styles.css');

assert.equal(version,'1.13.1');
assert.ok(versionJs.includes("APP_VERSION = '1.13.1'"));
assert.match(sw,/APP_VERSION = '1\.13\.1'/);
assert.match(sw,/CACHE_VERSION = 'v65-home-insights-card'/);

assert.match(app,/home-empty-logo[^>]+src="assets\/icon\.png"/,'empty home must use the MeteoCompare application icon');
assert.match(css,/\.home-empty \.home-empty-logo-wrap\s*\{[^}]*place-items:center/s,'empty home icon host must be centered');
assert.doesNotMatch(app,/home-empty[^`]+weatherIcons\.render\('RAIN_SHOWERS'/s,'empty home must no longer render a weather glyph');

assert.match(app,/overview-primary[^`]+renderTodaySummary[^`]+renderInsights/s,'À retenir must follow TodaySummary in overview-primary');
assert.match(app,/overview-secondary[^`]+renderGlobalAgreementCard[^`]+renderScenarios/s,'overview-secondary keeps agreement and scenarios');
assert.doesNotMatch(app,/overview-secondary[^`]+renderInsights/s,'À retenir must not remain in overview-secondary');
assert.match(app,/class="section insights-section" id="insights"/);
assert.match(app,/class="insight-item \$\{x===lead\?'lead':''\}/,'the highest-priority takeaway is visually promoted');
assert.match(css,/\.insight-item\.lead\s*\{[^}]*grid-column:1 \/ -1/s,'lead takeaway spans the card width');
assert.match(css,/\.insights-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);

console.log('MeteoCompare Web 1.13.1 home/insights redesign: OK');
