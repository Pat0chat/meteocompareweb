import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(css,/@media\(max-width:860px\)\{[\s\S]*?\.topbar-inner\{[^}]*gap:5px;[^}]*padding:7px 12px;[^}]*flex-wrap:nowrap;/,'mobile topbar must stay on one compact row');
assert.match(css,/\.topbar \.nav-btn\{width:34px;height:34px;min-height:34px;/,'mobile nav actions must use compact square buttons');
assert.match(css,/@media\(max-width:620px\)\{[\s\S]*?\.brand>div\{display:none;\}/,'small screens must reduce the brand to the app icon');
assert.match(css,/\.topbar-system-status\{display:inline-flex!important;width:32px;height:32px;/,'monitoring must remain available as a compact LED button on mobile');
assert.match(css,/@media\(max-width:360px\)\{[\s\S]*?\.topbar \.bluesky-nav\{display:none;\}/,'very narrow screens may drop the non-essential social shortcut');
console.log('Mobile topbar layout: OK');
