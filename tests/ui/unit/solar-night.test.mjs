import assert from 'node:assert/strict';
import { solarTimesForDate, isNightAt, localNowTimestamp } from '../../../js/ui/solar.js';
import { weatherIcons } from '../../../js/ui/weather-icons.js';

const source={seriesByModel:{a:{daily:{dates:['2026-10-13','2026-10-14'],sunrise:['2026-10-13T07:53','2026-10-14T07:54'],sunset:['2026-10-13T19:05','2026-10-14T19:03']}}}};
assert.deepEqual(solarTimesForDate(source,'2026-10-13'),{sunrise:'2026-10-13T07:53',sunset:'2026-10-13T19:05'});
for(const hour of ['2026-10-13T00:00','2026-10-13T07:52','2026-10-13T19:05','2026-10-13T23:59','2026-10-14T07:53']){
  assert.equal(isNightAt(source,hour),true,`${hour} should be nighttime`);
}
for(const hour of ['2026-10-13T07:53','2026-10-13T12:00','2026-10-13T19:04','2026-10-14T07:54']){
  assert.equal(isNightAt(source,hour),false,`${hour} should be daytime`);
}
assert.equal(isNightAt(source,'2026-10-13'),false,'daily weather aggregates have no nighttime phase');
assert.equal(isNightAt({},'2026-10-13T06:59'),true,'missing solar data should use the chart fallback');
assert.equal(isNightAt({},'2026-10-13T07:00'),false);
assert.equal(isNightAt({},'2026-10-13T19:00'),true);
assert.equal(isNightAt({},null),false);
assert.equal(localNowTimestamp('Europe/Paris',new Date('2026-01-14T22:00:00Z')),'2026-01-14T23:00');
assert.equal(localNowTimestamp('Europe/Paris',new Date('2026-07-14T22:00:00Z')),'2026-07-15T00:00');
assert.equal(isNightAt(source.seriesByModel.a,'2026-10-13T21:00'),true,'model tables use the same solar-phase logic');
for(const condition of ['CLEAR','MAINLY_CLEAR','PARTLY_CLOUDY','RAIN_SHOWERS','SNOW_SHOWERS']){
  const day=weatherIcons.render(condition,{size:'small'}),night=weatherIcons.render(condition,{size:'small',night:true});
  assert.match(day,/wx-sun/);
  assert.doesNotMatch(day,/wx-moon/);
  assert.match(night,/wx-moon-body/);
  assert.doesNotMatch(night,/wx-sun/);
  assert.match(night,/wx-night/);
}
assert.match(weatherIcons.render('RAIN',{night:true}),/wx-rain/,'night variants preserve precipitation symbols');
console.log('Solar time boundaries, timezone, day/night pictograms: OK');
