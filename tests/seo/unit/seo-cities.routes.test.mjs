import assert from 'node:assert/strict';
import { SEO_CITIES, slugifyCityName, seoCityBySlug, seoCityById, matchSeoCity, cityPublicPath, nearbySeoCities } from '../../../js/seo-cities.mjs';

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
assert.equal(cityPublicPath(custom),'/meteo/saint-test?id=custom%3A123');
const nearby=nearbySeoCities(paris,6);
assert.equal(nearby.length,6);
assert.equal(new Set(nearby.map(city=>city.id)).size,6);
assert.ok(nearby.every(city=>city.id!==paris.id));
assert.deepEqual(nearbySeoCities(paris,0),[]);

console.log('SEO city matching, slugs and public routes: OK');
