import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const html=read('admin.html'),js=read('admin.js'),css=read('admin.css'),store=read('js/server/analytics-store.js'),worker=read('worker.js'),wrangler=read('wrangler.jsonc');

for(const id of ['overview','audience','usage','vigilance','services-monitoring'])assert.match(html,new RegExp(`id="${id}"`),`admin must expose ${id} section`);
assert.match(html,/data-section-link="overview"/);assert.match(css,/\.section-nav/,'internal admin navigation must be styled');
assert.match(html,/id="compare-period"/);assert.match(store,/previousTrend/);assert.match(store,/previousHourly24/);assert.match(js,/comparePeriod/);
assert.match(html,/id="auto-refresh"/);assert.match(js,/scheduleAutoRefresh/);assert.match(js,/setTimeout/);assert.match(js,/visibilitychange/);assert.match(js,/meteocompare\.admin\.autoRefresh/);
assert.match(html,/Vue d’ensemble opérationnelle/);assert.match(html,/À surveiller/);assert.match(js,/renderAttention/);
assert.match(html,/Interactions/);assert.match(js,/INTERACTION_GROUPS/);assert.match(html,/dimension-tabs/,'environment data must be consolidated in one tabbed card');
assert.match(store,/CREATE TABLE IF NOT EXISTS service_checks/);assert.match(store,/serviceHistory/);assert.match(store,/DELETE FROM service_checks WHERE ts < \?/);assert.match(store,/latest-service-checks/,'latest monitoring snapshot must be readable without probing upstream services');assert.match(store,/ALTER TABLE service_checks ADD COLUMN state TEXT/,'service probes must persist ok/down/unknown state');assert.match(store,/SELECT MAX\(ts\) AS ts FROM service_checks/,'latest service status must come from one coherent snapshot timestamp');assert.match(js,/function serviceState\(service\)/,'admin must distinguish unavailable and indeterminate probes');assert.match(js,/serviceState\(service\)==='down'/,'only confirmed service failures should enter attention alerts');assert.match(worker,/scheduledServiceSnapshot/);assert.match(worker,/recordServiceChecks/);assert.match(worker,/ADMIN_STATUS_MAX_AGE_SECONDS=900/,'admin status must reuse a recent central snapshot for 15 minutes');assert.match(worker,/latestRecordedServiceStatus/,'admin refreshes must not probe every upstream service on every UI refresh');assert.match(wrangler,/\*\/30 \* \* \* \*/,'service monitoring must run every 30 minutes');
assert.match(html,/Historique de disponibilité/);assert.match(js,/renderServiceHistory/);assert.match(js,/service-history-strip/);
assert.match(store,/upstream_ms/);assert.match(store,/cache_age_seconds/);assert.match(worker,/x-meteocompare-cache-stored-at/);assert.match(js,/Cache edge/);assert.match(js,/Cache partagé/);assert.match(js,/Météo-France/);assert.match(js,/Cache à deux niveaux/);
assert.match(js,/chart-average/);assert.match(js,/trend-insights/);assert.match(css,/\.chart-insights/);

assert.match(worker,/VIGILANCE_EDGE_CACHE_TTL_SECONDS=600/,'edge Vigilance cache must use a 10-minute TTL');
assert.match(worker,/VIGILANCE_SHARED_CACHE_TTL_SECONDS=600/,'shared Vigilance cache must use a 10-minute TTL');
assert.match(worker,/class VigilanceCache/,'Vigilance must expose a shared Durable Object cache');
assert.match(wrangler,/"name": "VIGILANCE_CACHE"/,'shared Vigilance cache binding must be deployed');
assert.match(wrangler,/"VigilanceCache"/,'shared Vigilance cache Durable Object must have a migration');
assert.match(js,/Cache edge/);assert.match(js,/Cache partagé/);assert.match(js,/Météo-France/);
assert.match(store,/cache_status='shared'/);assert.match(store,/cache_status IN \('upstream','miss'\)/);

console.log('Operational admin overview, comparisons, monitoring history and auto-refresh: OK');
