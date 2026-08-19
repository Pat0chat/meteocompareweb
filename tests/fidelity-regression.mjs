import assert from 'node:assert/strict';
import { makeI18n } from '../js/i18n.js';

class MemoryStorage { constructor(){this.map=new Map()} getItem(k){return this.map.has(k)?this.map.get(k):null} setItem(k,v){this.map.set(String(k),String(v))} removeItem(k){this.map.delete(k)} key(i){return [...this.map.keys()][i]??null} get length(){return this.map.size} }
const storage=new MemoryStorage();
globalThis.localStorage=new Proxy(storage,{ownKeys:t=>[...t.map.keys()],getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true}),get:(t,p)=>p in t?(t[p].bind?.(t)??t[p]):undefined});

const city={id:'test',name:'Paris',country:'France',admin1:'Île-de-France',latitude:48.85,longitude:2.35,timezone:'Europe/Paris'};
const mids=['AROME_FRANCE_HD','ICON_EU','GFS','ECMWF'];
const localParts=date=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:city.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const now=new Date();
const hours=[];for(let i=0;i<36;i++){const p=localParts(new Date(now.getTime()+i*3600e3));hours.push(`${p.year}-${p.month}-${p.day}T${p.hour}:00`);}
const days=[...new Set(Array.from({length:9},(_,i)=>{const p=localParts(new Date(now.getTime()+i*24*3600e3));return `${p.year}-${p.month}-${p.day}`;}))].slice(0,7);
const seriesByModel={};
mids.forEach((mid,k)=>{
  const temp=hours.map((_,i)=>18+Math.sin(i/4)*5+k*1.7);
  const precip=hours.map((_,i)=>(i>=6&&i<=10)?(k<2?.1:2+k):0);
  const probs=hours.map((_,i)=>(i>=6&&i<=10)?(k<2?15:85):10+k*3);
  const wind=hours.map((_,i)=>15+k*8+(i>12?5:0));
  seriesByModel[mid]={hourly:{timestamps:hours,temperature2m:temp,precipitation:precip,precipitationProbability:probs,cloudCover:hours.map((_,i)=>30+k*15+(i%3)*5),windSpeed10m:wind,windGusts10m:wind.map(v=>v+12),windDirection10m:hours.map((_,i)=>(180+i*7+k*10)%360),weatherCode:hours.map((_,i)=>(i>=6&&i<=10&&k>=2)?61:(k===3?3:2))},daily:{dates:days,tempMax:days.map((_,i)=>24+i+k*1.4),tempMin:days.map((_,i)=>14+i*.3+k*.5),precipitationSum:days.map((_,i)=>i===2?(k<2?0:9+k):.1*k),precipitationProbabilityMax:days.map((_,i)=>i===2?(k<2?15:90):20+k*5),windSpeedMax:days.map((_,i)=>20+i*2+k*7),windGustsMax:days.map((_,i)=>32+i*3+k*7),windDirection10mDominant:days.map((_,i)=>(200+i*10+k*12)%360),weatherCode:days.map((_,i)=>i===2&&k>=2?61:2),sunrise:days.map(d=>d+'T06:35'),sunset:days.map(d=>d+'T20:58')}};
});
const forecast={city,seriesByModel,fetchedAt:new Date().toISOString()};
localStorage.setItem('meteocompare.web.cities.v1',JSON.stringify([city]));
localStorage.setItem('meteocompare.web.forecast.test',JSON.stringify(forecast));
const biasDates=Array.from({length:20},(_,i)=>{const p=localParts(new Date(now.getTime()-(20-i)*24*3600e3));return `${p.year}-${p.month}-${p.day}`;});
const observations=[];const forecastsBias=[];
biasDates.forEach((date,i)=>{
  const observedTemp=23+(i%4)*.6,observedRain=i%4===0?4:0,observedWind=24+(i%5)*2;
  observations.push({variable:'TEMPERATURE',targetDate:date,value:observedTemp},{variable:'PRECIPITATION',targetDate:date,value:observedRain},{variable:'WIND_SPEED',targetDate:date,value:observedWind});
  mids.forEach((mid,k)=>{
    forecastsBias.push({modelId:mid,variable:'TEMPERATURE',targetDate:date,value:observedTemp+[.4,.8,1.2,1.7][k]});
    forecastsBias.push({modelId:mid,variable:'PRECIPITATION',targetDate:date,value:Math.max(0,observedRain+[.2,.5,1,1.5][k])});
    forecastsBias.push({modelId:mid,variable:'WIND_SPEED',targetDate:date,value:observedWind+[1.5,3,5,7][k]});
  });
});
localStorage.setItem('meteocompare.web.bias.test',JSON.stringify({reference:'ERA5',referenceLagDays:6,forecasts:forecastsBias,observations,updatedAt:Date.now()}));
localStorage.setItem('meteocompare.web.settings.v1',JSON.stringify({theme:'LIGHT',language:'FRENCH',enabledModelIds:mids,refreshInterval:'MANUAL',detailViewMode:'HOURLY',detailTab:'TEMPERATURE',confidenceMetric:'TEMPERATURE',chartHorizon:24,timelineMode:'HOURLY'}));

const listeners={};
let routeLandmarkFocuses=0;const routeLandmark={hasAttribute(){return false},getAttribute(){return null},setAttribute(){},removeAttribute(){},focus(options){assert.equal(options?.preventScroll,true,'route landmark focus must never scroll the page');routeLandmarkFocuses++;}};
const stickyTopbar={getBoundingClientRect(){return {height:72}}};
const app={_html:'',addEventListener(t,f){listeners[t]=f},contains(){return true},querySelector(sel){if(sel==='.topbar')return stickyTopbar;return routeLandmark},set innerHTML(v){this._html=v},get innerHTML(){return this._html}};
let sectionLookup=new Map(),selectorLookup=new Map();
const cssVars=new Map();const rootStyle={scrollBehavior:'',setProperty(prop,value){cssVars.set(prop,value)},removeProperty(prop){if(prop==='scroll-behavior')this.scrollBehavior='';cssVars.delete(prop)}};
globalThis.document={activeElement:null,documentElement:{dataset:{},lang:'',scrollTop:0,style:rootStyle},body:{scrollTop:0,classList:{toggle(){}}},querySelector(sel){if(sel==='#app')return app;if(sel==='#toast-root')return {appendChild(){}};return selectorLookup.get(sel)||null},getElementById(id){return sectionLookup.get(id)||null},createElement(){return {className:'',textContent:'',remove(){}}},addEventListener(){}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:false,language:'fr-FR'},configurable:true});
globalThis.location={hash:'#/city/test',href:'https://example.test/#/city/test'};
const historyEntries=[{url:location.hash,state:null}];let historyIndex=0;
globalThis.history={length:1,state:null,scrollRestoration:'auto',replaceState(state,_title,url){this.state=state;historyEntries[historyIndex]={url:url||location.hash,state};},pushState(state,_title,url){this.state=state;historyEntries.splice(historyIndex+1);historyEntries.push({url,state});historyIndex++;this.length=historyEntries.length;if(typeof url==='string'&&url.includes('#'))location.hash=url.slice(url.indexOf('#'));location.href='https://example.test/'+location.hash;},back(){if(historyIndex<=0)return;historyIndex--;const entry=historyEntries[historyIndex];this.state=entry.state;if(typeof entry.url==='string'&&entry.url.includes('#'))location.hash=entry.url.slice(entry.url.indexOf('#'));windowListeners.popstate?.({state:entry.state});}};globalThis.confirm=()=>true;
const windowListeners={};
let scrollTopCalls=0;const scrollCalls=[];globalThis.window={scrollY:0,addEventListener(type,fn){windowListeners[type]=fn;},matchMedia(){return {matches:false,addEventListener(){}}},scrollTo(arg,y){const top=typeof arg==='object'?Number(arg.top)||0:Number(y)||0;this.scrollY=top;document.documentElement.scrollTop=top;scrollCalls.push(top);if(top===0)scrollTopCalls++;}};
let rafRunning=false;const deferredRafs=[];
globalThis.requestAnimationFrame=cb=>{if(rafRunning){deferredRafs.push(cb);return deferredRafs.length+1;}rafRunning=true;try{cb(globalThis.performance?.now?.()||0);}finally{rafRunning=false;}return 1;};
globalThis.cancelAnimationFrame=()=>{};
function flushDeferredRafs(){while(deferredRafs.length){const batch=deferredRafs.splice(0);for(const cb of batch){rafRunning=true;try{cb(globalThis.performance?.now?.()||0);}finally{rafRunning=false;}}}}
globalThis.queueMicrotask||=(cb=>Promise.resolve().then(cb));
const realSetInterval=globalThis.setInterval;globalThis.setInterval=()=>1;
globalThis.fetch=async()=>({ok:true,json:async()=>({})});

await import(`../js/app.js?fidelity=${Date.now()}`);
const html=app.innerHTML;
assert.match(html,/class="global-agreement-value">\d+%/,'TodaySummary must expose the global agreement prominently');
assert.ok((html.match(/class="summary-metric-icon /g)||[]).length>=4,'TodaySummary must expose dedicated metric icons for temperature, precipitation and wind');
assert.match(html,/class="summary-agreement-track"/,'TodaySummary variable cards must use their available height for agreement detail');
const todayStart=html.indexOf('id="today-summary"'), agreementStart=html.indexOf('id="agreement"');
const why=html.indexOf('data-action="why-confidence"');
assert.ok(todayStart>=0&&why>todayStart&&why<agreementStart,'Why-this-agreement control must live in TodaySummary, before hourly band');
const bandFragment=html.slice(agreementStart,html.indexOf('id="evolution"',agreementStart));
assert.doesNotMatch(bandFragment,/data-action="why-confidence"/,'Hourly agreement band must not own the explanation action');
assert.match(html,/data-timeline-mode="HOURLY"/,'Timeline must offer 24h mode');
assert.match(html,/data-timeline-mode="DAILY"/,'Timeline must offer 7-day mode');
assert.match(html,/class="timeline-full"/,'Full rich timeline must be rendered');
assert.match(html,/class="timeline-temp-band"/,'Timeline must retain thermal heat bands');
assert.match(html,/class="timeline-precip-heat"/,'Timeline must retain precipitation heat indicators');
assert.match(html,/class="timeline-metric"/,'Timeline must retain precipitation, cloud and wind metrics');
assert.match(html,/class="chart-legend"/,'Agreement chart must have a legend');
assert.match(html,/class="agreement-strip"/,'Hourly agreement band must expose a color-coded confidence strip');
assert.match(html,/class="chart-band-segment (?:high|medium|low)"/,'The min-max inter-model envelope must itself be color-coded by agreement');
assert.match(html,/class="model-header-stack"/,'Model metadata and bias pills must use a non-overlapping stacked header layout');
assert.match(html,/agreement-level-legend[\s\S]*Élevé ≥80%[\s\S]*Moyen 50–79%[\s\S]*Faible &lt;50%/,'Agreement strip must explain high, medium and low confidence colors');
assert.match(html,/class="table-legend heatmap-legend"/,'Temperature table must have a heatmap legend');
assert.match(html,/class="heatmap-data-cell"[^>]*style="--heat:/,'Table cells must carry heatmap styling');
assert.match(html,/class="detail-workspace"/,'Desktop detail view must use a workspace layout');
assert.match(html,/class="detail-sidebar"/,'Desktop detail view must expose a navigation rail');
assert.equal(cssVars.get('--topbar-height'),'72px','sticky layout must measure the real topbar height');

assert.match(html,/4 modèles/,'model counts must be explicit rather than bare numbers');
assert.match(html,/data-bias-model="GFS"[^>]*data-bias-variable="TEMPERATURE"/,'temperature bias must be clickable from the GFS model header');
assert.ok((html.match(/data-bias-model=/g)||[]).length>=mids.length,'each eligible model header should expose its bias action');
assert.match(html,/class="reliability-rank-row"[^>]*data-bias-model=/,'Local reliability model rows must navigate to model bias pages');

function clickDataset(dataset,section=null,controlTop=null){const target={dataset,closest(selector){if(selector==='section[id]'&&section)return section;return this}};if(Number.isFinite(controlTop))target.getBoundingClientRect=()=>({top:controlTop});listeners.click({target});return app.innerHTML;}
function makeSection(id,top){return {id,getBoundingClientRect(){return {top}}};}
function makeControl(top){return {getBoundingClientRect(){return {top}}};}

// Real rerenders must translate the complete city-detail surface, not only the settings screen.
for(const [pref,lang] of [['ENGLISH','en'],['SPANISH','es'],['GERMAN','de'],['ITALIAN','it']]){
  clickDataset({language:pref});
  await Promise.resolve(); await Promise.resolve();
  const translated=app.innerHTML,tr=makeI18n(pref);
  assert.equal(document.documentElement.lang,lang,`document language must switch to ${lang}`);
  for(const key of ['overview','forecastTimeline','confidenceBand','reliability','detailedComparison','shareView','refreshWeather'])
    assert.ok(translated.includes(tr.t(key)),`${key} must rerender in ${lang}`);
}
clickDataset({language:'FRENCH'}); await Promise.resolve(); await Promise.resolve();

// Same-view controls must preserve the clicked control's visual position even if the rerender changes heights above it.
window.scrollY=900;document.documentElement.scrollTop=900;
selectorLookup.set('[data-detail-tab="PRECIPITATION"]',makeControl(205));
let switched=clickDataset({detailTab:'PRECIPITATION'},null,140);
assert.equal(window.scrollY,965,'changing a table variable must keep its control at the same viewport coordinate');
assert.match(switched,/Précipitations horaires/,'Hourly precipitation table must expose its heatmap legend');
assert.match(switched,/heatmap-data-cell[^>]*--heat:/,'Hourly precipitation values must remain heatmapped');
window.scrollY=1200;document.documentElement.scrollTop=1200;
selectorLookup.set('[data-chart-horizon="72"]',makeControl(170));
clickDataset({chartHorizon:'72'},null,110);
assert.equal(window.scrollY,1260,'changing graph zoom must preserve the zoom control position despite layout changes');
selectorLookup.clear();sectionLookup.clear();
switched=clickDataset({detailTab:'WIND'});
assert.match(switched,/Vent horaire/,'Hourly wind table must expose its heatmap legend');
assert.match(switched,/R = rafales/,'Wind legend must explain gust notation');
switched=clickDataset({detailTab:'CONDITIONS'});
assert.match(switched,/weather-legend/,'Conditions table must expose the weather legend');
switched=clickDataset({timelineMode:'DAILY'});
assert.match(switched,/data-timeline-mode="DAILY"[^>]*class=|class="seg-btn active" data-timeline-mode="DAILY"/,'Timeline must be switchable to the 7-day view');

let sourceBlurred=false;document.activeElement={blur(){sourceBlurred=true;}};
window.scrollY=2400;document.documentElement.scrollTop=2400;document.body.scrollTop=2400;
clickDataset({biasModel:'GFS',biasVariable:'TEMPERATURE',biasCity:'test'});
for(let i=0;i<20&&app.innerHTML.includes('feature-loading');i++) await new Promise(r=>setTimeout(r,5));
assert.match(location.hash,/\/bias\/GFS\/TEMPERATURE$/,'clicking a table bias must navigate to the model bias route');
assert.equal(sourceBlurred,true,'the clicked model control must lose focus before the route DOM is replaced');
assert.equal(window.scrollY,0,'Opening a model bias page must reset the viewport immediately to the top');
assert.equal(document.documentElement.scrollTop,0,'the document element must also be pinned to the top');
assert.equal(document.body.scrollTop,0,'the body scroll position must also be pinned to the top for browser compatibility');
assert.ok(routeLandmarkFocuses>0,'the new bias page must receive focus on its top landmark without scrolling');
// Simulate a browser restoring the previously focused control after the new DOM has already rendered.
window.scrollY=2400;document.documentElement.scrollTop=2400;document.body.scrollTop=2400;
flushDeferredRafs();
assert.equal(window.scrollY,0,'a delayed browser scroll restoration must be overridden on the following frame');
assert.equal(document.documentElement.scrollTop,0,'the delayed reset must also repin the document element');
assert.equal(document.body.scrollTop,0,'the delayed reset must also repin the body');
assert.ok(scrollTopCalls>0,'route navigation must perform an explicit top reset');
assert.equal(history.scrollRestoration,'manual','native browser restoration must be disabled in favor of deterministic app routing');
const biasPage=app.innerHTML;
assert.match(biasPage,/Fiabilité locale J\+1/,'dedicated model bias page must render');
assert.match(biasPage,/Indice local de fiabilité/,'bias page must expose the local reliability score');
assert.match(biasPage,/Erreur absolue moyenne/,'bias page must distinguish MAE from signed bias');
assert.match(biasPage,/Historique prévision \/ référence ERA5/,'bias page must restore forecast-vs-observation history');
assert.match(biasPage,/Rang \d+\/\d+ modèles/,'bias page rank must explicitly label the model count');

// Settings controls must not rebuild the whole page in a way that loses the
// user's viewport. Local toggles stay put; controls requiring a rerender are
// re-anchored to the clicked control over the following layout frames.
clickDataset({action:'settings'});flushDeferredRafs();
assert.equal(location.hash,'#/settings');
window.scrollY=1350;document.documentElement.scrollTop=1350;
clickDataset({modelToggle:'GFS'},null,245);
assert.equal(window.scrollY,1350,'toggling a weather model in Settings must not move the page');
window.scrollY=1420;document.documentElement.scrollTop=1420;
clickDataset({theme:'DARK'},null,190);
assert.equal(window.scrollY,1420,'changing the theme in Settings must not move the page');
window.scrollY=1510;document.documentElement.scrollTop=1510;
selectorLookup.set('[data-model-sort="FINESSE"]',makeControl(260));
clickDataset({modelSort:'FINESSE'},null,210);flushDeferredRafs();
assert.equal(window.scrollY,1560,'model sorting may relayout the list but must keep the clicked control at the same viewport coordinate');
window.scrollY=1600;document.documentElement.scrollTop=1600;
selectorLookup.set('[data-language="ENGLISH"]',makeControl(285));
clickDataset({language:'ENGLISH'},null,235);await Promise.resolve();await Promise.resolve();flushDeferredRafs();
assert.equal(window.scrollY,1650,'language changes must preserve the Settings control position after translated layout changes');

globalThis.setInterval=realSetInterval;
if(process.env.SNAPSHOT){ const fs=await import('node:fs'); fs.writeFileSync(process.env.SNAPSHOT,`<!doctype html><html data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"styles.css\"></head><body><div id=\"app\">${html}</div></body></html>`); }
console.log('MeteoCompare Web fidelity regression tests: OK');
