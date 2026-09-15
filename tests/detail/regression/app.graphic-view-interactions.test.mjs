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
assert.doesNotMatch(css,/--axis-heading-width:/);
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
assert.doesNotMatch(css,/\.graphic-ruler::before|\.graphic-ruler::after/);
assert.match(css,/\.graphic-ruler \{[^}]*transform: translate3d\(var\(--graphic-ruler-x,0px\),0,0\);/s);
assert.match(app,/ruler\.style\.setProperty\('--graphic-ruler-x'/);

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

// Home/detail temperature plots open the graphic route directly: no cloned-SVG or route animation layer.
assert.match(app,/class="home-temperature-plot"[^>]*data-action="open-graphic-view"[^>]*data-graphic-city-id/);
assert.match(app,/class="detail-chrono-temp-plot"[^>]*data-action="open-graphic-view"/);
assert.match(app,/function openGraphicForecastView\(city,sourceElement=null\)[\s\S]*go\(cityViewUrl\(city,q\)\);/);
assert.doesNotMatch(app,/runGraphicForecastTransition|graphicTransitionSourceGeometry|graphicTransitionLayer|graphicRouteTransitionActive|graphicRouteTransitionSeq/);
assert.doesNotMatch(app,/source\.cloneNode\(true\)/);
assert.doesNotMatch(app,/document\.startViewTransition/);
assert.doesNotMatch(css,/::view-transition-group\(|graphic-transition-|graphic-route-enter/);
assert.doesNotMatch(css,/home-temperature-plot[^}]*transition:|detail-chrono-temp-plot[^}]*transition:/);
assert.doesNotMatch(css,/home-temperature-plot[^}]*drop-shadow|detail-chrono-temp-plot[^}]*drop-shadow/);

// Legacy in-chart tooltip positioning was removed after the fixed floating tooltip layer replaced it.
assert.doesNotMatch(app,/graphicTooltipEdgeClass|graphic-tooltip-source/);
assert.doesNotMatch(css,/\.graphic-tooltip \{|\.graphic-tooltip-source|edge-left|edge-right/);

assert.match(css,/--gv-bg:\s*var\(--bg\)/);
assert.match(app,/heatStops=points\.flatMap/);
assert.match(app,/--graphic-heatmap:\$\{attr\(`linear-gradient\(90deg,\$\{heatStops\}\)`\)\}/);
assert.match(css,/\.graphic-temperature-tint \{[^}]*background: var\(--graphic-heatmap\);[^}]*mask-image:/s);
assert.doesNotMatch(css,/\.graphic-temperature-tint > span/);


// The ruler carries a compact synchronized weather summary for the hovered hour.
assert.match(app,/data-graphic-ruler-temp=/);
assert.match(app,/data-graphic-ruler-rain=/);
assert.match(app,/data-graphic-ruler-wind=/);
assert.match(app,/data-graphic-ruler-gust=/);
assert.match(app,/class="graphic-ruler-summary"/);
assert.match(app,/context\.summary\.temp\.textContent=slot\.temp/);
assert.match(css,/\.graphic-ruler-summary \{/);

// Day boundaries are reinforced across the full stacked plot, while a subtle solar overlay keeps the temperature heatmap visible.
assert.match(app,/graphicSolarWindow\(forecast,group\.date,timezone\)/);
assert.match(app,/graphicDaylightGradient\(f,points,groups,graphicTimezone,\{leftPad,step,totalWidth\}\)/);
assert.match(app,/epochToX=epoch=>leftPad\+step\/2/);
assert.match(app,/--graphic-daylight:\$\{attr\(daylightGradient\)\}/);
assert.match(app,/class="graphic-day-divider-layer"/);
assert.match(css,/\.graphic-plot::before \{[^}]*background: var\(--graphic-daylight,transparent\);/s);
assert.match(css,/\.graphic-day-divider \{/);
assert.match(css,/\.graphic-temperature-tint \{[^}]*z-index: 0;[^}]*background: var\(--graphic-heatmap\);/s);

// Y axes live in a sticky overlay so their headings and ticks remain visible during horizontal exploration.
assert.match(app,/class="graphic-sticky-axes"/);
assert.match(css,/\.graphic-sticky-axes \{[^}]*position: sticky;[^}]*left: 0;/s);
assert.match(css,/\.graphic-sticky-axis-slot \{/);

// An opt-in checkbox exposes agreement as a progressive color band behind the main data.
assert.match(app,/data-graphic-agreement-toggle/);
assert.match(app,/graphicAgreementGradientStops\(points,'temperatureAgreementPercent'\)/);
assert.match(app,/graphicAgreementGradientStops\(points,'windAgreementPercent'\)/);
assert.match(app,/class="graphic-agreement-path temperature halo"/);
assert.match(app,/class="graphic-agreement-path temperature core"/);
assert.match(app,/--agreement-color:\$\{graphicAgreementColor\(point\.precipitationAgreementPercent\)\}/);
assert.match(app,/classList\?\.toggle\?\.\('show-agreement',state\.graphicAgreementVisible\)/);
assert.match(css,/\.graphic-view\.show-agreement \.graphic-agreement-path\.halo \{/);
assert.match(css,/\.graphic-view\.show-agreement \.graphic-agreement-path\.core \{/);
assert.match(css,/\.graphic-view\.show-agreement \.graphic-rain-bar::after \{/);
assert.match(css,/\.graphic-agreement-toggle \{/);

console.log('Graphical 7-day view stacked plots, ruler, legend and hover/click tooltip interactions: OK');
