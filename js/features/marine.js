import { fetchOpenMeteoJson } from '../api-budget.js';

const MARINE_URL='https://marine-api.open-meteo.com/v1/marine';
export const MARINE_CACHE_TTL_MS=6*3600_000;
export const COASTAL_MAX_DISTANCE_KM=50;

function haversineKm(aLat,aLon,bLat,bLon){const r=6371,toRad=x=>x*Math.PI/180,dLat=toRad(bLat-aLat),dLon=toRad(bLon-aLon),q=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(q));}
function nums(a){return Array.isArray(a)?a.map(v=>Number.isFinite(v)?v:null):[];}
function strings(a){return Array.isArray(a)?a.map(v=>typeof v==='string'?v:''):[];}
function countFinite(a){return Array.isArray(a)?a.filter(Number.isFinite).length:0;}

function urlFor(city){
  const u=new URL(MARINE_URL);
  u.searchParams.set('latitude',String(city.latitude));u.searchParams.set('longitude',String(city.longitude));
  // Keep the Marine request under 10 variables: daily summaries are derived client-side.
  u.searchParams.set('hourly','wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature');
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
  const hourlyRaw=raw?.hourly||{},gridLat=Number(raw?.latitude),gridLon=Number(raw?.longitude),distanceKm=Number.isFinite(gridLat)&&Number.isFinite(gridLon)?haversineKm(Number(city.latitude),Number(city.longitude),gridLat,gridLon):null;
  const hourly={timestamps:strings(hourlyRaw.time),waveHeight:nums(hourlyRaw.wave_height),waveDirection:nums(hourlyRaw.wave_direction),wavePeriod:nums(hourlyRaw.wave_period),swellHeight:nums(hourlyRaw.swell_wave_height),swellDirection:nums(hourlyRaw.swell_wave_direction),swellPeriod:nums(hourlyRaw.swell_wave_period),seaSurfaceTemperature:nums(hourlyRaw.sea_surface_temperature)};
  const result={fetchedAt:new Date().toISOString(),timezone:raw?.timezone||city.timezone||'UTC',grid:{latitude:gridLat,longitude:gridLon,distanceKm},hourly,daily:deriveDaily(hourly)};
  result.usablePoints=countFinite(result.hourly.waveHeight);
  result.coastal=Number.isFinite(distanceKm)&&distanceKm<=COASTAL_MAX_DISTANCE_KM&&result.usablePoints>=6;
  return result;
}

export async function fetchMarineForCity(city){const raw=await fetchOpenMeteoJson(urlFor(city),{timeoutMs:30000,category:'marine'});return normalizeMarine(raw,city);}
export function marineCacheFresh(data){return Boolean(data?.fetchedAt&&Date.now()-Date.parse(data.fetchedAt)<MARINE_CACHE_TTL_MS);}
export function nearestMarineIndex(data,now=Date.now()){const ts=data?.hourly?.timestamps||[];if(!ts.length)return -1;let best=-1,delta=Infinity;for(let i=0;i<ts.length;i++){const d=Math.abs(Date.parse(ts[i])-now);if(Number.isFinite(d)&&d<delta){delta=d;best=i;}}return best;}
