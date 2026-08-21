import fs from 'node:fs';
import assert from 'node:assert/strict';
import { WeatherIconRenderer } from '../js/ui/weather-icons.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js'),css=read('styles.css');
assert.equal(version,'1.14.0','product version must remain 1.14.0');
assert.ok(versionJs.includes("APP_VERSION = '1.14.0'"));
assert.ok(Number(sw.match(/CACHE_VERSION = 'v(\d+)/)?.[1]||0)>=65);

const icons=new WeatherIconRenderer();
const conditions=['CLEAR','MAINLY_CLEAR','PARTLY_CLOUDY','OVERCAST','FOG','DRIZZLE','RAIN','RAIN_SHOWERS','SNOW','SNOW_SHOWERS','FREEZING_RAIN','THUNDERSTORM','UNKNOWN'];
for(const condition of conditions){
  const svg=icons.render(condition,{animated:true});
  assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg,/class="wx-artwork wx-artwork-[^"]+" data-center="optical"/);
}
assert.match(icons.render('CLEAR'),/wx-artwork-clear[^>]+transform="translate\(6 8\)"/,'standalone sun must be centred in the 48x48 viewBox');
assert.match(icons.render('PARTLY_CLOUDY'),/transform="translate\(-0\.5 4\.4\)"/,'composite icons must keep an optical correction');
assert.doesNotMatch(icons.render('UNKNOWN'),/wx-artwork-unknown[^>]+transform=/,'already-centred unknown glyph must not be shifted');
assert.match(css,/\.condition-icon[^}]*display:inline-grid;[^}]*place-items:center;/,'shared condition hosts must centre the SVG box');

console.log('MeteoCompare Web 1.14.0 weather icon optical centering: OK');
