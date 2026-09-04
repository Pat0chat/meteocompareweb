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
  const length=Math.max(hourlyCodes.length,clouds.length,precipitation.length),timestamps=Array.from({length},(_,index)=>`${day}T${String(index).padStart(2,'0')}:00`);
  const fill=(values,fallback)=>Array.from({length},(_,index)=>values[index]??fallback);
  return {
    hourly:{timestamps,temperature2m:fill([],18),precipitation:fill(precipitation,0),precipitationProbability:fill([],10),cloudCover:fill(clouds,50),windSpeed10m:fill([],8),windGusts10m:fill([],14),weatherCode:fill(hourlyCodes,null)},
    daily:{dates:[day],tempMin:[12],tempMax:[22],precipitationSum:[precipitation.reduce((sum,value)=>sum+(Number(value)||0),0)],precipitationProbabilityMax:[10],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[dailyCode],sunrise:[null],sunset:[null]},
  };
}

const nativeHourlySky=dailyCondition(dailySeries({dailyCode:3}),day);
assert.deepEqual(nativeHourlySky,{condition:CONDITION.OVERCAST,inferred:false,conditionSource:'HOURLY_WMO_AGGREGATE'},'hourly WMO sky codes must stay native and must not be replaced by cloud-cover inference');

const gifLike=dailyCondition(dailySeries({
  dailyCode:3,
  hourlyCodes:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,3,3,3],
  clouds:[10,10,12,12,15,15,18,18,20,20,22,22,24,24,25,25,28,30,35,40,45,81,92,99],
}),day);
assert.deepEqual(gifLike,{condition:CONDITION.MAINLY_CLEAR,inferred:false,conditionSource:'HOURLY_WMO_AGGREGATE'},'a severe daily sky code must yield to the dominant hourly WMO sky state without becoming inferred');

assert.deepEqual(dailyCondition(dailySeries({dailyCode:2,clouds:[],hourlyCodes:[]}),day),{condition:CONDITION.PARTLY_CLOUDY,inferred:false,conditionSource:'DAILY_WMO_NATIVE'},'daily WMO 2 mapping must remain intact when hourly WMO evidence is unavailable');
assert.deepEqual(dailyCondition(dailySeries({dailyCode:3,clouds:[],hourlyCodes:[]}),day),{condition:CONDITION.OVERCAST,inferred:false,conditionSource:'DAILY_WMO_NATIVE'},'daily WMO 3 mapping must remain intact when hourly WMO evidence is unavailable');

const dailyRain=dailyCondition(dailySeries({dailyCode:61,clouds:[5,10,15,20],hourlyCodes:[0,0,0,0]}),day);
assert.deepEqual(dailyRain,{condition:CONDITION.RAIN,inferred:false,conditionSource:'DAILY_WMO_NATIVE'},'a significant daily WMO phenomenon must stay authoritative');

const hourlyDominant=dailyCondition(dailySeries({dailyCode:3,clouds:[10,20,30,40],hourlyCodes:[0,95,0,0]}),day);
assert.deepEqual(hourlyDominant,{condition:CONDITION.CLEAR,inferred:false,conditionSource:'HOURLY_WMO_AGGREGATE'},'an isolated severe hourly code must not turn a dry sky day into an inferred severe condition');

const derived=dailyCondition(dailySeries({dailyCode:null,hourlyCodes:[null,null,null,null],clouds:[25,45,65,85]}),day);
assert.deepEqual(derived,{condition:CONDITION.PARTLY_CLOUDY,inferred:true,conditionSource:'DERIVED_VARIABLES'},'cloud-cover fallback must be the only daily sky path marked inferred');

console.log('Cloud-cover thresholds and daily WMO provenance/arbitration rules: OK');
