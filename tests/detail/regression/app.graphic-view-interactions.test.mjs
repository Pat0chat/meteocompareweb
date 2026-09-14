import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

assert.match(app,/data-graphic-tooltip-target="temperature"/);
assert.match(app,/data-graphic-tooltip-target="rain"/);
assert.match(app,/data-graphic-tooltip-target="wind"/);
assert.match(app,/<span class="graphic-temp-value">\$\{fmt\(point\.temperatureC\)\}°<\/span>/);
assert.doesNotMatch(app,/index%6===0\?`<span class="graphic-temp-value">/);
assert.match(app,/class="graphic-tooltip-layer" data-graphic-tooltip-layer hidden/);
assert.match(app,/function toggleGraphicTooltipPin\(target\)/);
assert.match(app,/graphicTooltipState\.pinned/);
assert.match(css,/--gv-bg:\s*var\(--bg\)/);
assert.match(app,/--heat-color:\$\{attr\(color\)\}/);
assert.match(css,/\.graphic-temperature-tint > span[^}]*color-mix\(in srgb,var\(--heat-color\)/s);
assert.match(css,/\.graphic-y-axis\.wind > span \{ left: 52px;/);
assert.match(css,/\.graphic-y-axis\.rain > b \{ left: 10px;/);
assert.match(css,/\.graphic-tooltip-layer \{ position: fixed; inset: 0; z-index: 10000;/);
assert.match(css,/\.graphic-floating-tooltip \{[\s\S]*overflow-y: auto;/);
assert.match(css,/\.graphic-tooltip-layer\.is-pinned \.graphic-floating-tooltip \{ pointer-events: auto; \}/);

console.log('Graphical 7-day view theme, heatmap and persistent tooltip interactions: OK');
