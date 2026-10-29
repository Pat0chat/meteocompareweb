import assert from 'node:assert/strict';
import { normalizeCity } from '../../../js/data/contracts.js';
import { citySearchLocationLabel } from '../../../js/api.js';

const saved = normalizeCity({
  id: '101', name: 'Coleford', latitude: 51.794, longitude: -2.617,
  admin1: 'England', admin2: 'Gloucestershire', admin3: 'Forest of Dean',
  country: 'United Kingdom', countryCode: 'GB', postcodes: ['GL16'],
});
assert.ok(saved, 'a selected search city is accepted as a saved favorite');
assert.equal(citySearchLocationLabel(saved, [saved]), 'Forest of Dean, Gloucestershire, England, United Kingdom');
const persisted = normalizeCity(JSON.parse(JSON.stringify(saved)));
assert.equal(citySearchLocationLabel(persisted, [persisted]), citySearchLocationLabel(saved, [saved]), 'saved/loaded cities retain the locality hierarchy');

const homonym = normalizeCity({...saved, id:'102',latitude:51.800,longitude:-2.630});
assert.match(citySearchLocationLabel(saved,[saved,homonym]),/51\.7940°, -2\.6170°/,'same-name saved favorites must be distinguishable');
assert.match(citySearchLocationLabel(homonym,[saved,homonym]),/51\.8000°, -2\.6300°/);

const legacy = normalizeCity({id:'old',name:'Quimper',latitude:47.9975,longitude:-4.0979,region:'Bretagne',department:'Finistère',country:'France'});
assert.equal(citySearchLocationLabel(legacy,[legacy]),'Finistère, Bretagne, France','existing favorites with legacy region/department fields retain their location');
const fallback = normalizeCity({id:'sparse',name:'Place',latitude:40,longitude:-75});
assert.match(citySearchLocationLabel(fallback,[fallback]),/40\.0000°, -75\.0000°/,'sparse legacy favorite still shows an identifying location');

const html=normalizeCity({id:'unsafe',name:'Place',latitude:12,longitude:13,admin2:'<script>',country:'X'});
assert.ok(citySearchLocationLabel(html,[html]).includes('<script>'),'location text must be escaped by UI renderers');
console.log('Home/detail geographic detail: complete hierarchy, old favorites, homonyms and missing data: OK');
