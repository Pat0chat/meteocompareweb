import assert from 'node:assert/strict';
import fs from 'node:fs';

class LocalStorageMock{
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

const storage=await import('../js/storage.js');
const {APP_VERSION}=await import('../js/version.js');
assert.ok(Number(APP_VERSION.split('.')[0])>1 || (Number(APP_VERSION.split('.')[0])===1 && Number(APP_VERSION.split('.')[1])>=9));

const city={id:'coast',name:'Coast',latitude:43.29,longitude:5.37,timezone:'Europe/Paris'};
storage.saveSettings({...storage.defaultSettings,enabledModelIds:['GFS'],theme:'DARK'});
localStorage.setItem('meteocompare.web.analytics.optout.v1','1');
storage.saveCities([city]);
storage.saveBias(city.id,{forecasts:[{modelId:'GFS'}],observations:[{variable:'TEMPERATURE'}],updatedAt:1});
storage.saveEvolution(city.id,[{capturedAt:1,daily:{'2026-08-18':{GFS:{temperature:25}}}}]);
storage.saveNormals(city.id,{computedAt:1,normals:{'08-18':{tempMax:25,tempMin:15}}});
storage.saveMarine(city.id,{fetchedAt:new Date().toISOString(),hourly:{timestamps:['2026-08-18T12:00'],waveHeight:[1.2]}});
const backup=await storage.createLocalBackup([city],{normals:true,bias:true,evolution:true,marine:true});
assert.equal(backup.type,'meteocompare-backup');
assert.equal(backup.appVersion,APP_VERSION);
assert.equal(backup.data.cities.length,1);
assert.equal(backup.data.bias.coast.forecasts.length,1);
assert.ok(backup.data.marine.coast);
assert.equal(backup.privacy.analyticsOptOut,true);

storage.saveCities([]);storage.saveSettings({...storage.defaultSettings,theme:'LIGHT'});
const restored=await storage.restoreLocalBackup(backup,{replace:true});
assert.equal(restored.cities,1);
assert.equal(storage.loadCities()[0].id,'coast');
assert.equal(storage.loadSettings().theme,'DARK');
assert.equal(storage.loadBias('coast').forecasts.length,1);
assert.ok(storage.loadMarine('coast'));
assert.equal(localStorage.getItem('meteocompare.web.analytics.optout.v1'),'1','analytics opt-out must survive restore');

const marine=await import('../js/features/marine.js');
const raw={latitude:43.30,longitude:5.38,timezone:'Europe/Paris',hourly:{time:Array.from({length:12},(_,i)=>`2026-08-18T${String(i).padStart(2,'0')}:00`),wave_height:Array(12).fill(1.1),wave_direction:Array(12).fill(180),wave_period:Array(12).fill(7),swell_wave_height:Array(12).fill(.8),swell_wave_direction:Array(12).fill(190),swell_wave_period:Array(12).fill(9),sea_surface_temperature:Array(12).fill(24)},daily:{time:['2026-08-18'],wave_height_max:[1.5],wave_direction_dominant:[180],wave_period_max:[8],swell_wave_height_max:[1],swell_wave_direction_dominant:[190],swell_wave_period_max:[10]}};
const marineData=marine.normalizeMarine(raw,city);assert.equal(marineData.coastal,true);assert.equal(marineData.usablePoints,12);
const inland=marine.normalizeMarine({...raw,latitude:46,longitude:7},city);assert.equal(inland.coastal,false);

let calls=0;globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {ok:true,headers:{get:()=>null},json:async()=>({value:1})};};
const budget=await import('../js/api-budget.js');budget.resetApiUsage();
const [a,b]=await Promise.all([budget.fetchOpenMeteoJson('https://api.open-meteo.com/test',{category:'forecast'}),budget.fetchOpenMeteoJson('https://api.open-meteo.com/test',{category:'forecast'})]);
assert.equal(calls,1,'identical in-flight requests must be deduplicated');assert.deepEqual(a,b);assert.equal(budget.apiUsageSnapshot().day,1);

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),sw=read('sw.js'),release=read('.github/workflows/release.yml'),rollback=read('.github/workflows/rollback.yml'),marineSource=read('js/features/marine.js');
assert.match(app,/data-action="export-backup"/);
assert.doesNotMatch(marineSource,/searchParams\.set\('daily'/,'Marine must derive daily summaries locally instead of requesting extra daily variables');
assert.match(marineSource,/wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature/);assert.match(app,/data-action="import-backup"/);assert.match(app,/activate-marine/);assert.match(app,/apiUsageSnapshot/);
assert.match(sw,/const APP_VERSION = '\d+\.\d+\.\d+'/);assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);assert.match(sw,/features\/marine\.js/);
assert.match(release,/tags: \['v\*\.\*\.\*'\]/);assert.match(release,/gh release create/);assert.match(release,/sha256sum/);assert.match(release,/releases\/generate-notes/);assert.match(release,/CHANGELOG-\$\{GITHUB_REF_NAME\}\.md/);
assert.match(rollback,/workflow_dispatch/);assert.match(rollback,/ref: \$\{\{ inputs\.tag \}\}/);assert.match(rollback,/deploy-pages/);
console.log('MeteoCompare production foundation tests: OK');
