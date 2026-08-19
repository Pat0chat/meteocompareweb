import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const storageSource=read('js/storage.js'),app=read('js/app.js'),sw=read('sw.js');
assert.match(storageSource,/const PWA_CACHE_PREFIX = 'meteocompare-web-'/);
assert.match(storageSource,/export async function clearPwaRuntime\(\)/);
assert.match(storageSource,/export async function clearAllData\(\{includePwa=false\}=\{\}\)/);
assert.match(storageSource,/includePwa\?clearPwaRuntime\(\)/);
assert.match(storageSource,/caches\.keys\(\)\)\.filter\(name=>String\(name\)\.startsWith\(PWA_CACHE_PREFIX\)\)/);
assert.match(storageSource,/registration\?\.scope!==appScope/);
assert.match(app,/armPwaClearReloadGuard\(\);clearAllData\(\{includePwa:true\}\)/);
assert.match(app,/const skipPwaRegistration=consumePwaClearReloadGuard\(\)/);
assert.match(app,/if\(skipPwaRegistration\)pwaPostClearCleanup=clearPwaRuntime\(\)/);
assert.match(app,/await pwaPostClearCleanup;state\.localDataStats=await inspectLocalData/);
assert.match(sw,/const CACHE_PREFIX = 'meteocompare-web-'/);
assert.match(sw,/key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/);
assert.match(sw,/const APP_VERSION = '1\.10\.10'/);
assert.match(sw,/const CACHE_VERSION = 'v40-clarity-pages'/);

class LocalStorageMock {
  constructor(){this.map=new Map();}
  get length(){return this.map.size;}
  key(i){return [...this.map.keys()][i]??null;}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(String(k),String(v));}
  removeItem(k){this.map.delete(String(k));}
}
globalThis.localStorage=new LocalStorageMock();
localStorage.setItem('meteocompare.web.settings.v1','{}');
localStorage.setItem('foreign.key','keep');
Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true});
const cacheNames=['meteocompare-web-old-shell','unrelated-app-cache'];
const deleted=[];
globalThis.caches={
  async keys(){return [...cacheNames];},
  async delete(name){deleted.push(name);return true;},
  async open(name){throw new Error(`unexpected open ${name}`);}
};
const unregistered=[];
Object.defineProperty(globalThis,'document',{value:{baseURI:'https://example.test/meteocompare/'},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{serviceWorker:{async getRegistrations(){return [
  {scope:'https://example.test/meteocompare/',async unregister(){unregistered.push('mc');return true;}},
  {scope:'https://example.test/other/',async unregister(){unregistered.push('other');return true;}}
];}}},configurable:true});
const mod=await import(pathToFileURL(path.join(root,'js/storage.js')).href+`?clear=${Date.now()}`);
const result=await mod.clearAllData({includePwa:true});
assert.equal(localStorage.getItem('meteocompare.web.settings.v1'),null);
assert.equal(localStorage.getItem('foreign.key'),'keep');
assert.deepEqual(deleted,['meteocompare-web-old-shell']);
assert.deepEqual(unregistered,['mc']);
assert.equal(result.cachesDeleted,1);
assert.equal(result.registrationsUnregistered,1);
console.log('MeteoCompare Web PWA full local clear 1.10.8 tests: OK');
