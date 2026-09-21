import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const html=read('admin.html'),js=read('admin.js'),store=read('js/server/analytics-store.js'),worker=read('worker.js'),docs=read('ANALYTICS.md');

assert.match(html,/data-days="1">1 jour<\/button>/,'admin period picker must expose the current-day view');
assert.match(worker,/Math\.max\(1,Math\.min\(180/,'admin endpoint must continue accepting one-day requests');
assert.match(store,/todayOnly=days===1/,'analytics store must distinguish the current-day view');
assert.match(store,/fillHourlyRange/,'current-day analytics must expose only elapsed hours from today');
assert.match(store,/previousUntil=todayOnly\?Math\.min\(since,previousSince\+\(until-since\)\):since/,'one-day comparison must stop at the same elapsed time on the previous day');
assert.match(js,/Aujourd’hui, heure par heure/,'admin hourly card must clearly switch to current-day semantics');
assert.match(js,/Même tranche hier/,'current-day comparison must be labelled as the same elapsed slice yesterday');
assert.match(js,/Journée en cours/,'current-day period label must be explicit');
assert.match(docs,/périodes \*\*1, 7, 30, 90 et 180 jours\*\*/,'analytics documentation must describe the one-day period');

console.log('Admin current-day analytics period and same-time comparison: OK');
