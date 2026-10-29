import assert from 'node:assert/strict';
import { graphicNiceAxis, graphicNiceRange, graphicBoundedRange, graphicAxisDigits, graphicReadableTicks } from '../../../js/ui/timeline-utils.js';
import { convertUnitValue } from '../../../js/units.js';

const contains=(axis,value)=>assert.ok(value>=axis.min&&value<=axis.max,`${value} must fall within ${axis.min}–${axis.max}`);
const valid=axis=>{
  assert.ok(Number.isFinite(axis.min)&&Number.isFinite(axis.max)&&axis.max>axis.min);
  assert.ok(axis.step>0&&axis.ticks.length>=2);
  assert.ok(axis.ticks.every((v,i)=>Number.isFinite(v)&&v>=axis.min&&v<=axis.max&&(i===0||v>axis.ticks[i-1])));
  assert.ok(axis.ticks.length<=8,`crowded axis: ${axis.ticks}`);
};
for(const values of [[12.1,12.4],[0,1],[-15,-14.9],[25,40],[-20,35]]){
  const axis=graphicNiceRange(values,{minimumSpan:1.5,targetTicks:4});valid(axis);
  values.forEach(value=>contains(axis,value));
}
const pressure=graphicNiceRange([1012.4,1013.1],{minimumSpan:1.2,targetTicks:4});
valid(pressure);assert.ok(pressure.max-pressure.min<8,'a quiet pressure curve must have a tighter scale than 8 hPa');
const rain=graphicNiceAxis(.12,{minimum:.1,targetTicks:4});
valid(rain);assert.equal(rain.min,0,'rainfall bars start at zero');contains(rain,.12);
const noRain=graphicNiceAxis(0,{minimum:1,targetTicks:4});valid(noRain);assert.equal(noRain.min,0);
const wind=graphicBoundedRange([42,44,46],{minimumSpan:4,minBound:0,fallback:[0,20]});
valid(wind);assert.ok(wind.min>0&&wind.max-wind.min<20,'wind variations should not be flattened against zero');
const calm=graphicBoundedRange([0,1.5],{minimumSpan:4,minBound:0});valid(calm);assert.equal(calm.min,0);
for(const sample of [[70,72,75],[99,100],[0,3],[0,100],[48],[100],[0]]){
  const axis=graphicBoundedRange(sample,{minimumSpan:10,targetTicks:4,minBound:0,maxBound:100,fallback:[0,100]});
  valid(axis);assert.ok(axis.min>=0&&axis.max<=100);
  sample.forEach(value=>contains(axis,value));
  if(sample[0]===70)assert.ok(axis.max-axis.min<40,'humidity needs a close-up of small variations');
}
const unknown=graphicBoundedRange([null,NaN,Infinity,-10,120],{minimumSpan:10,targetTicks:4,minBound:0,maxBound:100,fallback:[0,100]});
valid(unknown);assert.equal(unknown.min,0);assert.equal(unknown.max,100);
// The numeric axis stays canonical, but tick precision responds to the units
// so neighboring pressure/rain labels do not collapse on conversion.
for(const unitSystem of ['METRIC','IMPERIAL','UK']){
  for(const [kind,step] of [['temperature',.5],['pressure',.5],['precipitationRate',.05],['wind',1]]){
    const digits=graphicAxisDigits(kind,step,unitSystem);
    assert.ok(digits>=0&&digits<=5);
    const first=convertUnitValue(kind,0,unitSystem).toFixed(digits);
    const second=convertUnitValue(kind,step,unitSystem).toFixed(digits);
    assert.notEqual(first,second,`${unitSystem} ${kind} must have distinct adjacent tick labels`);
  }
}
assert.deepEqual(graphicReadableTicks([0,25,50,75,100]),[0,50,100]);
assert.deepEqual(graphicReadableTicks([3,5,7]),[3,5,7]);
console.log('Adaptive temperature, pressure, rainfall, wind and bounded humidity scales with metric/imperial/UK labels: OK');
