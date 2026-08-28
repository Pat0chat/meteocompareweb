import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ECMWF_IFS025_LEGACY_ID, getModel } from '../../../js/models.js';

class LocalStorageMock {
  constructor(){this.map=new Map();}
  get length(){return this.map.size;}
  key(i){return [...this.map.keys()][i]??null;}
  getItem(k){return this.map.has(String(k))?this.map.get(String(k)):null;}
  setItem(k,v){this.map.set(String(k),String(v));}
  removeItem(k){this.map.delete(String(k));}
}

globalThis.localStorage=new LocalStorageMock();
Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true});

const envelope=(kind,payload,cityId='paris')=>({marker:'meteocompare.local-record',schemaVersion:3,kind,cityId,storedAt:Date.now()-1000,payload});
const city={id:'paris',name:'Paris',admin1:'Île-de-France',country:'France',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
const series=()=>({
  modelId:'ECMWF',
  hourly:{timestamps:['2026-08-28T08:00'],timestampEpochMs:[Date.parse('2026-08-28T06:00:00Z')],temperature2m:[20],precipitation:[0],precipitationProbability:[0],cloudCover:[30],windSpeed10m:[12],windDirection10m:[180],windGusts10m:[20],weatherCode:[1]},
  daily:{dates:['2026-08-28'],tempMax:[25],tempMin:[16],precipitationSum:[0],precipitationProbabilityMax:[0],windSpeedMax:[18],windGustsMax:[28],windDirection10mDominant:[180],weatherCode:[1],sunrise:['2026-08-28T06:50'],sunset:['2026-08-28T20:40']},
});
const gfs={...series(),modelId:'GFS'};
const ecmwf=series();

localStorage.setItem('meteocompare.web.forecast.paris',JSON.stringify(envelope('forecast',{
  city,timezone:city.timezone,fetchedAt:'2026-08-28T06:00:00.000Z',seriesByModel:{GFS:gfs,ECMWF:ecmwf},modelMeta:{GFS:{},ECMWF:{}},errors:{},requestedModelIds:['GFS','ECMWF']
})));
localStorage.setItem('meteocompare.web.bias.paris',JSON.stringify(envelope('bias',{
  reference:'ERA5',forecasts:[{modelId:'ECMWF',variable:'TEMPERATURE',targetDate:'2026-08-20',value:24}],observations:[{variable:'TEMPERATURE',targetDate:'2026-08-20',value:23}],updatedAt:Date.now(),lastRefreshReport:{modelIds:['GFS','ECMWF'],remainingModelIds:['ECMWF']}
})));
localStorage.setItem('meteocompare.web.evolution.paris',JSON.stringify(envelope('evolution',[{capturedAt:Date.now()-3600000,qualityVersion:2,daily:{'2026-08-29':{ECMWF:{temperature:26,precipitation:2,wind:20},GFS:{temperature:25,precipitation:1,wind:18}}}}])));
localStorage.setItem('meteocompare.web.health.paris',JSON.stringify(envelope('health',[{capturedAt:Date.now()-3600000,qualityVersion:2,rows:[{modelId:'ECMWF',status:'OK'},{modelId:'GFS',status:'OK'}]}])));

const storage=await import(`../../../js/storage.js?ifs9=${Date.now()}`);
assert.equal(storage.DATA_SCHEMA_VERSION,4);
const model=getModel('ECMWF');
assert.equal(model.apiKey,'ecmwf_ifs');
assert.equal(model.openDataKey,'ecmwf_ifs');
assert.equal(model.metadataKey,'ecmwf_ifs');
assert.equal(model.resolutionKm,9);
assert.equal(model.nativeStepMinutes,60);

const forecast=storage.loadForecast('paris');
assert.ok(forecast,'the remaining non-ECMWF cache should stay usable while a network refresh is scheduled');
assert.ok(forecast.seriesByModel.GFS);
assert.equal(forecast.seriesByModel.ECMWF,undefined,'cached 25 km ECMWF values must never be relabelled as the 9 km model');
assert.deepEqual(forecast.requestedModelIds,['GFS'],'removing ECMWF from requested ids makes freshness checks request the new 9 km source');
const migratedForecastEnvelope=JSON.parse(localStorage.getItem('meteocompare.web.forecast.paris'));
assert.equal(migratedForecastEnvelope.schemaVersion,4);
assert.equal(migratedForecastEnvelope.payload.modelMigrationRefreshRequired,true);

const bias=storage.loadBias('paris');
assert.equal(bias.forecasts[0].modelId,ECMWF_IFS025_LEGACY_ID,'25 km reliability history must retain a distinct legacy identity');
assert.deepEqual(bias.lastRefreshReport.modelIds,['GFS',ECMWF_IFS025_LEGACY_ID]);
assert.deepEqual(bias.lastRefreshReport.remainingModelIds,[ECMWF_IFS025_LEGACY_ID]);

const evolution=storage.loadEvolution('paris');
assert.ok(evolution[0].daily['2026-08-29'][ECMWF_IFS025_LEGACY_ID]);
assert.equal(evolution[0].daily['2026-08-29'].ECMWF,undefined,'run-to-run evolution must not compare 25 km history against new 9 km ECMWF');

const health=storage.loadModelHealth('paris');
assert.equal(health[0].rows[0].modelId,ECMWF_IFS025_LEGACY_ID,'old health incidents must not carry over to the new 9 km source');

const appSource=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
assert.match(appSource,/map\(x=>x\.modelId\)\)\]\.filter\(id=>Boolean\(getModel\(id\)\)\)/,'legacy model ids must be retained in storage but excluded from active reliability cohorts');

console.log('MeteoCompare Web ECMWF IFS 9 km storage migration tests: OK');
