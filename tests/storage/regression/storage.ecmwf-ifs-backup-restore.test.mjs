import assert from 'node:assert/strict';
import { ECMWF_IFS025_LEGACY_ID } from '../../../js/models.js';

class LocalStorageMock {
  constructor(){this.map=new Map();}
  get length(){return this.map.size;}
  key(i){return [...this.map.keys()][i]??null;}
  getItem(k){return this.map.has(String(k))?this.map.get(String(k)):null;}
  setItem(k,v){this.map.set(String(k),String(v));}
  removeItem(k){this.map.delete(String(k));}
  clear(){this.map.clear();}
}

globalThis.localStorage=new LocalStorageMock();
Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true});
const storage=await import(`../../../js/storage.js?backup-ifs9=${Date.now()}`);

const city={id:'paris',name:'Paris',admin1:'Île-de-France',country:'France',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
function series(modelId='ECMWF'){
  return {
    modelId,
    hourly:{timestamps:['2026-08-28T08:00'],timestampEpochMs:[Date.parse('2026-08-28T06:00:00Z')],temperature2m:[20],precipitation:[0],precipitationProbability:[null],cloudCover:[30],windSpeed10m:[12],windDirection10m:[180],windGusts10m:[20],weatherCode:[1]},
    daily:{dates:['2026-08-28'],tempMax:[25],tempMin:[16],precipitationSum:[0],precipitationProbabilityMax:[null],windSpeedMax:[18],windGustsMax:[28],windDirection10mDominant:[180],weatherCode:[1],sunrise:['2026-08-28T06:50'],sunset:['2026-08-28T20:40']},
  };
}
function baseBackup(dataSchemaVersion){
  return {
    type:'meteocompare-backup',formatVersion:1,dataSchemaVersion,appVersion:'legacy-schema-fixture',exportedAt:'2026-08-27T12:00:00.000Z',privacy:{analyticsOptOut:false},
    data:{
      settings:{...storage.defaultSettings,enabledModelIds:['GFS','ECMWF']},cities:[city],normals:{},marine:{},
      forecasts:{paris:{city,timezone:city.timezone,fetchedAt:'2026-08-27T12:00:00.000Z',seriesByModel:{GFS:series('GFS'),ECMWF:series('ECMWF')},modelMeta:{GFS:{},ECMWF:{}},errors:{},requestedModelIds:['GFS','ECMWF']}},
      bias:{paris:{reference:'ERA5',forecasts:[{modelId:'ECMWF',variable:'TEMPERATURE',targetDate:'2026-08-20',value:24}],observations:[{variable:'TEMPERATURE',targetDate:'2026-08-20',value:23}],updatedAt:1,lastRefreshReport:{modelIds:['ECMWF'],remainingModelIds:['ECMWF']}}},
      evolution:{paris:[{capturedAt:1,qualityVersion:2,daily:{'2026-08-29':{ECMWF:{temperature:26,precipitation:2,wind:20}}}}]},
      health:{paris:[{capturedAt:1,qualityVersion:2,rows:[{modelId:'ECMWF',status:'OK'}]}]},
    },
  };
}

// A pre-v4 backup contains the old 25 km source under the stable UI id ECMWF.
// Restoring it must not silently relabel any of those records as IFS HRES 9 km.
const oldBackup=baseBackup(3);
await storage.restoreLocalBackup(oldBackup,{replace:true});
const forecast=storage.loadForecast('paris');
assert.ok(forecast?.seriesByModel?.GFS,'unaffected models from an old backup should remain reusable');
assert.equal(forecast?.seriesByModel?.ECMWF,undefined,'old backup forecast values must not be restored as active ECMWF 9 km');
assert.deepEqual(forecast?.requestedModelIds,['GFS'],'old ECMWF must be removed from freshness coverage so the 9 km model is fetched again');
assert.equal(storage.loadBias('paris').forecasts[0].modelId,ECMWF_IFS025_LEGACY_ID,'old reliability history must stay legacy after backup restore');
assert.equal(storage.loadEvolution('paris')[0].daily['2026-08-29'][ECMWF_IFS025_LEGACY_ID].temperature,26,'old evolution history must remain attributable to IFS 25 km');
assert.equal(storage.loadModelHealth('paris')[0].rows[0].modelId,ECMWF_IFS025_LEGACY_ID,'old health history must not contaminate IFS 9 km incident counts');

// A v4 backup is already source-aware and must preserve a genuine 9 km ECMWF record.
const freshBackup=baseBackup(4);
freshBackup.appVersion='current-schema-fixture';
freshBackup.data.forecasts.paris.modelMeta.ECMWF={sourceApiKey:'ecmwf_ifs',resolutionKm:9};
freshBackup.data.bias.paris.forecasts[0].modelId='ECMWF';
freshBackup.data.evolution.paris[0].daily['2026-08-29']={ECMWF:{temperature:26,precipitation:2,wind:20}};
freshBackup.data.health.paris[0].rows[0].modelId='ECMWF';
await storage.restoreLocalBackup(freshBackup,{replace:true});
const fresh=storage.loadForecast('paris');
assert.ok(fresh?.seriesByModel?.ECMWF,'current-schema IFS 9 km backups must preserve the active ECMWF series');
assert.equal(fresh.modelMeta.ECMWF.sourceApiKey,'ecmwf_ifs');
assert.equal(fresh.modelMeta.ECMWF.resolutionKm,9);
assert.equal(storage.loadBias('paris').forecasts[0].modelId,'ECMWF');
assert.ok(storage.loadEvolution('paris')[0].daily['2026-08-29'].ECMWF);
assert.equal(storage.loadModelHealth('paris')[0].rows[0].modelId,'ECMWF');

console.log('ECMWF IFS 9 km backup restore migration: OK');
