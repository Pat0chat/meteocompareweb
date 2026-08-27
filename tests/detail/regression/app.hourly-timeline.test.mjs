import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const fr=fs.readFileSync(new URL('../../../js/locales/fr.js',import.meta.url),'utf8');
const health=fs.readFileSync(new URL('../../../js/features/model-health.js',import.meta.url),'utf8');
const network=fs.readFileSync(new URL('../../../js/network-config.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../../index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

const renderTimeline=app.slice(app.indexOf('function renderTimeline('),app.indexOf('function renderConfidenceSection('));
assert.match(renderTimeline,/selectRegularTimelinePoints\(analysis,mode==='HOURLY'\?24:7,1\)/,'detail 24 h timeline must render hourly points');
assert.match(app,/function homeTimelinePoints[\s\S]*selectRegularTimelinePoints\(buildTimelinePoints\(f,'HOURLY'[\s\S]*maxPoints,3\)/,'home mini timeline keeps its compact 3-hour sampling');
assert.match(app,/disagreementAnalysis\(cityId\)[\s\S]*selectRegularTimelinePoints\(buildTimelinePoints\(f,'HOURLY',new Date\(\),opts\),24,1\)/,'detail disagreement analysis must use the same hourly grid');
assert.match(fr,/"next24Regular":"Prochaines 24 heures · repères chaque heure"/);
assert.match(health,/METADATA_PROXY_PATH=NETWORK_ENDPOINTS\.firstParty\.modelMetadata/);
assert.match(network,/modelMetadata: '\/_mcx\/model-metadata'/);
assert.doesNotMatch(health,/fetch\(`https:\/\/openmeteo-data-spatial\.b-cdn\.net/);
assert.doesNotMatch(html,/openmeteo-data-spatial\.b-cdn\.net/,'browser CSP no longer needs a direct metadata CDN connection');
assert.match(styles,/timeline-ruler, \.timeline-full \{ grid-template-columns: repeat\(var\(--timeline-cols, 8\), minmax\(148px,1fr\)\); \}/,'hourly timeline columns must have enough width for condition labels');
assert.match(styles,/timeline-condition > span:last-child \{[^}]*white-space:nowrap;[^}]*text-overflow:ellipsis;/,'weather condition labels must stay on one line');
console.log('detail hourly timeline and first-party model health proxy: OK');
