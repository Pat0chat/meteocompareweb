import assert from 'node:assert/strict';
import { aggregateDay } from '../../../js/domain.js';

const ids=['ARPEGE_EUROPE','GFS','ECMWF'];
function series(){return {hourly:{timestamps:[],temperature2m:[],precipitation:[],precipitationProbability:[],cloudCover:[],windSpeed10m:[],windGusts10m:[],weatherCode:[]},daily:{dates:['2026-09-02','2026-09-03'],tempMin:[10,10],tempMax:[20,20],precipitationSum:[0,0],precipitationProbabilityMax:[0,0],windSpeedMax:[10,10],windGustsMax:[15,15],windDirection10mDominant:[180,180],weatherCode:[1,1],sunrise:[null,null],sunset:[null,null],completeness:{temperature:[{status:'FULL'},{status:'FULL'}],precipitation:[{status:'FULL'},{status:'FULL'}],wind:[{status:'FULL'},{status:'FULL'}],condition:[{status:'FULL'},{status:'FULL'}]}}};}
const forecast={fetchedAt:'2026-09-01T08:00:00Z',city:{timezone:'UTC'},seriesByModel:Object.fromEntries(ids.map(id=>[id,series()]))};
const calibration=Object.fromEntries(ids.map(id=>[id,{bias:2,score:80,standardDeviation:1,meanAbsoluteError:1,sampleSize:30,byLeadDay:{1:{bias:2,score:80,standardDeviation:1,meanAbsoluteError:1,sampleSize:30},2:{bias:-3,score:80,standardDeviation:1,meanAbsoluteError:1,sampleSize:30}}}]));
const options={forecastEngine:'CALIBRATION',calibrationByVariable:{temperature:calibration,wind:{},precipitation:{}},weightsByVariable:{}};
assert.equal(aggregateDay(forecast,'2026-09-02',options).tempMax,18,'D+1 must use the D+1 bias profile');
assert.equal(aggregateDay(forecast,'2026-09-03',options).tempMax,23,'D+2 must use the D+2 bias profile');
console.log('Daily horizon-aware calibration routing: OK');
