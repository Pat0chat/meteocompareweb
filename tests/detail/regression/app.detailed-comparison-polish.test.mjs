import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(app,/section-head detailed-section-head[\s\S]*section-actions detailed-export-actions/,'detailed comparison exports must expose a dedicated right-aligned action group');
assert.match(css,/\.detailed-section-head \.detailed-export-actions\{[^}]*margin-left:auto;[^}]*justify-content:flex-end;/s,'detailed comparison exports must align to the right');
assert.match(css,/\.detailed-section-head\{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1fr\) auto;[^}]*width:100%;/s,'detailed comparison header must reserve a dedicated right-edge actions column');
assert.match(css,/\.detailed-section-head \.detailed-export-actions\{[^}]*justify-self:end;/s,'detailed comparison exports must be anchored to the grid right edge');
assert.match(app,/class="forecast-date-time">\$\{esc\(timeLabel\(row\.ts\)\)\}<\/span>\$\{row\.epochMs===targetEpoch\?`<span class="forecast-date-now">/,'hourly current marker must live on its own line instead of overflowing the time cell');
assert.match(css,/\.forecast-table \.forecast-date-now\{[^}]*white-space:nowrap;/s,'current marker must stay on one line inside the narrow first column');
assert.doesNotMatch(css,/\.forecast-table \.forecast-date-now\{[^}]*overflow-wrap:anywhere;/s,'current marker must not be forced to split across lines');
console.log('detailed comparison polish regression test passed');

assert.match(app,/sectionId==='details'\?head\.querySelector\?\.\('\.detailed-export-actions'\):null;/,'detailed comparison collapse button must be inserted into the export action group');
assert.match(css,/\.detailed-section-head \.detailed-export-actions\{[^}]*flex-wrap:nowrap;[^}]*width:auto;/s,'detailed comparison actions must keep CSV, JSON and collapse chevron on one line');
assert.match(css,/\.detailed-card\[data-collapsed="true"\] \.detailed-export-actions \.btn \{ display:none !important; \}/,'collapsed detailed comparison must hide export buttons without hiding the collapse chevron');
