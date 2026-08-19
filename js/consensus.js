import { consensusGroupFor } from './models.js';

const EPS=1e-12;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

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
  const ids=[...new Set((modelIds||[]).filter(Boolean))];
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
  const rows=(entries||[]).filter(x=>x?.modelId&&Number.isFinite(x?.value));
  const balanced=familyBalancedWeights(rows.map(x=>x.modelId),localWeights);
  return {entries:rows.map(x=>({...x,weight:balanced.weights[x.modelId]||0})).filter(x=>x.weight>0),familyCount:balanced.familyCount,modelCount:balanced.modelCount};
}

export function weightedMedian(entries){
  const rows=(entries||[]).filter(x=>Number.isFinite(x?.value)&&Number.isFinite(x?.weight)&&x.weight>0).sort((a,b)=>a.value-b.value);
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
  const rows=(entries||[]).filter(x=>Number.isFinite(x?.value)&&Number.isFinite(x?.weight)&&x.weight>0);
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

export function weightedVote(entries,localWeights={},severity=()=>0){
  const rows=(entries||[]).filter(x=>x?.modelId&&x?.value!=null),balanced=familyBalancedWeights(rows.map(x=>x.modelId),localWeights),votes=new Map();
  for(const row of rows){const w=balanced.weights[row.modelId]||0;if(w>0)votes.set(row.value,(votes.get(row.value)||0)+w);}
  if(!votes.size)return {value:null,percent:null,count:0,familyCount:0};
  const total=[...votes.values()].reduce((a,b)=>a+b,0),top=Math.max(...votes.values());
  const value=[...votes].filter(([,w])=>Math.abs(w-top)<=EPS).map(([v])=>v).sort((a,b)=>severity(b)-severity(a))[0]??null;
  return {value,percent:balanced.familyCount>=2?top*100/total:null,count:balanced.modelCount,familyCount:balanced.familyCount};
}

/**
 * Precipitation is decomposed into P(wet) and amount conditional on a wet event.
 * Native model probabilities are used when present; deterministic models contribute
 * a binary wet/dry probability. The displayed deterministic amount is the conditional
 * weighted median only when P(wet) >= 50%; expectedAmountMm remains available separately.
 */
export function precipitationConsensus(rows,{threshold=.1,localWeights={},amountTight=1,amountWide=8}={}){
  const usable=(rows||[]).filter(x=>x?.modelId&&(Number.isFinite(x.amount)||Number.isFinite(x.probability)));
  if(!usable.length)return {probabilityPercent:null,conditionalAmountMm:null,centralAmountMm:null,expectedAmountMm:null,convergencePercent:null,count:0,familyCount:0,wetModelCount:0,wetFamilyCount:0,source:null};
  const occurrence=familyBalancedWeights(usable.map(x=>x.modelId),localWeights);let probability=0,total=0,nativeProbCount=0;
  for(const row of usable){const w=occurrence.weights[row.modelId]||0;if(w<=0)continue;let p;if(Number.isFinite(row.probability)){p=clamp(row.probability/100,0,1);nativeProbCount++;}else p=Number.isFinite(row.amount)&&row.amount>=threshold?1:0;probability+=w*p;total+=w;}
  const p=total>0?probability/total:null,wet=usable.filter(x=>Number.isFinite(x.amount)&&x.amount>=threshold),wetBalanced=familyBalancedEntries(wet.map(x=>({modelId:x.modelId,value:x.amount})),localWeights),conditional=weightedMedian(wetBalanced.entries),amountStats=weightedStats(wetBalanced.entries);
  const occurrenceConv=Number.isFinite(p)&&occurrence.familyCount>=2?Math.abs(p-.5)*200:null;
  const amountConv=amountStats&&wetBalanced.familyCount>=2?scoreFromDispersion(amountStats.stdDev,amountTight,amountWide):null;
  const convergence=Number.isFinite(occurrenceConv)?(Number.isFinite(amountConv)&&p>=.5?Math.round(occurrenceConv*.7+amountConv*.3):Math.round(occurrenceConv)):null;
  const source=nativeProbCount>=Math.max(2,Math.ceil(usable.length/2))?'PROBABILITY':nativeProbCount>0?'MIXED':'MODEL_AGREEMENT';
  return {
    probabilityPercent:Number.isFinite(p)?Math.round(p*100):null,
    conditionalAmountMm:Number.isFinite(conditional)?conditional:(wet.length?0:null),
    centralAmountMm:Number.isFinite(p)&&p>=.5&&Number.isFinite(conditional)?conditional:0,
    expectedAmountMm:Number.isFinite(p)&&Number.isFinite(conditional)?p*conditional:0,
    convergencePercent:convergence,count:usable.length,familyCount:occurrence.familyCount,
    wetModelCount:wet.length,wetFamilyCount:wetBalanced.familyCount,source,
    minMm:usable.some(x=>Number.isFinite(x.amount))?Math.min(...usable.map(x=>x.amount).filter(Number.isFinite)):null,
    maxMm:usable.some(x=>Number.isFinite(x.amount))?Math.max(...usable.map(x=>x.amount).filter(Number.isFinite)):null,
    conditionalStdDev:amountStats?.stdDev??null
  };
}
