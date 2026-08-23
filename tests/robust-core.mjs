import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyError, ErrorCenter } from '../js/errors.js';
import { buildCityDiagnostics } from '../js/features/diagnostics.js';
import { WEATHER_MODELS } from '../js/models.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),i18n=read('js/i18n.js'),storageSource=read('js/storage.js'),sw=read('sw.js');
const locales=Object.fromEntries(['fr','en','es','de','it'].map(lang=>[lang,read(`js/locales/${lang}.js`)]));

// 1 — runtime is split: no monolithic translation import and expensive features are dynamic.
assert.doesNotMatch(app,/from ['"]\.\/android_strings\.js['"]/,'runtime must not import the monolithic Android string catalog');
assert.ok(i18n.length<10_000,'i18n runtime loader should remain small');
for(const lang of ['fr','en','es','de','it']){
  assert.match(i18n,new RegExp(`import\\('\\.\\/locales\\/${lang}\\.js'\\)`),`${lang} locale must be dynamically imported`);
  assert.ok(locales[lang].length>10_000,`${lang} translation payload should live in a separate bundle`);
}
for(const feature of ['bias','evolution','diagnostics','comparison']) assert.match(app,new RegExp(`import\\('\\.\\/features\\/${feature}\\.js'\\)`),`${feature} must be lazy loaded`);
assert.doesNotMatch(sw,/android_strings\.js/,'service worker shell must not preload the old monolithic translation catalog');

// 2 — structured errors keep useful fallback actions and are centrally manageable.
const network=classifyError(new TypeError('Failed to fetch'),{hasCache:true});
assert.equal(network.code,'OPEN_METEO_UNAVAILABLE');
assert.deepEqual(network.actions,['retry','use-cache']);
const networkNoCache=classifyError(new TypeError('Failed to fetch'),{hasCache:false});
assert.deepEqual(networkNoCache.actions,['retry']);
const center=new ErrorCenter();center.report('city:paris:network',network);assert.equal(center.get('city:paris:network').code,'OPEN_METEO_UNAVAILABLE');center.dismiss('city:paris:network');assert.equal(center.get('city:paris:network'),null);center.report('city:paris:network',network);center.resolve('city:paris:network');assert.equal(center.list().length,0);
assert.match(app,/data-error-action/,'user error actions must be rendered');
assert.match(app,/ERROR_ACTIONS/,'error actions must use the centralized action registry');

// 3 — diagnostics report all configured models without letting one damaged model invalidate healthy ones.
const enabled=WEATHER_MODELS.map(m=>m.id);
const makeMeta=(count,last='2026-08-20T12:00')=>({coverageByVariable:{temperature:{count,lastTimestamp:last},precipitation:{count,lastTimestamp:last},wind:{count,lastTimestamp:last},conditions:{count,lastTimestamp:last}},loadedAt:'2026-08-18T12:00:00Z'});
const seriesByModel={},modelMeta={};
for(const model of WEATHER_MODELS){seriesByModel[model.id]={hourly:{},daily:{}};modelMeta[model.id]=makeMeta(24);}
modelMeta.ICON_D2={...makeMeta(24),dataWarning:'PARTIAL_HOURLY_SERIES',recoveryAttempted:true};
modelMeta.GFS={...makeMeta(24),recoveredFromBatch:true,recoveryAttempted:true};
modelMeta.ECMWF={...makeMeta(24),coverageByVariable:{...makeMeta(24).coverageByVariable,precipitation:{count:0,lastTimestamp:null}}};
delete seriesByModel.METNO_NORDIC;
const diagnostic=buildCityDiagnostics({city:{timezone:'Europe/Paris'},fetchedAt:'2026-08-18T12:00:00Z',seriesByModel,modelMeta,errors:{}},WEATHER_MODELS,enabled);
assert.equal(diagnostic.rows.length,WEATHER_MODELS.length);
assert.equal(diagnostic.rows.find(x=>x.modelId==='ICON_D2').status,'PARTIAL');
assert.equal(diagnostic.rows.find(x=>x.modelId==='GFS').status,'RECOVERED');
assert.equal(diagnostic.rows.find(x=>x.modelId==='ECMWF').status,'VARIABLE_MISSING');
assert.equal(diagnostic.rows.find(x=>x.modelId==='METNO_NORDIC').status,'OUT_OF_DOMAIN_OR_UNAVAILABLE');
assert.equal(diagnostic.rows.find(x=>x.modelId==='AROME_FRANCE_HD').status,'OK');
assert.equal(diagnostic.summary.total,WEATHER_MODELS.length);
assert.match(app,/data-scroll-section="diagnostics"/,'city page must expose diagnostics navigation');
assert.match(app,/data-action="toggle-diagnostics"/,'diagnostics must be expandable without leaving the city');

// 4 — local records have a schema, explicit migrations and selective integrity repair.
assert.match(storageSource,/export const DATA_SCHEMA_VERSION = 3/);
assert.match(storageSource,/function migrateV1ToV2/);
assert.match(storageSource,/function migrateV2ToV3/);
assert.match(storageSource,/export async function verifyLocalDataIntegrity/);
assert.match(app,/data-action="check-integrity"/);
assert.match(app,/data-action="repair-integrity"/);

class LocalStorageMock{
  constructor(){this.map=new Map();}
  get length(){return this.map.size;}
  key(i){return [...this.map.keys()][i]??null;}
  getItem(k){return this.map.has(String(k))?this.map.get(String(k)):null;}
  setItem(k,v){this.map.set(String(k),String(v));}
  removeItem(k){this.map.delete(String(k));}
}
globalThis.localStorage=new LocalStorageMock();
Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true});
const city={id:'paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
localStorage.setItem('meteocompare.web.settings.v1',JSON.stringify({theme:'DARK',language:'FRENCH'}));
localStorage.setItem('meteocompare.web.cities.v1',JSON.stringify([city]));
localStorage.setItem('meteocompare.web.bias.paris',JSON.stringify({forecasts:[],observations:[],updatedAt:null}));
localStorage.setItem('meteocompare.web.bias.orphan',JSON.stringify({forecasts:[],observations:[],updatedAt:null}));
localStorage.setItem('meteocompare.web.evolution.paris',JSON.stringify('not-an-array'));
const storage=await import(`../js/storage.js?robust=${Date.now()}`);
assert.equal(storage.loadSettings().theme,'DARK');
assert.equal(storage.loadCities()[0].id,'paris');
const settingsEnvelope=JSON.parse(localStorage.getItem('meteocompare.web.settings.v1'));
assert.equal(settingsEnvelope.schemaVersion,3,'legacy settings must be migrated on read');
assert.equal(settingsEnvelope.marker,'meteocompare.local-record');
let report=await storage.verifyLocalDataIntegrity([city]);
assert.ok(report.issueCount>=2,'integrity check must detect invalid/orphan records');
assert.ok(report.orphans>=1);
assert.ok(report.invalid>=1);
report=await storage.verifyLocalDataIntegrity([city],{repair:true});
assert.ok(report.repairs.some(x=>x.action==='REMOVE_ORPHAN'));
assert.ok(report.repairs.some(x=>x.action==='REMOVE_INVALID'));
assert.equal(localStorage.getItem('meteocompare.web.bias.orphan'),null);
assert.equal(localStorage.getItem('meteocompare.web.evolution.paris'),null);
assert.notEqual(localStorage.getItem('meteocompare.web.bias.paris'),null,'valid city data must be preserved');

console.log('MeteoCompare Web robust core tests: OK');
