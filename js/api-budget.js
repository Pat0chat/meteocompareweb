const USAGE_KEY='meteocompare.web.api-usage.v1';
const inFlight=new Map();
const memoryCache=new Map();
const LIMITS={minute:120,hour:1000,day:5000}; // local runaway guards, intentionally below provider free-tier limits
const PROVIDER_LIMITS={minute:600,hour:5000,day:10000,month:300000};

function safeRead(){try{return JSON.parse(localStorage.getItem(USAGE_KEY)||'{}')||{};}catch{return {};}}
function safeWrite(value){try{localStorage.setItem(USAGE_KEY,JSON.stringify(value));}catch{}}
function keys(now=Date.now()){
  const d=new Date(now),day=d.toISOString().slice(0,10),hour=d.toISOString().slice(0,13),minute=d.toISOString().slice(0,16),month=d.toISOString().slice(0,7);
  return {day,hour,minute,month};
}
function prune(value,k){
  const buckets=value.buckets||{},active=new Set([k.minute,k.hour,k.day,k.month]);
  for(const key of Object.keys(buckets))if(!active.has(key))delete buckets[key];
  value.buckets=buckets;
  const categories=value.categories||{};for(const key of Object.keys(categories))if(!key.startsWith(k.month))delete categories[key];value.categories=categories;return value;
}
function countBucket(value,key){return Number(value?.buckets?.[key]?.count)||0;}
function increment(category,url){
  const now=Date.now(),k=keys(now),value=prune(safeRead(),k);value.buckets||={};value.categories||={};
  for(const key of [k.minute,k.hour,k.day,k.month]){value.buckets[key]||={count:0};value.buckets[key].count++;}
  value.categories[k.day]||={};value.categories[k.day][category]=(Number(value.categories[k.day][category])||0)+1;
  value.total=(Number(value.total)||0)+1;value.lastAt=now;value.lastHost=new URL(String(url)).host;safeWrite(value);return value;
}
function assertBudget(){
  const value=safeRead(),k=keys();
  if(countBucket(value,k.minute)>=LIMITS.minute||countBucket(value,k.hour)>=LIMITS.hour||countBucket(value,k.day)>=LIMITS.day){const err=new Error('LOCAL_API_BUDGET_EXCEEDED');err.code='LOCAL_API_BUDGET_EXCEEDED';throw err;}
}
export function apiUsageSnapshot(){
  const value=safeRead(),k=keys();return {minute:countBucket(value,k.minute),hour:countBucket(value,k.hour),day:countBucket(value,k.day),month:countBucket(value,k.month),categories:value.categories?.[k.day]||{},lastAt:value.lastAt||null,limits:{...LIMITS},providerLimits:{...PROVIDER_LIMITS}};
}
export function resetApiUsage(){try{localStorage.removeItem(USAGE_KEY);}catch{}}

export async function fetchOpenMeteoJson(url,{timeoutMs=30000,signal=null,category='other',cacheTtlMs=0,dedupe=true}={}){
  const key=String(url),now=Date.now(),cached=memoryCache.get(key);
  if(cacheTtlMs>0&&cached&&now-cached.at<cacheTtlMs)return cached.value;
  if(dedupe&&!signal&&inFlight.has(key))return inFlight.get(key);
  const run=(async()=>{
    assertBudget();
    const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener?.('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      increment(category,url);
      const res=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
      if(!res.ok){const err=new Error(`HTTP ${res.status}`);err.code='HTTP_ERROR';err.status=res.status;err.retryAfter=res.headers?.get?.('retry-after')||null;throw err;}
      const json=await res.json();if(json?.error){const err=new Error(json.reason||'Open-Meteo error');err.code='OPEN_METEO_ERROR';err.reason=json.reason||'';throw err;}
      if(cacheTtlMs>0)memoryCache.set(key,{at:Date.now(),value:json});return json;
    }finally{clearTimeout(timer);signal?.removeEventListener?.('abort',abort);}
  })();
  if(dedupe&&!signal)inFlight.set(key,run);
  try{return await run;}finally{if(dedupe&&!signal&&inFlight.get(key)===run)inFlight.delete(key);}
}
