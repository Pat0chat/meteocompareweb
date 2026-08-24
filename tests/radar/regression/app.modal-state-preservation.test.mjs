import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),radar=read('js/features/radar.js'),css=read('styles.css');

assert.match(app,/existingRadarRoot=state\.modal\?\.type==='radar'\?app\?\.querySelector\?\.\('\[data-radar-root\]'\):null/,'global rerenders must detect an already mounted radar');
assert.match(app,/preservedRadarBackdrop=existingRadarRoot\?\.closest\?\.\('\.modal-backdrop'\)\|\|null/);
assert.match(app,/if\(preservedRadarBackdrop\)preservedRadarBackdrop\.remove\(\)/,'radar modal must be detached before replacing the application shell');
assert.match(app,/if\(preservedRadarBackdrop\)app\.append\(preservedRadarBackdrop\)/,'the same radar DOM/controller must be reattached after the shell render');
assert.match(app,/state\.modal=\{type:'radar',cityId:state\.route\.id,radarMode:'observation',radarRange:'near',radarHorizon:30,radarFullscreen:false\}/);
assert.match(app,/initialMode=state\.modal\.radarMode\|\|'observation'/);
assert.match(app,/initialRange=state\.modal\.radarRange\|\|'near'/);
assert.match(app,/initialHorizon=\[15,30,45,60\]\.includes\(Number\(state\.modal\.radarHorizon\)\)\?Number\(state\.modal\.radarHorizon\):30/);
assert.match(app,/state\.modal\.radarHorizon=horizon/,'selected projection horizon must survive application rerenders');
assert.match(app,/initialFullscreen=Boolean\(state\.modal\.radarFullscreen\)/);
assert.match(app,/state\.modal\.radarFullscreen=Boolean\(fullscreen\)/);
assert.match(app,/state\.modal\.radarRange=range/);
assert.match(app,/state\.modal\.radarMode=mode/);
assert.match(radar,/initialMode='observation',initialRange='near',initialHorizon=30,initialFullscreen=false/);
assert.match(radar,/root\.dataset\.radarHorizon=String\(horizon\)/);

assert.match(css,/\.radar-center-marker\{[^}]*left:50%;top:50%;width:0;height:0/s,'city anchor must stay exactly at map centre');
assert.match(css,/\.radar-center-marker span\{[^}]*left:0;top:0[^}]*transform:translate\(-50%,-50%\)/s,'the point itself must sit on the locality');
assert.match(css,/\.radar-center-marker strong\{[^}]*position:absolute[^}]*left:10px;top:-25px/s,'the locality label must remain offset from the exact city point');

assert.match(radar,/identityRegistry:\[\],nextCellId:1/,'stable rain-cell identities must live on the persistent radar controller');
assert.match(radar,/controller\.identityRegistry=identity\.registry;controller\.nextCellId=identity\.nextId/,'identity state must survive projection recomputations');
assert.match(radar,/RADAR_ANALYSIS_ZOOM/,'stable identities must be computed in a range-independent coordinate space');
assert.match(app,/data-radar-fullscreen/,'radar modal must expose a fullscreen control');
assert.match(css,/\.radar-modal\.is-fullscreen\{[^}]*position:fixed[^}]*height:calc\(100dvh - 16px\)/s,'fullscreen radar must use the viewport rather than a fixed card');

console.log('Radar modal state preservation, selected horizon, locality anchor and stable identities: OK');
