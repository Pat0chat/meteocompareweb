import assert from 'node:assert/strict';
import { normalizePreviousRuns } from '../../../js/features/bias.js';
import { getModel, biasLeadDaysForModel } from '../../../js/models.js';

const model=getModel('GFS');
assert.deepEqual(biasLeadDaysForModel(model),[1,2,3,4,5,6,7]);
assert.deepEqual(biasLeadDaysForModel(getModel('AROME_FRANCE_HD')),[1,2]);
assert.deepEqual(biasLeadDaysForModel(getModel('HRRR_CONUS')),[]);

const times=Array.from({length:24},(_,hour)=>`2026-08-01T${String(hour).padStart(2,'0')}:00`);
const raw={hourly:{time:times}};
for(const leadDay of [1,2]){
  raw.hourly[`temperature_2m_previous_day${leadDay}_${model.apiKey}`]=times.map((_,i)=>20+leadDay+i/100);
  raw.hourly[`precipitation_previous_day${leadDay}_${model.apiKey}`]=times.map(()=>leadDay===1?.1:.2);
  raw.hourly[`wind_speed_10m_previous_day${leadDay}_${model.apiKey}`]=times.map(()=>10+leadDay);
}
const records=normalizePreviousRuns(raw,{timezone:'UTC'},[model],'2026-08-01','2026-08-01');
assert.equal(records.length,6);
assert.equal(records.filter(row=>row.leadDay===1).length,3);
assert.equal(records.filter(row=>row.leadDay===2).length,3);
assert.ok(records.filter(row=>row.leadDay===1).every(row=>row.issuedDate==='2026-07-31'));
assert.ok(records.filter(row=>row.leadDay===2).every(row=>row.issuedDate==='2026-07-30'));
assert.equal(records.find(row=>row.leadDay===1&&row.variable==='PRECIPITATION').value,2.400000000000001);
assert.equal(records.find(row=>row.leadDay===2&&row.variable==='PRECIPITATION').value,4.800000000000002);

console.log('Previous Runs horizon normalization: OK');
