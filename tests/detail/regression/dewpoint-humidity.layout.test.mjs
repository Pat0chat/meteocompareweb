import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = name => readFileSync(new URL(`../../../${name}`,import.meta.url),'utf8');
const css=root('styles.css'),app=root('js/app.js');
const graphic=app.slice(app.indexOf('function renderGraphicForecastView('),app.indexOf('function renderTodaySummary('));
const columns=app.slice(app.indexOf('function renderTimelinePoint('),app.indexOf('function renderDetailChronology('));

// Dew point / humidity now share the icon-label-value-dispersion-range
// three-row geometry of the other columns, including narrow screen columns.
const columnLayout=css.match(/\.timeline-dew-point-metric,\s*\.timeline-humidity-metric\s*\{([^}]+)\}/)?.[1];
assert.ok(columnLayout,'shared atmosphere metric layout exists');
for(const rule of ['grid-template-columns:19px minmax(0,1fr) auto;','grid-template-rows:18px 10px 16px;','height:64px;','min-height:64px;']) {
  assert.ok(columnLayout.includes(rule),`column ${rule}`);
}
const labelLayout=css.match(/\.timeline-dew-point-metric > \.timeline-metric-label,\s*\.timeline-humidity-metric > \.timeline-metric-label\s*\{([^}]+)\}/)?.[1];
const valueLayout=css.match(/\.timeline-dew-point-metric > strong,\s*\.timeline-humidity-metric > strong\s*\{([^}]+)\}/)?.[1];
assert.match(labelLayout||'',/grid-column:2;/);
assert.match(labelLayout||'',/text-overflow:ellipsis;/);
assert.match(valueLayout||'',/grid-column:3;/);
assert.match(valueLayout||'',/justify-self:end;/);
for(const fragment of ['dewPointRail','humidityRail','dewPointRange','humidityRange',"t('dewPointShort')","t('relativeHumidityShort')",'timeline-metric-icon']){
  assert.ok(columns.includes(fragment),`chronology should render ${fragment}`);
}
assert.match(columns,/rawMin:p\.dewPointMinAcrossModels,rawMax:p\.dewPointMaxAcrossModels/);
assert.match(columns,/rawMin:p\.humidityMinAcrossModels,rawMax:p\.humidityMaxAcrossModels/);
assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.timeline-metric \{ height: 64px; min-height: 64px; \}/);
for(const lang of ['fr','en','de','it','es']){
  const locale=root(`js/locales/${lang}.js`);
  for(const name of ['dewPoint','relativeHumidity','dewPointShort','relativeHumidityShort'])assert.match(locale,new RegExp(`"${name}":"[^"\\n]+"`),`${lang}: ${name}`);
}

// Rain/humidity are side by side on the LEFT with a unified 120px gutter.
assert.match(graphic,/leftPad=120/);
assert.match(graphic,/graphic-sticky-rain-axes">\$\{rainAxisMarkup\}\$\{humidityAxisMarkup\}/);
assert.doesNotMatch(graphic,/class="graphic-sticky-humidity-axis"/);
assert.match(css,/\.graphic-sticky-axes \{[^}]*position: sticky;[^}]*left: 0;/s);
assert.match(css,/\.graphic-y-axis\.rain \{ --axis-left:4px; --axis-rail-offset:48px; \}/);
assert.match(css,/\.graphic-y-axis\.humidity \{ --axis-color:#7281cc; --axis-left:63px; --axis-rail-offset:47px; \}/);
assert.ok(4+48+7<63,'rain tick lane does not touch humidity lane');
assert.ok(63+47+7<=120,'humidity ticks and rail fit entirely inside the sticky gutter');
assert.match(css,/\.graphic-axis-heading strong \{ display:none; \}/,'axis title has moved to the legend to prevent overlaps');
assert.match(css,/@media \(max-height:640px\) \{ \.graphic-sticky-axes \.graphic-axis-heading \{ display:none; \} \}/);
assert.match(graphic,/humidityTicks,yHumidity/);
assert.match(graphic,/y:yHumidity\(point\.relativeHumidityPercent\)/);
assert.match(graphic,/t\('aboutVisualVariableHumidity'\)/);
assert.match(graphic,/horizontalGrid\(humidityTicks,yHumidity,'humidity'\)/);
assert.match(graphic,/role="img" aria-label="\$\{attr\(`\$\{label\} \(\$\{unit\}\)`\)\}"/);
console.log('Chronology metric formatting and compact dual axes without overlap: OK');
