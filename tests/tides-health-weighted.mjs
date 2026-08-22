import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMarine, detectTideEvents, tideRangeNext24h } from '../js/features/marine.js';
import { weightedDayConfidence, dayConfidence } from '../js/domain.js';
import { buildModelHealthReport, appendHealthSnapshot, countIncidentEpisodes } from '../js/features/model-health.js';
import { WEATHER_MODELS } from '../js/models.js';

const now=Date.now(),times=Array.from({length:72},(_,i)=>new Date(now+i*3600e3).toISOString().slice(0,16));
const sea=times.map((_,i)=>0.8*Math.sin(i*Math.PI/6));
const raw={latitude:48.4,longitude:-4.5,timezone:'Europe/Paris',hourly:{time:times,wave_height:times.map(()=>1.2),wave_direction:times.map(()=>250),wave_period:times.map(()=>8),swell_wave_height:times.map(()=>.8),swell_wave_direction:times.map(()=>260),swell_wave_period:times.map(()=>10),sea_surface_temperature:times.map(()=>17),sea_level_height_msl:sea}};
const marine=normalizeMarine(raw,{latitude:48.4,longitude:-4.5,timezone:'Europe/Paris'});
assert.equal(marine.hourly.seaLevelHeightMsl.length,72);
const events=detectTideEvents(marine,{hours:48});assert.ok(events.length>=4);assert.ok(events.some(e=>e.type==='HIGH'));assert.ok(events.some(e=>e.type==='LOW'));assert.ok(tideRangeNext24h(marine)?.range>1);

const date='2026-08-19';
function series(id,max){return {modelId:id,hourly:{timestamps:[],temperature2m:[],precipitation:[],windSpeed10m:[]},daily:{dates:[date],tempMax:[max],tempMin:[max-8],precipitationSum:[null],windSpeedMax:[null],windGustsMax:[null],windDirection10mDominant:[null],precipitationProbabilityMax:[null],weatherCode:[null],sunrise:[null],sunset:[null]}};}
const f={city:{timezone:'UTC'},seriesByModel:{GFS:series('GFS',20),ECMWF:series('ECMWF',20.5),ICON_GLOBAL:series('ICON_GLOBAL',24.5)}};
const rawConf=dayConfidence(f,date),weighted=weightedDayConfidence(f,date,{temperature:{GFS:1.2,ECMWF:1.2,ICON_GLOBAL:.75}});
assert.notEqual(weighted.tempMax.percent,rawConf.tempMax.percent);assert.equal(weighted.weighted,true);

const models=WEATHER_MODELS.slice(0,2),enabled=models.map(m=>m.id),reference=new Date(now-(models[0].updateMinutes-5)*60_000).toISOString();
const forecast={city:{timezone:'Europe/Paris'},fetchedAt:new Date(now).toISOString(),seriesByModel:{},modelMeta:{},errors:{}};
for(const m of models){forecast.seriesByModel[m.id]={};forecast.modelMeta[m.id]={coverageByVariable:{temperature:{count:24,lastTimestamp:'2026-08-19T12:00'},precipitation:{count:24,lastTimestamp:'2026-08-19T12:00'},wind:{count:24,lastTimestamp:'2026-08-19T12:00'},conditions:{count:24,lastTimestamp:'2026-08-19T12:00'}}};}
const metadata=Object.fromEntries(models.map(m=>[m.id,{modelId:m.id,referenceTime:reference,lastModifiedTime:reference,responseMs:42}]));
const report=buildModelHealthReport(forecast,models,enabled,metadata,[],now);assert.equal(report.rows.length,2);assert.ok(['OK','RECOVERED'].includes(report.rows[0].healthStatus));assert.equal(report.rows[0].responseMs,42);assert.ok(report.rows[0].expectedRunAt);
let history=appendHealthSnapshot([],report,now-2*3600e3);const degraded=structuredClone(report);degraded.rows[0].healthStatus='DEGRADED';history=appendHealthSnapshot(history,degraded,now);assert.equal(countIncidentEpisodes(history,models[0].id,24*3600e3,now),1);
const metadataOnly=structuredClone(report);metadataOnly.rows[0].healthStatus='METADATA_UNAVAILABLE';let metadataHistory=appendHealthSnapshot([],metadataOnly,now);assert.equal(countIncidentEpisodes(metadataHistory,models[0].id,24*3600e3,now),0);

const app=fs.readFileSync('js/app.js','utf8'),sw=fs.readFileSync('sw.js','utf8'),html=fs.readFileSync('index.html','utf8'),storage=fs.readFileSync('js/storage.js','utf8');
for(const token of ['localWeightedConsensus','refreshModelHealthData','marineTides','data-local-weighting'])assert.ok(app.includes(token),token);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);assert.ok(html.includes('openmeteo-data-spatial.b-cdn.net'));assert.ok(storage.includes('meteocompare.web.health.'));
console.log('tides-health-weighted: OK');
