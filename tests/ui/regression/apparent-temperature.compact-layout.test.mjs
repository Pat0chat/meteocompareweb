import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeI18n } from '../../../js/i18n.js';

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),comparison=read('js/features/comparison.js');
const languages={FRENCH:['fr','Ressenti'],ENGLISH:['en','Feels'],SPANISH:['es','Sensación'],GERMAN:['de','Gefühlt'],ITALIAN:['it','Percepita']};
for(const [preference,[code,expected]] of Object.entries(languages)){
  const i18n=makeI18n(preference),short=i18n.t('apparentTemperatureShort'),full=i18n.t('apparentTemperature');
  assert.equal(short,expected,`${code}: short label must be genuinely localized`);
  assert.ok(short.length<=11,`${code}: label must fit compact chronology lanes`);
  assert.notEqual(short,full,`${code}: compact form must not silently fall back to long form`);
  assert.ok(full.length>0,`${code}: full explanatory label remains available`);
}
// Constrained zones must display the short form while exposing the full explanation.
assert.match(app,/class="timeline-apparent-label">\$\{esc\(t\('apparentTemperatureShort'\)\)\}<\/span>/);
assert.match(app,/class="timeline-apparent-value" title="\$\{attr\(t\('apparentTemperature'\)\)\}"/);
assert.match(app,/class="detail-chrono-row-label temp"[^\n]+title="\$\{attr\(t\('apparentTemperature'\)\)\}">\$\{esc\(t\('apparentTemperatureShort'\)\)\}/);
assert.match(app,/class="graphic-legend"[^\n]+class="apparent-temp" title="\$\{attr\(t\('apparentTemperature'\)\)\}">/);
assert.equal((app.match(/class="cell-sub apparent-table-value" title="\$\{attr\(i18n\(\)\.t\('apparentTemperature'\)\)\}"/g)||[]).length,2);
assert.equal((comparison.match(/class="apparent-legend-note" title="\$\{attr\(t\('apparentTemperature'\)\)\}"/g)||[]).length,2);

const summary=app.slice(app.indexOf('function renderTodaySummary('),app.indexOf('function scenarioLabel('));
assert.match(summary,/<span class="summary-temperature-stack"><span class="summary-current-temp">[^\n]+<\/span><small class="apparent-temperature-caption">[^\n]+<\/small><\/span><span class="summary-condition">/,'TodaySummary temperature and felt value must be a single stacked group');
assert.match(css,/\.summary-temperature-stack\s*\{[^}]*flex-direction:column;[^}]*min-width:0;/,'stacked label may wrap without pushing out the condition');
assert.match(css,/\.timeline-apparent-value\s*\{[^}]*max-width:100%;[^}]*white-space:normal;/,'column values must not overflow their narrow lane');
assert.match(css,/\.timeline-apparent-label,\.timeline-apparent-measure\s*\{[^}]*display:block;/,'label and value must get separate lines');
assert.match(css,/\.apparent-table-value\s*\{[^}]*white-space:normal;/,'table cells must allow localized content to wrap');
assert.match(css,/\.summary-dispersion-title \.tile-label\s*\{[^}]*overflow-wrap:break-word;/,'long daily felt temperatures must not overflow cards');
assert.doesNotMatch(app.slice(app.indexOf('function renderTodaySummary('),app.indexOf('function scenarioLabel(')),/fetch\(|setInterval\(|requestAnimationFrame\(/,'layout must not create network traffic or refresh loops');
console.log('Localized compact felt-temperature UI, TodaySummary stacking, and overflow protections: OK');
