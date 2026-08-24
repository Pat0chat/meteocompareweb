import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),radar=read('js/features/radar.js'),css=read('styles.css');

assert.match(app,/existingRadarRoot=state\.modal\?\.type==='radar'\?app\?\.querySelector\?\.\('\[data-radar-root\]'\):null/,'global rerenders must detect an already mounted radar');
assert.match(app,/preservedRadarBackdrop=existingRadarRoot\?\.closest\?\.\('\.modal-backdrop'\)\|\|null/);
assert.match(app,/if\(preservedRadarBackdrop\)preservedRadarBackdrop\.remove\(\)/,'radar modal must be detached before replacing the application shell');
assert.match(app,/if\(preservedRadarBackdrop\)app\.append\(preservedRadarBackdrop\)/,'the same radar DOM/controller must be reattached after the shell render');
assert.match(app,/state\.modal=\{type:'radar',cityId:state\.route\.id,radarMode:'observation',radarRange:'near'\}/);
assert.match(app,/initialMode=state\.modal\.radarMode\|\|'observation'/);
assert.match(app,/initialRange=state\.modal\.radarRange\|\|'near'/);
assert.match(app,/state\.modal\.radarRange=range/);
assert.match(app,/state\.modal\.radarMode=mode/);
assert.match(radar,/initialMode='observation',initialRange='near'/);
assert.match(radar,/range=initialRange in RADAR_RANGE_CONFIG\?initialRange:'near'/);
assert.match(radar,/mode=\['observation','projection'\]\.includes\(initialMode\)\?initialMode:'observation'/);

assert.match(css,/\.radar-center-marker\{[^}]*left:50%;top:50%;width:0;height:0/s,'city anchor must be a zero-size point exactly at map centre');
assert.match(css,/\.radar-center-marker span\{[^}]*left:0;top:0[^}]*transform:translate\(-50%,-50%\)/s,'the point itself, not the label group, must sit on the locality');
assert.match(css,/\.radar-center-marker strong\{[^}]*position:absolute[^}]*left:10px;top:-25px/s,'the locality label must be offset from the exact city point');

assert.match(radar,/isDestination=horizon===60/,'projection rendering must establish a clear +60 destination hierarchy');
assert.match(radar,/lineWidth:isDestination\?2\.15:1\.2/,'intermediate horizons must stay visually subordinate to +60');

console.log('Radar modal state preservation, locality anchor and projection hierarchy: OK');
