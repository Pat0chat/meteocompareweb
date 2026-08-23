import { fetchOpenMeteoJson } from '../api-budget.js';
import { zonedTimestampEpochs } from '../domain.js';

const MARINE_URL='https://marine-api.open-meteo.com/v1/marine';
export const MARINE_CACHE_TTL_MS=6*3600_000;
export const COASTAL_MAX_DISTANCE_KM=50;

function haversineKm(aLat,aLon,bLat,bLon){const r=6371,toRad=x=>x*Math.PI/180,dLat=toRad(bLat-aLat),dLon=toRad(bLon-aLon),q=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(q));}
function validHourlyTimestamp(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);}
function validTimeIndices(values){return (Array.isArray(values)?values:[]).map((value,index)=>validHourlyTimestamp(value)?index:-1).filter(index=>index>=0);}
function alignedNumbers(values,indices){return indices.map(index=>Number.isFinite(values?.[index])?values[index]:null);}
function countFinite(a){return Array.isArray(a)?a.filter(Number.isFinite).length:0;}

function validCityCoordinates(city){
  const latitude=Number(city?.latitude),longitude=Number(city?.longitude);
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){const error=new Error('INVALID_CITY');error.code='INVALID_CITY';throw error;}
  return {...city,latitude,longitude};
}
function marineGridAvailability(raw,city,waveValues=raw?.hourly?.wave_height){
  const gridLat=Number(raw?.latitude),gridLon=Number(raw?.longitude),distanceKm=Number.isFinite(gridLat)&&Number.isFinite(gridLon)?haversineKm(Number(city.latitude),Number(city.longitude),gridLat,gridLon):null,usablePoints=countFinite(waveValues);
  return {available:Number.isFinite(distanceKm)&&distanceKm<=COASTAL_MAX_DISTANCE_KM&&usablePoints>=6,distanceKm,usablePoints};
}
function capabilityUrlFor(city){
  const u=new URL(MARINE_URL);u.searchParams.set('latitude',String(city.latitude));u.searchParams.set('longitude',String(city.longitude));u.searchParams.set('hourly','wave_height');u.searchParams.set('timezone',city.timezone||'auto');u.searchParams.set('forecast_days','1');u.searchParams.set('cell_selection','sea');return u;
}

function urlFor(city){
  const u=new URL(MARINE_URL);
  u.searchParams.set('latitude',String(city.latitude));u.searchParams.set('longitude',String(city.longitude));
  // Keep the Marine request under 10 variables: daily summaries are derived client-side.
  u.searchParams.set('hourly','wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,sea_level_height_msl');
  u.searchParams.set('timezone',city.timezone||'auto');u.searchParams.set('forecast_days','7');u.searchParams.set('cell_selection','sea');
  return u;
}

function deriveDaily(hourly){
  const groups=new Map();
  for(let i=0;i<hourly.timestamps.length;i++){
    const day=String(hourly.timestamps[i]||'').slice(0,10);if(!day)continue;
    if(!groups.has(day))groups.set(day,[]);groups.get(day).push(i);
  }
  const daily={dates:[],waveHeightMax:[],waveDirectionDominant:[],wavePeriodMax:[],swellHeightMax:[],swellDirectionDominant:[],swellPeriodMax:[]};
  for(const [day,indices] of groups){
    const finite=(arr)=>indices.filter(i=>Number.isFinite(arr[i]));
    const maxValue=(arr)=>{const ii=finite(arr);return ii.length?Math.max(...ii.map(i=>arr[i])):null;};
    const maxIndex=(arr)=>{const ii=finite(arr);if(!ii.length)return -1;return ii.reduce((best,i)=>arr[i]>arr[best]?i:best,ii[0]);};
    const circularMean=(direction,weight)=>{let x=0,y=0,w=0;for(const i of indices){if(!Number.isFinite(direction[i]))continue;const wi=Number.isFinite(weight[i])&&weight[i]>0?weight[i]:1,r=direction[i]*Math.PI/180;x+=Math.cos(r)*wi;y+=Math.sin(r)*wi;w+=wi;}if(!w||(!x&&!y))return null;return (Math.atan2(y,x)*180/Math.PI+360)%360;};
    const waveI=maxIndex(hourly.waveHeight),swellI=maxIndex(hourly.swellHeight);
    daily.dates.push(day);
    daily.waveHeightMax.push(waveI>=0?hourly.waveHeight[waveI]:null);
    daily.waveDirectionDominant.push(circularMean(hourly.waveDirection,hourly.waveHeight));
    daily.wavePeriodMax.push(maxValue(hourly.wavePeriod));
    daily.swellHeightMax.push(swellI>=0?hourly.swellHeight[swellI]:null);
    daily.swellDirectionDominant.push(circularMean(hourly.swellDirection,hourly.swellHeight));
    daily.swellPeriodMax.push(maxValue(hourly.swellPeriod));
  }
  return daily;
}

export function normalizeMarine(raw,city){
  const hourlyRaw=raw?.hourly||{},indices=validTimeIndices(hourlyRaw.time),gridLat=Number(raw?.latitude),gridLon=Number(raw?.longitude),distanceKm=Number.isFinite(gridLat)&&Number.isFinite(gridLon)?haversineKm(Number(city.latitude),Number(city.longitude),gridLat,gridLon):null;
  const timestamps=indices.map(index=>hourlyRaw.time[index]);
  const hourly={
    timestamps,
    waveHeight:alignedNumbers(hourlyRaw.wave_height,indices),
    waveDirection:alignedNumbers(hourlyRaw.wave_direction,indices),
    wavePeriod:alignedNumbers(hourlyRaw.wave_period,indices),
    swellHeight:alignedNumbers(hourlyRaw.swell_wave_height,indices),
    swellDirection:alignedNumbers(hourlyRaw.swell_wave_direction,indices),
    swellPeriod:alignedNumbers(hourlyRaw.swell_wave_period,indices),
    seaSurfaceTemperature:alignedNumbers(hourlyRaw.sea_surface_temperature,indices),
    seaLevelHeightMsl:alignedNumbers(hourlyRaw.sea_level_height_msl,indices),
  };
  const timezone=raw?.timezone||city.timezone||'UTC';hourly.timestampEpochMs=zonedTimestampEpochs(hourly.timestamps,timezone);
  const result={fetchedAt:new Date().toISOString(),timezone,grid:{latitude:gridLat,longitude:gridLon,distanceKm},hourly,daily:deriveDaily(hourly)};
  result.usablePoints=countFinite(result.hourly.waveHeight);
  result.coastal=Number.isFinite(distanceKm)&&distanceKm<=COASTAL_MAX_DISTANCE_KM&&result.usablePoints>=6;
  return result;
}


function marineEpochs(data){const ts=data?.hourly?.timestamps||[],cached=data?.hourly?.timestampEpochMs;if(Array.isArray(cached)&&cached.length===ts.length)return cached;return zonedTimestampEpochs(ts,data?.timezone||'UTC');}
export function detectTideEvents(data,{hours=72,minGapHours=3,now=Date.now()}={}){
  const ts=data?.hourly?.timestamps||[],epochs=marineEpochs(data),v=data?.hourly?.seaLevelHeightMsl||[];if(ts.length<3||v.length<3)return [];
  const start=now,end=start+hours*3600e3,candidates=[];
  for(let i=1;i<Math.min(ts.length,v.length,epochs.length)-1;i++){
    const ms=epochs[i];if(!Number.isFinite(ms)||ms<start-3600e3||ms>end)continue;
    if(![v[i-1],v[i],v[i+1]].every(Number.isFinite))continue;
    const high=v[i]>=v[i-1]&&v[i]>v[i+1],low=v[i]<=v[i-1]&&v[i]<v[i+1];if(high||low)candidates.push({timestamp:ts[i],epochMs:ms,value:v[i],type:high?'HIGH':'LOW'});
  }
  const out=[];for(const e of candidates){const prev=out.at(-1);if(prev&&e.type===prev.type&&e.epochMs-prev.epochMs<minGapHours*3600e3){const better=e.type==='HIGH'?e.value>prev.value:e.value<prev.value;if(better)out[out.length-1]=e;continue;}out.push(e);}return out;
}
export function tideRangeNext24h(data,now=Date.now()){
  const epochs=marineEpochs(data),v=data?.hourly?.seaLevelHeightMsl||[],vals=[];for(let i=0;i<Math.min(epochs.length,v.length);i++){const ms=epochs[i];if(ms>=now&&ms<now+24*3600e3&&Number.isFinite(v[i]))vals.push(v[i]);}return vals.length?{min:Math.min(...vals),max:Math.max(...vals),range:Math.max(...vals)-Math.min(...vals)}:null;
}

export function marineAvailabilityFromRaw(raw,city){const normalizedCity=validCityCoordinates(city);return marineGridAvailability(raw,normalizedCity);}
export async function probeMarineAvailability(city){const normalizedCity=validCityCoordinates(city),raw=await fetchOpenMeteoJson(capabilityUrlFor(normalizedCity),{timeoutMs:15000,category:'marine'});return marineGridAvailability(raw,normalizedCity);}
export async function fetchMarineForCity(city){const normalizedCity=validCityCoordinates(city),raw=await fetchOpenMeteoJson(urlFor(normalizedCity),{timeoutMs:30000,category:'marine'});return normalizeMarine(raw,normalizedCity);}
export function marineCacheFresh(data){const age=Date.now()-Date.parse(data?.fetchedAt||'');return Number.isFinite(age)&&age>=0&&age<MARINE_CACHE_TTL_MS;}
export function nearestMarineIndex(data,now=Date.now()){const epochs=marineEpochs(data);if(!epochs.length)return -1;let best=-1,delta=Infinity;for(let i=0;i<epochs.length;i++){const d=Math.abs(epochs[i]-now);if(Number.isFinite(d)&&d<delta){delta=d;best=i;}}return best;}
