import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
assert.match(css,/--scrollbar-thumb:\s*#[0-9a-f]{6};/i);
assert.match(css,/html, body, \*\s*\{[^}]*scrollbar-width:\s*thin\s*!important;[^}]*scrollbar-color:\s*var\(--scrollbar-thumb\) transparent\s*!important;/s);
assert.doesNotMatch(css,/@supports selector\(::-webkit-scrollbar\)/,'do not gate WebKit scrollbars with selector(): Firefox may enter the block and reset its standard styling');
assert.match(css,/@supports \(-webkit-appearance: none\) and \(not \(-moz-appearance: none\)\)[\s\S]*scrollbar-width:\s*auto\s*!important;/,'only Blink/WebKit should reset the standard property so their 6px pseudo-element sizing can win');
assert.match(css,/html::\-webkit-scrollbar, body::\-webkit-scrollbar, \*::\-webkit-scrollbar\s*\{[^}]*width:\s*6px;[^}]*height:\s*10px;/s);
assert.match(css,/\*::\-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent;/s);
assert.match(css,/\*::\-webkit-scrollbar-thumb\s*\{[^}]*border:\s*2px solid transparent;[^}]*border-radius:\s*999px;[^}]*background-clip:\s*padding-box;[^}]*background-color:\s*var\(--scrollbar-thumb\);/s);
assert.doesNotMatch(css,/::\-webkit-scrollbar-(?:thumb|track|corner):(?:hover|active)/,'Firefox rejects state pseudo-classes placed after WebKit scrollbar pseudo-elements');
assert.match(css,/@media \(forced-colors: active\)[\s\S]*scrollbar-color:\s*Highlight transparent\s*!important;/);
assert.match(css,/@supports \(-moz-appearance: none\)[\s\S]*\.timeline-scroll[\s\S]*scrollbar-width:\s*auto\s*!important;/,'Firefox horizontal data strips should use a usable native thickness instead of thin');
assert.match(css,/@supports \(-moz-appearance: none\)[\s\S]*border-end-start-radius:\s*var\(--radius-sm, 9px\);[\s\S]*padding-block-end:\s*max\(6px, var\(--space-2, 6px\)\);/,'Firefox horizontal gutters should remain inset within rounded MeteoCompare components');

console.log('MeteoCompare cross-browser themed scrollbar policy: OK');
