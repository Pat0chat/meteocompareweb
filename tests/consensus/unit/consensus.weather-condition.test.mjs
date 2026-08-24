import assert from 'node:assert/strict';
import { weatherConditionConsensus } from '../../../js/consensus.js';
import { conditionInfo } from '../../../js/domain.js';
import { CONDITION } from '../../../js/models.js';

const severity=value=>conditionInfo(value).severity;
const entries=values=>values.map((value,index)=>({modelId:`FAMILY_${index+1}`,value}));

{
  const vote=weatherConditionConsensus(entries([
    CONDITION.OVERCAST,CONDITION.OVERCAST,CONDITION.OVERCAST,
    CONDITION.PARTLY_CLOUDY,CONDITION.PARTLY_CLOUDY,
    CONDITION.MAINLY_CLEAR,CONDITION.MAINLY_CLEAR,
    CONDITION.CLEAR,CONDITION.CLEAR,
  ]),{},severity);
  assert.equal(vote.value,CONDITION.PARTLY_CLOUDY,'3 overcast votes must not beat the six less-cloudy sky-family votes through categorical fragmentation');
}

{
  const vote=weatherConditionConsensus(entries([
    CONDITION.OVERCAST,CONDITION.OVERCAST,CONDITION.OVERCAST,
    CONDITION.PARTLY_CLOUDY,CONDITION.PARTLY_CLOUDY,CONDITION.PARTLY_CLOUDY,
  ]),{},severity);
  assert.equal(vote.value,CONDITION.PARTLY_CLOUDY,'an exact partly-cloudy/overcast tie must resolve on the lower ordinal median, not the more severe sky state');
}

{
  const vote=weatherConditionConsensus(entries([
    CONDITION.CLEAR,CONDITION.CLEAR,CONDITION.CLEAR,
    CONDITION.RAIN,CONDITION.RAIN,CONDITION.RAIN,
  ]),{},severity);
  assert.equal(vote.value,CONDITION.RAIN,'severity must still break a true tie between semantically different weather families');
}

{
  const vote=weatherConditionConsensus([
    {modelId:'AROME_FRANCE_HD',value:CONDITION.OVERCAST},
    {modelId:'AROME_FRANCE',value:CONDITION.OVERCAST},
    {modelId:'GFS',value:CONDITION.CLEAR},
    {modelId:'ECMWF',value:CONDITION.CLEAR},
  ],{},severity);
  assert.equal(vote.value,CONDITION.CLEAR,'sibling models must split their family mass instead of double-voting for overcast');
  assert.equal(vote.familyCount,3);
}

console.log('Weather-condition consensus groups sky cover ordinally without weakening hazard tie-breaking: OK');
