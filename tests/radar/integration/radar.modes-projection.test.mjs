import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),radar=read('js/features/radar.js'),css=read('styles.css');

assert.match(app,/data-radar-mode="\$\{radarMode\}"/,'radar root must render the persisted mode');
assert.match(app,/modeButton\('observation','radarModeObservation'\)/);
assert.match(app,/modeButton\('projection','radarModeProjection'\)/);
assert.match(app,/horizonButton=minute=>/,'projection UI must expose a dedicated lead-time selector');
assert.match(app,/\[15,30,45,60\]\.map\(horizonButton\)/,'the selector must offer exactly +15/+30/+45/+60');
assert.match(app,/data-radar-horizon="\$\{minute\}"/);
assert.match(app,/Rain Radar Horizon Changed/,'lead-time changes should remain observable through privacy-safe analytics');
assert.match(app,/data-radar-observation-controls/);
assert.match(app,/data-radar-projection-controls/);
assert.match(app,/data-radar-recalculate/,'projection UI must expose a manual recalculation button');
assert.match(app,/Rain Radar Projection Recalculated/,'manual recalculation should remain observable through privacy-safe analytics');
assert.match(app,/radarProbableZone/);
assert.match(app,/radarForecastZone/);
assert.match(app,/radarTrajectory/);

assert.match(radar,/RADAR_PROJECTION_HORIZONS=Object\.freeze\(\[15,30,45,60\]\)/);
assert.match(radar,/initialHorizon=30/,'projection must have a stable default horizon');
assert.match(radar,/horizon=RADAR_PROJECTION_HORIZONS\.includes\(Number\(initialHorizon\)\)\?Number\(initialHorizon\):30/);
assert.match(radar,/controller\.horizon=next/,'lead-time changes must update the existing controller without rebuilding the modal');
assert.match(radar,/projectRainCell\(cell,horizon\)/,'rendering must project each cell only to the selected horizon');
assert.doesNotMatch(radar,/NOWCAST_HORIZONS\.map\(horizon=>projectRainCell\(cell,horizon\)\)/,'projection rendering must not draw all four horizons simultaneously');
assert.match(radar,/expandPx:projection\.uncertaintyPx[\s\S]*dash:\[7,5\]/,'selected probable envelope must be visible and dashed');
assert.match(radar,/drawCellShape\(ctx,cell,geometry,\{dx:projection\.dx,dy:projection\.dy[\s\S]*lineWidth:2\.1\+\.6\*emphasis/,'selected projected contour must be visually stronger than the probable envelope');
assert.match(radar,/drawProjectionTrajectory\(ctx,cell,geometry,horizon,color/,'trajectory must connect the observation to the selected projection');
assert.match(radar,/drawObservedMotion\(ctx,cell,geometry,color/,'projection must expose the recent observed track so its direction can be visually checked');
assert.match(radar,/estimateRainCellTranslation/,'cell direction must use frame-to-frame footprint advection, not centroid movement alone');
assert.match(radar,/recentRadarFrameIndices\(sourceFrames\.length,7\)/,'nowcast must analyze consecutive recent radar frames rather than sparse snapshots across two hours');
assert.match(radar,/steps=\[0,\.33,\.66,1\]/,'trajectory must communicate progression toward the selected horizon without four competing outlines');
assert.match(radar,/drawArrow\(ctx,points\.at\(-2\),to,color,alpha\)/,'trajectory must expose a clear direction arrow');
assert.match(radar,/badge\.textContent=`\$\{controller\.t\('radarNowcastProjection'\)\} · \+\$\{controller\.horizon\} min`/,'map badge must reflect the selected horizon');
assert.match(radar,/imageSmoothingEnabled=false/,'projection canvas rendering must remain crisp');
assert.match(radar,/stabilizeRainCellIdentities/,'stable cell identities must be preserved');
assert.match(radar,/evaluateRainCellLocalityImpact/,'locality relevance must still prioritize meaningful cells');
assert.match(radar,/radarImageUrl\(controller\.meta,frame,controller\.city,RADAR_ANALYSIS_ZOOM\)/,'analysis must remain independent from visual range');
assert.match(radar,/fetchMetadata\(fetch,\{forceRefresh:true\}\)/,'manual recalculation must fetch the latest radar metadata instead of replaying cached inputs');
assert.match(radar,/cache:forceRefresh\?'no-store':'default'/,'forced radar refresh must bypass the browser metadata cache');
assert.match(radar,/controller\.identityRegistry=\[\];controller\.nextCellId=1;controller\.coverageRanges=new Set\(\)/,'manual recalculation must restart the projection analysis from a clean tracking state');
assert.match(radar,/controller\.meta=previous\.meta;controller\.frames=previous\.frames/,'a metadata refresh failure must preserve the last usable radar projection');
assert.match(radar,/button\.disabled=busy/,'manual recalculation must be disabled while radar analysis is busy');

assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \.radar-precip-layer\{opacity:\.38;filter:saturate\(\.90\) contrast\(1\.02\) brightness\(1\.03\)\}/,'latest observation must remain visible but secondary in projection mode');
assert.match(css,/\.radar-horizon-selector\{/,'projection lead-time selector must have a dedicated compact style');
assert.match(css,/\.radar-horizon-selector \.seg-btn\.active\{/,'selected horizon must be visually obvious');
assert.match(css,/\.radar-projection-actions\{/,'projection actions must accommodate the lead selector and recalculation button');
assert.match(css,/\.radar-recalculate-button\[aria-busy=\"true\"] \.radar-recalculate-icon\{animation:meteo-spin/,'recalculation button must expose a visible busy state');
assert.match(css,/\.radar-zone-key\.probable i\{[^}]*border:1\.5px dashed var\(--primary\)/s,'probable-area legend must match the dashed uncertainty envelope');
assert.match(css,/\.radar-zone-key\.forecast i\{[^}]*border:2px solid var\(--primary\)/s,'forecast legend must match the solid projected outline');
assert.match(css,/\.radar-zone-key\.trajectory i\{[^}]*border-top:2px solid var\(--primary\)/s,'trajectory legend must match line/arrow rendering');
assert.match(css,/\.radar-modal-content\[data-radar-mode="projection"\] \[data-radar-observation-controls\]\{display:none\}/,'historical playback must not compete with projection controls');

for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  for(const key of ['radarModeObservation','radarModeProjection','radarProbableZone','radarForecastZone','radarTrajectory','radarProjectionTitle','radarProjectionLead','radarProjectionHorizons','radarProjectionRecalculate','radarProjectionRecalculating']) assert.match(locale,new RegExp(`"${key}"`),`${lang}.${key} missing`);
}

console.log('Single-horizon radar observation/projection visual contract: OK');
