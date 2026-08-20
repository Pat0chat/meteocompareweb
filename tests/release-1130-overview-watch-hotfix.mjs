import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeTodayHourlyPoints, zonedLocalTimestampEpoch } from '../js/domain.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const css=read('styles.css'),app=read('js/app.js'),version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js');

assert.equal(version,'1.13.0');
assert.match(versionJs,/APP_VERSION = '1\.13\.0'/);
assert.match(sw,/APP_VERSION = '1\.13\.0'/);
assert.match(sw,/CACHE_VERSION = 'v63-overview-watch-time'/);
assert.match(css,/\.overview-layout\s*\{[^}]*align-items:\s*start/s);
assert.match(css,/\.overview-primary\s*\{[^}]*display:\s*block[^}]*min-height:\s*0/s);
assert.match(css,/\.overview-secondary\s*\{[^}]*height:\s*auto[^}]*grid-template-rows:\s*none/s);
assert.doesNotMatch(css,/TodaySummary must match the full height/);
assert.match(app,/activeTodayHourlyPoints\(homeTimelinePoints\(f,weights,8,now\),timezone,now\)/);

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

console.log('MeteoCompare Web 1.13.0 overview/watch hotfix: OK');
