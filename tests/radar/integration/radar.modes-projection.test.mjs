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
assert.match(app,/Rain Radar Mode Changed/,'mode changes should remain observable through privacy-safe product analytics');

assert.match(radar,/RADAR_PROJECTION_HORIZONS=Object\.freeze\(\[15,30,45,60\]\)/);
assert.match(radar,/extractRainCells/);
assert.match(radar,/estimateRainCellMotions/);
assert.match(radar,/for\(const cell of drawn\)/,'projection rendering must iterate through individual rain cells');
assert.match(radar,/for\(let idx=NOWCAST_HORIZONS\.length-1;idx>=0;idx--\)/,'every cell must render each projection horizon');
assert.match(radar,/filter=`blur\(/,'probable areas must be rendered as uncertainty envelopes');
assert.match(radar,/cellRaster\(cell,color,\{texture:true\}\)/,'forecast areas must use a distinct light texture');
assert.match(radar,/drawArrow\(ctx,current/,'each tracked rain cell must expose a visible trajectory');
assert.match(radar,/controller\.mode==='projection'/,'projection overlay must be mode-gated');
assert.match(radar,/controller\.nowcast=null[\s\S]*?void analyzeNowcast\(\)/,'range changes must recompute per-cell projection rather than reusing the wrong zoom geometry');

assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \.radar-precip-layer/,'latest observed radar must be visually subordinated in projection mode');
assert.match(css,/\.radar-zone-key\.probable/);
assert.match(css,/\.radar-zone-key\.forecast/);
assert.match(css,/\.radar-zone-key\.trajectory/);
assert.match(css,/\.radar-modal-content\[data-radar-mode="observation"\][^\n]*\.radar-projection-legend/,'projection-only guidance must stay hidden in observation mode');
assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \[data-radar-observation-controls\]\{display:none\}/,'historical playback must not compete with the +60 min projection controls');

for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  for(const key of ['radarMode','radarModeObservation','radarModeProjection','radarProbableZone','radarForecastZone','radarTrajectory','radarProjectionTitle','radarProjectionLead','radarProjectionCells','radarProjectionDetail']) assert.match(locale,new RegExp(`"${key}"`),`${lang}.${key} missing`);
}

console.log('Radar observation/projection modes and visual projection contract: OK');
