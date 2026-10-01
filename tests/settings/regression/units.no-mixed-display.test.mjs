import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const units=fs.readFileSync(new URL('../../../js/units.js',import.meta.url),'utf8');
const chartUtils=fs.readFileSync(new URL('../../../js/ui/chart-utils.js',import.meta.url),'utf8');
const renderingSources=['../../../js/app.js','../../../js/features/comparison.js','../../../js/features/radar.js','../../../js/ui/chart-utils.js'].map(path=>fs.readFileSync(new URL(path,import.meta.url),'utf8')).join('\n');

// Regression: the main wind was converted but the adjacent gust used the raw km/h number.
assert.doesNotMatch(app,/gustAbbr'\)\)} \$\{fmt\(gust\)/,'detail chronology must not render a raw gust next to converted wind');
assert.match(app,/gustAbbr'\)\)} \$\{measurement\('wind',gust,\{compact:true\}\)\}/);
assert.doesNotMatch(app,/gustAbbr'\)\)} \$\{fmt\(unitValue\('wind',g\)/,'table gust must use the complete measurement formatter, including its unit');
assert.match(app,/gustAbbr'\)\)} \$\{measurement\('wind',g,\{compact:true\}\)\}/);

// Regression: generic length precision changed wave heights from 1 to 2 decimals.
assert.match(app,/marineSparkline[\s\S]*?measurement\('length',v,\{digits:1\}\)/);
assert.match(app,/lengthValue=a=>[^\n]*measurement\('length',a\[idx\],\{digits:1\}\)/);
assert.match(app,/waveHeightMax\?\.\[i\]\)\?measurement\('length',data\.daily\.waveHeightMax\[i\],\{digits:1\}\)/);
assert.match(app,/swellHeightMax\?\.\[i\]\)\?measurement\('length',data\.daily\.swellHeightMax\[i\],\{digits:1\}\)/);
assert.match(app,/measurement\('length',e\.value,\{digits:2\}\)/,'tides retain the pre-unit 2-decimal precision');

// Unit names belong to the central unit module, not active app rendering code.
for(const literal of ['°C','°F','km/h','mph','mm/h','in/h','hPa','inHg']){
  const quoted=new RegExp(`['\"]${literal.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['\"]`);
  assert.doesNotMatch(app,quoted,`app.js must not hard-code the unit literal ${literal}`);
}
assert.match(units,/imperial\?'°F':'°C'/);
assert.match(units,/imperial\?'mph':'km\/h'/);
assert.match(units,/imperial\?'in':'mm'/);
for(const [label,pattern] of [['°C',/°C/],['°F',/°F/],['km/h',/km\/h/],['mph',/\bmph\b/],['mm/h',/mm\/h/],['in/h',/in\/h/],['hPa',/\bhPa\b/],['inHg',/\binHg\b/]])assert.doesNotMatch(renderingSources,pattern,`active rendering modules must obtain ${label} from units.js`);
assert.doesNotMatch(chartUtils,/chartMetric(?:Unit|Digits)/,'shared chart primitives must not retain legacy metric-only unit helpers');

// Absolute values vs deltas and scale spans are intentionally distinct.
assert.match(app,/biasKind\(variable,\{absolute=false\}=\{\}\)\{return variable==='TEMPERATURE'\?\(absolute\?'temperature':'temperatureDelta'\)/);
assert.match(units,/kind==='temperature'\)return convertUnitValue\('temperatureDelta',value,unitSystem\)/);
assert.doesNotMatch(app,/thresholdValue\*2,\.8\)/,'evolution scale floor must not stay in display units after conversion');
assert.match(app,/thresholdValue\*2,minSpan\)/,'evolution scale floor must be passed in converted units');
assert.doesNotMatch(app,/activeUnitSystem\(\)==='IMPERIAL'\?1\.8:1/,'bias trend span must not duplicate a rounded Fahrenheit conversion');
assert.doesNotMatch(app,/activeUnitSystem\(\)==='IMPERIAL'\?4:2/,'bias history span must not use an approximate Fahrenheit conversion');

// Unknown chart metrics must not silently inherit a percent suffix.
assert.match(units,/PERCENT_CHART_METRICS\.has\(metric\)\?'%':''/);

console.log('unit mixed-display regressions: OK');
