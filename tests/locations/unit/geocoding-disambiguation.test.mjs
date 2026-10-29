import assert from 'node:assert/strict';
import { normalizeGeocodingResults, citySearchLocationLabel } from '../../../js/api.js';
import { normalizeCity } from '../../../js/data/contracts.js';

const city=(id,name,latitude,longitude,admin2='',admin3='',country='United Kingdom',admin1='England',extras={})=>({
  id,name,latitude,longitude,admin1,admin2,admin3,country,country_code:'GB',timezone:'Europe/London',...extras,
});
const raw=[
  city(101,'Coleford',51.794,-2.617,'Gloucestershire','Forest of Dean'),
  city(102,'Coleford',51.304,-2.445,'Somerset','Mendip'),
  city(103,'Coleford',50.794,-3.717,'Devon','Mid Devon'),
  city(104,'Coleford',51.79401,-2.61701,'Gloucestershire','Forest of Dean'), // GeoNames equivalent
  city(105,'Coleford',51.800,-2.630,'Gloucestershire','Forest of Dean'), // real distinct point
  city(106,'Coleford',-29.1,30.9,'KwaZulu-Natal','','South Africa','', {country_code:'ZA'}),
  city(107,'Coleford',51.794,-2.617,'Gloucestershire','Different district'), // do not erase conflicting admin
  city(108,'Coleford Water',51.95,-2.5,'Gloucestershire','Forest of Dean'),
  city(101,'Coleford',51.794,-2.617,'Gloucestershire','Forest of Dean'), // duplicate ID
];
const results=normalizeGeocodingResults(raw);
assert.deepEqual(results.map(r=>r.id),['101','102','103','105','106','107','108']);
assert.equal(results[0].admin3,'Forest of Dean');
assert.match(citySearchLocationLabel(results[0],results),/Forest of Dean, Gloucestershire, England, United Kingdom/);
assert.match(citySearchLocationLabel(results[1],results),/Mendip, Somerset, England, United Kingdom/);
assert.match(citySearchLocationLabel(results[2],results),/Mid Devon, Devon, England, United Kingdom/);
assert.match(citySearchLocationLabel(results[4],results),/KwaZulu-Natal, South Africa/);
assert.equal(results[0].id,'101','the original geocoding ID remains selectable');
assert.notEqual(citySearchLocationLabel(results[0],results),citySearchLocationLabel(results[1],results));
assert.match(citySearchLocationLabel(results[0],results),/51\.7940°, -2\.6170°/, 'a remaining same-name/same-admin collision is distinguished by coordinates');
assert.match(citySearchLocationLabel(results[3],results),/51\.8000°, -2\.6300°/);
assert.equal(normalizeGeocodingResults(null).length,0);
assert.equal(normalizeGeocodingResults([{id:'bad',name:'Invalid',latitude:999,longitude:12}]).length,0);
assert.equal(normalizeGeocodingResults(raw,3).length,3);

const translated=normalizeGeocodingResults([city(201,'Coleford',51.794,-2.617,'Gloucestershire','Forest of Dean','Royaume-Uni','Angleterre')])[0];
assert.match(citySearchLocationLabel(translated,[translated]),/Angleterre, Royaume-Uni/,'the geocoder localization is kept');
const berlin=normalizeCity({id:1,name:'Berlin',admin4:'Berlin',admin3:'Berlin, Stadt',admin1:'Berlin',country:'Deutschland',latitude:52.52,longitude:13.40});
assert.equal(citySearchLocationLabel(berlin,[berlin]),'Berlin, Stadt, Deutschland','repeated city/region labels do not clutter the subtitle');
const sparse=normalizeCity({id:2,name:'Unnamed',latitude:11.33333,longitude:-4.11111});
assert.match(citySearchLocationLabel(sparse,[sparse]),/11\.3333°, -4\.1111°/,'missing administrative data must not produce blank labels');
const noHierarchy=normalizeGeocodingResults([
  city(301,'Springfield',42.1,-72.5,'','','United States','',{country_code:'US',postcodes:['01103']}),
  city(302,'Springfield',39.78,-89.64,'','','United States','',{country_code:'US',postcodes:['62701']}),
]);
assert.match(citySearchLocationLabel(noHierarchy[0],noHierarchy),/01103/,'a unique postal code can clarify an otherwise ambiguous result');
assert.match(citySearchLocationLabel(noHierarchy[1],noHierarchy),/62701/);
const identicalPostcodes=normalizeGeocodingResults([
  city(401,'Springfield',40,-88,'','','United States','',{country_code:'US',postcodes:['12345']}),
  city(402,'Springfield',41,-89,'','','United States','',{country_code:'US',postcodes:['12345']}),
]);
assert.match(citySearchLocationLabel(identicalPostcodes[0],identicalPostcodes),/40\.0000°/,'shared postcodes cannot disambiguate places');
console.log('Geocoding: administrative subdivisions, true duplicates, localization and ambiguous names: OK');
