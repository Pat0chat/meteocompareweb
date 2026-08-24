import assert from 'node:assert/strict';
import fs from 'node:fs';

const radar=fs.readFileSync(new URL('../../../js/features/radar.js',import.meta.url),'utf8');
assert.doesNotMatch(radar,/throw new Error\(['"]RADAR_MOTION_UNCERTAIN/,'uncertain radar motion is an expected state, not an exception');
assert.match(radar,/nowcastReason='uncertain'/,'uncertain motion must have an explicit UI state');
assert.match(radar,/radarNowcastUncertain/,'the UI must explain uncertain motion without a console stack');
for(const locale of ['fr','en','es','de','it']){
  const source=fs.readFileSync(new URL(`../../../js/locales/${locale}.js`,import.meta.url),'utf8');
  assert.match(source,/radarNowcastUncertain/);
}
console.log('MeteoCompare graceful radar-nowcast uncertainty: OK');
