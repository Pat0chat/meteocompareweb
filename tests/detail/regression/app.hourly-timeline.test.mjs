import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const fr=fs.readFileSync(new URL('../../../js/locales/fr.js',import.meta.url),'utf8');
const network=fs.readFileSync(new URL('../../../js/network-config.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../../index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

const renderTimeline=app.slice(app.indexOf('function renderTimeline('),app.indexOf('function renderConfidenceSection('));
const renderPoint=app.slice(app.indexOf('function timelineMetricRail('),app.indexOf('function timelineEventMarker('));
assert.match(renderTimeline,/selectRegularTimelinePoints\(analysis,mode==='HOURLY'\?24:7,1\)/,'detail 24 h timeline must render hourly points');
assert.match(app,/function homeTimelinePoints\(f,forecastOptions,maxPoints=12,now=new Date\(\),stepHours=1\)[\s\S]*selectRegularTimelinePoints\(buildTimelinePoints\(f,'HOURLY'[\s\S]*maxPoints,stepHours\)/,'home mini timeline must expose 12 consecutive hourly points');
assert.match(app,/disagreementAnalysis\(cityId\)[\s\S]*selectRegularTimelinePoints\(buildTimelinePoints\(f,'HOURLY',new Date\(\),opts\),24,1\)/,'detail disagreement analysis must use the same hourly grid');
assert.match(fr,/"next24Regular":"Prochaines 24 heures · repères chaque heure"/);
assert.doesNotMatch(html,/openmeteo-data-spatial\.b-cdn\.net/,'browser CSP no longer needs a direct metadata CDN connection');
assert.match(styles,/timeline-ruler, \.timeline-full \{ grid-template-columns: repeat\(var\(--timeline-cols, 8\), minmax\(148px,1fr\)\); \}/,'hourly timeline columns must have enough width for condition labels');
assert.match(styles,/timeline-condition > span:last-child \{[^}]*white-space:normal;[^}]*-webkit-line-clamp:2;/,'weather condition labels must use a stable two-line area instead of ellipsis');
assert.match(styles,/timeline-point-head span \{[^}]*white-space:normal;[^}]*-webkit-line-clamp:2;/,'localized timeline dates must be readable on two lines');
assert.match(renderPoint,/engineDetail\?\.allSourceInterval\|\|engineDetail\?\.interval/,'timeline rails must distinguish the probable all-source interval');
assert.match(renderPoint,/retainedInterval=normalizedInterval\(engineDetail\?\.interval\)/,'timeline rails must retain the selected engine interval separately');
assert.match(renderPoint,/precipitationExpectedMinAcrossModelsMm[\s\S]*engineDetails\?\.precipitation/,'rain rail must compare expected precipitation on one consistent scale');
assert.match(renderPoint,/engineDetails\?\.cloud[\s\S]*engineDetails\?\.wind/,'cloud and wind timeline metrics must consume their engine intervals');
assert.match(renderPoint,/timeline-rain-probability-metric[\s\S]*timeline-rain-amount-metric/,'rain probability and probabilistic accumulation must use distinct timeline rows');
assert.match(renderPoint,/precipitationProbabilityMin[\s\S]*engineDetail:null[\s\S]*precipitationExpectedMinAcrossModelsMm/,'probability spread must stay separate from amount intervals');
assert.match(renderPoint,/windGustMinAcrossModels[\s\S]*engineDetails\?\.gust[\s\S]*timeline-gust-metric/,'gusts must be promoted to their own metric with a complete engine rail');
assert.match(renderPoint,/renderMetric\('precipitation-probability'[\s\S]*renderMetric\('precipitation-amount'[\s\S]*renderMetric\('wind'[\s\S]*renderMetric\('gust'/,'probability, accumulation, wind and gusts must use semantically distinct glyphs');
assert.match(renderPoint,/timeline-metric-label[\s\S]*timelineRainProbabilityShort[\s\S]*timelineRainAmountShort/,'narrow metric rows must expose short labels rather than hiding long descriptions');
assert.match(renderTimeline,/summaryRainExpectedLabel[\s\S]*windMedianLegend[\s\S]*gusts[\s\S]*timeline-rail-legend/,'the chronology legend must name weighted rain and gusts separately');
assert.match(renderTimeline,/timeline-rail-legend[\s\S]*summarySpreadLegend[\s\S]*summaryIntervalLegend/,'the chronology legend must explain spread and intervals once globally');

assert.match(app,/class="detail-chrono-view" data-chrono-mode="\$\{attr\(mode\)\}"/,'chronological strip must expose its hourly/daily mode for layout tuning');
assert.match(styles,/\.detail-chrono-view\[data-chrono-mode="HOURLY"\] \{ --detail-chrono-axis-height:86px; \}/,'24 h condition lane must be taller so localized dates can use two lines');
assert.match(styles,/\.detail-chrono-axis-hour small \{[^}]*-webkit-line-clamp:2;[^}]*white-space:normal;/,'24 h dates must wrap instead of being ellipsized');
assert.match(styles,/--detail-chrono-label-width:136px;/,'chronological strip must reserve a wider first column for row labels');
assert.match(app,/function divergenceIcon\(x\)[\s\S]*renderMetric\('temperature'[\s\S]*renderMetric\('precipitation'[\s\S]*renderMetric\('wind'[\s\S]*render\('PARTLY_CLOUDY'/,'chronological convergence warnings must use distinct weather icons for the affected variables');
assert.match(app,/detail-chrono-disagreement-icons[\s\S]*reasons\.map\(reason=>[\s\S]*divergenceIcon\(reason\)/,'chronological convergence warnings must render one icon per affected variable');
console.log('detail hourly timeline: OK');
