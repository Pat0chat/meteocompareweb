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

// SVG grids are batched into paths instead of hundreds of individual line nodes.
assert.match(app,/horizontalGrid=\(ticks,y,kind=''\)=>/);
assert.match(app,/verticalGrid=\(height\)=>/);

console.log('Graphic view release performance guards: OK');
