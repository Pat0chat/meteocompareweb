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
assert.match(app,/class="graphic-header-context"/);
assert.match(app,/graphicDateRangeLabel\(points\[0\]\.date,points\.at\(-1\)\.date,locale\)/);
assert.match(app,/graphicExploreHint/);
assert.doesNotMatch(app,/graphic-footer-hint/);

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
assert.match(css,/--axis-heading-width:\s*122px/);
assert.match(css,/--axis-rail-offset:\s*132px/);


// Wind plot includes gusts on the same scale and exposes them in the legend.
assert.match(app,/gustLine=svgPathFromPoints/);
assert.match(app,/class="graphic-gust-line" d="\$\{gustLine\}"/);
assert.match(app,/class="gust"><i><\/i>\$\{esc\(t\('gusts'\)\)\}<\/span>/);
assert.match(css,/\.graphic-gust-line \{/);
assert.match(css,/\.graphic-legend \.gust > i \{/);

// Expensive tooltip markup is generated lazily and SVG grids are batched into paths.
assert.match(app,/const graphicTooltipContentCache = new Map\(\)/);
assert.match(app,/graphicTooltipContentCache\.set\(id,\{type:'wind',point,html:null\}\)/);
assert.match(app,/if\(cached\.html==null\)cached\.html=graphicTooltipMarkup/);
assert.match(app,/horizontalGrid=\(ticks,y,kind=''\)=>/);
assert.match(app,/verticalGrid=\(height\)=>/);
assert.match(css,/\.graphic-plot \{[^}]*contain: layout paint style;/s);

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


// Axis headings size themselves to their label/unit instead of reserving a fixed badge width.
assert.match(css,/\.graphic-axis-heading \{[\s\S]*width: fit-content;[\s\S]*max-width: calc\(var\(--axis-rail-offset\) - 10px\);/);

// The temperature plot overlays 10-year ERA5 thermal max/min references and explains them in the legend.
assert.match(app,/ensureNormalsLoaded\(cityId\)\?\.normals\|\|null/);
assert.match(app,/era5MaxLine=svgPathFromPoints/);
assert.match(app,/era5MinLine=svgPathFromPoints/);
assert.match(app,/class="graphic-era5-line max"/);
assert.match(app,/class="graphic-era5-line min"/);
assert.match(app,/chart_normals_legend_temp_max/);
assert.match(app,/chart_normals_legend_temp_min/);
assert.match(css,/\.graphic-era5-line\.max \{ stroke: var\(--semantic-warning\); \}/);
assert.match(css,/\.graphic-era5-line\.min \{ stroke: var\(--primary\); \}/);

// Home/detail temperature plots are direct launch surfaces with a shared animated transition into the graphical view.
assert.match(app,/class="home-temperature-plot"[^>]*data-action="open-graphic-view"[^>]*data-graphic-city-id/);
assert.match(app,/class="detail-chrono-temp-plot"[^>]*data-action="open-graphic-view"/);
assert.match(app,/function openGraphicForecastView\(city,sourceElement=null\)/);
assert.match(app,/document\.startViewTransition\(\(\)=>go\(targetUrl\)\)/);
assert.match(css,/\.graphic-plot-temperature \{ view-transition-name: graphic-forecast-source; \}/);
assert.match(css,/::view-transition-group\(graphic-forecast-source\)/);

assert.match(css,/--gv-bg:\s*var\(--bg\)/);
assert.match(app,/--heat-color:\$\{attr\(color\)\}/);
assert.match(css,/\.graphic-temperature-tint > span[^}]*color-mix\(in srgb,var\(--heat-color\)/s);

console.log('Graphical 7-day view stacked plots, ruler, legend and hover/click tooltip interactions: OK');
