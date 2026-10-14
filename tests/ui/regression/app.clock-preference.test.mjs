import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),radar=read('js/features/radar.js'),sw=read('sw.js'),solar=read('js/ui/solar.js');
assert.match(app,/data-time-format="\$\{id\}"/,'settings controls are interactive and stateful');
assert.match(app,/if\(target\.dataset\.timeFormat\)/);
assert.match(app,/state\.settings\.timeFormat=target\.dataset\.timeFormat;persistSettings\(\);render\(/,'format change must persist and redraw immediately');
assert.match(app,/function timeLabel\(localTs\)\{return formatLocalClock\(localTs,state\.settings\.timeFormat\);\}/,'all local forecast labels use selected format');
assert.match(app,/withClockPreference\(options,state\.settings\.timeFormat\)/,'date+time labels follow selected clock');
assert.match(app,/\$\{i18n\(\)\.lang\}\|\$\{state\.settings\.timeFormat\}/,'home cached HTML must separate time formats');
assert.match(app,/function changeLanguage\(nextLanguage,directive\)/,'language switch remains isolated from clock');
assert.doesNotMatch(app,/state\.settings\.timeFormat=['"]H24['"];/,'language change must not reset the clock');
assert.match(app,/timeFormat:state\.settings\.timeFormat,initialMode/,'radar must receive clock preference');
assert.match(radar,/formatInstantClock\(epochSeconds\*1000,timezone,timeFormat\)/,'radar frames must use city timezone and preference');
assert.match(radar,/hourText\(row\.epochMs,locale,timezone,timeFormat\)/,'radar forecast list must also respect format');
assert.match(sw,/\.\/js\/ui\/solar\.js/,'offline shell contains time formatter');
assert.match(solar,/const clockFormatters=new Map\(\)/,'clock formatters cached for performance');
for(const lang of ['fr','en','es','de','it']){
  const catalog=read(`js/locales/${lang}.js`);
  for(const key of ['timeFormatTitle','timeFormatIntro','timeFormat24','timeFormat12'])assert.ok(catalog.includes(`"${key}"`),`${lang} missing ${key}`);
}
console.log('Clock selection wired across views, cache, radar, locale and PWA: OK');
