import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeTodayHourlyPoints, zonedLocalTimestampEpoch } from '../js/domain.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const css=read('styles.css'),app=read('js/app.js'),version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js');

assert.ok(version.localeCompare('1.13.0',undefined,{numeric:true})>=0,'release must preserve 1.13 contracts');
assert.ok(versionJs.includes(`APP_VERSION = '${version}'`));
assert.ok(sw.includes(`APP_VERSION = '${version}'`));
assert.ok(Number(sw.match(/CACHE_VERSION = 'v(\d+)/)?.[1]||0)>=63,'1.13 cache generation must not regress');
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
