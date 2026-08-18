import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

const nav=app.match(/<nav class="topbar-nav"[\s\S]*?<\/nav>/)?.[0]||'';
assert.ok(nav,'topbar navigation must exist');
const playPos=nav.indexOf('class="nav-btn android-nav"');
const supportPos=nav.indexOf('class="nav-btn support-nav"');
assert.ok(playPos>=0,'Google Play action must exist in topbar');
assert.ok(supportPos>playPos,'Google Play action must be immediately before Support in navigation order');
assert.match(nav,/href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.meteocompare\.app"/);
assert.match(nav,/target="_blank" rel="noopener"/);
assert.match(nav,/aria-label="\$\{esc\(t\('openAndroidApp'\)\)\}"/);
assert.match(nav,/<span>Google Play<\/span>/);
assert.match(css,/\.topbar \.android-nav/);
assert.match(css,/@media \(max-width:860px\)[\s\S]*\.topbar \.nav-btn > span:last-child \{ display:none; \}/);
assert.match(sw,/const APP_VERSION = '\d+\.\d+\.\d+'/);
assert.match(sw,/const CACHE_VERSION = 'v\d+-[a-z0-9-]+'/);
console.log('MeteoCompare Web Play Store navigation regression: OK');
