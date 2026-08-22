import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RADAR_RANGE_CONFIG, radarForecastHours, radarForecastTrend, radarImageUrl, estimateRadarTranslation, estimateRadarMotion, radarNowcastEta } from '../js/features/radar.js';


assert.deepEqual(RADAR_RANGE_CONFIG.near,{mapZoom:9,radarZoom:7,radarScale:4});
assert.deepEqual(RADAR_RANGE_CONFIG.regional,{mapZoom:8,radarZoom:7,radarScale:2});
assert.deepEqual(RADAR_RANGE_CONFIG.wide,{mapZoom:6,radarZoom:5,radarScale:2});
assert.ok(RADAR_RANGE_CONFIG.near.mapZoom>RADAR_RANGE_CONFIG.regional.mapZoom&&RADAR_RANGE_CONFIG.regional.mapZoom>RADAR_RANGE_CONFIG.wide.mapZoom,'radar ranges must progressively zoom out');

const forecast={city:{timezone:'Europe/Paris'},seriesByModel:{
  a:{hourly:{timestamps:['a','b','c'],timestampEpochMs:[1000,2000,3000],precipitation:[0,0.4,1.2],precipitationProbability:[10,60,80]}},
  b:{hourly:{timestamps:['a','b','c'],timestampEpochMs:[1000,2000,3000],precipitation:[0,0.2,0.8],precipitationProbability:[20,55,75]}}
}};
const hours=radarForecastHours(forecast,900,3);
assert.equal(hours.length,3);
assert.equal(hours[0].modelCount,2);
assert.ok(hours[1].probabilityPercent>=55&&hours[1].probabilityPercent<=60,'radar short-term trend should use the forecast engine probability rather than a raw arithmetic mean');
assert.equal(radarForecastTrend(hours),'approaching');
assert.equal(radarForecastTrend([{probabilityPercent:80},{probabilityPercent:60},{probabilityPercent:20}]),'leaving');
assert.equal(radarForecastTrend([{probabilityPercent:70},{probabilityPercent:65},{probabilityPercent:60}]),'persistent');
assert.equal(radarForecastTrend([{probabilityPercent:10},{probabilityPercent:20},{probabilityPercent:25}]),'quiet');
const url=radarImageUrl({host:'https://tilecache.rainviewer.com'},{path:'/v2/radar/123'}, {latitude:48.8566,longitude:2.3522},7);
assert.equal(url,'https://tilecache.rainviewer.com/v2/radar/123/512/7/48.85660/2.35220/2/1_1.png');


const mask=(width,height,left,top,w=4,h=5)=>{const data=new Uint8Array(width*height);for(let y=top;y<top+h;y++)for(let x=left;x<left+w;x++)data[y*width+x]=1;return data;};
const mw=32,mh=32,m1=mask(mw,mh,6,13),m2=mask(mw,mh,8,13),m3=mask(mw,mh,10,13);
const shift=estimateRadarTranslation(m1,m2,mw,mh,6);
assert.equal(shift.dx,2);assert.equal(shift.dy,0);assert.ok(shift.score>.8);
const motion=estimateRadarMotion([{mask:m1,time:0},{mask:m2,time:600},{mask:m3,time:1200}],{width:mw,height:mh,maxShift:6});
assert.ok(motion);assert.ok(Math.abs(motion.vx-.2)<.01);assert.ok(Math.abs(motion.vy)<.01);assert.ok(motion.confidence>.7);
const eta=radarNowcastEta(m3,motion,{width:mw,height:mh,maxMinutes:60});
assert.equal(eta.kind,'approaching');assert.ok(eta.minute<=30);

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
assert.match(app,/data-action="open-radar"/);
assert.match(app,/type:'radar'/);
assert.match(app,/Rain Radar Opened/);
assert.match(app,/Rain Radar Range Changed/);
assert.match(app,/data-radar-nowcast/);
assert.doesNotMatch(app,/data-radar-dots/);
assert.doesNotMatch(app,/radar-method-note/);
assert.ok(app.indexOf('class=\"radar-legend\"')<app.indexOf('class=\"radar-playback\"'),'precipitation legend must be directly below the radar before playback');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
assert.match(css,/\.radar-map-stage\{[^}]*width:100%[^}]*height:clamp\(300px,40vh,390px\)/s,'radar must use full width with reduced height');
assert.match(css,/\.radar-modal-head>div\{flex:1;min-width:0\}/,'radar modal title must reserve space so close stays right');
assert.match(css,/\.radar-modal-head>\.icon-btn\{margin-left:auto/,'radar close button must stay at the right edge');
assert.match(css,/\.radar-map-stage\{[^}]*isolation:isolate[^}]*z-index:0/s,'radar overlays must stay below sticky modal header');
assert.match(app,/class="radar-intensity-scale"/,'intensity labels must be integrated with the gradient scale');

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/img-src[^\"]*tile\.openstreetmap\.org[^\"]*rainviewer\.com/);
assert.match(html,/connect-src[^\"]*api\.rainviewer\.com/);
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(fs.readFileSync(new URL('../cache-version.js',import.meta.url),'utf8'),/METEOCOMPARE_CACHE_VERSION = 'v\d+[-a-z0-9]+'/);
assert.match(sw,/features\/radar\.js/);
for(const lang of ['fr','en','es','de','it']){
  const locale=fs.readFileSync(new URL(`../js/locales/${lang}.js`,import.meta.url),'utf8');
  assert.match(locale,/"rainRadar"/);
  assert.match(locale,/"radarPrivacyNote"/);
  assert.match(locale,/"radarNowcastArrival"/);
}
console.log('MeteoCompare rain radar tests: OK');
