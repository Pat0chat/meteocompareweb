import assert from 'node:assert/strict';
import { resolveFrenchDepartment, isVigilanceSupportedCity, vigilanceMaxLevel, activeVigilancePhenomena } from '../../../js/features/vigilance.js';

const essonne=await resolveFrenchDepartment({id:'gif',name:'Gif-sur-Yvette',country:'France',countryCode:'FR',admin2:'Essonne',latitude:48.7,longitude:2.13});
assert.equal(essonne.supported,true);
assert.equal(essonne.code,'91');

const finistere=await resolveFrenchDepartment({id:'brest',name:'Brest',country:'France',countryCode:'FR',admin2:'Finistère',latitude:48.39,longitude:-4.49});
assert.equal(finistere.code,'29');

const corse=await resolveFrenchDepartment({id:'ajaccio',name:'Ajaccio',country:'France',countryCode:'FR',admin2:'Corse-du-Sud',postcodes:['20000'],latitude:41.92,longitude:8.74});
assert.equal(corse.code,'2A');


assert.equal(isVigilanceSupportedCity(essonne.supported?{country:'France',countryCode:'FR',admin2:'Essonne'}:{}),true);
assert.equal(isVigilanceSupportedCity({name:'Bruxelles',country:'Belgique',countryCode:'BE'}),false);
assert.equal(isVigilanceSupportedCity({name:'Pointe-à-Pitre',country:'France',countryCode:'FR',admin2:'Guadeloupe',postcodes:['97110']}),false);
const guadeloupe=await resolveFrenchDepartment({id:'pap',name:'Pointe-à-Pitre',country:'France',countryCode:'FR',admin2:'Guadeloupe',postcodes:['97110'],latitude:16.24,longitude:-61.53});
assert.equal(guadeloupe.supported,false);
assert.equal(guadeloupe.reason,'NOT_COVERED');

const foreign=await resolveFrenchDepartment({id:'brussels',name:'Bruxelles',country:'Belgique',countryCode:'BE',latitude:50.85,longitude:4.35});
assert.equal(foreign.supported,false);
assert.equal(foreign.reason,'NOT_FRANCE');

const payload={periods:[{maxColorId:3,phenomena:[{id:'2',maxColorId:3,intervals:[{colorId:3}]},{id:'3',maxColorId:2,intervals:[{colorId:2}]}]}]};
assert.equal(vigilanceMaxLevel(payload),3);
assert.deepEqual(activeVigilancePhenomena(payload).map(row=>row.id),['2','3']);
console.log('Vigilance department resolution and significant phenomena: OK');
