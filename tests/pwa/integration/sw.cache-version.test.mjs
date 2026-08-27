import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw=fs.readFileSync(new URL('../../../sw.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../../../cache-version.js',import.meta.url),'utf8');
assert.match(sw,/importScripts\('\.\/app-version\.js','\.\/cache-version\.js'\)/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
const generation=Number(config.match(/METEOCOMPARE_CACHE_VERSION\s*=\s*['"]v(\d+)/)?.[1]||0);
assert.ok(generation>=76,'centralized PWA cache generation must not regress below v76');
assert.match(sw,/\.\/cache-version\.js/,'cache config must be part of the application shell');
assert.match(sw,/url\.pathname\.startsWith\('\/_mcx\/'\)\)return/,'dynamic first-party proxy endpoints must bypass the PWA shell cache');
assert.match(sw,/legacyAssetPath\(pathname\)/,'service worker must recover legacy /meteo/ asset paths');
assert.match(sw,/cachedOrUnavailable\(request\)/,'service worker code fallback must always resolve to a Response');
assert.doesNotMatch(sw,/catch\(\(\)=>caches\.match\(request\)\)/,'service worker must not return undefined when a code asset is absent');
console.log('MeteoCompare centralized cache version tests: OK');
