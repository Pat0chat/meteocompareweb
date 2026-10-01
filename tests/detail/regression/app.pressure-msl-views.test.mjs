import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api,app,domain,styles,icons,...locales]=await Promise.all([
  readFile(new URL('../../../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../../../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../../../js/domain.js',import.meta.url),'utf8'),
  readFile(new URL('../../../styles.css',import.meta.url),'utf8'),
  readFile(new URL('../../../js/ui/weather-icons.js',import.meta.url),'utf8'),
  ...['fr','en','es','de','it'].map(lang=>readFile(new URL(`../../../js/locales/${lang}.js`,import.meta.url),'utf8')),
]);

assert.match(api,/['"]pressure_msl['"]/, 'hourly Open-Meteo request must include pressure_msl');
for(const variable of ['pressure_msl_mean','pressure_msl_min','pressure_msl_max'])assert.match(api,new RegExp(variable),`daily request must include ${variable}`);

assert.match(domain,/pressureMslHpa:pressureForecast\.central/);
assert.match(domain,/pressureMslMinHpa:/);
assert.match(domain,/pressureMslMaxHpa:/);
assert.match(domain,/pressureAgreementPercent:/);
assert.match(domain,/engineDetails:\{[\s\S]*pressure:forecastEngineSummary\(pressureForecast\)/);

assert.match(app,/timeline-pressure-metric/,'column chronology must render MSL pressure');
assert.match(app,/detail-chrono-pressure/,'frie chronology must render an MSL pressure lane');
assert.match(app,/graphic-plot-pressure/,'ChartView must include a dedicated pressure plot');
assert.match(app,/graphic-pressure-line/);
assert.match(app,/graphic-pressure-band/);
assert.match(app,/data-graphic-ruler-pressure/,'ChartView ruler must include pressure');
assert.match(app,/graphicPressureTooltip/,'ChartView pressure points must expose details');
assert.match(app,/measurement\('pressure',point\.pressureMslHpa\)/,'visible ChartView pressure must go through the unit formatter');
assert.match(app,/unitLabel\('pressure'\)/,'pressure axes must use dynamic metric\/imperial units');
assert.match(app,/unitValue\('pressure',value\)/,'pressure axis ticks must convert through the unit system');

assert.match(styles,/grid-template-rows:\s*minmax\(0,42fr\)\s+minmax\(0,19fr\)\s+minmax\(0,19\.5fr\)\s+minmax\(0,19\.5fr\)/,'ChartView must allocate a fourth pressure row while shrinking temperature');
assert.match(styles,/\.graphic-y-axis\.pressure/);
assert.match(styles,/\.graphic-pressure-point/);
assert.match(styles,/--detail-chrono-pressure-height/);
assert.match(icons,/pressure:'<g class="wx-metric-stroke wx-pressure-gauge"/,'pressure needs a theme-compatible metric icon');

for(const [index,locale] of locales.entries()){
  assert.match(locale,/"pressureMsl"\s*:/,`locale ${index} must translate the MSL pressure label`);
  assert.match(locale,/"pressureMslDescription"\s*:/,`locale ${index} must translate the MSL pressure description`);
  assert.match(locale,/"pressureShort"\s*:/,`locale ${index} must translate the compact pressure label`);
}

console.log('MSL pressure hourly/daily chronology, ChartView, i18n and unit rendering: OK');
