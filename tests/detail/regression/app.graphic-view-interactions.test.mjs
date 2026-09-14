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
assert.match(app,/data-graphic-hour-index="\$\{index\}"/);
assert.doesNotMatch(app,/class="graphic-hour[^`]*<small>/);
assert.doesNotMatch(app,/graphic-day-strip-shell/);

// The graphic header no longer exposes a settings shortcut.
assert.doesNotMatch(app,/data-action="open-graphic-settings"/);
assert.match(app,/class="graphic-header-balance"/);

// Temperature, rain and wind are three distinct stacked plots with independent scales.
assert.match(app,/class="graphic-plot graphic-plot-temperature"/);
assert.match(app,/class="graphic-plot graphic-plot-rain"/);
assert.match(app,/class="graphic-plot graphic-plot-wind"/);
assert.match(app,/graphicNiceAxis\(rainMaxRaw/);
assert.match(app,/graphicNiceAxis\(windMaxRaw/);
assert.match(app,/axisMarkup\('rain'/);
assert.match(app,/axisMarkup\('wind'/);
assert.match(css,/\.graphic-plots \{ display: grid; grid-template-rows:/);
assert.match(css,/\.graphic-y-axis\.rain \{ --axis-color: var\(--gv-rain\); \}/);
assert.match(css,/\.graphic-y-axis\.wind \{ --axis-color: var\(--gv-wind\); \}/);
assert.match(css,/\.graphic-axis-heading \{/);
assert.match(css,/\.graphic-axis-rail \{/);
assert.match(css,/\.graphic-axis-tick \{/);

// Legend is placed directly below the plot stack, before the time axis.
assert.match(app,/class="graphic-chart graphic-plots"[\s\S]*class="graphic-legend-row">\$\{legend\}<\/div><div class="graphic-time-axis"/);
assert.match(css,/\.graphic-legend-row \{/);

// A vertical ruler follows the pointer and snaps to hourly points.
assert.match(app,/data-graphic-ruler-track/);
assert.match(app,/data-graphic-ruler hidden/);
assert.match(app,/function handleGraphicRulerPointerMoveScheduled\(e\)/);
assert.match(app,/Math\.round\(\(localX-leftPad-step\/2\)\/step\)/);
assert.match(css,/\.graphic-ruler \{/);
assert.match(css,/\.graphic-ruler-badge \{/);

// Tooltips appear on hover/focus and remain click-persistent, foreground and scrollable.
assert.match(app,/class="graphic-tooltip-layer" data-graphic-tooltip-layer hidden/);
assert.match(app,/function handleGraphicTooltipPointerOver\(e\)/);
assert.match(app,/function handleGraphicTooltipPointerOut\(e\)/);
assert.match(app,/showGraphicTooltip\(target,\{pinned:false\}\)/);
assert.match(app,/function openGraphicTooltip\(target\)\{showGraphicTooltip\(target,\{pinned:true\}\);\}/);
assert.match(app,/if\(graphicTooltipState\.pinned&&!e\.target\.closest\?\.\('\.graphic-floating-tooltip'\)\)clearGraphicTooltip\(\);/);
assert.doesNotMatch(app,/data-graphic-tooltip-close/);
assert.doesNotMatch(app,/graphic-tooltip-close/);
assert.match(css,/\.graphic-tooltip-layer \{ position: fixed; inset: 0; z-index: 10000;/);
assert.match(css,/\.graphic-floating-tooltip \{[\s\S]*overflow-y: auto;/);
assert.match(css,/\.graphic-tooltip-layer\.is-pinned \.graphic-floating-tooltip \{ pointer-events: auto; \}/);

assert.match(css,/--gv-bg:\s*var\(--bg\)/);
assert.match(app,/--heat-color:\$\{attr\(color\)\}/);
assert.match(css,/\.graphic-temperature-tint > span[^}]*color-mix\(in srgb,var\(--heat-color\)/s);

console.log('Graphical 7-day view stacked plots, ruler, legend and hover/click tooltip interactions: OK');
