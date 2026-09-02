import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

assert.match(app,/axisValues=\[central,rawInterval\?\.low,rawInterval\?\.high,probableInterval\?\.low,probableInterval\?\.high,retainedInterval\?\.low,retainedInterval\?\.high\]\.filter\(Number\.isFinite\)/,'the rail domain must include the central value and every displayed range, including a 0 mm edge value');
assert.match(app,/summary-dispersion-envelope" style="\$\{intervalStyle\(rawInterval\)\}/,'raw model dispersion must keep its own positioned segment instead of stretching to the central-value edge');
assert.match(app,/summary-dispersion-center" style="--center:\$\{centerPosition\}%/,'the black dispersion marker must use the central-value position');
assert.match(app,/summary-dispersion-scale" style="--center:\$\{centerPosition\}%/,'the displayed central value must receive the exact same position as the black marker');
assert.match(app,/!centerAtMin&&!centerAtMax\?`<strong>/,'a central value on either axis edge must not collide with a duplicate edge label');
assert.match(css,/\.summary-dispersion-scale strong \{[\s\S]*?left:var\(--center,50%\);[\s\S]*?transform:translateX\(-50%\)/,'the central value label must be anchored below the black marker instead of centered in the card');
assert.match(css,/\.summary-dispersion-track \{[\s\S]*?inset:0 8%;/,'the rail must reserve symmetric edge room for dots and labels');
assert.match(css,/\.summary-dispersion-scale \{[\s\S]*?margin:1px 8% 0;/,'the scale and the drawable rail must share the same horizontal bounds');
assert.match(css,/\.summary-dispersion-scale span:first-child \{ left:0; \}/,'minimum label must stay attached to the left edge');
assert.match(css,/\.summary-dispersion-scale span:last-child \{ right:0; text-align:right; \}/,'maximum label must stay attached to the right edge');

assert.match(app,/engineDetail\?\.allSourceInterval\|\|engineDetail\?\.interval/,'the probable range must use the all-source descriptive interval when available');
assert.match(app,/retainedInterval=normalizedInterval\(engineDetail\?\.interval\)/,'the selected engine interval must be rendered separately');
assert.match(app,/summary-probable-interval/,'the probable range must appear inside every eligible rail');
assert.match(app,/summary-engine-interval/,'the engine-retained range must appear inside every eligible rail');
assert.match(app,/agreementLabel:t\('rainAgreement'\)/,'the precipitation card must label its score as rain agreement');
assert.match(app,/summary-rail-legend/,'the Today Summary card must end with one shared spread/interval legend');

console.log('Today summary rails align edges and expose engine intervals: OK');
