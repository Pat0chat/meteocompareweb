import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

assert.match(app,/data-graphic-tooltip-target="temperature"/);
assert.match(app,/data-graphic-tooltip-target="rain"/);
assert.match(app,/data-graphic-tooltip-target="wind"/);
assert.match(app,/<span class="graphic-temp-value">\$\{fmt\(point\.temperatureC\)\}°<\/span>/);
assert.doesNotMatch(app,/index%6===0\?`<span class="graphic-temp-value">/);

// Dates live in their own row under the hourly timeline; hourly cells only show the hour.
assert.match(app,/class="graphic-time-axis"[\s\S]*class="graphic-hour-row">\$\{timeAxis\}<\/div><div class="graphic-date-row">\$\{dateAxis\}<\/div>/);
assert.match(app,/class="graphic-date-block/);
assert.match(app,/const timeAxis=points\.map\([\s\S]*<strong>\$\{esc\(timeLabel\(point\.timestamp\)\)\}<\/strong><\/div>/);
assert.doesNotMatch(app,/class="graphic-hour[^`]*<small>/);
assert.doesNotMatch(app,/graphic-day-strip-shell/);

// Rain and wind keep independent, readable left-side scales.
assert.match(app,/const step=54,leftPad=148/);
assert.match(app,/graphicNiceAxis\(rainMaxRaw/);
assert.match(app,/graphicNiceAxis\(windMaxRaw/);
assert.match(app,/axisMarkup\('rain'/);
assert.match(app,/axisMarkup\('wind'/);
assert.match(css,/\.graphic-y-axis\.rain \{ --axis-left: 10px;/);
assert.match(css,/\.graphic-y-axis\.wind \{ --axis-left: 76px;/);
assert.match(css,/\.graphic-axis-heading \{/);
assert.match(css,/\.graphic-axis-rail \{/);
assert.match(css,/\.graphic-axis-tick \{/);

// Tooltips are foreground, scrollable and click-persistent, with no close cross.
assert.match(app,/class="graphic-tooltip-layer" data-graphic-tooltip-layer hidden/);
assert.match(app,/function openGraphicTooltip\(target\)\{showGraphicTooltip\(target,\{pinned:true\}\);\}/);
assert.match(app,/if\(graphicTooltipState\.pinned&&!e\.target\.closest\?\.\('\.graphic-floating-tooltip'\)\)clearGraphicTooltip\(\);/);
assert.doesNotMatch(app,/data-graphic-tooltip-close/);
assert.doesNotMatch(app,/graphic-tooltip-close/);
assert.doesNotMatch(app,/handleGraphicTooltipPointerOver/);
assert.doesNotMatch(app,/handleGraphicTooltipPointerOut/);
assert.match(css,/\.graphic-tooltip-layer \{ position: fixed; inset: 0; z-index: 10000;/);
assert.match(css,/\.graphic-floating-tooltip \{[\s\S]*overflow-y: auto;/);
assert.match(css,/\.graphic-tooltip-layer\.is-pinned \.graphic-floating-tooltip \{ pointer-events: auto; \}/);
assert.doesNotMatch(css,/\.graphic-tooltip-close/);

assert.match(css,/--gv-bg:\s*var\(--bg\)/);
assert.match(app,/--heat-color:\$\{attr\(color\)\}/);
assert.match(css,/\.graphic-temperature-tint > span[^}]*color-mix\(in srgb,var\(--heat-color\)/s);

console.log('Graphical 7-day view timeline, axes and click tooltip interactions: OK');
