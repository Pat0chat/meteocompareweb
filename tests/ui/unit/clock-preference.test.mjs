import assert from 'node:assert/strict';
import {formatLocalClock,formatInstantClock,normalizeTimeFormat,withClockPreference} from '../../../js/ui/solar.js';
import {normalizeSettings,DEFAULT_SETTINGS} from '../../../js/data/contracts.js';
import {saveSettings,loadSettings} from '../../../js/storage.js';
import {ensureLanguage,makeI18n} from '../../../js/i18n.js';

assert.equal(DEFAULT_SETTINGS.timeFormat,'H24');
assert.equal(normalizeTimeFormat('BAD'),'H24');
assert.equal(normalizeSettings({timeFormat:'BAD'}).timeFormat,'H24');
assert.equal(normalizeSettings({timeFormat:'H12'}).timeFormat,'H12');
assert.equal(formatLocalClock('2026-10-14T00:00','H24'),'00:00');
assert.equal(formatLocalClock('2026-10-14T00:00','H12'),'12:00 AM');
assert.equal(formatLocalClock('2026-10-14T12:00','H12'),'12:00 PM');
assert.equal(formatLocalClock('2026-10-14T13:05','H12'),'1:05 PM');
assert.equal(formatLocalClock('2026-10-14T23:59','H12'),'11:59 PM');
assert.equal(formatLocalClock('2026-10-14T23:59','H24'),'23:59');
assert.equal(formatLocalClock('2026-10-14T24:00','H12'),'—');
assert.equal(formatLocalClock('invalid','H12'),'—');

// Same instant, but time displayed in the forecast location (not the device timezone).
const utc=Date.parse('2026-07-01T00:05:00Z');
assert.equal(formatInstantClock(utc,'Europe/Paris','H24'),'02:05');
assert.equal(formatInstantClock(utc,'Europe/Paris','H12'),'2:05 AM');
assert.equal(formatInstantClock(utc,'America/New_York','H12'),'8:05 PM');
assert.equal(formatInstantClock(utc,'Asia/Tokyo','H24'),'09:05');
assert.equal(formatInstantClock(NaN,'UTC','H12'),'—');

// The locale may change the calendar labels, but NOT the chosen hour cycle.
for(const [lang,locale] of [['FRENCH','fr-FR'],['ENGLISH','en-GB'],['SPANISH','es-ES'],['GERMAN','de-DE'],['ITALIAN','it-IT']]){
  await ensureLanguage(lang);
  assert.equal(makeI18n(lang).locale,locale);
  assert.equal(formatLocalClock('2026-10-14T21:30','H12'),'9:30 PM');
  assert.equal(formatLocalClock('2026-10-14T21:30','H24'),'21:30');
  const options=withClockPreference({weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'},'H12');
  assert.equal(new Intl.DateTimeFormat(locale,options).resolvedOptions().hour12,true);
  assert.equal(new Intl.DateTimeFormat(locale,withClockPreference({timeStyle:'short'},'H24')).resolvedOptions().hourCycle,'h23');
}

// An existing setting survives a language change, persistence and reload.
const oldStorage=globalThis.localStorage;
const data=new Map();
globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},removeItem:key=>data.delete(key)};
try{
  let current=normalizeSettings({language:'FRENCH',timeFormat:'H12'});
  assert.equal(saveSettings(current),true);
  current=loadSettings();
  assert.equal(current.timeFormat,'H12');
  current.language='ITALIAN';
  saveSettings(current);
  assert.equal(loadSettings().timeFormat,'H12');
  assert.equal(loadSettings().language,'ITALIAN');
  current=normalizeSettings({language:'GERMAN',...loadSettings(),language:'GERMAN'});
  assert.equal(current.timeFormat,'H12');
}finally{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
console.log('12h/24h time preference, locale independence, timezone and storage: OK');
