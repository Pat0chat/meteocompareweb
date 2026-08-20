import { addDays } from '../domain.js';

export function normalizePreviousRuns(raw,city,models,startDate,endDate){
  const h=raw?.hourly||{};const timeline=(h.time||[]).map((ts,i)=>({ts,i,date:typeof ts==='string'?ts.slice(0,10):''})).filter(x=>x.date>=startDate&&x.date<=endDate),axis=new Map();for(const x of timeline){const row=axis.get(x.date)||{count:0,first:x.ts,last:x.ts};row.count++;row.last=x.ts;axis.set(x.date,row);}const records=[];const single=models.length===1;
  const lookup=(base,model)=>{const lead=`${base}_previous_day1`;const keys=[];for(const key of [model.apiKey,...model.aliases]){keys.push(`${lead}_${key}`,`${base}_${key}_previous_day1`);}if(single)keys.push(lead);for(const k of keys)if(Array.isArray(h[k]))return h[k];return [];};
  for(const model of models){const series={TEMPERATURE:lookup('temperature_2m',model),PRECIPITATION:lookup('precipitation',model),WIND_SPEED:lookup('wind_speed_10m',model)};const byDate=new Map();for(const x of timeline){let a=byDate.get(x.date);if(!a){a={TEMPERATURE:[],PRECIPITATION:[],WIND_SPEED:[]};byDate.set(x.date,a);}for(const v of Object.keys(series)){const z=series[v][x.i];if(Number.isFinite(z)&&(v==='TEMPERATURE'||z>=0))a[v].push(z);}}
    for(const [date,a] of byDate){const day=axis.get(date),n=day?.count||0;if(n<23||n>25||day?.first?.slice(11,16)!=='00:00'||day?.last?.slice(11,16)!=='23:00')continue;const values={TEMPERATURE:a.TEMPERATURE.length===n?Math.max(...a.TEMPERATURE):null,PRECIPITATION:a.PRECIPITATION.length===n?a.PRECIPITATION.reduce((s,v)=>s+v,0):null,WIND_SPEED:a.WIND_SPEED.length===n?Math.max(...a.WIND_SPEED):null};for(const [variable,value] of Object.entries(values))if(Number.isFinite(value))records.push({modelId:model.id,variable,targetDate:date,issuedDate:addDays(date,-1),value});}
  }
  return records;
}

export function normalizeBiasObservations(raw,startDate,endDate){
  const d=raw?.daily||{};const out=[];(d.time||[]).forEach((date,i)=>{if(date<startDate||date>endDate)return;const vals={TEMPERATURE:d.temperature_2m_max?.[i],PRECIPITATION:d.precipitation_sum?.[i],WIND_SPEED:d.wind_speed_10m_max?.[i]};for(const [variable,value] of Object.entries(vals))if(Number.isFinite(value)&&(variable==='TEMPERATURE'||value>=0))out.push({variable,targetDate:date,value});});return out;
}

export const BIAS_REFERENCE_ID='ERA5';
export const BIAS_REFERENCE_LAG_DAYS=6;
export function computeBiases(biasData,today,windowDays=30,lagDays=BIAS_REFERENCE_LAG_DAYS){
  if(biasData?.reference!==BIAS_REFERENCE_ID)return {};
  const end=addDays(today,-Math.max(1,lagDays)),start=addDays(end,-windowDays+1);const obs=new Map((biasData.observations||[]).map(x=>[`${x.variable}|${x.targetDate}`,x.value]));const grouped=new Map();for(const f of biasData.forecasts||[]){if(f.targetDate<start||f.targetDate>end)continue;const o=obs.get(`${f.variable}|${f.targetDate}`);if(!Number.isFinite(f.value)||!Number.isFinite(o))continue;const key=`${f.modelId}|${f.variable}`;const m=grouped.get(key)||new Map();m.set(f.targetDate,f.value-o);grouped.set(key,m);}const out={};for(const [key,map] of grouped){const vals=[...map.values()];const [modelId,variable]=key.split('|');out[modelId]||={};if(vals.length<14){out[modelId][variable]={sampleSize:vals.length,ready:false};continue;}const mean=vals.reduce((a,b)=>a+b,0)/vals.length;const sd=vals.length>1?Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/(vals.length-1)):0;out[modelId][variable]={sampleSize:vals.length,ready:true,meanBias:mean,stdDev:sd,windowDays};}return out;
}
