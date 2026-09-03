import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeTodayHourlyPoints, zonedLocalTimestampEpoch } from '../../../js/domain.js';
import { APP_VERSION } from '../../../js/version.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const css=read('styles.css'),app=read('js/app.js'),version=APP_VERSION,versionJs=read('js/version.js'),sw=read('sw.js');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.match(versionJs,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');
assert.match(css,/\.overview-layout\s*\{[^}]*align-items:\s*start/s);
assert.match(css,/\.overview-primary\s*\{[^}]*display:\s*block[^}]*min-height:\s*0/s);
assert.match(css,/\.overview-secondary\s*\{[^}]*height:\s*auto[^}]*grid-template-rows:\s*none/s);
assert.doesNotMatch(css,/TodaySummary must match the full height/);
assert.match(app,/activeTodayHourlyPoints\(homeTimelinePoints\(f,forecastOptions,8,now,3\),timezone,now\)/,'watchlist analysis must retain its 3-hour sampling independently from the hourly home rail');

const tz='Europe/Paris';
const now=new Date('2026-08-20T13:23:00.000Z'); // 15:23 in Paris (CEST)
const point=(timestamp)=>({mode:'HOURLY',timestamp,date:timestamp.slice(0,10),epochMs:zonedLocalTimestampEpoch(timestamp,tz,now.getTime())});
const filtered=activeTodayHourlyPoints([
  point('2026-08-20T12:00'),
  point('2026-08-20T15:00'),
  point('2026-08-20T18:00'),
  point('2026-08-21T00:00'),
],tz,now);
assert.deepEqual(filtered.map(x=>x.timestamp),['2026-08-20T15:00','2026-08-20T18:00'],'watchlist must exclude expired and next-day slots while keeping the current active hour');

console.log(`MeteoCompare Web ${APP_VERSION} overview/watch hotfix: OK`);
