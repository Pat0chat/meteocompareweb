import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const storage=fs.readFileSync(path.join(root,'js/storage.js'),'utf8');
const i18n=fs.readFileSync(path.join(root,'js/i18n.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

assert.match(app,/parts\[0\]==='data'/,'#/data route missing');
assert.match(app,/data-action="local-data"/,'Local data navigation button missing');
assert.match(app,/renderLocalDataPage\(\)/,'Local data page renderer missing');
assert.match(app,/inspectLocalData\(state\.cities\)/,'Storage inventory is not wired');
assert.match(app,/storageByCity/,'Per-city storage table missing');
assert.match(app,/privacyLocalTitle/,'Privacy section not moved to local data page');
assert.doesNotMatch(app,/function renderSettings\([\s\S]*?<h2>\$\{esc\(t\('privacy'\)\)\}/,'Privacy still rendered in settings');
assert.match(storage,/export async function inspectLocalData/,'Storage inspection API missing');
assert.match(storage,/navigator\.storage\?\.estimate/,'StorageManager usage/quota missing');
assert.match(storage,/idbListEntries/,'IndexedDB inventory missing');
assert.match(storage,/cacheStorageStats/,'CacheStorage inventory missing');
assert.match(css,/\.storage-kpis/,'Local data page styles missing');
assert.ok(Number(sw.match(/shell-v(\d+)-/)?.[1]||0)>=20,'PWA cache version must not regress below v20');
for(const key of ['localDataNav','localDataTitle','storageEstimatedApp','storageDatabase','storageBias','storageEvolution','privacyEraseTitle']){
  const hits=(i18n.match(new RegExp(`${key}:`,'g'))||[]).length;
  assert.ok(hits>=5,`${key} is not translated in all five web languages`);
}

class LocalStorageMock {
  constructor(){this.map=new Map();}
  get length(){return this.map.size;}
  key(i){return [...this.map.keys()][i]??null;}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(String(k),String(v));}
  removeItem(k){this.map.delete(String(k));}
}
globalThis.localStorage=new LocalStorageMock();
localStorage.setItem('meteocompare.web.cities.v1',JSON.stringify([{id:'paris',name:'Paris'}]));
localStorage.setItem('meteocompare.web.settings.v1',JSON.stringify({theme:'DARK',language:'FRENCH'}));
localStorage.setItem('meteocompare.web.evolution.paris',JSON.stringify([{capturedAt:1,daily:{}}]));
localStorage.setItem('meteocompare.web.bias.paris',JSON.stringify({forecasts:[{date:'2026-08-01'}],observations:[{date:'2026-08-01'}]}));
localStorage.setItem('meteocompare.web.normals.era5-v1.paris',JSON.stringify({normals:{'08-18':{min:12,max:24}}}));
localStorage.setItem('meteocompare.web.forecast.paris',JSON.stringify({seriesByModel:{gfs:{},ecmwf_ifs025:{}}}));

const mod=await import(pathToFileURL(path.join(root,'js/storage.js')).href+`?test=${Date.now()}`);
const stats=await mod.inspectLocalData([{id:'paris',name:'Paris'}]);
assert.equal(stats.categories.favorites.items,1);
assert.equal(stats.categories.forecasts.items,2);
assert.equal(stats.categories.bias.items,2);
assert.equal(stats.categories.evolution.items,1);
assert.equal(stats.cities[0].forecastModels,2);
assert.equal(stats.cities[0].biasForecasts,1);
assert.equal(stats.cities[0].biasObservations,1);
assert.ok(stats.localStorageBytes>0);
assert.ok(stats.appBytes>=stats.localStorageBytes);

console.log('MeteoCompare Web local data center tests: OK');
