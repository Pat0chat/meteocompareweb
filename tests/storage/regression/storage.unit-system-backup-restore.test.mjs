import assert from 'node:assert/strict';

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
const storage=await import(`../../../js/storage.js?unit-system-backup=${Date.now()}`);

storage.saveSettings({...storage.defaultSettings,unitSystem:'IMPERIAL'});
assert.equal(storage.loadSettings().unitSystem,'IMPERIAL','the selected unit system must persist locally');
const backup=await storage.createLocalBackup([]);
assert.equal(backup.data.settings.unitSystem,'IMPERIAL','backup must preserve the unit preference');

storage.saveSettings({...storage.defaultSettings,unitSystem:'METRIC'});
await storage.restoreLocalBackup(backup,{replace:true});
assert.equal(storage.loadSettings().unitSystem,'IMPERIAL','restore must recover the unit preference');

const legacy=structuredClone(backup);delete legacy.data.settings.unitSystem;
await storage.restoreLocalBackup(legacy,{replace:true});
assert.equal(storage.loadSettings().unitSystem,'METRIC','legacy backups without unitSystem must safely default to metric');

const invalid=structuredClone(backup);invalid.data.settings.unitSystem='KELVIN';
await storage.restoreLocalBackup(invalid,{replace:true});
assert.equal(storage.loadSettings().unitSystem,'METRIC','invalid imported unit systems must be normalized to metric');
// UK survives app restarts, language switches and exported backups.
storage.saveSettings({...storage.defaultSettings,unitSystem:'UK',language:'ENGLISH'});
assert.equal(storage.loadSettings().unitSystem,'UK');
storage.saveSettings({...storage.loadSettings(),language:'FRENCH'});
assert.equal(storage.loadSettings().unitSystem,'UK','language changes must preserve the unit profile');
const ukBackup=await storage.createLocalBackup([]);
assert.equal(ukBackup.data.settings.unitSystem,'UK');
storage.saveSettings({...storage.defaultSettings,unitSystem:'METRIC'});
await storage.restoreLocalBackup(ukBackup,{replace:true});
assert.equal(storage.loadSettings().unitSystem,'UK','restore must preserve UK measurements');

console.log('unit-system backup/restore: OK');
