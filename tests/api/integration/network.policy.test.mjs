import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=rel=>fs.readFileSync(new URL(`../../../${rel}`,import.meta.url),'utf8');
const config=read('js/network-config.js'),network=read('js/network.js'),api=read('js/api.js'),marine=read('js/features/marine.js'),health=read('js/features/model-health.js'),radar=read('js/features/radar.js'),vigilance=read('js/features/vigilance.js'),analytics=read('js/analytics-config.js'),html=read('index.html'),sw=read('sw.js');

for(const endpoint of ['api.open-meteo.com','geocoding-api.open-meteo.com','archive-api.open-meteo.com','previous-runs-api.open-meteo.com','marine-api.open-meteo.com','map-tiles.open-meteo.com','api.rainviewer.com','tile.openstreetmap.org','public-api.meteofrance.fr','plausible.io']) assert.ok(config.includes(endpoint),`${endpoint} must be centralized in network-config.js`);
for(const source of [api,marine,health,radar,vigilance,analytics]) assert.doesNotMatch(source,/https:\/\/(?:api|geocoding-api|archive-api|previous-runs-api|marine-api)\.open-meteo\.com|https:\/\/openmeteo-data-spatial\.b-cdn\.net|https:\/\/api\.rainviewer\.com|https:\/\/tile\.openstreetmap\.org|https:\/\/public-api\.meteofrance\.fr|https:\/\/plausible\.io/,'runtime modules must consume centralized network destinations');

assert.doesNotMatch(config,/portail-api\.meteofrance\.fr\/token/,'OAuth token endpoint must not remain after API Key migration');
assert.match(network,/credentials='omit'/);
assert.match(network,/referrerPolicy='no-referrer'/);
assert.match(network,/error\.code='HTTP_ERROR'/);
assert.match(network,/error\.code='NETWORK_TIMEOUT'/);
assert.match(api,/NETWORK_ENDPOINTS\.openMeteo/);
assert.match(marine,/NETWORK_ENDPOINTS\.openMeteo\.marine/);
assert.match(health,/fetchJsonResource/);
assert.match(radar,/fetchJsonResource/);
assert.match(radar,/fetchBlobResource/);
assert.match(analytics,/optOutStorageKey: 'meteocompare\.web\.analytics\.optout\.v1'/);

const csp=html.match(/Content-Security-Policy" content="([^"]+)/)?.[1]||'';
for(const host of ['https://api.open-meteo.com','https://geocoding-api.open-meteo.com','https://archive-api.open-meteo.com','https://previous-runs-api.open-meteo.com','https://marine-api.open-meteo.com','https://api.rainviewer.com','https://*.rainviewer.com']) assert.ok(csp.includes(host),`CSP must allow direct data source ${host}`);
assert.ok(!csp.includes('plausible.io'),'Plausible must remain first-party from the browser');
assert.ok(!csp.includes('map-tiles.open-meteo.com'),'model metadata CDN must remain first-party from the browser');
assert.ok(!csp.includes('meteofrance.fr'),'Météo-France Vigilance must remain first-party from the browser');
assert.match(sw,/url\.pathname\.startsWith\('\/_mcx\/'\)\)return/,'Worker proxies must bypass service-worker storage');

console.log('Centralized network destinations, browser policy, CSP and PWA bypass: OK');
