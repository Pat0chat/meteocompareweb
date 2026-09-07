import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const html=read('admin.html'),js=read('admin.js'),css=read('admin.css'),store=read('js/server/analytics-store.js'),worker=read('worker.js'),app=read('js/app.js');
assert.match(html,/Audience quotidienne/);
assert.match(html,/Dernières 24 heures/);
assert.match(html,/Systèmes/);
assert.match(html,/Médiums UTM/);
assert.match(html,/Versions MeteoCompare/);
assert.match(js,/renderTrend/);
assert.match(js,/renderHourly/);
assert.match(js,/renderDonut/);
assert.match(js,/previousSummary/);
assert.match(css,/\.trend-line\.pageviews/);
assert.match(css,/\.donut-segment\.segment-0/);
assert.match(store,/previousSummary/);
assert.match(store,/hourly24/);
assert.match(store,/operatingSystems/);
assert.match(store,/navigationModes/);
assert.match(store,/campaignMediums/);
assert.match(store,/CREATE TABLE IF NOT EXISTS maintenance/,'analytics retention must use deterministic maintenance state');
assert.match(store,/DELETE FROM events WHERE ts < \?/,'analytics retention must delete expired rows');
assert.doesNotMatch(store,/Math\.random/,'analytics retention must not depend on probabilistic cleanup');
assert.match(worker,/osFromUa/);
assert.match(app,/dateLabel\(bands\[i\]\.timestamp\.slice\(0,10\),i18n\(\)\.locale,'long'\)/,'hourly convergence axis must use localized long dates');
assert.doesNotMatch(app,/bands\[i\]\.timestamp\.slice\(5,10\)/,'hourly convergence axis must not expose raw month-day strings');

assert.match(app,/chart-date-guide/,'hourly convergence chart must draw visible vertical date guides above the band fills');
assert.match(css,/\.hour-line-halo/,'hourly admin visitor curve must have a contrast halo');
assert.match(css,/\.hour-dot/,'hourly admin visitor curve must expose visible data points');
assert.match(html,/legend-hour-pages[\s\S]*legend-hour-visitors/,'hourly admin chart must explain bars versus visitor line');
for(const locale of ['fr','en','de','es','it']){
  const text=read(`js/locales/${locale}.js`);
  assert.doesNotMatch(text,/la mesure d.audience interne de MeteoCompare/,'locale must not contain the broken mixed-language analytics phrase');
}
console.log('Rich private admin dashboard + localized convergence dates: OK');
