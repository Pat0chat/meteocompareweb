import assert from 'node:assert/strict';
import { CONDITION } from '../../../js/models.js';
import { inferCondition, skyConditionFromCloudCover, dailyCondition } from '../../../js/domain.js';

const cases=[
  [0,CONDITION.CLEAR],[19.999,CONDITION.CLEAR],
  [20,CONDITION.MAINLY_CLEAR],[44.999,CONDITION.MAINLY_CLEAR],
  [45,CONDITION.PARTLY_CLOUDY],[89.999,CONDITION.PARTLY_CLOUDY],
  [90,CONDITION.OVERCAST],[100,CONDITION.OVERCAST],
];
for(const [cloud,expected] of cases){
  assert.equal(skyConditionFromCloudCover(cloud),expected,`cloud cover ${cloud}% must map to ${expected}`);
  assert.equal(inferCondition(0,20,cloud),expected,`inferred sky at ${cloud}% must use the shared thresholds`);
}
assert.equal(skyConditionFromCloudCover(-1),null);
assert.equal(skyConditionFromCloudCover(101),null);

const day='2026-09-02';
function dailySeries({dailyCode,hourlyCodes=[3,3,3,3],clouds=[25,45,65,85],precipitation=[0,0,0,0]}={}){
  const timestamps=clouds.map((_,index)=>`${day}T${String(index*6).padStart(2,'0')}:00`);
  return {
    hourly:{timestamps,temperature2m:clouds.map(()=>18),precipitation,precipitationProbability:clouds.map(()=>10),cloudCover:clouds,windSpeed10m:clouds.map(()=>8),windGusts10m:clouds.map(()=>14),weatherCode:hourlyCodes},
    daily:{dates:[day],tempMin:[12],tempMax:[22],precipitationSum:[precipitation.reduce((sum,value)=>sum+value,0)],precipitationProbabilityMax:[10],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[dailyCode],sunrise:[null],sunset:[null]},
  };
}

const variableSky=dailyCondition(dailySeries({dailyCode:3}),day);
assert.equal(variableSky.condition,CONDITION.PARTLY_CLOUDY,'daily WMO 3 must yield to variable hourly cloud cover');
assert.equal(variableSky.inferred,true);

assert.deepEqual(dailyCondition(dailySeries({dailyCode:2,clouds:[],hourlyCodes:[]}),day),{condition:CONDITION.PARTLY_CLOUDY,inferred:false},'daily WMO 2 mapping must remain intact without hourly cloud evidence');
assert.deepEqual(dailyCondition(dailySeries({dailyCode:3,clouds:[],hourlyCodes:[]}),day),{condition:CONDITION.OVERCAST,inferred:false},'daily WMO 3 mapping must remain intact without hourly cloud evidence');

const dailyRain=dailyCondition(dailySeries({dailyCode:61,clouds:[5,10,15,20],hourlyCodes:[0,0,0,0]}),day);
assert.deepEqual(dailyRain,{condition:CONDITION.RAIN,inferred:false},'a significant daily WMO phenomenon must stay authoritative');

const hourlyStorm=dailyCondition(dailySeries({dailyCode:3,clouds:[10,20,30,40],hourlyCodes:[0,95,0,0]}),day);
assert.deepEqual(hourlyStorm,{condition:CONDITION.THUNDERSTORM,inferred:true},'a significant hourly WMO phenomenon must override a daily sky-only code');

console.log('Cloud-cover thresholds and daily WMO arbitration rules: OK');
