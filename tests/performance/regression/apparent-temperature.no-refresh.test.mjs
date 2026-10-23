import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const cacheVersion=get('cache-version.js');
assert.match(cacheVersion,/METEOCOMPARE_CACHE_VERSION\s*=\s*'v\d+-[^']+'/, 'PWA must version the weather assets without polling for them');
const api=get('js/api.js'),app=get('js/app.js'),domain=get('js/domain.js'),comparison=get('js/features/comparison.js'),normalizer=get('js/data/forecast-normalizer.js'),css=get('styles.css');
// New fields ride on the existing (batched model + single UV) fetches; never call a new endpoint.
assert.match(api,/const HOURLY_VARS = \[[\s\S]*'apparent_temperature'/);
assert.match(api,/const DAILY_VARS = \[[\s\S]*'apparent_temperature_max','apparent_temperature_min'/);
assert.match(api,/u\.searchParams\.set\('hourly', HOURLY_VARS\)/);
assert.match(api,/if \(includeDaily\) u\.searchParams\.set\('daily', DAILY_VARS\)/);
assert.equal((api.match(/async function fetchModelGroup\(/g)||[]).length,1);
assert.ok(!/fetch\s*\(/.test(domain+comparison),'domain and views must not fetch');
assert.ok(!/fetch(OpenMeteoJson|ModelGroup|UvForecast)\(/.test(normalizer),'normalization must not fetch');
assert.ok(!/requestAnimationFrame|setInterval|setTimeout|addEventListener/.test(comparison),'chart overlays must not add listeners, timers, or animation frames');
// Reuse the existing timeline memoization and throttled ruler, without adding animated SVG effects.
assert.match(app,/function cachedTimelinePoints\(f,mode='HOURLY'/);
assert.match(app,/if\(context\.lastIndex!==index\)\{[\s\S]*context\.summary\.apparent/);
assert.match(app,/if\(graphicRulerFrame\)return;graphicRulerFrame=requestAnimationFrame\(/);
assert.match(css,/\.graphic-apparent-temp-line\s*\{[^}]*pointer-events:\s*none/s);
assert.match(css,/\.compare-line\.apparent-temp-line\s*\{[^}]*pointer-events:\s*none/s);
assert.doesNotMatch(css,/\.graphic-apparent-temp-line\s*\{[^}]*(?:animation|filter|backdrop-filter):/s);
assert.doesNotMatch(css,/\.compare-line\.apparent-temp-line\s*\{[^}]*(?:animation|filter|backdrop-filter):/s);
console.log('Felt-temperature request / redraw / passive SVG performance guards: OK');
