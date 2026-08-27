import { consensusGroupFor, CONDITION } from './models.js';

const EPS=1e-12;
export const RAIN_THRESHOLD_MM=0.1;
export function isWetPrecipitation(amount,threshold=RAIN_THRESHOLD_MM){return Number.isFinite(amount)&&amount>threshold;}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const canonicalCompare=(a,b)=>{const valueDelta=Number(a?.value)-Number(b?.value);if(Number.isFinite(valueDelta)&&valueDelta!==0)return valueDelta;return String(a?.modelId||'').localeCompare(String(b?.modelId||''));};

export function scoreFromDispersion(stdDev,tight,wide){
  if(!Number.isFinite(stdDev))return null;
  if(stdDev<=tight)return 100;
  if(stdDev>=wide)return 0;
  return Math.round(100*(1-(stdDev-tight)/(wide-tight)));
}

/**
 * Give each numerical lineage one unit of total influence. Sibling models split that
 * unit, with optional local-reliability multipliers redistributing influence inside
 * the lineage rather than creating extra independent votes.
 */
export function familyBalancedWeights(modelIds,localWeights={}){
  const ids=[...new Set((modelIds||[]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
  const groups=new Map();
  for(const modelId of ids){
    const group=consensusGroupFor(modelId),raw=clamp(Number(localWeights?.[modelId])||1,.5,1.5),rows=groups.get(group)||[];
    rows.push({modelId,raw});groups.set(group,rows);
  }
  const weights={};
  for(const rows of groups.values()){
    const total=rows.reduce((s,x)=>s+x.raw,0)||1,groupMass=clamp(total/rows.length,.75,1.25);
    for(const row of rows)weights[row.modelId]=(row.raw/total)*groupMass;
  }
  return {weights,familyCount:groups.size,modelCount:ids.length};
}

export function familyBalancedEntries(entries,localWeights={}){
  const rows=(entries||[]).filter(x=>x?.modelId&&Number.isFinite(x?.value)).slice().sort(canonicalCompare);
  const balanced=familyBalancedWeights(rows.map(x=>x.modelId),localWeights);
  return {entries:rows.map(x=>({...x,weight:balanced.weights[x.modelId]||0})).filter(x=>x.weight>0),familyCount:balanced.familyCount,modelCount:balanced.modelCount};
}

export function weightedMedian(entries){
  const rows=(entries||[]).filter(x=>Number.isFinite(x?.value)&&Number.isFinite(x?.weight)&&x.weight>0).sort(canonicalCompare);
  if(!rows.length)return null;
  const total=rows.reduce((s,x)=>s+x.weight,0),half=total/2;let cumulative=0;
  for(let i=0;i<rows.length;i++){
    cumulative+=rows[i].weight;
    if(cumulative>half+EPS)return rows[i].value;
    if(Math.abs(cumulative-half)<=EPS&&i+1<rows.length)return (rows[i].value+rows[i+1].value)/2;
  }
  return rows.at(-1).value;
}

export function weightedStats(entries){
  const rows=(entries||[]).filter(x=>Number.isFinite(x?.value)&&Number.isFinite(x?.weight)&&x.weight>0).slice().sort(canonicalCompare);
  if(!rows.length)return null;
  const total=rows.reduce((s,x)=>s+x.weight,0),mean=rows.reduce((s,x)=>s+x.value*x.weight,0)/total;
  const variance=rows.reduce((s,x)=>s+x.weight*(x.value-mean)**2,0)/total;
  return {mean,stdDev:Math.sqrt(variance),min:Math.min(...rows.map(x=>x.value)),max:Math.max(...rows.map(x=>x.value)),count:rows.length,totalWeight:total};
}

export function continuousConsensus(entries,localWeights={},tight=.5,wide=3){
  const balanced=familyBalancedEntries(entries,localWeights),stats=weightedStats(balanced.entries);
  if(!stats)return {central:null,convergencePercent:null,count:0,familyCount:0,stats:null};
  return {central:weightedMedian(balanced.entries),convergencePercent:balanced.familyCount>=2?scoreFromDispersion(stats.stdDev,tight,wide):null,count:balanced.modelCount,familyCount:balanced.familyCount,stats};
}

const WEATHER_CONDITION_FAMILY=Object.freeze({
  [CONDITION.CLEAR]:'SKY',
  [CONDITION.MAINLY_CLEAR]:'SKY',
  [CONDITION.PARTLY_CLOUDY]:'SKY',
  [CONDITION.OVERCAST]:'SKY',
  [CONDITION.FOG]:'FOG',
  [CONDITION.DRIZZLE]:'LIQUID',
  [CONDITION.RAIN]:'LIQUID',
  [CONDITION.RAIN_SHOWERS]:'LIQUID',
  [CONDITION.SNOW]:'SNOW',
  [CONDITION.SNOW_SHOWERS]:'SNOW',
  [CONDITION.FREEZING_RAIN]:'FREEZING',
  [CONDITION.THUNDERSTORM]:'THUNDER',
});
const WEATHER_PHENOMENON_GROUP=Object.freeze({SKY:'DRY',FOG:'DRY',LIQUID:'PRECIPITATION',SNOW:'PRECIPITATION',FREEZING:'PRECIPITATION',THUNDER:'PRECIPITATION'});
const WEATHER_CONDITION_ORDER=Object.freeze({
  SKY:Object.freeze([CONDITION.CLEAR,CONDITION.MAINLY_CLEAR,CONDITION.PARTLY_CLOUDY,CONDITION.OVERCAST]),
  LIQUID:Object.freeze([CONDITION.DRIZZLE,CONDITION.RAIN,CONDITION.RAIN_SHOWERS]),
  SNOW:Object.freeze([CONDITION.SNOW,CONDITION.SNOW_SHOWERS]),
});

function weatherConditionFamily(value){return WEATHER_CONDITION_FAMILY[value]||null;}
function weatherPhenomenonGroup(value){const family=weatherConditionFamily(value);return family?WEATHER_PHENOMENON_GROUP[family]||null:null;}
function weightedGroupWinner(rows,groupFor,severity){
  const totals=new Map(),groupSeverity=new Map();
  for(const row of rows){const group=groupFor(row.value);if(!group)continue;totals.set(group,(totals.get(group)||0)+row.weight);groupSeverity.set(group,Math.max(groupSeverity.get(group)??-Infinity,severity(row.value)));}
  if(!totals.size)return null;
  const total=[...totals.values()].reduce((sum,value)=>sum+value,0),top=Math.max(...totals.values()),group=[...totals].filter(([,weight])=>Math.abs(weight-top)<=EPS).map(([key])=>key).sort((a,b)=>(groupSeverity.get(b)??-Infinity)-(groupSeverity.get(a)??-Infinity)||String(a).localeCompare(String(b)))[0];
  return {group,weight:totals.get(group)||0,total,share:total>0?(totals.get(group)||0)/total:0,totals};
}
function weightedOrdinalCondition(rows,order){
  const index=new Map(order.map((value,i)=>[value,i])),sorted=rows.filter(row=>index.has(row.value)).slice().sort((a,b)=>index.get(a.value)-index.get(b.value)||String(a.modelId).localeCompare(String(b.modelId)));
  if(!sorted.length)return {value:null,agreement:0};
  const total=sorted.reduce((sum,row)=>sum+row.weight,0),half=total/2;let cumulative=0,selected=sorted[0].value;
  for(const row of sorted){cumulative+=row.weight;selected=row.value;if(cumulative>=half-EPS)break;}
  const meanIndex=total?sorted.reduce((sum,row)=>sum+index.get(row.value)*row.weight,0)/total:0,variance=total?sorted.reduce((sum,row)=>sum+row.weight*(index.get(row.value)-meanIndex)**2,0)/total:0,scale=Math.max(1,order.length/2),agreement=1-clamp(Math.sqrt(Math.max(0,variance))/scale,0,1);
  return {value:selected,agreement};
}

/**
 * Hierarchical weather-condition consensus.
 *
 * 1. Numerical model lineages are family-balanced, exactly like the other consensus paths.
 * 2. Conditions first vote as DRY vs PRECIPITATION so rain/snow/showers cannot fragment a
 *    broad precipitation signal into several losing categories.
 * 3. The winning phenomenon is resolved into a semantic family: SKY, FOG, LIQUID, SNOW,
 *    FREEZING or THUNDER. True ties between different families still use severity as a
 *    conservative safety tie-breaker.
 * 4. Ordered variants inside SKY, LIQUID and SNOW use a lower weighted median instead of
 *    severity, preventing adjacent states from being biased toward the harshest label.
 */
export function weatherConditionConsensus(entries,localWeights={},severity=()=>0){
  const rows=(entries||[]).filter(row=>row?.modelId&&row?.value!=null&&row.value!==CONDITION.UNKNOWN&&weatherConditionFamily(row.value)).slice().sort((a,b)=>String(a.modelId).localeCompare(String(b.modelId))),balanced=familyBalancedWeights(rows.map(row=>row.modelId),localWeights);
  if(!rows.length)return {value:null,percent:null,count:0,familyCount:0,group:null,phenomenonGroup:null};
  const weighted=rows.map(row=>({...row,weight:balanced.weights[row.modelId]||0})).filter(row=>row.weight>0),phenomenon=weightedGroupWinner(weighted,weatherPhenomenonGroup,severity);
  if(!phenomenon)return {value:null,percent:null,count:0,familyCount:0,group:null,phenomenonGroup:null};
  const phenomenonRows=weighted.filter(row=>weatherPhenomenonGroup(row.value)===phenomenon.group),family=weightedGroupWinner(phenomenonRows,weatherConditionFamily,severity);
  if(!family)return {value:null,percent:null,count:balanced.modelCount,familyCount:balanced.familyCount,group:null,phenomenonGroup:phenomenon.group};
  const familyRows=phenomenonRows.filter(row=>weatherConditionFamily(row.value)===family.group),order=WEATHER_CONDITION_ORDER[family.group];
  let value=familyRows[0]?.value??null,subtypeAgreement=1;
  if(order){const ordinal=weightedOrdinalCondition(familyRows,order);value=ordinal.value;subtypeAgreement=ordinal.agreement;}
  else if(familyRows.length>1){const subtype=weightedGroupWinner(familyRows,row=>row.value,severity);value=subtype?.group??value;subtypeAgreement=subtype?.share??1;}
  const percent=balanced.familyCount>=2?phenomenon.share*family.share*subtypeAgreement*100:null;
  return {
    value,percent,count:balanced.modelCount,familyCount:balanced.familyCount,
    group:family.group,phenomenonGroup:phenomenon.group,
    phenomenonSharePercent:balanced.familyCount>=2?phenomenon.share*100:null,
    familySharePercent:balanced.familyCount>=2?family.share*100:null,
    subtypeAgreementPercent:balanced.familyCount>=2?subtypeAgreement*100:null,
    skyAgreementPercent:family.group==='SKY'&&balanced.familyCount>=2?subtypeAgreement*100:null,
  };
}

/**
 * Precipitation is decomposed into P(wet) and amount conditional on a wet event.
 * Native model probabilities are used when present; deterministic models contribute
 * a binary wet/dry probability. The displayed deterministic amount is the conditional
 * weighted median only when P(wet) >= 50%; expectedAmountMm remains available separately.
 */
export function precipitationConsensus(rows,{threshold=RAIN_THRESHOLD_MM,localWeights={},amountTight=1,amountWide=8}={}){
  const usable=(rows||[]).filter(x=>x?.modelId&&(Number.isFinite(x.amount)||Number.isFinite(x.probability))).slice().sort((a,b)=>String(a.modelId).localeCompare(String(b.modelId)));
  if(!usable.length)return {probabilityPercent:null,conditionalAmountMm:null,centralAmountMm:null,expectedAmountMm:null,convergencePercent:null,count:0,familyCount:0,wetModelCount:0,wetFamilyCount:0,source:null};
  const occurrence=familyBalancedWeights(usable.map(x=>x.modelId),localWeights);let probability=0,total=0,nativeProbCount=0;
  for(const row of usable){const w=occurrence.weights[row.modelId]||0;if(w<=0)continue;let p;if(Number.isFinite(row.probability)){p=clamp(row.probability/100,0,1);nativeProbCount++;}else p=isWetPrecipitation(row.amount,threshold)?1:0;probability+=w*p;total+=w;}
  const p=total>0?probability/total:null,wet=usable.filter(x=>isWetPrecipitation(x.amount,threshold)),wetBalanced=familyBalancedEntries(wet.map(x=>({modelId:x.modelId,value:x.amount})),localWeights),conditional=weightedMedian(wetBalanced.entries),amountStats=weightedStats(wetBalanced.entries),amounts=usable.map(x=>x.amount).filter(Number.isFinite),hasAmount=amounts.length>0;
  const occurrenceConv=Number.isFinite(p)&&occurrence.familyCount>=2?Math.abs(p-.5)*200:null;
  const amountConv=amountStats&&wetBalanced.familyCount>=2?scoreFromDispersion(amountStats.stdDev,amountTight,amountWide):null;
  const convergence=Number.isFinite(occurrenceConv)?(Number.isFinite(amountConv)&&p>=.5?Math.round(occurrenceConv*.7+amountConv*.3):Math.round(occurrenceConv)):null;
  const source=nativeProbCount===usable.length?'PROBABILITY':nativeProbCount>0?'MIXED':'MODEL_AGREEMENT';
  return {
    probabilityPercent:Number.isFinite(p)?Math.round(p*100):null,
    conditionalAmountMm:Number.isFinite(conditional)?conditional:(wet.length?0:null),
    centralAmountMm:!hasAmount?null:(Number.isFinite(p)&&p>=.5?(Number.isFinite(conditional)?conditional:null):0),
    expectedAmountMm:Number.isFinite(p)&&Number.isFinite(conditional)?p*conditional:(hasAmount&&p===0?0:null),
    convergencePercent:convergence,count:usable.length,familyCount:occurrence.familyCount,
    wetModelCount:wet.length,wetFamilyCount:wetBalanced.familyCount,source,
    minMm:amounts.length?Math.min(...amounts):null,
    maxMm:amounts.length?Math.max(...amounts):null,
    conditionalStdDev:amountStats?.stdDev??null
  };
}
