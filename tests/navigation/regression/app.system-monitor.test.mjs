import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=rel=>fs.readFileSync(new URL(`../../../${rel}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),network=read('js/network-config.js'),bootstrap=read('js/plausible-bootstrap.js');

assert.match(network,/health:\s*'\/_mcx\/health'/,'system monitor must use one first-party health endpoint');
assert.match(app,/function renderSystemMonitor\(/,'topbar status must render a monitoring popover');
assert.match(app,/monitorForecastItem\(\)/,'forecast health must be part of the monitor');
assert.match(app,/monitorVigilanceItem\(\)/,'Météo-France Vigilance must be part of the monitor');
assert.match(app,/monitorMetadataItem\(\)/,'model metadata health must be part of the monitor');
assert.match(app,/monitorAnalyticsItem\(\)/,'Plausible must be part of the monitor');
assert.match(app,/monitorPwaItem\(\)/,'PWA/cache state must be part of the monitor');
assert.match(app,/fetchJsonResource\(NETWORK_ENDPOINTS\.firstParty\.health/,'worker probe must stay first-party');
assert.match(app,/handleSystemMonitorIntent/,'hover/focus must refresh stale monitoring data');
assert.match(app,/data-action="refresh-system-monitor"/,'monitor must expose an explicit refresh control');
assert.match(css,/\.topbar-system-monitor:hover \.system-monitor-popover/,'monitor must open on hover like topbar menus');
assert.match(css,/\.topbar-system-monitor:focus-within \.system-monitor-popover/,'monitor must be keyboard accessible');
assert.match(css,/\.system-monitor-item/,'monitor rows must have a dedicated compact design');
assert.match(bootstrap,/__METEOCOMPARE_ANALYTICS_RUNTIME__/,'Plausible bootstrap must expose load/error runtime state without leaking data');
assert.match(app,/services tiers[^']*ne sont pas sondés|monitorNoSyntheticProbes/,'monitor must explain that third parties are not synthetically probed');
console.log('Topbar system monitoring center: OK');
