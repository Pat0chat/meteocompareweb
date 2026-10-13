import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');
const solarSection=app.slice(app.indexOf('function renderTodaySunCard('),app.indexOf('function renderCityCard('));
assert.match(solarSection,/t\('sunSection'\)/);
assert.match(solarSection,/t\('uvDailyMax'\)/);
assert.match(solarSection,/class="summary-sun-uv-label"/);
assert.match(solarSection,/t\('sunrise'\)/);
assert.match(solarSection,/t\('sunset'\)/);
assert.match(solarSection,/t\('daylightDuration'\)/);
assert.match(solarSection,/zonedTimestampEpoch\(sunrise,timezone\)/);
assert.match(app,/renderTodaySunCard\(uvMaxForDate\(f,agg\.date\),agg,f\.city\?\.timezone\)/);
assert.match(app,/night:isNightAt\(f,localNowTimestamp\(f\.city\?\.timezone\)\)/,'home/detail weather icons should use their local time');
assert.match(app,/night:isNightAt\(f,point\.timestamp\)/,'hourly home/chart/timeline forecast icons need nighttime context');
assert.match(app,/night:mode==='HOURLY'&&isNightAt\(f,point\.timestamp\)/,'daily aggregates should not be classified as night');
assert.match(app,/weatherIcons\.render\(point\.condition,\{size:'small',night:point\.night\}\)/,'chart weather icons should follow local nighttime');
assert.match(app,/conditionMarkup\(c,'small',x\.inferred,false,isNightAt\(s,row\.ts\)\)/,'per-model hourly table should use nighttime icon');
assert.match(css,/\.summary-sun-facts\s*\{/);
assert.match(css,/\.wx-moon-body\s*\{/);
assert.match(sw,/\.\/js\/ui\/solar\.js/,'new solar module must be precached for offline apps');
for(const language of ['fr','en','de','es','it']){
  const locale=read(`js/locales/${language}.js`);
  assert.match(locale,/"sunSection"\s*:/,`translated Sun heading missing in ${language}`);
  assert.match(locale,/"daylightDuration"\s*:/,`translated day length missing in ${language}`);
}
console.log('Solar summary and night icon wiring across screens: OK');
