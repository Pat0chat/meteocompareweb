import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app,css]=await Promise.all([
  readFile(new URL('../../../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../../../styles.css',import.meta.url),'utf8'),
]);

// Chrono view: pressure values follow the same visual hierarchy as the other data
// lanes while keeping enough room for metric and imperial ranges.
assert.match(app,/const step=mode==='HOURLY'\?96:132,/,'chrono cells need enough width for hPa and inHg values/ranges');
assert.match(app,/class="detail-chrono-pressure-cell"[^>]*><strong>\$\{Number\.isFinite\(value\)\?measurement\('pressure',value\):'—'\}<\/strong><small>/,'pressure chrono cells must dedicate their full width to values');
assert.doesNotMatch(app,/detail-chrono-pressure-cell[^`]*renderMetric\('pressure'/,'pressure icons must not be repeated inside every chrono value cell');
assert.match(css,/\.detail-chrono-pressure-cell\s*\{[\s\S]*place-items:center;[\s\S]*gap:3px;[\s\S]*padding:4px 3px;[\s\S]*text-align:center;/,'chrono pressure cells must use the same centered rhythm as adjacent chrono metrics');
assert.match(css,/\.detail-chrono-pressure-cell strong\s*\{[\s\S]*font-size:\.74rem;[\s\S]*font-weight:700;[\s\S]*white-space:nowrap;/,'primary pressure values must match the primary data typography used by rain cells');
assert.match(css,/--detail-chrono-pressure-height:64px;/,'pressure lane must reserve enough height for wrapped imperial ranges');
assert.match(css,/\.detail-chrono-pressure-cell small\s*\{[\s\S]*font-size:\.70rem;[\s\S]*text-align:center;[\s\S]*white-space:normal;/,'pressure ranges must match secondary chrono typography and wrap instead of truncating');

// Column view: pressure must use the shared metric component geometry instead of a
// bespoke taller stack. A short localized label keeps the standard row usable.
assert.match(app,/timeline-pressure-metric[\s\S]*timeline-metric-label">\$\{esc\(t\('pressureShort'\)\)\}<\/span><strong>/,'column pressure uses the compact localized pressure label');
assert.match(css,/\.timeline-pressure-metric \{ --timeline-rail-accent: var\(--primary\); \}/,'pressure may theme its rail without redefining metric geometry');
assert.doesNotMatch(css,/\.timeline-pressure-metric\s*\{[\s\S]{0,240}(?:height:|grid-template-columns:|grid-template-rows:)/,'pressure must not override the shared metric height or grid');
assert.match(css,/\.timeline-metric\s*\{[\s\S]*height: 64px;[\s\S]*grid-template-rows: 18px 10px 16px;/,'all column metrics, including pressure, share one geometry');

// The rain heat marker belongs to the thermal band, centered directly below the
// temperature track. It must not compete with pressure or rain metric rows.
assert.match(app,/class="timeline-temp-track"[^>]*><i><\/i><b><\/b><\/div>\$\{rainHeat\}<\/div><div class="timeline-metric timeline-pressure-metric"/,'rain heat must be directly below the temperature track inside the thermal band');
assert.doesNotMatch(app,/timeline-rain-probability-metric[\s\S]{0,260}\$\{rainHeat\}/,'rain heat must not be embedded in the probability metric');
assert.match(css,/\.timeline-temp-band > \.timeline-precip-heat \{[^}]*align-self:center;[^}]*justify-self:center;/,'rain heat marker must be centered in the thermal band');
assert.match(css,/\.timeline-precip-heat\s*\{[\s\S]*width:\s*15px;[\s\S]*height:\s*15px;[\s\S]*margin:\s*0;[\s\S]*display:\s*inline-grid;/,'rain heat marker keeps a stable footprint without row-specific offset');

console.log('MSL pressure chronology visual consistency: OK');
