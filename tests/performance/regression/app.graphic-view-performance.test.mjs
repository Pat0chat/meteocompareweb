import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

// The graphical route must not pay for transition snapshots, cloned charts or Web Animations.
assert.doesNotMatch(app,/runGraphicForecastTransition|graphicTransitionLayer|graphicTransitionTransform|graphicRouteTransitionActive|graphicRouteTransitionSeq/);
assert.doesNotMatch(app,/source\.cloneNode\(true\)|document\.startViewTransition/);
assert.doesNotMatch(css,/graphic-transition-|graphic-route-enter|::view-transition/);

// Global delegated pointer handlers should bail out before DOM traversal outside the graphic route.
assert.match(app,/function isGraphicForecastRoute\(\)\{return state\.route\.name==='city'&&state\.route\.view\?\.graphic===true;\}/);
assert.match(app,/function handleGraphicRulerPointerMoveScheduled\(e\)\{\s*if\(!isGraphicForecastRoute\(\)\|\|e\.pointerType==='touch'\)return;/);
assert.match(app,/function handleGraphicTooltipPointerOver\(e\)\{\s*if\(!isGraphicForecastRoute\(\)\|\|e\.pointerType==='touch'\)return;/);

// Route changes/renders cancel stale animation-frame work and release cached point references.
assert.match(app,/function resetGraphicInteractions\(\)[\s\S]*graphicTooltipContentCache\.clear\(\);[\s\S]*cancelAnimationFrame\(graphicRulerFrame\)/);
assert.match(app,/function renderNow\(\)[\s\S]*resetGraphicInteractions\(\);/);

// Tooltip details remain lazy: expensive per-model markup is created only on first use.
assert.match(app,/graphicTooltipContentCache\.set\(id,\{type:'temperature',point,html:null\}\)/);
assert.match(app,/graphicTooltipContentCache\.set\(id,\{type:'rain',point,html:null\}\)/);
assert.match(app,/graphicTooltipContentCache\.set\(id,\{type:'wind',point,html:null\}\)/);
assert.match(app,/if\(cached\.html==null\)cached\.html=graphicTooltipMarkup/);
assert.doesNotMatch(app,/graphic-tooltip-source|graphicTooltipEdgeClass/);

// The wide 7-day plots keep paint containment and avoid large-area SVG drop-shadow filters.
assert.match(css,/\.graphic-plot \{[^}]*contain: layout paint style;/s);
assert.doesNotMatch(css,/\.graphic-temp-line \{[^}]*filter:/s);
assert.doesNotMatch(css,/\.graphic-wind-line \{[^}]*filter:/s);
assert.doesNotMatch(css,/\.graphic-condition \{[^}]*filter:/s);
assert.doesNotMatch(css,/\.graphic-legend \{[^}]*backdrop-filter:/s);


// Entering the heavy route paints a lightweight loader first, then performs the full build after two frames.
assert.match(app,/function renderGraphicBuildShell\(city\)/);
assert.match(app,/function scheduleGraphicDeferredRender\(key\)[\s\S]*requestAnimationFrame\([\s\S]*requestAnimationFrame/);
assert.match(app,/deferGraphic\?renderGraphicBuildShell\(graphicCity\):renderGraphicForecastView/);
assert.match(css,/\.graphic-build-shell \{/);

// Timeline consensus work and hourly timestamp indexes are cached across rerenders/views.
assert.match(app,/timelines:new Map\(\)/);
assert.match(app,/function cachedTimelinePoints\(f,mode='HOURLY'/);
assert.match(app,/points=cachedTimelinePoints\(f,'HOURLY',new Date\(\),\{\.\.\.normalizeForecastOptions\(engineContext\),hourlyHorizonHours:168,includeModelValues:true\}\)/);
const domain=fs.readFileSync(new URL('../../../js/domain.js',import.meta.url),'utf8');
assert.match(domain,/const hourlyAxisCache=new WeakMap\(\)/);
assert.match(domain,/cachedAxis\?\.timestamps===ts&&cachedAxis\.timezone===timezone/);

// The heatmap is one composited gradient instead of 168 positioned DOM columns.
assert.match(app,/heatStops=points\.flatMap/);
assert.doesNotMatch(app,/const tint=points\.map/);
assert.match(css,/\.graphic-temperature-tint \{[^}]*background: var\(--graphic-heatmap\);/s);

// The ruler is compositor-friendly and has no decorative endpoint dots/shadow to repaint while tracking the pointer.
assert.match(app,/ruler\.style\.setProperty\('--graphic-ruler-x'/);
assert.match(css,/\.graphic-ruler \{[^}]*transform: translate3d\(var\(--graphic-ruler-x,0px\),0,0\);[^}]*will-change: transform;/s);
assert.doesNotMatch(css,/\.graphic-ruler::before|\.graphic-ruler::after/);
assert.doesNotMatch(css,/\.graphic-ruler \{[^}]*box-shadow:/s);

// SVG grids are batched into paths instead of hundreds of individual line nodes.
assert.match(app,/horizontalGrid=\(ticks,y,kind=''\)=>/);
assert.match(app,/verticalGrid=\(height\)=>/);


// Solar day/night shading is computed from at most two astronomical transitions per day,
// aligned directly to the plotted hourly x-axis (including the sticky-axis left padding).
assert.match(app,/function graphicDaylightGradient\(forecast,points,groups,timezone,/);
assert.match(app,/epochToX=epoch=>leftPad\+step\/2\+\(\(epoch-firstEpoch\)\/3600000\)\*step/);
assert.match(app,/for\(const group of groups\)/);
assert.doesNotMatch(app,/daylightPhases=points\.map/);
assert.doesNotMatch(app,/graphic-daylight-hour/);

// Agreement rendering samples SVG gradient stops rather than adding a segment node per hour.
assert.match(app,/function graphicAgreementGradientStops\(points,key,\{sampleEvery=6\}=\{\}\)/);
assert.match(app,/for\(let i=0;i<points\.length;i\+=Math\.max\(1,sampleEvery\)\)/);
assert.doesNotMatch(app,/graphic-agreement-segment/);

console.log('Graphic view release performance guards: OK');
