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
assert.match(app,/\+15[\s\S]*\+30[\s\S]*\+45[\s\S]*\+60 min/,'the projection UI must expose all four requested horizons');
assert.match(app,/radar-horizon-step h15[\s\S]*radar-horizon-step h30[\s\S]*radar-horizon-step h45[\s\S]*radar-horizon-step h60/,'horizon legend must expose four distinct marker shapes');
assert.match(app,/Rain Radar Mode Changed/,'mode changes should remain observable through privacy-safe product analytics');

assert.match(radar,/RADAR_PROJECTION_HORIZONS=Object\.freeze\(\[15,30,45,60\]\)/);
assert.match(radar,/extractRainCells/);
assert.match(radar,/estimateRainCellMotions/);
assert.match(radar,/for\(const cell of drawn\)/,'projection rendering must iterate through individual rain cells');
assert.match(radar,/for\(let idx=NOWCAST_HORIZONS\.length-1;idx>=0;idx--\)/,'every cell must render each projection horizon');
assert.doesNotMatch(radar,/filter=`blur\(/,'probable areas must not use a Gaussian blur');
assert.match(radar,/cellRaster\(cell,color,\{expandPx:projection\.uncertaintyPx\}\)/,'probable areas must use a crisp geometric uncertainty envelope');
assert.match(radar,/imageSmoothingEnabled=false/,'projected masks must remain visually crisp after scaling');
assert.match(radar,/const ANALYSIS_SIZE=320/,'projection analysis must use a higher-resolution mask to reduce coarse or fuzzy boundaries');
assert.match(radar,/function drawHorizonMarker/,'projection must encode lead time independently from cell colour');
assert.match(radar,/RADAR_CELL_COLORS=Object\.freeze/,'rain cells must use stable identity colours');
assert.match(radar,/`Z\$\{cellIndex\+1\}`/,'each tracked cell must receive a visible identity label');
assert.match(app,/data-radar-cell-legend/,'projection UI must expose a dynamic per-cell legend');
assert.match(radar,/cellRaster\(cell,color,\{texture:true\}\)/,'forecast areas must use a distinct light texture');
assert.match(radar,/drawArrow\(ctx,current/,'each tracked rain cell must expose a visible trajectory');
assert.match(radar,/controller\.mode==='projection'/,'projection overlay must be mode-gated');
assert.match(radar,/controller\.nowcast=null[\s\S]*?void analyzeNowcast\(\)/,'range changes must recompute per-cell projection rather than reusing the wrong zoom geometry');

assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \.radar-precip-layer/,'latest observed radar must be visually subordinated in projection mode');
assert.match(css,/\.radar-zone-key\.probable/);
assert.match(css,/\.radar-zone-key\.forecast/);
assert.match(css,/\.radar-zone-key\.trajectory/);
assert.match(css,/\.radar-cell-chip/,'each tracked cell must have a keyed legend chip');
assert.match(css,/\.radar-horizon-step\.h15 i[^{]*\{[^}]*border-radius:50%[^}]*background:currentColor/s,'+15 must use a filled circle');
assert.match(css,/\.radar-horizon-step\.h30 i[^{]*\{[^}]*border-radius:50%[^}]*background:transparent/s,'+30 must use a ring');
assert.match(css,/\.radar-horizon-step\.h45 i[^{]*\{[^}]*rotate\(45deg\)/s,'+45 must use a diamond');
assert.match(css,/\.radar-horizon-step\.h60 i[^{]*\{[^}]*background:currentColor/s,'+60 must use a square');
assert.match(css,/\.radar-modal-content\[data-radar-mode="observation"\][^\n]*\.radar-projection-legend/,'projection-only guidance must stay hidden in observation mode');
assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \[data-radar-observation-controls\]\{display:none\}/,'historical playback must not compete with the +60 min projection controls');

for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  for(const key of ['radarMode','radarModeObservation','radarModeProjection','radarProbableZone','radarForecastZone','radarTrajectory','radarProjectionTitle','radarProjectionLead','radarProjectionCells','radarProjectionDetail']) assert.match(locale,new RegExp(`"${key}"`),`${lang}.${key} missing`);
}

console.log('Radar observation/projection modes and visual projection contract: OK');
