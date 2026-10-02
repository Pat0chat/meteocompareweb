import assert from 'node:assert/strict';
import { SEO_CITIES, SEO_GLOBAL_CITIES, slugifyCityName, seoCityBySlug, seoCityById, matchSeoCity, cityPublicPath } from '../../../js/seo-cities.mjs';

assert.ok(SEO_CITIES.length>=40,'SEO city catalog should remain broad enough for static discovery');
assert.equal(Object.isFrozen(SEO_CITIES),true);
assert.equal(Object.isFrozen(SEO_CITIES[0]),true);
assert.equal(slugifyCityName("L'Haÿ-les-Roses"),'l-hay-les-roses');
assert.equal(slugifyCityName('  Aix  en   Provence '),'aix-en-provence');

const paris=seoCityBySlug('PARIS');
assert.ok(paris);
assert.equal(paris.name,'Paris');
assert.equal(seoCityById(paris.id),paris);
assert.equal(matchSeoCity({...paris}),paris);
assert.equal(matchSeoCity({id:'custom',name:'Paris',latitude:paris.latitude+0.01,longitude:paris.longitude+0.01}),paris);
assert.equal(matchSeoCity({id:'custom',name:'Paris',latitude:0,longitude:0}),null,'same name far from the catalog city must not be falsely canonicalized');

assert.equal(cityPublicPath(paris),'/meteo/paris');
const custom={id:'custom:123',name:'Saint Test',latitude:1,longitude:2,timezone:'UTC'};
const customPath=cityPublicPath(custom);
assert.match(customPath,/^\/meteo\/saint-test\?/);
const customQuery=new URLSearchParams(customPath.split('?')[1]);
assert.equal(customQuery.get('id'),'custom:123');
assert.equal(customQuery.get('name'),'Saint Test');
assert.equal(customQuery.get('lat'),'1.00000');
assert.equal(customQuery.get('lon'),'2.00000');
assert.equal(customQuery.get('tz'),'UTC');


assert.equal(SEO_CITIES.length,178);
assert.equal(SEO_GLOBAL_CITIES.length,100);
assert.deepEqual(SEO_GLOBAL_CITIES.map(city=>city.globalRank),Array.from({length:100},(_,index)=>index+1),'global destination ranks must stay complete and ordered');
assert.ok(new Set(SEO_GLOBAL_CITIES.map(city=>city.countryCode)).size>=35,'global catalog should keep broad country coverage');
for(const city of SEO_CITIES){
  assert.ok(Number.isFinite(city.latitude)&&Math.abs(city.latitude)<=90,`${city.slug}: latitude must be valid`);
  assert.ok(Number.isFinite(city.longitude)&&Math.abs(city.longitude)<=180,`${city.slug}: longitude must be valid`);
  assert.match(city.countryCode,/^[A-Z]{2}$/,`${city.slug}: ISO country code must be present`);
  assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:city.timezone}),`${city.slug}: timezone must be a valid IANA identifier`);
}
for(const [slug,name,countryCode] of [['tokyo','Tokyo','JP'],['new-york','New York','US'],['sydney','Sydney','AU'],['bangkok','Bangkok','TH'],['cairo','Cairo','EG'],['buenos-aires','Buenos Aires','AR']]){
  const city=seoCityBySlug(slug);assert.ok(city,`${slug}: international city must resolve`);assert.equal(city.name,name);assert.equal(city.countryCode,countryCode);assert.equal(cityPublicPath(city),`/meteo/${slug}`);
}
const tokyo=seoCityBySlug('tokyo');
assert.equal(matchSeoCity({id:'custom',name:'Tokyo',latitude:tokyo.latitude+0.005,longitude:tokyo.longitude+0.005}),tokyo,'geocoded international cities should canonicalize to their SEO route');

console.log('SEO city matching, slugs and public routes: OK');
