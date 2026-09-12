import assert from 'node:assert/strict';
import { fetchForecast } from '../../../js/api.js';
import { webTranslationAudit } from '../../../js/i18n.js';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../../../js/api.js',import.meta.url),'utf8');

assert.match(api,/searchParams\.set\('forecast_hours',[\s\S]*forecastHours/,'hourly API requests must use a rolling forecast_hours window');
assert.match(api,/const suspicious=models\.filter[\s\S]*recoveryAttempted/,'short-series recovery must be generic instead of ICON-D2-specific');
assert.match(app,/class="evolution-table-head"/,'forecast evolution must use one analytical matrix instead of a card grid');
assert.match(app,/data-evolution-variable=/,'forecast evolution must allow switching variable without multiplying cards');
assert.match(app,/class="evolution-track"/,'forecast evolution must render revision trajectories');
assert.match(app,/class="evolution-summary /,'forecast evolution must lead with the strongest revision signal');
assert.match(app,/class="evolution-legend"/,'forecast evolution must explain central trajectory, comparable spread and stability zone');
assert.match(app,/class="evolution-dispersion-band"/,'forecast evolution trajectories must expose the comparable model spread');
assert.match(app,/evolutionDispersionMethod/,'forecast evolution must distinguish raw historical spread from the engine-retained interval');
assert.match(app,/currentLow:e\.currentLow|low:e\.currentLow/,'current dispersion bounds must enter the trajectory points');
assert.match(app,/const plotTop=pad\.t,plotBottom=height-pad\.b,clampPlotY=/,'evolution threshold geometry must be clamped to the local plot area');
assert.match(app,/thresholdBottomVisible=rawBandBottom>=plotTop&&rawBandBottom<=plotBottom/,'threshold visibility must follow the clipped plot domain');
assert.match(app,/const thresholdBottomLabel=thresholdBottomVisible\?/,'out-of-range lower threshold labels must be hidden with their boundary');
assert.match(css,/\.evolution-track \{[^}]*overflow:hidden/,'evolution SVGs must clip plot decorations to their own chart');
assert.doesNotMatch(css,/\.evolution-track \{[^}]*overflow:visible/,'evolution SVGs must not leak threshold bands into adjacent rows');
assert.doesNotMatch(app,/class="evolution-grid"/,'legacy evolution card grid must be removed');
assert.match(app,/class="reliability-rank-row"/,'local reliability must use compact ranking rows');
assert.match(app,/data-reliability-variable=/,'local reliability must use variable tabs');
assert.match(app,/reliability\.score/,'local reliability compact ranking must expose the local score');
assert.match(css,/\.evolution-row \{ display:grid/,'evolution rows must be aligned as a desktop analysis matrix');
assert.match(app,/preserveAspectRatio="xMidYMid meet" role="img" aria-label="\$\{attr\(t\('evolutionTrajectoryAria'\)\)\}"/,'evolution trajectories must preserve their geometry instead of stretching SVG content');
assert.match(app,/new ResizeObserver\(entries=>\{[\s\S]*pendingEvolutionWidths\.set[\s\S]*requestAnimationFrame[\s\S]*resizeEvolutionTrack/,'evolution trajectories must rebuild when their container width changes without layout-thrashing each observer entry');
assert.match(app,/data-evolution-track=/,'evolution trajectories must retain their source data for responsive reconstruction');
assert.match(css,/\.evolution-panel\.evolution-variable-temperature \{ --evolution-metric-accent:var\(--temp\); \}/,'temperature evolution must use the temperature accent');
assert.match(css,/\.evolution-panel\.evolution-variable-precipitation \{ --evolution-metric-accent:var\(--rain\); \}/,'precipitation evolution must use the rain accent');
assert.match(css,/\.evolution-panel\.evolution-variable-wind \{ --evolution-metric-accent:var\(--wind\); \}/,'wind evolution must use the wind accent');
assert.match(css,/\.evolution-track-shell \{[^}]*min-height:142px/,'evolution trajectories must reserve a readable responsive plot height');
assert.match(css,/\.evolution-track \{[^}]*height:auto/,'evolution SVG height must follow its reconstructed aspect ratio');
assert.match(css,/\.evolution-summary \{/,'evolution revision summary must be styled');
assert.match(css,/\.evolution-dispersion-band\{fill:color-mix\(in srgb,var\(--evolution-metric-accent\) 10%,transparent\)\}/,'historical model spread must use the selected variable accent with a restrained fill');
assert.match(css,/\.evolution-dispersion-edge\{[^}]*var\(--evolution-metric-accent\)[^}]*38%[^}]*stroke-width:1;/,'historical model spread boundaries must remain readable in the selected variable accent');
assert.match(css,/\.reliability-table-head,\.reliability-rank-row/,'local reliability must use a compact table-like layout');
assert.match(app,/function renderBiasTrendChart\(samples,variable\)/,'J+1 reliability detail must render a real recent trend chart');
assert.match(app,/biasDailyAbsoluteError/,'recent trend must expose daily absolute error');
assert.match(app,/biasRollingMae7d/,'recent trend must expose a 7-day moving average');
assert.match(app,/data-hover-chart="bias-history"/,'ERA5 history must support chart hover interaction');
assert.match(app,/data-hover-date-style="FULL_DATE"/,'reliability charts must use full localized dates for hover');
assert.match(app,/biasFullDateLabel\(samples\[i\]\.date\)/,'ERA5 history axis must render localized real dates instead of MM-DD slices');
assert.match(app,/class="bias-overview-grid"/,'performance and recent evolution must share one outer panel');
assert.match(app,/class="bias-diagnostics-grid"/,'distribution and bias reading must share one outer panel');
assert.match(css,/\.bias-overview-grid \{/,'combined reliability overview must be styled');
assert.match(css,/\.bias-diagnostics-grid \{/,'combined reliability diagnostics must be styled');

// Simulate the precise ICON-D2 failure mode inside a 7-day multi-model
// response: GFS is complete for 168 hours, ICON-D2 has only 3 usable hours.
const city={id:'strasbourg',name:'Strasbourg',latitude:48.5734,longitude:7.7521,timezone:'Europe/Paris'};
const batchedTimes=Array.from({length:168},(_,i)=>{const d=new Date(Date.UTC(2026,7,18,i));return d.toISOString().slice(0,13)+':00';});
const batched={timezone:'Europe/Paris',hourly:{time:batchedTimes,
  temperature_2m_icon_d2:batchedTimes.map((_,i)=>i<3?20+i:null),
  temperature_2m_ncep_gfs_seamless:batchedTimes.map((_,i)=>19+i/10),
  precipitation_icon_d2:batchedTimes.map((_,i)=>i<3?0:null),precipitation_ncep_gfs_seamless:batchedTimes.map(()=>0),
  wind_speed_10m_icon_d2:batchedTimes.map((_,i)=>i<3?10:null),wind_speed_10m_ncep_gfs_seamless:batchedTimes.map(()=>12),
  weather_code_icon_d2:batchedTimes.map((_,i)=>i<3?1:null),weather_code_ncep_gfs_seamless:batchedTimes.map(()=>1)
}};
const fallbackTimes=batchedTimes.slice(0,48),fallback={timezone:'Europe/Paris',hourly:{time:fallbackTimes,
  temperature_2m:fallbackTimes.map((_,i)=>20+i/20),precipitation:fallbackTimes.map(()=>0),wind_speed_10m:fallbackTimes.map(()=>10),weather_code:fallbackTimes.map(()=>1)
}};
const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return {ok:true,json:async()=>urls.length===1?batched:fallback};};
const f=await fetchForecast(city,['ICON_D2','GFS'],7);
assert.equal(urls.length,2,'a short ICON-D2 batched series should trigger one recovery request');
assert.match(urls[0],/forecast_hours=168/,'the main 7-day request must expose 168 rolling hourly slots');
assert.match(urls[1],/models=icon_d2/,'recovery must request only the suspicious ICON-D2 cohort');
assert.match(urls[1],/forecast_hours=48/,'ICON-D2 recovery must request its documented 48-hour horizon');
assert.equal(f.seriesByModel.ICON_D2.hourly.temperature2m.filter(Number.isFinite).length,48,'the longer ICON-D2 recovery must replace the short batched hourly series');
assert.equal(f.modelMeta.ICON_D2.recoveredFromBatch,true,'recovery provenance must be retained in model metadata');

for(const [lang,missing] of Object.entries(webTranslationAudit()))assert.deepEqual(missing,[],`missing web translations for ${lang}`);
console.log('MeteoCompare Web ICON-D2 + evolution + reliability tests: OK');
