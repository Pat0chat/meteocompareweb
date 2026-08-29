import { searchCities } from '../api.js';
import { fetchJsonResource } from '../network.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from '../network-config.js';

const CACHE_TTL_MS=5*60_000;
const departmentCache=new Map();
const vigilanceCache=new Map();

function normalizeText(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function isFrance(value){
  const code=String(value?.countryCode||value?.country_code||'').toUpperCase();
  return code==='FR'||normalizeText(value?.country)==='france';
}
function hasExplicitForeignCountry(value){
  const code=String(value?.countryCode||value?.country_code||'').trim().toUpperCase(),country=normalizeText(value?.country);
  return Boolean((code&&code!=='FR')||(country&&country!=='france'));
}
const METROPOLITAN_DEPARTMENT_CODES=Object.freeze({
  'ain':'01','aisne':'02','allier':'03','alpes-de-haute-provence':'04','hautes-alpes':'05','alpes-maritimes':'06','ardeche':'07','ardennes':'08','ariege':'09','aube':'10','aude':'11','aveyron':'12','bouches-du-rhone':'13','calvados':'14','cantal':'15','charente':'16','charente-maritime':'17','cher':'18','correze':'19',
  'corse-du-sud':'2A','haute-corse':'2B','cote-d-or':'21','cotes-d-armor':'22','creuse':'23','dordogne':'24','doubs':'25','drome':'26','eure':'27','eure-et-loir':'28','finistere':'29','gard':'30','haute-garonne':'31','gers':'32','gironde':'33','herault':'34','ille-et-vilaine':'35','indre':'36','indre-et-loire':'37','isere':'38','jura':'39','landes':'40','loir-et-cher':'41','loire':'42','haute-loire':'43','loire-atlantique':'44','loiret':'45','lot':'46','lot-et-garonne':'47','lozere':'48','maine-et-loire':'49','manche':'50','marne':'51','haute-marne':'52','mayenne':'53','meurthe-et-moselle':'54','meuse':'55','morbihan':'56','moselle':'57','nievre':'58','nord':'59','oise':'60','orne':'61','pas-de-calais':'62','puy-de-dome':'63','pyrenees-atlantiques':'64','hautes-pyrenees':'65','pyrenees-orientales':'66','bas-rhin':'67','haut-rhin':'68','rhone':'69','haute-saone':'70','saone-et-loire':'71','sarthe':'72','savoie':'73','haute-savoie':'74','paris':'75','seine-maritime':'76','seine-et-marne':'77','yvelines':'78','deux-sevres':'79','somme':'80','tarn':'81','tarn-et-garonne':'82','var':'83','vaucluse':'84','vendee':'85','vienne':'86','haute-vienne':'87','vosges':'88','yonne':'89','territoire-de-belfort':'90','essonne':'91','hauts-de-seine':'92','seine-saint-denis':'93','val-de-marne':'94','val-d-oise':'95',
});
function codeFromAdmin2(admin2=''){
  const key=normalizeText(admin2).replace(/[’']/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return METROPOLITAN_DEPARTMENT_CODES[key]||null;
}
function codeFromPostcode(postcode,admin2=''){
  const raw=String(postcode||'').trim().toUpperCase();
  if(/^2[AB]$/.test(raw))return raw;
  if(!/^\d{5}$/.test(raw))return null;
  if(raw.startsWith('20')){
    const area=normalizeText(admin2);
    if(area.includes('corse-du-sud')||area.includes('corse du sud'))return '2A';
    if(area.includes('haute-corse')||area.includes('haute corse'))return '2B';
    return null;
  }
  if(/^97[1-6]/.test(raw))return null;
  const code=raw.slice(0,2);
  return /^(?:0[1-9]|[1-8]\d|9[0-5])$/.test(code)?code:null;
}
function cityDepartmentCode(city){
  const explicit=String(city?.departmentCode||'').trim().toUpperCase();
  if(/^(?:0[1-9]|1\d|2[1-9]|[3-8]\d|9[0-5]|2A|2B)$/.test(explicit))return explicit;
  for(const postcode of Array.isArray(city?.postcodes)?city.postcodes:[]) { const code=codeFromPostcode(postcode,city?.admin2); if(code)return code; }
  return codeFromAdmin2(city?.admin2);
}
function distanceSq(a,b){
  const lat=Number(a?.latitude)-Number(b?.latitude),lon=Number(a?.longitude)-Number(b?.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lon)?lat*lat+lon*lon:Infinity;
}


export function isVigilanceSupportedCity(city){
  if(!city||hasExplicitForeignCountry(city))return false;
  const postcodes=Array.isArray(city?.postcodes)?city.postcodes.map(value=>String(value||'').trim().toUpperCase()):[];
  if(postcodes.some(code=>/^97[1-6]\d{2}$/.test(code)))return false;
  if(cityDepartmentCode(city))return true;
  return isFrance(city);
}

export const VIGILANCE_LEVELS=Object.freeze({
  1:{key:'green',labelKey:'vigilanceLevelGreen'},
  2:{key:'yellow',labelKey:'vigilanceLevelYellow'},
  3:{key:'orange',labelKey:'vigilanceLevelOrange'},
  4:{key:'red',labelKey:'vigilanceLevelRed'},
});
export const VIGILANCE_PHENOMENA=Object.freeze({
  '1':{labelKey:'vigilancePhenomenonWind',icon:'wind'},
  '2':{labelKey:'vigilancePhenomenonRainFlood',icon:'rain'},
  '3':{labelKey:'vigilancePhenomenonStorm',icon:'storm'},
  '4':{labelKey:'vigilancePhenomenonFlood',icon:'flood'},
  '5':{labelKey:'vigilancePhenomenonSnowIce',icon:'snow'},
  '6':{labelKey:'vigilancePhenomenonHeat',icon:'heat'},
  '7':{labelKey:'vigilancePhenomenonCold',icon:'cold'},
  '8':{labelKey:'vigilancePhenomenonAvalanche',icon:'avalanche'},
  '9':{labelKey:'vigilancePhenomenonWaves',icon:'waves'},
});

export async function resolveFrenchDepartment(city,{signal=null}={}){
  if(!isVigilanceSupportedCity(city))return {supported:false,reason:hasExplicitForeignCountry(city)?'NOT_FRANCE':'NOT_COVERED'};
  const cached=departmentCache.get(String(city.id||''));if(cached)return cached;
  const direct=cityDepartmentCode(city);
  if(direct){const result={supported:true,code:direct,admin2:city.admin2||'',postcodes:Array.isArray(city.postcodes)?city.postcodes:[]};departmentCache.set(String(city.id||''),result);return result;}
  const candidates=(await searchCities(city.name||'', 'fr', signal)).filter(isFrance).sort((a,b)=>distanceSq(a,city)-distanceSq(b,city));
  const match=candidates.find(candidate=>distanceSq(candidate,city)<0.25*0.25)||candidates[0];
  if(!match)return {supported:false,reason:'DEPARTMENT_UNKNOWN'};
  const code=cityDepartmentCode(match);if(!code)return {supported:false,reason:'DEPARTMENT_UNKNOWN'};
  const result={supported:true,code,admin2:match.admin2||'',postcodes:match.postcodes||[],countryCode:'FR'};
  departmentCache.set(String(city.id||''),result);return result;
}

export function vigilanceMaxLevel(payload){
  let max=1;for(const period of payload?.periods||[])max=Math.max(max,Number(period?.maxColorId)||1);return max;
}
export function activeVigilancePhenomena(payload,minColor=2){
  const byId=new Map();
  for(const period of payload?.periods||[])for(const phenomenon of period?.phenomena||[]){
    const id=String(phenomenon.id),current=byId.get(id)||{id,maxColorId:1,intervals:[]};
    current.maxColorId=Math.max(current.maxColorId,Number(phenomenon.maxColorId)||1);
    current.intervals.push(...(phenomenon.intervals||[]).filter(x=>(Number(x.colorId)||1)>=minColor));byId.set(id,current);
  }
  return [...byId.values()].filter(x=>x.maxColorId>=minColor).sort((a,b)=>b.maxColorId-a.maxColorId||Number(a.id)-Number(b.id));
}

export async function fetchVigilanceForCity(city,{force=false,includeCoast=false,signal=null}={}){
  const department=await resolveFrenchDepartment(city,{signal});
  if(!department.supported)return {...department,cachedAt:Date.now()};
  const key=`${department.code}|${includeCoast?'coast':'land'}`,cached=vigilanceCache.get(key);
  if(!force&&cached&&Date.now()-cached.cachedAt<CACHE_TTL_MS)return {...cached,departmentResolution:department};
  const url=new URL(NETWORK_ENDPOINTS.firstParty.vigilance,globalThis.location?.origin||'http://localhost');
  url.searchParams.set('department',department.code);if(includeCoast)url.searchParams.set('coast','1');
  const data=await fetchJsonResource(url,{timeoutMs:NETWORK_TIMEOUTS_MS.vigilance,signal,cache:'no-store'});
  const result={...data,supported:true,departmentCode:department.code,departmentResolution:department,cachedAt:Date.now()};
  vigilanceCache.set(key,result);return result;
}
