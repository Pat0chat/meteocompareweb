import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('js/app.js','utf8');
const comparison=fs.readFileSync('js/features/comparison.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const build=fs.readFileSync('tools/build-site.mjs','utf8');

assert.match(css,/\.mc-disclosure-chevron\s*\{/,'shared disclosure chevron style must exist');
assert.match(css,/\.mc-disclosure-chevron::before\s*\{/,'chevron geometry must be drawn in CSS');
assert.match(css,/border-right:1\.7px solid currentColor/,'shared mark must have a consistent stroke');
assert.match(css,/\.city-list-disclosure\[open\] \.mc-disclosure-chevron[\s\S]*transform:rotate\(180deg\)/,'city disclosures must rotate the shared mark');
assert.match(css,/\.collapsible-card:not\(\[data-collapsed="true"\]\) \.collapse-card-btn \.mc-disclosure-chevron/,'expanded cards must use the shared mark orientation');
assert.match(css,/:where\(\.storage-details,\.privacy-details,\.method-details\) > summary::marker/,'native detail markers must be suppressed');

for(const source of [app,comparison,build]) assert.ok(!/[⌄⌃]/.test(source),'legacy Unicode chevrons must not remain in rendered UI sources');
for(const marker of ['city-list-chevron mc-disclosure-chevron','details-chevron mc-disclosure-chevron']) assert.ok(app.includes(marker),`missing shared marker ${marker}`);
assert.ok(app.includes('class="mc-disclosure-chevron" aria-hidden="true"'),'foldable cards and compact details must use shared chevrons');
assert.ok(comparison.includes('target-compare-chevron mc-disclosure-chevron'),'comparison disclosure must use shared chevron');
assert.ok(build.includes('city-list-chevron mc-disclosure-chevron'),'SEO prerender must use shared city-list chevron');

console.log('tests/design-system/regression/app.chevrons-unified.test.mjs: OK');
