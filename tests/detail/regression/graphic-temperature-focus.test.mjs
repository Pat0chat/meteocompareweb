import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {graphicNiceRange,graphicAxisDigits} from '../../../js/ui/timeline-utils.js';
const app=readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const graphic=app.slice(app.indexOf('function renderGraphicForecastView('),app.indexOf('function renderTodaySummary('));

// A model disagreement or a climatological normal far from the forecast must
// not flatten the main temperature, feels-like and dewpoint curves.
assert.match(graphic,/tempValues=points\.flatMap\(point=>\[point\.temperatureC,point\.apparentTemperatureC,point\.dewPointC\]\)/);
assert.doesNotMatch(graphic,/const normalValues=.*tempMinNormal/);
assert.match(graphic,/tempAxis=graphicNiceRange\(tempValues\.length\?tempValues:\[0,30\],\{minimumSpan:0\.8,targetTicks:5,paddingSteps:0\.05\}\)/);
assert.match(graphic,/const yTemp=value=>tempBottom-\(value-tempMin\)\/tempSpan/);
for(const samples of [[15.1,15.3,15.6],[24.1,24.5,25],[-2.3,-2.1,-1.9]]){
  const tight=graphicNiceRange(samples,{minimumSpan:.8,targetTicks:5,paddingSteps:.05});
  const old=graphicNiceRange([...samples,-18,42],{minimumSpan:1.5,targetTicks:4});
  assert.ok(tight.max-tight.min<(old.max-old.min)/3,`small temperature differences remain visible for ${samples}`);
  for(const value of samples)assert.ok(value>=tight.min&&value<=tight.max);
  for(const unit of ['METRIC','IMPERIAL','UK'])assert.ok(graphicAxisDigits('temperature',tight.step,unit)>=0);
}
assert.match(graphic,/pressureTop=52,pressureBottom=125/,'short pressure panel preserves space above tick labels');
assert.match(graphic,/windTop=54,windBottom=131/,'wind panel reserves header space');
console.log('Focused temperature plotting without model/normal outlier flattening: OK');
