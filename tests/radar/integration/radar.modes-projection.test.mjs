import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),radar=read('js/features/radar.js'),css=read('styles.css');

assert.match(app,/data-radar-mode="observation"/);
assert.match(app,/data-radar-mode="projection"/);
assert.match(app,/radarModeObservation/);
assert.match(app,/radarModeProjection/);
assert.match(app,/data-radar-observation-controls/);
assert.match(app,/data-radar-projection-controls/);
assert.match(app,/radarProbableZone/);
assert.match(app,/radarForecastZone/);
assert.match(app,/radarTrajectory/);
assert.doesNotMatch(app,/radar-horizon-step|data-radar-cell-legend|radar-projection-horizons/,'projection UI must not duplicate horizon/cell encodings in extra legends');
assert.match(app,/Rain Radar Mode Changed/,'mode changes should remain observable through privacy-safe product analytics');

assert.match(radar,/RADAR_PROJECTION_HORIZONS=Object\.freeze\(\[15,30,45,60\]\)/);
assert.match(radar,/const RADAR_OPTIONS='0_1'/,'RainViewer server-side smoothing must be disabled');
assert.match(radar,/const ANALYSIS_SIZE=512/,'projection analysis must retain the full RainViewer widget resolution');
assert.match(radar,/extractRainCells/);
assert.match(radar,/estimateRainCellMotions/);
assert.match(radar,/for\(const cell of drawn\)/,'projection rendering must iterate through individual rain cells');
assert.match(radar,/NOWCAST_HORIZONS\.map\(horizon=>projectRainCell\(cell,horizon\)\)/,'all four requested horizons must still be projected for every cell');
assert.match(radar,/projections\.forEach\(\(projection,index\)=>/,'moving cells must annotate projected lead times directly on the trajectory');
assert.match(radar,/`\+\$\{NOWCAST_HORIZONS\[index\]\}`/,'lead-time labels must use the canonical +15/+30/+45/+60 horizons without shape codes');
assert.doesNotMatch(radar,/filter=`blur\(|drawHorizonMarker|cellRaster/,'projection rendering must not reintroduce blur filters, marker-shape codes or scaled raster masks');
assert.match(radar,/rainCellContours/,'rain zones must be converted to vector-like contour loops');
assert.match(radar,/traceCellPath/,'projection shapes must be drawn as direct canvas paths');
assert.match(radar,/expandPx:last\.uncertaintyPx[\s\S]*dash:\[6,4\]/,'the +60 probable envelope must remain geometrically distinct with a dashed outline');
assert.match(radar,/imageSmoothingEnabled=false/,'projection canvas rendering must stay unsmoothed');
assert.match(radar,/rainCellDisplayMode\(cell,sourceScale\)/,'projection rendering must explicitly detect low-motion cells');
assert.match(radar,/display\.lowMotion[\s\S]*radarLowMotionShort[\s\S]*\+15 → \+60/,'low-motion cells must consolidate overlapping horizons instead of stacking unreadable markers');
assert.match(radar,/RADAR_CELL_COLORS=Object\.freeze/,'rain cells must retain stable identity colours');
assert.match(radar,/`Z\$\{cellIndex\+1\}`/,'each tracked cell must receive a visible identity label');
assert.match(radar,/drawArrow\(ctx,current,lastScreen,color\)/,'moving rain cells must expose a visible trajectory');
assert.match(radar,/controller\.mode==='projection'/,'projection overlay must be mode-gated');
assert.match(radar,/controller\.nowcast=null[\s\S]*?void analyzeNowcast\(\)/,'range changes must recompute per-cell projection rather than reusing the wrong zoom geometry');

assert.match(css,/\.radar-precip-layer\{[^}]*image-rendering:crisp-edges[^}]*image-rendering:pixelated/s,'scaled RainViewer imagery must prefer crisp browser rendering instead of bilinear blur');
assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \.radar-precip-layer/,'latest observed radar must be visually subordinated in projection mode');
assert.match(css,/\.radar-zone-key\.probable/);
assert.match(css,/\.radar-zone-key\.forecast/);
assert.match(css,/\.radar-zone-key\.trajectory/);
assert.doesNotMatch(css,/\.radar-cell-chip|\.radar-horizon-step/,'removed duplicate visual codes must not linger in CSS');
assert.match(css,/\.radar-modal-content\[data-radar-mode="observation"\][^\n]*\.radar-projection-legend/,'projection-only guidance must stay hidden in observation mode');
assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \[data-radar-observation-controls\]\{display:none\}/,'historical playback must not compete with the +60 min projection controls');

for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  for(const key of ['radarMode','radarModeObservation','radarModeProjection','radarProbableZone','radarForecastZone','radarTrajectory','radarProjectionTitle','radarProjectionLead','radarProjectionCells','radarProjectionDetail','radarLowMotionShort']) assert.match(locale,new RegExp(`"${key}"`),`${lang}.${key} missing`);
}

console.log('Simplified crisp radar observation/projection visual contract: OK');
