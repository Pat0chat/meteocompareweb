import assert from 'node:assert/strict';
import { weatherConditionConsensus } from '../../../js/consensus.js';
import { conditionInfo } from '../../../js/domain.js';
import { CONDITION } from '../../../js/models.js';

const severity=value=>conditionInfo(value).severity;
const entries=values=>values.map((value,index)=>({modelId:`FAMILY_${index+1}`,value}));
const vote=values=>weatherConditionConsensus(entries(values),{},severity);

{
  const result=vote([
    CONDITION.CLEAR,CONDITION.CLEAR,CONDITION.CLEAR,
    CONDITION.DRIZZLE,CONDITION.DRIZZLE,
    CONDITION.RAIN,CONDITION.RAIN,
    CONDITION.RAIN_SHOWERS,CONDITION.RAIN_SHOWERS,
  ]);
  assert.equal(result.phenomenonGroup,'PRECIPITATION','liquid precipitation variants must aggregate before competing with dry sky conditions');
  assert.equal(result.group,'LIQUID');
  assert.equal(result.value,CONDITION.RAIN,'an evenly fragmented drizzle/rain/showers signal must resolve to the central liquid-precipitation subtype');
}

{
  const result=vote([
    CONDITION.OVERCAST,CONDITION.OVERCAST,CONDITION.OVERCAST,
    CONDITION.SNOW,CONDITION.SNOW,
    CONDITION.SNOW_SHOWERS,CONDITION.SNOW_SHOWERS,
    CONDITION.FREEZING_RAIN,CONDITION.FREEZING_RAIN,
  ]);
  assert.equal(result.phenomenonGroup,'PRECIPITATION');
  assert.equal(result.group,'SNOW','snow + snow-showers must aggregate as one family before competing with freezing rain');
  assert.equal(result.value,CONDITION.SNOW,'an exact snow/snow-showers tie must use the lower ordinal median rather than severity');
}

{
  const result=vote([
    CONDITION.OVERCAST,CONDITION.OVERCAST,CONDITION.OVERCAST,CONDITION.OVERCAST,
    CONDITION.RAIN,CONDITION.RAIN,
    CONDITION.SNOW,CONDITION.SNOW,
    CONDITION.THUNDERSTORM,CONDITION.THUNDERSTORM,
  ]);
  assert.equal(result.phenomenonGroup,'PRECIPITATION','different precipitation families must not be fragmented into a false dry majority');
  assert.equal(result.group,'THUNDER','a true tie between precipitation families must retain the conservative hazard tie-breaker');
  assert.equal(result.value,CONDITION.THUNDERSTORM);
}

{
  const result=vote([
    CONDITION.RAIN,CONDITION.RAIN,CONDITION.RAIN,
    CONDITION.RAIN_SHOWERS,CONDITION.RAIN_SHOWERS,CONDITION.RAIN_SHOWERS,
  ]);
  assert.equal(result.value,CONDITION.RAIN,'rain/rain-showers ties must resolve within their family without choosing the more severe subtype automatically');
}

{
  const result=vote([
    CONDITION.CLEAR,CONDITION.CLEAR,CONDITION.CLEAR,
    CONDITION.RAIN,CONDITION.RAIN,CONDITION.RAIN,
  ]);
  assert.equal(result.phenomenonGroup,'PRECIPITATION');
  assert.equal(result.value,CONDITION.RAIN,'a true dry/precipitation tie must retain the prudent precipitation tie-breaker');
}

{
  const result=weatherConditionConsensus([
    {modelId:'AROME_FRANCE_HD',value:CONDITION.RAIN},
    {modelId:'AROME_FRANCE',value:CONDITION.RAIN_SHOWERS},
    {modelId:'GFS',value:CONDITION.CLEAR},
    {modelId:'ECMWF',value:CONDITION.CLEAR},
  ],{},severity);
  assert.equal(result.value,CONDITION.CLEAR,'two sibling precipitation models must still share one numerical-lineage vote in the hierarchy');
  assert.equal(result.familyCount,3);
}

{
  for(const condition of Object.values(CONDITION).filter(value=>value!==CONDITION.UNKNOWN)){
    const result=vote([condition,condition,condition]);
    assert.equal(result.value,condition,`a unanimous ${condition} signal must remain unchanged by the hierarchy`);
  }
}

{
  const result=vote([
    CONDITION.CLEAR,CONDITION.CLEAR,CONDITION.CLEAR,CONDITION.CLEAR,
    CONDITION.RAIN,CONDITION.RAIN,
    CONDITION.FREEZING_RAIN,CONDITION.FREEZING_RAIN,
  ]);
  assert.equal(result.phenomenonGroup,'PRECIPITATION','a 4/4 dry-versus-precipitation tie must select the prudent precipitation branch');
  assert.equal(result.group,'FREEZING','freezing rain must win a true tie against ordinary liquid precipitation within the wet branch');
  assert.equal(result.value,CONDITION.FREEZING_RAIN);
}

{
  const result=vote([
    CONDITION.DRIZZLE,CONDITION.DRIZZLE,
    CONDITION.SNOW,CONDITION.SNOW,
    CONDITION.FREEZING_RAIN,CONDITION.FREEZING_RAIN,
    CONDITION.THUNDERSTORM,CONDITION.THUNDERSTORM,
  ]);
  assert.equal(result.group,'THUNDER','an exact tie across precipitation families must preserve the highest-impact hazard category');
  assert.equal(result.value,CONDITION.THUNDERSTORM);
}

{
  const result=vote([
    CONDITION.CLEAR,CONDITION.CLEAR,CONDITION.CLEAR,
    CONDITION.FOG,CONDITION.FOG,CONDITION.FOG,
  ]);
  assert.equal(result.phenomenonGroup,'DRY');
  assert.equal(result.group,'FOG','fog remains a distinct non-precipitating phenomenon and wins a true dry-family tie by severity');
  assert.equal(result.value,CONDITION.FOG);
}

{
  const result=weatherConditionConsensus([
    {modelId:'GFS',value:CONDITION.UNKNOWN},
    {modelId:'ECMWF',value:CONDITION.RAIN},
  ],{},severity);
  assert.equal(result.value,CONDITION.RAIN,'UNKNOWN must not compete as a real weather family');
  assert.equal(result.count,1,'UNKNOWN model rows must be excluded from categorical consensus counts');
}

console.log('Hierarchical weather-condition consensus across dry, liquid, snow and hazard families: OK');
