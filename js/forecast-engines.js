import { familyBalancedEntries, familyBalancedWeights, weightedMedian, weightedStats, scoreFromDispersion } from './consensus.js';

export const FORECAST_ENGINES = Object.freeze(['MULTI_CONSENSUS','CALIBRATION','SCENARIOS','ADAPTIVE']);
export const DEFAULT_FORECAST_ENGINE = 'MULTI_CONSENSUS';

const EPS=1e-9;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=v=>Number.isFinite(v);

function weightedQuantile(entries,q){
  const rows=(entries||[]).filter(x=>finite(x?.value)&&finite(x?.weight)&&x.weight>0).sort((a,b)=>a.value-b.value);
  if(!rows.length)return null;const total=rows.reduce((s,x)=>s+x.weight,0),target=clamp(q,0,1)*total;let acc=0;
  for(const row of rows){acc+=row.weight;if(acc+EPS>=target)return row.value;}return rows.at(-1).value;
}
function weightedMean(entries){const rows=(entries||[]).filter(x=>finite(x?.value)&&finite(x?.weight)&&x.weight>0);const total=rows.reduce((s,x)=>s+x.weight,0);return total?rows.reduce((s,x)=>s+x.value*x.weight,0)/total:null;}
function weightedMad(entries,center){const rows=(entries||[]).filter(x=>finite(x?.value)&&finite(x?.weight)&&x.weight>0).map(x=>({...x,value:Math.abs(x.value-center)}));return weightedQuantile(rows,.5);}
function intervalFrom(entries,center,stdDev,extraSigma=0){
  if(!finite(center))return {low:null,high:null};const q10=weightedQuantile(entries,.1),q90=weightedQuantile(entries,.9),sigma=Math.sqrt(Math.max(0,(finite(stdDev)?stdDev:0)**2+(finite(extraSigma)?extraSigma:0)**2));
  const normalLow=center-1.2816*sigma,normalHigh=center+1.2816*sigma;
  return {low:finite(q10)?Math.min(q10,normalLow):normalLow,high:finite(q90)?Math.max(q90,normalHigh):normalHigh};
}
function robustFromBalanced(balanced,tight=.5,wide=3){
  const rows=balanced.entries||[];if(!rows.length)return null;const median=weightedMedian(rows),mad=weightedMad(rows,median),scale=Math.max(tight*.35,(finite(mad)?mad:0)*1.4826,EPS),limit=1.5*scale;
  const robustRows=rows.map(row=>{const d=Math.abs(row.value-median),factor=d<=limit?1:limit/Math.max(d,EPS);return {...row,weight:row.weight*factor,robustFactor:factor};});
  const central=weightedMean(robustRows),stats=weightedStats(robustRows),interval=intervalFrom(robustRows,central,stats?.stdDev||0);
  return {central,stats,interval,mad,rows:robustRows,convergencePercent:balanced.familyCount>=2?scoreFromDispersion(stats?.stdDev,tight,wide):null,count:balanced.modelCount,familyCount:balanced.familyCount};
}
function multiConsensus(entries,{localWeights={},tight=.5,wide=3,min=null,max=null}={}){
  const balanced=familyBalancedEntries(entries,localWeights),r=robustFromBalanced(balanced,tight,wide);if(!r)return emptyResult('MULTI_CONSENSUS');
  const central=bound(r.central,min,max),interval={low:bound(r.interval.low,min,max),high:bound(r.interval.high,min,max)};
  return {...r,central,interval,engine:'MULTI_CONSENSUS',effectiveEngine:'MULTI_CONSENSUS',fallback:false,calibrationCoverage:0,scenarioCount:1,dominantShare:1,explanation:'ROBUST_FAMILY_BALANCED'};
}
function calibrationProfileFor(calibration,modelId){const p=calibration?.[modelId];return p&&finite(p.bias)&&Number(p.sampleSize)>=14?p:null;}
function calibrationConsensus(entries,{localWeights={},calibration={},tight=.5,wide=3,min=null,max=null}={}){
  const usable=(entries||[]).filter(x=>x?.modelId&&finite(x?.value));if(!usable.length)return emptyResult('CALIBRATION');
  let calibrated=0,scoreSum=0,noiseSum=0,noiseWeight=0;const corrected=usable.map(row=>{const p=calibrationProfileFor(calibration,row.modelId);if(!p)return row;calibrated++;const skill=.85+.30*clamp((Number(p.score)||50)/100,0,1),noise=Math.max(0,Number(p.standardDeviation)||Number(p.meanAbsoluteError)||0);scoreSum+=Number(p.score)||0;noiseSum+=noise;noiseWeight++;return {...row,value:bound(row.value-p.bias,min,max),calibrationSkill:skill};});
  const coverage=usable.length?calibrated/usable.length:0;if(calibrated<2||coverage<.34){const fallback=multiConsensus(entries,{localWeights,tight,wide,min,max});return {...fallback,engine:'CALIBRATION',fallback:true,fallbackReason:'INSUFFICIENT_CALIBRATION',calibrationCoverage:coverage};}
  const skillWeights={...localWeights};for(const row of corrected){if(row.calibrationSkill)skillWeights[row.modelId]=(Number(skillWeights[row.modelId])||1)*row.calibrationSkill;}
  const balanced=familyBalancedEntries(corrected,skillWeights),r=robustFromBalanced(balanced,tight,wide);if(!r)return emptyResult('CALIBRATION');const extraSigma=noiseWeight?noiseSum/noiseWeight*.35:0,interval=intervalFrom(r.rows,r.central,r.stats?.stdDev||0,extraSigma);
  return {...r,central:bound(r.central,min,max),interval:{low:bound(interval.low,min,max),high:bound(interval.high,min,max)},engine:'CALIBRATION',effectiveEngine:'CALIBRATION',fallback:false,calibrationCoverage:coverage,historicalScore:calibrated?scoreSum/calibrated:null,scenarioCount:1,dominantShare:1,explanation:'BIAS_CORRECTED_SKILL_WEIGHTED'};
}
function scenarioSplit(entries,tight){
  const rows=(entries||[]).filter(x=>finite(x?.value)&&finite(x?.weight)&&x.weight>0).sort((a,b)=>a.value-b.value);if(rows.length<4)return null;
  const total=rows.reduce((s,x)=>s+x.weight,0),center=weightedMedian(rows),mad=weightedMad(rows,center)||0,minimumGap=Math.max(tight*.9,mad*1.25);let best=null,leftWeight=0;
  for(let i=0;i<rows.length-1;i++){leftWeight+=rows[i].weight;const rightWeight=total-leftWeight,gap=rows[i+1].value-rows[i].value,share=Math.min(leftWeight,rightWeight)/total;if(share<.18||gap<minimumGap)continue;const score=gap*(.5+share);if(!best||score>best.score)best={index:i,gap,score,leftWeight,rightWeight};}
  return best?{left:rows.slice(0,best.index+1),right:rows.slice(best.index+1),gap:best.gap}:null;
}
function scenarioConsensus(entries,{localWeights={},tight=.5,wide=3,min=null,max=null}={}){
  const balanced=familyBalancedEntries(entries,localWeights),base=robustFromBalanced(balanced,tight,wide);if(!base)return emptyResult('SCENARIOS');const split=scenarioSplit(balanced.entries,tight);if(!split)return {...multiConsensus(entries,{localWeights,tight,wide,min,max}),engine:'SCENARIOS',effectiveEngine:'SCENARIOS',scenarioCount:1,dominantShare:1,explanation:'SINGLE_SCENARIO'};
  const total=[...split.left,...split.right].reduce((s,x)=>s+x.weight,0),clusters=[split.left,split.right].map(rows=>{const weight=rows.reduce((s,x)=>s+x.weight,0),central=weightedMedian(rows),stats=weightedStats(rows);return {rows,weight,share:weight/total,central,low:weightedQuantile(rows,.1),high:weightedQuantile(rows,.9),stdDev:stats?.stdDev||0};}).sort((a,b)=>b.weight-a.weight),dominant=clusters[0],interval=intervalFrom(dominant.rows,dominant.central,dominant.stdDev);
  return {central:bound(dominant.central,min,max),stats:weightedStats(dominant.rows),interval:{low:bound(interval.low,min,max),high:bound(interval.high,min,max)},rows:dominant.rows,convergencePercent:Math.round(clamp(dominant.share*100,0,100)),count:balanced.modelCount,familyCount:balanced.familyCount,engine:'SCENARIOS',effectiveEngine:'SCENARIOS',fallback:false,calibrationCoverage:0,scenarioCount:2,dominantShare:dominant.share,scenarioGap:split.gap,scenarios:clusters.map(c=>({share:c.share,central:bound(c.central,min,max),low:bound(c.low,min,max),high:bound(c.high,min,max)})),explanation:'DOMINANT_SCENARIO'};
}
function adaptiveConsensus(entries,opts={}){
  const multi=multiConsensus(entries,opts),cal=calibrationConsensus(entries,opts),sc=scenarioConsensus(entries,opts);
  const strongScenario=sc.scenarioCount>1&&sc.dominantShare>=.52&&sc.dominantShare<=.82&&finite(sc.scenarioGap)&&sc.scenarioGap>=Math.max((opts.tight||.5)*1.1,(multi.stats?.stdDev||0)*.5);
  if(strongScenario)return {...sc,engine:'ADAPTIVE',effectiveEngine:'SCENARIOS',adaptiveComponents:{multi:multi.central,calibration:cal.central,scenarios:sc.central},explanation:'ADAPTIVE_SCENARIO'};
  const calibrationReady=!cal.fallback&&cal.calibrationCoverage>=.5&&(cal.historicalScore==null||cal.historicalScore>=45);
  if(calibrationReady){const trust=clamp(.45+(cal.calibrationCoverage*.3)+((cal.historicalScore||50)/100)*.15,.55,.88),central=bound(cal.central*trust+multi.central*(1-trust),opts.min,opts.max),sigma=Math.max(cal.stats?.stdDev||0,multi.stats?.stdDev||0),interval=intervalFrom(cal.rows||multi.rows,central,sigma);return {...cal,central,interval:{low:bound(interval.low,opts.min,opts.max),high:bound(interval.high,opts.min,opts.max)},engine:'ADAPTIVE',effectiveEngine:'CALIBRATION',adaptiveTrust:trust,adaptiveComponents:{multi:multi.central,calibration:cal.central,scenarios:sc.central},explanation:'ADAPTIVE_CALIBRATION_BLEND'};}
  return {...multi,engine:'ADAPTIVE',effectiveEngine:'MULTI_CONSENSUS',adaptiveComponents:{multi:multi.central,calibration:cal.central,scenarios:sc.central},explanation:'ADAPTIVE_ROBUST_FALLBACK'};
}
function bound(value,min,max){if(!finite(value))return value;return min!=null&&max!=null?clamp(value,min,max):min!=null?Math.max(min,value):max!=null?Math.min(max,value):value;}
function emptyResult(engine){return {central:null,stats:null,interval:{low:null,high:null},rows:[],convergencePercent:null,count:0,familyCount:0,engine,effectiveEngine:engine,fallback:false,calibrationCoverage:0,scenarioCount:0,dominantShare:null};}

export function forecastEngineContinuous(entries,options={}){
  const engine=FORECAST_ENGINES.includes(options.engine)?options.engine:DEFAULT_FORECAST_ENGINE;
  if(engine==='CALIBRATION')return calibrationConsensus(entries,options);
  if(engine==='SCENARIOS')return scenarioConsensus(entries,options);
  if(engine==='ADAPTIVE')return adaptiveConsensus(entries,options);
  return multiConsensus(entries,options);
}

function occurrenceAdjustment(calibration={}){
  const rows=Object.values(calibration).filter(p=>Number(p?.sampleSize)>=14&&p?.precipitation);if(!rows.length)return {delta:0,coverage:0};let sum=0,w=0;
  for(const p of rows){const n=Math.max(1,Number(p.sampleSize)||1),obs=(p.precipitation.observedWetDays||0)/n,fc=(p.precipitation.forecastWetDays||0)/n,quality=clamp((Number(p.score)||50)/100,.25,1);sum+=(obs-fc)*quality;w+=quality;}
  return {delta:w?clamp(sum/w,-.2,.2):0,coverage:rows.length/Object.keys(calibration).length||0};
}

export function forecastEnginePrecipitation(rows,{engine=DEFAULT_FORECAST_ENGINE,threshold=.1,localWeights={},calibration={},amountTight=1,amountWide=8}={}){
  const requested=FORECAST_ENGINES.includes(engine)?engine:DEFAULT_FORECAST_ENGINE,usable=(rows||[]).filter(x=>x?.modelId&&(finite(x.amount)||finite(x.probability)));if(!usable.length)return {engine:requested,effectiveEngine:requested,probabilityPercent:null,conditionalAmountMm:null,centralAmountMm:null,expectedAmountMm:null,convergencePercent:null,count:0,familyCount:0,wetModelCount:0,scenarioCount:0};
  const corrected=usable,occurrence=familyBalancedWeights(corrected.map(x=>x.modelId),localWeights),adj=occurrenceAdjustment(calibration);let pSum=0,total=0,nativeProbCount=0;
  for(const row of corrected){const w=occurrence.weights[row.modelId]||0;if(w<=0)continue;let p;if(finite(row.probability)){p=clamp(row.probability/100,0,1);nativeProbCount++;}else p=finite(row.amount)&&row.amount>=threshold?1:0;if((requested==='CALIBRATION'||requested==='ADAPTIVE')&&adj.coverage>=.34)p=clamp(p+adj.delta*.65,0,1);pSum+=w*p;total+=w;}
  const probability=total?pSum/total:null,wet=corrected.filter(x=>finite(x.amount)&&x.amount>=threshold),amountEntries=wet.map(x=>({modelId:x.modelId,value:x.amount})),amountResult=forecastEngineContinuous(amountEntries,{engine:requested,localWeights,calibration,amountTight,amountWide,tight:amountTight,wide:amountWide,min:0}),conditional=amountResult.central,occurrenceConv=finite(probability)&&occurrence.familyCount>=2?Math.abs(probability-.5)*200:null,amountConv=amountResult.convergencePercent,convergence=finite(occurrenceConv)?(finite(amountConv)&&probability>=.5?Math.round(occurrenceConv*.7+amountConv*.3):Math.round(occurrenceConv)):null;
  return {engine:requested,effectiveEngine:amountResult.effectiveEngine,probabilityPercent:finite(probability)?Math.round(probability*100):null,conditionalAmountMm:finite(conditional)?conditional:(wet.length?0:null),centralAmountMm:finite(probability)&&probability>=.5&&finite(conditional)?conditional:0,expectedAmountMm:finite(probability)&&finite(conditional)?probability*conditional:0,convergencePercent:convergence,count:usable.length,familyCount:occurrence.familyCount,wetModelCount:wet.length,wetFamilyCount:amountResult.familyCount,source:nativeProbCount===usable.length?'PROBABILITY':nativeProbCount>0?'MIXED':'MODEL_AGREEMENT',minMm:usable.some(x=>finite(x.amount))?Math.min(...usable.map(x=>x.amount).filter(finite)):null,maxMm:usable.some(x=>finite(x.amount))?Math.max(...usable.map(x=>x.amount).filter(finite)):null,conditionalStdDev:amountResult.stats?.stdDev??null,interval:amountResult.interval,scenarioCount:amountResult.scenarioCount,scenarios:amountResult.scenarios||null,calibrationCoverage:amountResult.calibrationCoverage||0,fallback:amountResult.fallback||false,explanation:amountResult.explanation};
}

export function forecastEngineSummary(result){
  if(!result)return {effectiveEngine:DEFAULT_FORECAST_ENGINE,fallback:false,scenarioCount:0,calibrationCoverage:0};
  return {effectiveEngine:result.effectiveEngine||result.engine||DEFAULT_FORECAST_ENGINE,fallback:Boolean(result.fallback),scenarioCount:Number(result.scenarioCount)||0,dominantShare:finite(result.dominantShare)?result.dominantShare:null,calibrationCoverage:finite(result.calibrationCoverage)?result.calibrationCoverage:0,historicalScore:finite(result.historicalScore)?result.historicalScore:null,interval:result.interval||null,explanation:result.explanation||null};
}
