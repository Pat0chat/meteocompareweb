import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../js/version.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=APP_VERSION;
const versionJs=read('js/version.js');
const sw=read('sw.js');
const css=read('styles.css');

assert.ok(version.localeCompare('1.10.18',undefined,{numeric:true,sensitivity:'base'})>=0);
assert.ok(versionJs.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.ok(sw.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');

// Detail page returns to the standard app canvas; no special 1780px override remains.
assert.match(css,/--content-max:\s*1560px/);
assert.doesNotMatch(css,/--detail-content-max/);
assert.doesNotMatch(css,/\.detail-page\s*\{[^}]*width:/s);

// Sidebar is wider, fixed on desktop, and never owns a scrollbar.
assert.match(css,/--detail-sidebar-width:\s*248px/);
assert.match(css,/\.detail-workspace\s*\{[^}]*grid-template-columns:var\(--detail-sidebar-width\) minmax\(0,1fr\)[^}]*min-width:0/s);
assert.match(css,/\.detail-sidebar\s*\{[^}]*width:var\(--detail-sidebar-width\)[^}]*min-width:var\(--detail-sidebar-width\)[^}]*max-width:var\(--detail-sidebar-width\)[^}]*max-height:none[^}]*overflow:visible/s);
assert.doesNotMatch(css,/\.detail-sidebar\s*\{[^}]*overflow:\s*auto/s);
assert.match(css,/@media \(max-width:1040px\)[^]*\.detail-sidebar\s*\{[^}]*width:auto[^}]*min-width:0[^}]*max-width:none/s);

console.log('MeteoCompare Web 1.10.18 release guards: OK');
