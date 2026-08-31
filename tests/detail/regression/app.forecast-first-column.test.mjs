import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(app,/function forecastDateCellParts\(/,'forecast table must use compact localized date parts');
assert.match(app,/class="forecast-date-primary"/,'forecast table must render the main date line separately');
assert.match(app,/class="forecast-date-month"/,'forecast table must place the month on its own line');
assert.match(app,/class="forecast-date-time"/,'hourly rows must keep time on a compact third line');
assert.match(css,/\.detail-page \.forecast-table th:first-child,[\s\S]*?width:94px; min-width:94px; max-width:94px;/,'detail forecast first column must have a bounded compact width');
assert.match(css,/\.forecast-table \.forecast-date-month \{[^}]*display:block/s,'month must be block-level to reduce first-column width');
console.log('Forecast table compact first column: OK');
