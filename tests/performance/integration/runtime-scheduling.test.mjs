import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),admin=read('admin.js'),adminCss=read('admin.css'),sw=read('sw.js'),vigilance=read('js/features/vigilance.js');

assert.match(sw,/if\(isCode\)[\s\S]*caches\.match\(request\)[\s\S]*cached\|\|fetch\(request\)/,'versioned PWA code must use cache-first startup');
assert.match(app,/schedulePwaServiceWorkerRegistration[\s\S]*addEventListener\('load'/,'service-worker installation should be deferred until the page load phase');
assert.match(app,/hydrateForecastStorage[\s\S]*workers=Math\.min\(3,cities\.length\)/,'IndexedDB forecast hydration must use bounded concurrency');
assert.match(app,/yieldToMainThread[\s\S]*scheduler\?\.yield/,'forecast hydration must cooperatively yield to the main thread');
assert.match(app,/refreshDueCities[\s\S]*workers=Math\.min\(2,due\.length\)/,'automatic forecast refresh must use bounded parallel workers');
assert.match(app,/startAutoRefreshTimer[\s\S]*document\.visibilityState==='hidden'/,'background PWA refresh timer must pause when the document is hidden');
assert.match(app,/handleChartPointerMoveScheduled[\s\S]*requestAnimationFrame/,'application chart hover must be frame-throttled');
assert.match(app,/pendingEvolutionWidths[\s\S]*requestAnimationFrame/,'responsive evolution graph rebuilds must be frame-batched');
assert.match(vigilance,/CACHE_TTL_MS=10\*60_000/,'browser Vigilance cache must align with the 10-minute edge cache');

assert.match(admin,/renderSignatures/,'admin must skip unchanged expensive DOM/chart renders');
assert.match(admin,/bindCartesianHover[\s\S]*requestAnimationFrame/,'admin chart hover must be frame-throttled');
assert.match(admin,/scheduleAutoRefresh[\s\S]*document\.hidden/,'admin automatic refresh must pause while hidden');
assert.match(admin,/visibilitychange/,'admin must resume automatic refresh on visibility changes');

assert.match(adminCss,/\.dashboard-section:not\(\.overview-section\)\{[^}]*content-visibility:auto[^}]*contain-intrinsic-size/,'below-the-fold admin sections should use content-visibility to reduce initial layout/paint work');
assert.match(admin,/function bindDonutHover[\s\S]*requestAnimationFrame/,'admin donut hover should batch pointer movement to animation frames');

console.log('Runtime/PWA/admin scheduling performance guards: OK');
