import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app,css]=await Promise.all([
  readFile(new URL('../../../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../../../styles.css',import.meta.url),'utf8'),
]);

// Chrono view: pressure cells must reserve enough horizontal room and must not
// repeat the pressure icon inside every narrow cell (the row header already owns it).
assert.match(app,/const step=mode==='HOURLY'\?96:132,/,'chrono cells need enough width for hPa and inHg values/ranges');
assert.match(app,/class="detail-chrono-pressure-cell"[^>]*><strong>\$\{Number\.isFinite\(value\)\?measurement\('pressure',value\):'—'\}<\/strong><small>/,'pressure chrono cells must dedicate their full width to values');
assert.doesNotMatch(app,/detail-chrono-pressure-cell[^`]*renderMetric\('pressure'/,'pressure icons must not be repeated inside every chrono value cell');
assert.match(css,/\.detail-chrono-pressure-cell\s*\{[\s\S]*place-items:center;[\s\S]*text-align:center;/,'chrono pressure values must be centered in their own lane');
assert.match(css,/\.detail-chrono-pressure-cell strong\s*\{[\s\S]*white-space:nowrap;/,'primary pressure values must remain intact');
assert.match(css,/--detail-chrono-pressure-height:64px;/,'pressure lane must reserve enough height for wrapped imperial ranges');
assert.match(css,/\.detail-chrono-pressure-cell small\s*\{[\s\S]*font-size:\.70rem;[\s\S]*white-space:normal;/,'pressure ranges must wrap instead of truncating or overlapping adjacent cells');

// Column view: pressure label/value/rail/range get separate rows so localized labels
// and imperial values cannot paint over each other.
assert.match(css,/\.timeline-pressure-metric\s*\{[\s\S]*height:\s*76px;[\s\S]*grid-template-rows:\s*16px 18px 10px 16px;/,'pressure metric requires a dedicated four-row geometry');
assert.match(css,/\.timeline-pressure-metric \.timeline-metric-label\s*\{[\s\S]*grid-row:1;[\s\S]*text-overflow:ellipsis;/,'pressure label must stay on its own row');
assert.match(css,/\.timeline-pressure-metric strong\s*\{[\s\S]*grid-row:2;[\s\S]*justify-self:start;/,'pressure value must stay below the label');
assert.match(css,/\.timeline-pressure-metric \.timeline-dispersion-rail\s*\{\s*grid-column:1 \/ -1;\s*grid-row:3;/,'pressure spread rail must have a separate row');
assert.match(css,/\.timeline-pressure-metric small\s*\{[\s\S]*grid-row:4;/,'pressure range must have a separate row');

// The rain heat marker is semantically and visually attached to precipitation,
// never inserted as a standalone block between pressure and precipitation.
assert.match(app,/timeline-rain-probability-metric[\s\S]*timeline-metric-label[^`]*\$\{rainHeat\}/,'rain heat must live inside the rain probability metric');
assert.doesNotMatch(app,/<\/div>\$\{rainHeat\}<div class="timeline-metric timeline-rain-metric/,'rain heat must not occupy a standalone row after pressure');
assert.match(css,/\.timeline-precip-heat\s*\{[\s\S]*width:\s*15px;[\s\S]*margin:\s*0 0 0 3px;[\s\S]*display:\s*inline-grid;/,'rain heat marker must be an inline precipitation affordance');

console.log('MSL pressure chronology layout separation: OK');
