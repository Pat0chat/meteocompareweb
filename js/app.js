import { WEATHER_MODELS, COVERAGE_LABELS, REFRESH_INTERVALS, getModel, selectedModels } from './models.js';
import { loadSettings, saveSettings, loadCities, saveCities, loadForecast, loadForecastAsync, saveForecast, deleteForecast, recordEvolutionSnapshot, loadEvolution, loadNormals, saveNormals, loadBias, saveBias, clearAllData } from './storage.js';
import { searchCities, fetchForecast, fetchClimateNormals, fetchPreviousRuns, fetchBiasArchive } from './api.js';
import { fromWmoCode, conditionInfo, cityToday, addDays, dayConfidence, currentConditions, hourlyConfidenceBand, aggregateDay, homeHeatmap, buildScenarios, aggregateNormals, normalizePreviousRuns, normalizeBiasObservations, computeBiases, buildEvolution, reliabilityRanking, windArrow, formatWindDirection, dateLabel, timeLabel, relativeAge, dailyCondition, dailyCloudCoverMean, buildTimelinePoints, selectRegularTimelinePoints } from './domain.js';
import { makeI18n, languageCode } from './i18n.js';

const state = {
  settings: loadSettings(),
  cities: loadCities(),
  forecasts: {},
  loading: new Set(),
  errors: {},
  modal: null,
  route: parseRoute(),
  normals: {},
  evolution: {},
  bias: {},
  biasRefresh: new Set(),
  online: navigator.onLine,
  compareModelIds: [],
};
applyRouteViewState(state.route);
state.cities.forEach(c => {
  const f=loadForecast(c.id); if(f) state.forecasts[c.id]=f;
  const n=loadNormals(c.id); if(n) state.normals[c.id]=n;
  state.evolution[c.id]=loadEvolution(c.id);
  state.bias[c.id]=loadBias(c.id);
});

const app = document.querySelector('#app');
let searchTimer = null;
let searchAbort = null;
let searchSeq = 0;
let autoRefreshTimer = null;
let dueRefreshRunning = false;
let renderQueued = false;
let renderFrame = 0;
let lastFocusedBeforeModal = null;
let i18nCacheKey = null;
let i18nCache = null;
const numberFormatters = new Map();
const forecastViewCache = new WeakMap();
const seriesIndexCache = new WeakMap();
const routeScrollPositions = new Map();
let pendingScrollDirective = null;
let interactionScrollContext = null;
let historyScrollRaf = 0;
let routeTransitionToken = 0;
const supportsHistoryRouting = typeof history?.pushState === 'function' && typeof history?.replaceState === 'function';

init();

function init() {
  applyTheme();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker:', err));
  }
  app.addEventListener('click', handleAppClick);
  app.addEventListener('input', handleAppInput);
  app.addEventListener('toggle', handleDetailsToggle, true);
  document.addEventListener?.('keydown', handleGlobalKeydown);
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDueCities();});
  if(supportsHistoryRouting){
    try{ history.scrollRestoration='manual'; history.replaceState({...history.state,mcRouteKey:routeKey(state.route),mcScrollY:currentScrollY()},'',location.href); }catch{}
    window.addEventListener('popstate',event=>handleHistoryNavigation(event));
    window.addEventListener('scroll',scheduleHistoryScrollSnapshot,{passive:true});
  }else{
    window.addEventListener('hashchange',()=>{state.route=parseRoute();applyRouteViewState(state.route);state.modal=null;cancelCitySearch();const saved=routeScrollPositions.get(routeKey(state.route));render({scroll:{type:'absolute',y:state.route.name==='bias'?0:(Number.isFinite(saved)?saved:0)}});onRouteSettled();});
  }
  window.addEventListener('online',()=>{state.online=true;render();refreshDueCities();});
  window.addEventListener('offline',()=>{state.online=false;render();});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='SYSTEM')applyTheme();});
  render({scroll:{type:'absolute',y:0}});
  hydrateForecastStorage().finally(()=>{onRouteSettled();refreshDueCities();});
  autoRefreshTimer=setInterval(refreshDueCities,60_000);
}
async function hydrateForecastStorage(){
  let changed=false;
  await Promise.all(state.cities.map(async city=>{
    const f=await loadForecastAsync(city.id);
    if(f&&state.forecasts[city.id]!==f){state.forecasts[city.id]=f;changed=true;}
  }));
  if(changed)render();
}

function parseRoute(){
  const raw=(location.hash||'#/').replace(/^#/,'');
  const [pathPart,queryString='']=raw.split('?',2),parts=pathPart.split('/').filter(Boolean),query=new URLSearchParams(queryString);
  const view={
    tab:query.get('tab'), mode:query.get('mode'), metric:query.get('metric'),
    horizon:Number(query.get('h')), timeline:query.get('timeline'),
    compareModels:(query.get('models')||'').split(',').filter(Boolean).map(decodeURIComponent)
  };
  if(parts[0]==='settings')return {name:'settings'};
  if(parts[0]==='compare')return {name:'compare',ids:(query.get('cities')||'').split(',').filter(Boolean).map(decodeURIComponent).slice(0,3)};
  if(parts[0]==='city'&&parts[1]&&parts[2]==='bias'&&parts[3]&&parts[4])return {name:'bias',id:decodeURIComponent(parts[1]),modelId:decodeURIComponent(parts[3]),variable:decodeURIComponent(parts[4])};
  if(parts[0]==='city'&&parts[1])return {name:'city',id:decodeURIComponent(parts[1]),view};
  return {name:'home'};
}
function routeKey(route){return route.name==='city'?`city:${route.id}`:route.name==='bias'?`bias:${route.id}:${route.modelId}:${route.variable}`:route.name==='compare'?`compare:${(route.ids||[]).join(',')}`:route.name;}
function applyRouteViewState(route){
  if(route?.name!=='city')return; const v=route.view||{};
  if(['CONDITIONS','TEMPERATURE','PRECIPITATION','WIND'].includes(v.tab))state.settings.detailTab=v.tab;
  if(['DAILY','HOURLY'].includes(v.mode))state.settings.detailViewMode=v.mode;
  if(['TEMPERATURE','PRECIPITATION','WIND'].includes(v.metric))state.settings.confidenceMetric=v.metric;
  if([24,72,168].includes(v.horizon))state.settings.chartHorizon=v.horizon;
  if(['HOURLY','DAILY'].includes(v.timeline))state.settings.timelineMode=v.timeline;
  state.compareModelIds=(v.compareModels||[]).filter(id=>WEATHER_MODELS.some(m=>m.id===id)).slice(0,4);
}
function syncCityViewUrl(){
  if(state.route.name!=='city')return;
  const q=new URLSearchParams();q.set('tab',state.settings.detailTab||'CONDITIONS');q.set('mode',state.settings.detailViewMode||'DAILY');q.set('metric',state.settings.confidenceMetric||'TEMPERATURE');q.set('h',String(state.settings.chartHorizon||168));q.set('timeline',state.settings.timelineMode||'HOURLY');
  if(state.compareModelIds.length)q.set('models',state.compareModelIds.join(','));
  const hash=`#/city/${encodeURIComponent(state.route.id)}?${q}`;
  state.route={...state.route,view:{tab:state.settings.detailTab,mode:state.settings.detailViewMode,metric:state.settings.confidenceMetric,horizon:Number(state.settings.chartHorizon),timeline:state.settings.timelineMode,compareModels:[...state.compareModelIds]}};
  if(supportsHistoryRouting){try{history.replaceState({...history.state,mcRouteKey:routeKey(state.route),mcScrollY:currentScrollY()},'',hash);}catch{}}else if(location.hash!==hash)location.replace?.(hash);
}

function currentScrollY(){return Number(window.scrollY ?? document.documentElement?.scrollTop ?? 0)||0;}
function scrollInstantTo(y){
  const top=Math.max(0,Number(y)||0),root=document.documentElement,body=document.body,previous=root?.style?.scrollBehavior;
  if(root?.style)root.style.scrollBehavior='auto';
  try{if(root)root.scrollTop=top;if(body)body.scrollTop=top;}catch{}
  try{window.scrollTo?.({top,left:0,behavior:'auto'});}catch{window.scrollTo?.(0,top);}
  try{if(root)root.scrollTop=top;if(body)body.scrollTop=top;}catch{}
  if(root?.style){if(previous)root.style.scrollBehavior=previous;else root.style.removeProperty?.('scroll-behavior');}
}
function scrollControlSelector(target){
  if(!target?.dataset)return null;
  const keys=[['confidenceMetric','data-confidence-metric'],['chartHorizon','data-chart-horizon'],['detailMode','data-detail-mode'],['detailTab','data-detail-tab'],['timelineMode','data-timeline-mode'],['theme','data-theme'],['language','data-language'],['refreshInterval','data-refresh-interval'],['modelSort','data-model-sort'],['modelToggle','data-model-toggle'],['biasRefreshCity','data-bias-refresh-city'],['compareModel','data-compare-model'],['density','data-density']];
  for(const [key,attrName] of keys){if(target.dataset[key]!=null){const value=String(target.dataset[key]).replace(/\\/g,'\\\\').replace(/"/g,'\\"');return `[${attrName}="${value}"]`;}}
  return null;
}
function captureScrollContext(target=null){
  const y=currentScrollY(),selector=scrollControlSelector(target);
  if(selector&&typeof target?.getBoundingClientRect==='function')return {type:'selector',selector,top:target.getBoundingClientRect().top,y};
  const section=target?.closest?.('section[id]');
  if(section?.id&&typeof section.getBoundingClientRect==='function')return {type:'anchor',id:section.id,top:section.getBoundingClientRect().top,y};
  return {type:'absolute',y};
}
function focusRouteLandmark(){
  const landmark=app?.querySelector?.('main h1, main h2, main');
  if(!landmark)return;
  const hadTabindex=landmark.hasAttribute?.('tabindex'),previousTabindex=landmark.getAttribute?.('tabindex');
  if(!hadTabindex)landmark.setAttribute?.('tabindex','-1');
  try{landmark.focus?.({preventScroll:true});}catch{}
  if(!hadTabindex)queueMicrotask(()=>{if(previousTabindex==null)landmark.removeAttribute?.('tabindex');else landmark.setAttribute?.('tabindex',previousTabindex);});
}
function stabilizeRouteTop(directive){
  if(!directive||directive.type!=='route-top')return;
  const token=directive.token,key=directive.routeKey;
  const stillCurrent=()=>token===routeTransitionToken&&routeKey(state.route)===key;
  const pin=()=>{if(stillCurrent())scrollInstantTo(0);};
  focusRouteLandmark();
  pin();
  queueMicrotask(pin);
  requestAnimationFrame(()=>{pin();requestAnimationFrame(pin);});
}
function applyScrollDirective(directive){
  if(!directive)return;
  if(directive.type==='route-top'){scrollInstantTo(0);return;}
  let anchor=null;
  if(directive.type==='selector')anchor=document.querySelector?.(directive.selector);
  else if(directive.type==='anchor')anchor=document.getElementById?.(directive.id);
  if(anchor&&typeof anchor.getBoundingClientRect==='function'){
    const delta=anchor.getBoundingClientRect().top-directive.top;
    scrollInstantTo(currentScrollY()+delta);
    return;
  }
  scrollInstantTo(directive.y);
}
function saveCurrentRouteScroll(){
  const y=currentScrollY(),key=routeKey(state.route);routeScrollPositions.set(key,y);
  if(supportsHistoryRouting){try{history.replaceState({...history.state,mcRouteKey:key,mcScrollY:y},'',location.href);}catch{}}
}
function scheduleHistoryScrollSnapshot(){
  if(!supportsHistoryRouting||historyScrollRaf)return;
  historyScrollRaf=requestAnimationFrame(()=>{historyScrollRaf=0;saveCurrentRouteScroll();});
}
function applyRouteFromLocation(scrollY=0,options={}){
  state.route=parseRoute();applyRouteViewState(state.route);state.modal=null;cancelCitySearch();
  const y=Math.max(0,Number(scrollY)||0);
  if(options.newRoute){
    const token=++routeTransitionToken;
    render({scroll:{type:'route-top',y:0,token,routeKey:routeKey(state.route)},immediate:true});
  }else render({scroll:{type:'absolute',y},immediate:Boolean(options.immediate)});
  onRouteSettled();
}
function handleHistoryNavigation(event){
  const route=parseRoute(),key=routeKey(route),saved=Number(event?.state?.mcScrollY);
  state.route=route;applyRouteViewState(route);state.modal=null;cancelCitySearch();
  const fallback=routeScrollPositions.get(key),y=Number.isFinite(saved)?saved:(Number.isFinite(fallback)?fallback:0);
  render({scroll:{type:'absolute',y},immediate:true});onRouteSettled();
}
function go(path){
  saveCurrentRouteScroll();
  const hash=String(path||'#/').startsWith('#')?String(path||'#/'):`#${path}`;
  if(location.hash===hash)return;
  try{const active=document.activeElement;if(active&&active!==document.body&&typeof active.blur==='function')active.blur();}catch{}
  if(supportsHistoryRouting){
    try{history.pushState({mcRouteKey:null,mcScrollY:0},'',hash);scrollInstantTo(0);applyRouteFromLocation(0,{newRoute:true});return;}catch{}
  }
  routeTransitionToken++;
  scrollInstantTo(0);
  location.hash=hash;
}
function i18n(){
  const key=`${state.settings.language}|${navigator.language||''}`;
  if(key!==i18nCacheKey){i18nCacheKey=key;i18nCache=makeI18n(state.settings.language);numberFormatters.clear();}
  return i18nCache;
}
function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function attr(v=''){ return esc(v).replace(/`/g,'&#96;'); }
function fmt(v,d=0){
  if(!Number.isFinite(v))return '—';
  const locale=i18n().locale,key=`${locale}|${d}`;
  let nf=numberFormatters.get(key);
  if(!nf){nf=new Intl.NumberFormat(locale,{maximumFractionDigits:d,minimumFractionDigits:d});numberFormatters.set(key,nf);}
  return nf.format(v);
}
function fmtRange(a,b,unit='',d=0){ if(!Number.isFinite(a)||!Number.isFinite(b))return '—'; return `${fmt(a,d)}–${fmt(b,d)}${unit}`; }
function localizedConditionInfo(condition){
  const base=conditionInfo(condition); const {t}=i18n();
  const key={CLEAR:'weather_clear',MAINLY_CLEAR:'weather_mainly_clear',PARTLY_CLOUDY:'weather_partly_cloudy',OVERCAST:'weather_overcast',FOG:'weather_fog',DRIZZLE:'weather_drizzle',RAIN:'weather_rain',FREEZING_RAIN:'weather_freezing_rain',SNOW:'weather_snow',RAIN_SHOWERS:'weather_rain_showers',SNOW_SHOWERS:'weather_snow_showers',THUNDERSTORM:'weather_thunderstorm',UNKNOWN:'weather_unknown'}[condition]||'weather_unknown';
  return {...base,label:t(key)};
}
function conditionMarkup(condition,size='normal'){const inf=localizedConditionInfo(condition);return `<span class="weather-icon" title="${esc(inf.label)}" style="font-size:${size==='small'?'1.25rem':'2.35rem'}">${inf.icon}</span>`;}
function confidenceClass(percent){return percent>=80?'high':percent>=50?'medium':'low';}
function modelCountLabel(count){return `${count} ${i18n().t('models')}`;}
function confidencePill(percent,count){ if(!Number.isFinite(percent))return '';return `<span class="pill confidence ${confidenceClass(percent)}">◎ ${percent}%${Number.isFinite(count)?` · ${modelCountLabel(count)}`:''}</span>`; }
function summaryMetricIcon(kind){
  const common='viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if(kind==='temperature')return `<svg ${common}><path d="M14 14.76V5a4 4 0 0 0-8 0v9.76a6 6 0 1 0 8 0Z"/><path d="M10 7v9"/><path d="M8.5 17.5a2.12 2.12 0 1 0 3 0 2.12 2.12 0 0 0-3 0"/></svg>`;
  if(kind==='precipitation')return `<svg ${common}><path d="M12 3.2S6.5 9.4 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3.2 12 3.2Z"/><path d="M9.2 15.1c.45 1.15 1.25 1.75 2.55 1.9"/></svg>`;
  return `<svg ${common}><path d="M3 8h10.5a2.5 2.5 0 1 0-2.2-3.7"/><path d="M3 12h15.5a2.5 2.5 0 1 1-2.2 3.7"/><path d="M3 16h7"/></svg>`;
}
function uiIcon(kind,size=17){
  const common=`viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths={
    home:'<path d="M3.5 10.8 12 3.8l8.5 7"/><path d="M5.5 9.7V20h13V9.7"/><path d="M9.5 20v-6h5v6"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.24.62.84 1.02 1.5 1.02H21v4h-.1c-.66 0-1.26.4-1.5.98Z"/>',
    back:'<path d="m15 18-6-6 6-6"/>',
    refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 8.2A7 7 0 0 1 17.7 6L20 11"/><path d="M17.9 15.8A7 7 0 0 1 6.3 18L4 13"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };
  return `<svg ${common}>${paths[kind]||paths.home}</svg>`;
}
function summaryAgreement(percent,count,detail=''){
  if(!Number.isFinite(percent))return `<div class="summary-agreement-detail muted"><span>Accord</span><strong>—</strong></div>`;
  const level=confidenceClass(percent);
  return `<div class="summary-agreement-detail ${level}"><div class="summary-agreement-copy"><span>Accord</span><strong>${Math.round(percent)}%</strong><small>${Number.isFinite(count)?modelCountLabel(count):''}${detail?` · ${esc(detail)}`:''}</small></div><div class="summary-agreement-track" aria-hidden="true"><i style="--agreement:${Math.max(0,Math.min(100,percent))}%"></i></div></div>`;
}
function formatExactAge(iso){
  const ms=Date.now()-Date.parse(iso||'');if(!Number.isFinite(ms)||ms<0)return 'âge inconnu';
  const min=Math.floor(ms/60000);if(min<1)return 'à l’instant';if(min<60)return `${min} min`;const h=Math.floor(min/60),m=min%60;if(h<24)return `${h} h${m?` ${m} min`:''}`;const d=Math.floor(h/24);return `${d} j ${h%24} h`;
}
function forecastHealth(f){
  const age=Date.now()-Date.parse(f?.fetchedAt||'');const refreshMs=Math.max(60,refreshIntervalMinutes()||60)*60000;
  const stale=!Number.isFinite(age)||age>Math.max(refreshMs*2,3*3600e3);
  if(!state.online)return {class:stale?'stale':'cached',label:stale?'Hors ligne · cache ancien':'Hors ligne · cache récent',detail:f?.fetchedAt?`données de ${formatExactAge(f.fetchedAt)}`:'aucune donnée'};
  if(stale)return {class:'stale',label:'Cache ancien',detail:f?.fetchedAt?`chargé il y a ${formatExactAge(f.fetchedAt)}`:'date inconnue'};
  return {class:'live',label:'Données en ligne',detail:f?.fetchedAt?`chargées il y a ${formatExactAge(f.fetchedAt)}`:'récentes'};
}
function modelRunInfo(f,modelId){
  const meta=f?.modelMeta?.[modelId]||{},run=meta.runTimestamp?Date.parse(meta.runTimestamp):NaN;
  const runAge=Number.isFinite(run)?Math.max(0,Date.now()-run):null;
  const allRuns=Object.values(f?.modelMeta||{}).map(x=>Date.parse(x?.runTimestamp||'')).filter(Number.isFinite),newest=allRuns.length?Math.max(...allRuns):null;
  const older=runAge!=null&&newest!=null&&newest-run>6*3600e3;
  const coverage=meta.lastTimestamp?`couvre jusqu’au ${dateLabel(meta.lastTimestamp.slice(0,10),i18n().locale)} ${timeLabel(meta.lastTimestamp)}`:'couverture inconnue';
  return {known:runAge!=null,older,label:runAge!=null?`run ${formatExactAge(meta.runTimestamp)}`:'run exact non exposé',coverage};
}
function currentCityForecast(){return state.route.name==='city'?state.forecasts[state.route.id]:state.route.name==='bias'?state.forecasts[state.route.id]:null;}
function toast(message){const root=document.querySelector('#toast-root');if(!root)return;const el=document.createElement('div');el.className='toast';el.textContent=message;root.appendChild(el);setTimeout(()=>el.remove(),3500);}

function viewCache(f){let c=forecastViewCache.get(f);if(!c){c={days:new Map(),scenarios:new Map(),bands:new Map(),heat:new Map(),evolutionSource:null,evolutionReport:null,biasSource:null,biasToday:null,biasReport:null};forecastViewCache.set(f,c);}return c;}
function cachedAggregateDay(f,date){const c=viewCache(f);if(!c.days.has(date))c.days.set(date,aggregateDay(f,date));return c.days.get(date);}
function cachedScenarios(f,limit=null){const key=limit==null?'all':String(limit),c=viewCache(f);if(!c.scenarios.has(key))c.scenarios.set(key,limit==null?buildScenarios(f):buildScenarios(f,limit));return c.scenarios.get(key);}
function cachedBand(f,metric,horizon){const key=`${metric}|${horizon}`,c=viewCache(f);if(!c.bands.has(key))c.bands.set(key,hourlyConfidenceBand(f,metric,horizon));return c.bands.get(key);}
function cachedHeatmap(f,hours){const c=viewCache(f);if(!c.heat.has(hours))c.heat.set(hours,homeHeatmap(f,hours));return c.heat.get(hours);}
function cachedEvolution(f,snapshots){const c=viewCache(f);if(c.evolutionSource!==snapshots){c.evolutionSource=snapshots;c.evolutionReport=buildEvolution(f,snapshots);}return c.evolutionReport;}
function cachedBiases(f,biasSource,today){const c=viewCache(f);if(c.biasSource!==biasSource||c.biasToday!==today){c.biasSource=biasSource;c.biasToday=today;c.biasReport=computeBiases(biasSource,today);}return c.biasReport;}

function applyTheme(){
  let dark=state.settings.theme==='DARK'||(state.settings.theme==='SYSTEM'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light'; document.documentElement.dataset.density=state.settings.density==='COMPACT'?'compact':'comfortable'; document.documentElement.lang=languageCode(state.settings.language);
}

function render(options={}){
  if(options.scroll)pendingScrollDirective=options.scroll;
  else if(!pendingScrollDirective&&app?.innerHTML)pendingScrollDirective=interactionScrollContext||captureScrollContext();
  if(options.immediate){
    if(renderFrame){try{globalThis.cancelAnimationFrame?.(renderFrame);}catch{}renderFrame=0;}
    renderQueued=false;
    renderNow();
    return;
  }
  if(renderQueued)return;
  renderQueued=true;
  renderFrame=requestAnimationFrame(()=>{renderFrame=0;renderQueued=false;renderNow();});
}
function renderNow(){
  const scrollDirective=pendingScrollDirective;pendingScrollDirective=null;
  const {t}=i18n();
  let content=''; if(state.route.name==='home')content=renderHome(); else if(state.route.name==='settings')content=renderSettings(); else if(state.route.name==='bias')content=renderBiasDetailPage(state.route); else if(state.route.name==='compare')content=renderCityComparison(state.route); else content=renderCityDetail(state.route.id);
  app.innerHTML=`${renderTopbar()}${!state.online?`<div class="page"><div class="banner warn" role="status">📡 ${esc(t('offline'))}</div></div>`:''}${content}${renderModal()}`;
  applyScrollDirective(scrollDirective);
  stabilizeRouteTop(scrollDirective);
  document.body?.classList?.toggle?.('modal-open',Boolean(state.modal));
  if(state.modal){queueMicrotask(()=>{const input=document.querySelector('#city-search');const dialog=document.querySelector('.modal');(input||dialog?.querySelector('button,input,a,[tabindex]:not([tabindex="-1"])'))?.focus?.({preventScroll:true});});}
}

function renderTopbar(){
  const {t}=i18n();
  const isHome=state.route.name==='home', isSettings=state.route.name==='settings',activeForecast=currentCityForecast(),health=activeForecast?forecastHealth(activeForecast):null,statusLabel=health?.label||(state.online?'Données en ligne':'Hors ligne'),statusTitle=health?`${health.label} · ${health.detail}`:(state.online?'Connexion active · appels météo disponibles':'Hors ligne · données locales');
  return `<header class="topbar"><div class="topbar-inner">
    ${!isHome?`<button class="icon-btn" data-action="back" aria-label="${esc(t('back'))}" title="${esc(t('back'))}">${uiIcon('back',18)}</button>`:''}
    <div class="brand" role="link" tabindex="0" data-action="home" aria-label="MeteoCompare — ${esc(t('cities'))}"><img class="logo" src="assets/icon.png" alt=""><div><div class="brand-title">MeteoCompare</div><div class="brand-subtitle">${esc(t('subtitle'))}</div></div></div>
    <nav class="topbar-nav" aria-label="Navigation principale">
      <button class="nav-btn ${isHome?'active':''}" data-action="home" ${isHome?'aria-current="page"':''}><span class="nav-icon">${uiIcon('home')}</span><span>${esc(t('cities'))}</span></button>
      <button class="nav-btn ${isSettings?'active':''}" data-action="settings" ${isSettings?'aria-current="page"':''}><span class="nav-icon">${uiIcon('settings')}</span><span>${esc(t('settings'))}</span></button>
    </nav>
    <div class="topbar-spacer"></div>
    <div class="topbar-system-status ${health?.class|| (state.online?'online':'offline')}" title="${esc(statusTitle)}"><span class="system-led" aria-hidden="true"></span><span>${esc(statusLabel)}</span></div>
  </div></header>`;
}

function renderHome(){
  const {t}=i18n();
  const cards=state.cities.map(renderCityCard).join('');
  const forecasts=Object.values(state.forecasts).filter(Boolean);
  const modelCounts=forecasts.map(f=>Object.keys(f.seriesByModel||{}).length).filter(Number.isFinite);
  const avgModels=modelCounts.length?Math.round(modelCounts.reduce((a,b)=>a+b,0)/modelCounts.length):state.settings.enabledModelIds.length;
  const fresh=state.cities.filter(c=>isForecastFresh(state.forecasts[c.id])).length;
  const busy=state.loading.size;
  return `<main class="page"><section class="hero"><div class="hero-copy"><div class="eyebrow">Dashboard météo</div><h1>${esc(t('cities'))}</h1><p>${esc(t('webHomeIntro'))}</p></div><div class="page-actions">${state.cities.length>=2?`<button class="btn tonal" data-action="open-city-compare">Comparer des villes</button>`:''}<button class="btn tonal" data-action="refresh-all" ${busy?'disabled':''}><span class="btn-icon ${busy?'spinning':''}">${uiIcon('refresh')}</span>${esc(t('refresh'))}</button><button class="btn primary" data-action="open-add-city"><span class="btn-icon">${uiIcon('plus')}</span>${esc(t('addCity'))}</button></div></section>
  <section class="dashboard-kpis" aria-label="Résumé"><div class="kpi"><div class="kpi-label">Villes suivies</div><div class="kpi-value">${state.cities.length}</div><div class="kpi-note">favoris enregistrés localement</div></div><div class="kpi"><div class="kpi-label">Modèles actifs</div><div class="kpi-value">${modelCountLabel(state.settings.enabledModelIds.length)}</div><div class="kpi-note">sélection configurée</div></div><div class="kpi"><div class="kpi-label">Modèles disponibles</div><div class="kpi-value">${modelCountLabel(avgModels)}</div><div class="kpi-note">moyenne sur les données chargées</div></div><div class="kpi"><div class="kpi-label">Caches à jour</div><div class="kpi-value">${fresh}/${state.cities.length||0}</div><div class="kpi-note">selon la cadence choisie</div></div></section>
  ${state.cities.length?`<section class="grid city-grid" aria-label="${esc(t('cities'))}">${cards}</section>`:`<section class="empty-state"><div class="big">🌦️</div><h2>${esc(t('emptyTitle'))}</h2><p>${esc(t('emptyBody'))}</p><button class="btn primary" data-action="open-add-city">＋ ${esc(t('addCity'))}</button></section>`}
  </main>`;
}

function renderCityCard(city){
  const {t}=i18n(); const f=state.forecasts[city.id]; const loading=state.loading.has(city.id); const err=state.errors[city.id];
  if(!f && loading)return `<article class="skeleton" aria-label="${esc(t('loading'))}"></article>`;
  if(!f)return `<article class="card city-card" role="link" tabindex="0" data-city-open="${attr(city.id)}"><div class="card-body"><div class="city-card-head"><div><h2 class="city-name">${esc(city.name)}</h2><div class="city-place">${esc(placeLine(city))}</div></div></div><div class="banner ${err?'error':'info'}">${err?esc(err):esc(t('noCache'))}</div><button class="btn tonal" data-refresh-city="${attr(city.id)}">↻ ${esc(t('refresh'))}</button></div></article>`;
  const now=currentConditions(f); const today=cityToday(f.city.timezone); const day=cachedAggregateDay(f,today); const info=localizedConditionInfo(now.condition||day.condition); const heat=cachedHeatmap(f,12); const conf=day.confidence?.overallPercent;
  const minT=day.tempMin,maxT=day.tempMax; const precip=day.precip; const wind=day.wind;
  return `<article class="card city-card" role="link" tabindex="0" data-city-open="${attr(city.id)}" style="--accent:${info.accent}"><div class="card-body">
    <div class="city-card-head"><div><h2 class="city-name">${esc(city.name)}</h2><div class="city-place">${esc(placeLine(city))}</div></div><button class="icon-btn" data-city-menu="${attr(city.id)}" aria-label="Options">⋮</button></div>
    <div class="weather-now">${conditionMarkup(now.condition||day.condition)}<div><div class="current-temp">${Number.isFinite(now.temperature)?`${fmt(now.temperature,1)}°`:'—'}</div><div class="now-meta">${esc(info.label)}${Number.isFinite(now.cloudCover)&&['PARTLY_CLOUDY','OVERCAST'].includes(now.condition)?` · ${now.cloudCover}% ☁`:''}</div></div>${Number.isFinite(conf)?`<div style="margin-left:auto">${confidencePill(conf,Object.keys(f.seriesByModel).length)}</div>`:''}</div>
    <div class="metric-row"><div class="metric"><div class="metric-label">T° min/max</div><div class="metric-value">${Number.isFinite(minT)&&Number.isFinite(maxT)?`${fmt(minT)}° / ${fmt(maxT)}°`:'—'}</div></div><div class="metric"><div class="metric-label">${esc(t('precipitation'))}</div><div class="metric-value">${Number.isFinite(precip)?`${fmt(precip,1)} mm`:'—'}</div></div><div class="metric"><div class="metric-label">${esc(t('wind'))}</div><div class="metric-value">${Number.isFinite(wind)?`${fmt(wind)} km/h`:'—'}</div></div></div>
    ${renderHeatmap(heat)}
    ${day.sunrise||day.sunset?`<div class="footer-line" style="justify-content:flex-start"><span>☀ ${esc(t('sunrise'))} ${day.sunrise?timeLabel(day.sunrise):'—'}</span><span>☾ ${esc(t('sunset'))} ${day.sunset?timeLabel(day.sunset):'—'}</span></div>`:''}
    <details style="margin-top:10px" data-city-scenarios="${attr(city.id)}"><summary class="small" style="cursor:pointer;font-weight:700">${esc(t('models'))} · scénarios 12 h</summary><div class="scenario-list" data-scenario-body><div class="small" style="padding:8px 0">Ouvrez pour calculer les scénarios.</div></div></details>
    <div class="footer-line"><span>${Object.keys(f.seriesByModel).length} ${esc(t('models'))}</span><span class="cache-inline ${forecastHealth(f).class}">${esc(forecastHealth(f).label)} · ${esc(formatExactAge(f.fetchedAt))}${loading?' · ⟳':''}</span></div>
    ${err?`<div class="banner error" style="margin-bottom:0">${esc(err)}</div>`:''}
  </div></article>`;
}

function renderHeatmap(heat){
  const temps=heat.map(x=>x.temp).filter(Number.isFinite); const lo=temps.length?Math.min(...temps):0,hi=temps.length?Math.max(...temps):1,span=Math.max(.1,hi-lo);
  return `<div class="heatmap-strip" aria-label="Prévision température sur 12 heures">${heat.map(x=>{const n=Number.isFinite(x.temp)?(x.temp-lo)/span:.5;const hue=Math.round(210-(210*n));const bg=`hsl(${hue} 65% ${document.documentElement.dataset.theme==='dark'?30:80}%)`;return `<div class="heat-cell" style="background:${bg}" title="${attr(timeLabel(x.timestamp))} · ${Number.isFinite(x.temp)?fmt(x.temp,1)+'°C':'—'}${Number.isFinite(x.precipProbability)?' · '+x.precipProbability+'% pluie':''}"><span class="heat-temp">${Number.isFinite(x.temp)?Math.round(x.temp)+'°':''}</span>${x.precipProbability>=30?'<span class="rain-dot"></span>':''}</div>`;}).join('')}</div>`;
}


function medianValue(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;}
function cityComparisonMetricValue(f,date,metric){const a=cachedAggregateDay(f,date);return metric==='TEMPERATURE'?medianValue(a.data.map(x=>x.tempMax)):metric==='PRECIPITATION'?medianValue(a.data.map(x=>x.precip)):metric==='WIND'?medianValue(a.data.map(x=>x.wind)):a.confidence?.overallPercent;}
function renderCityComparisonMetric(cities,metric){
  const forecastPairs=cities.map(c=>({city:c,f:state.forecasts[c.id]})).filter(x=>x.f),dates=[...new Set(forecastPairs.flatMap(x=>Object.values(x.f.seriesByModel||{})[0]?.daily?.dates||[]))].sort().slice(0,7);if(forecastPairs.length<2||dates.length<2)return '<div class="empty-state compact">Données comparables insuffisantes.</div>';
  const rows=forecastPairs.map(x=>({city:x.city,values:dates.map(d=>cityComparisonMetricValue(x.f,d,metric))})),all=rows.flatMap(r=>r.values).filter(Number.isFinite);if(!all.length)return '<div class="empty-state compact">Aucune valeur disponible.</div>';
  const width=900,height=220,p={l:48,r:16,t:20,b:36},ymin=metric==='PRECIPITATION'?0:Math.min(...all),ymax=metric==='AGREEMENT'?100:Math.max(...all),span=Math.max(metric==='AGREEMENT'?10:.5,ymax-ymin),lo=metric==='PRECIPITATION'?0:ymin-span*.08,hi=metric==='AGREEMENT'?100:ymax+span*.08,x=i=>p.l+i*(width-p.l-p.r)/(dates.length-1),y=v=>p.t+(hi-v)*(height-p.t-p.b)/(hi-lo),colors=['#2563eb','#0f9f8f','#7c3aed'];
  const lines=rows.map((r,ri)=>{const pts=r.values.map((v,i)=>Number.isFinite(v)?`${x(i)},${y(v)}`:null).filter(Boolean);return `<polyline class="compare-line" style="--series:${colors[ri]}" points="${pts.join(' ')}"/>`;}).join('');
  const labels=dates.map((d,i)=>`<text class="compare-label" x="${x(i)}" y="${height-10}" text-anchor="middle">${esc(d.slice(5))}</text>`).join('');
  const unit=metric==='TEMPERATURE'?'°C':metric==='PRECIPITATION'?'mm':metric==='WIND'?'km/h':'%';
  return `<div class="city-compare-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparaison ${metric}">${lines}${labels}</svg><div class="compare-legend">${rows.map((r,ri)=>`<span><i style="--series:${colors[ri]}"></i>${esc(r.city.name)}</span>`).join('')}<span class="unit-note">${unit}</span></div></div>`;
}
function renderCityComparison(route){
  const ids=(route.ids||[]).filter(id=>state.cities.some(c=>c.id===id)).slice(0,3),cities=ids.map(id=>state.cities.find(c=>c.id===id)).filter(Boolean);
  if(cities.length<2)return `<main class="page"><section class="page-header"><div><div class="eyebrow">Analyse croisée</div><h1>Comparer des villes</h1><p>Sélectionnez 2 ou 3 villes depuis Mes villes.</p></div></section><div class="empty-state"><button class="btn primary" data-action="open-city-compare">Choisir les villes</button></div></main>`;
  return `<main class="page compare-page"><section class="page-header"><div><div class="eyebrow">Analyse croisée</div><h1>Comparaison de villes</h1><p>${cities.map(c=>esc(c.name)).join(' · ')} · mêmes indicateurs sur 7 jours</p></div><div class="page-actions"><button class="btn subtle" data-action="copy-link">Partager</button><button class="btn tonal" data-action="open-city-compare">Modifier</button></div></section><div class="city-compare-grid"><section class="section-card"><h2>Température maximale médiane</h2>${renderCityComparisonMetric(cities,'TEMPERATURE')}</section><section class="section-card"><h2>Précipitations</h2>${renderCityComparisonMetric(cities,'PRECIPITATION')}</section><section class="section-card"><h2>Vent</h2>${renderCityComparisonMetric(cities,'WIND')}</section><section class="section-card"><h2>Accord global</h2>${renderCityComparisonMetric(cities,'AGREEMENT')}</section></div></main>`;
}

function renderCityContextBar(city,f,loading){
  const health=forecastHealth(f),count=Object.keys(f.seriesByModel||{}).length;
  return `<div class="city-context-bar"><div class="context-primary"><strong>${esc(city.name)}</strong><span class="data-health ${health.class}"><i></i>${esc(health.label)}</span><span>${esc(health.detail)}</span><span>${modelCountLabel(count)}</span><span>${esc(f.city.timezone||'UTC')}</span></div><div class="context-actions"><button class="btn subtle" data-action="copy-link">Partager la vue</button><button class="btn tonal" data-refresh-city="${attr(city.id)}" ${loading?'disabled':''}>${loading?'Actualisation…':'Actualiser la météo'}</button></div></div>`;
}

function renderCityDetail(cityId){
  const {t}=i18n(); const city=state.cities.find(c=>c.id===cityId); if(!city)return `<main class="page"><div class="empty-state"><h2>Ville introuvable</h2><button class="btn" data-action="home">${esc(t('back'))}</button></div></main>`;
  const f=state.forecasts[cityId]; const loading=state.loading.has(cityId); const err=state.errors[cityId];
  if(!f)return `<main class="page"><section class="detail-hero"><div class="detail-title"><h1>${esc(city.name)}</h1><p>${esc(placeLine(city))}</p></div></section>${err?`<div class="banner error">${esc(err)}</div>`:''}<div class="section-card">${loading?'<div class="loader"></div> '+esc(t('loading')):`<button class="btn primary" data-refresh-city="${attr(city.id)}">↻ ${esc(t('refresh'))}</button>`}</div></main>`;
  const today=cityToday(f.city.timezone); const agg=cachedAggregateDay(f,today); const now=currentConditions(f); const inf=localizedConditionInfo(now.condition||agg.condition); const scenarios=cachedScenarios(f); const evolution=cachedEvolution(f,state.evolution[cityId]||[]); const biasSource=state.bias[cityId]||{forecasts:[],observations:[]}; const biases=cachedBiases(f,biasSource,today); const loadingLabel=loading?' · actualisation…':'';
  const modelCount=Object.keys(f.seriesByModel).length;
  return `<main class="page detail-page">
    <section class="detail-hero professional-hero"><div class="detail-weather-mark" aria-hidden="true">${inf.icon}</div><div class="detail-title"><div class="eyebrow">Prévision multi-modèles</div><h1>${esc(city.name)}</h1><p>${esc(placeLine(city))}</p><div class="hero-meta"><span>${modelCountLabel(modelCount)} disponibles</span><span>${esc(t('updated'))} ${esc(relativeAge(f.fetchedAt,i18n().lang))}${esc(loadingLabel)}</span></div></div></section>
    ${renderCityContextBar(city,f,loading)}
    ${err?`<div class="banner error">${esc(err)}</div>`:''}
    <div class="detail-workspace">
      <aside class="detail-sidebar" aria-label="Navigation de la prévision">
        <div class="sidebar-card"><div class="sidebar-title">Vue d’ensemble</div><nav class="detail-nav" aria-label="Sections de la prévision"><button data-scroll-section="today-summary">${esc(t('today'))}</button><button data-scroll-section="timeline">${esc(t('forecastTimeline'))}</button><button data-scroll-section="agreement">${esc(t('confidenceBand'))}</button><button data-scroll-section="evolution">${esc(t('evolution'))}</button><button data-scroll-section="reliability">${esc(t('reliability'))}</button><button data-scroll-section="details">${esc(t('detailedComparison'))}</button></nav></div>

      </aside>
      <div class="detail-main">
        <div class="overview-layout"><div class="overview-primary">${renderTodaySummary(f,agg,now)}</div><div class="overview-secondary">${renderInsights(f,evolution)}${renderScenarios(scenarios)}</div></div>
        ${renderTimeline(f)}
        ${renderConfidenceSection(f,cityId)}
        ${renderEvolutionSection(evolution)}
        ${renderReliabilitySection(city,biases)}
        ${renderDetailedComparison(f,biases)}
        <div class="small source-note">${esc(t('source'))}</div>
      </div>
    </div>
  </main>`;
}

function renderTodaySummary(f,agg,now){
  const {t}=i18n(); const c=agg.confidence; const overall=c?.overallPercent; const modelCount=Object.keys(f.seriesByModel||{}).length;
  const precipConfidence=c.precipitation; const precipTxt=precipConfidence?.kind==='NO_RAIN'?`${precipConfidence.percent}% · ${t('dry')}`:precipConfidence?.kind==='DIVIDED'?`${precipConfidence.percent}% · ${precipConfidence.modelsForRain}/${precipConfidence.count} ${t('models')} · ${t('rain')}`:precipConfidence?`${precipConfidence.percent}%`:'';
  const info=localizedConditionInfo(now.condition||agg.condition);
  return `<section class="section today-summary" id="today-summary"><div class="summary-card">
    <div class="summary-accent" style="--summary-accent:${info.accent||'var(--primary)'}"></div>
    <div class="summary-header"><div class="summary-now"><div class="summary-weather-icon">${conditionMarkup(now.condition||agg.condition)}</div><div><div class="summary-kicker">${esc(dateLabel(agg.date,i18n().locale,'long'))}</div><div class="summary-now-line"><span class="summary-current-temp">${Number.isFinite(now.temperature)?`${fmt(now.temperature,1)}°`:'—'}</span><span class="summary-condition">${esc(info.label)}</span></div><div class="summary-context-chips"><span>${modelCountLabel(modelCount)} analysés</span>${agg.sunrise?`<span>☀ ${esc(t('sunrise'))} ${timeLabel(agg.sunrise)}</span>`:''}${agg.sunset?`<span>◐ ${esc(t('sunset'))} ${timeLabel(agg.sunset)}</span>`:''}</div></div></div>
      <div class="global-agreement ${Number.isFinite(overall)?confidenceClass(overall):''}"><div class="global-agreement-label">${esc(t('agreement'))} global</div><div class="global-agreement-value">${Number.isFinite(overall)?`${overall}%`:'—'}</div><div class="global-agreement-meta">${Number.isFinite(overall)?`${overall>=80?'Convergence élevée':overall>=50?'Convergence moyenne':'Désaccord marqué'} · ${modelCountLabel(modelCount)}`:'Données insuffisantes'}</div><button class="btn agreement-link" data-action="why-confidence">ⓘ ${esc(t('whyAgreement'))}</button></div>
    </div>
    <div class="today-grid">
      <div class="summary-tile metric-temp-min"><div class="summary-tile-head"><span class="summary-metric-icon temp">${summaryMetricIcon('temperature')}</span><div><div class="tile-label">Température minimale</div><div class="tile-hint">Minimum moyen prévu aujourd’hui</div></div></div><div class="summary-value-line"><div class="big-value">${Number.isFinite(agg.tempMin)?fmt(agg.tempMin,1)+' °C':'—'}</div><div class="range"><span>Plage modèles</span><strong>${fmtRange(...agg.tempMinRange,' °C',1)}</strong></div></div>${summaryAgreement(c.tempMin?.percent,c.tempMin?.count)}</div>
      <div class="summary-tile metric-temp-max"><div class="summary-tile-head"><span class="summary-metric-icon temp">${summaryMetricIcon('temperature')}</span><div><div class="tile-label">Température maximale</div><div class="tile-hint">Maximum moyen prévu aujourd’hui</div></div></div><div class="summary-value-line"><div class="big-value">${Number.isFinite(agg.tempMax)?fmt(agg.tempMax,1)+' °C':'—'}</div><div class="range"><span>Plage modèles</span><strong>${fmtRange(...agg.tempMaxRange,' °C',1)}</strong></div></div>${summaryAgreement(c.tempMax?.percent,c.tempMax?.count)}</div>
      <div class="summary-tile metric-rain"><div class="summary-tile-head"><span class="summary-metric-icon rain">${summaryMetricIcon('precipitation')}</span><div><div class="tile-label">${esc(t('precipitation'))}</div><div class="tile-hint">Cumul moyen sur la journée</div></div></div><div class="summary-value-line"><div class="big-value">${Number.isFinite(agg.precip)?fmt(agg.precip,1)+' mm':'—'}</div><div class="range"><span>Plage modèles</span><strong>${fmtRange(...agg.precipRange,' mm',1)}</strong></div></div>${summaryAgreement(precipConfidence?.percent,precipConfidence?.count,precipConfidence?.kind==='DIVIDED'?`${precipConfidence.modelsForRain}/${precipConfidence.count} ${t('models')} pluie`:precipConfidence?.kind==='NO_RAIN'?t('dry'):precipTxt)}</div>
      <div class="summary-tile metric-wind"><div class="summary-tile-head"><span class="summary-metric-icon wind">${summaryMetricIcon('wind')}</span><div><div class="tile-label">${esc(t('wind'))}</div><div class="tile-hint">Vent moyen maximal</div></div></div><div class="summary-value-line"><div class="big-value">${Number.isFinite(agg.wind)?fmt(agg.wind)+' km/h':'—'}</div><div class="range"><span>Plage modèles</span><strong>${fmtRange(...agg.windRange,' km/h')}</strong>${Number.isFinite(agg.gust)?`<small>Rafales ${fmt(agg.gust)} km/h</small>`:''}</div></div>${summaryAgreement(c.windMax?.percent,c.windMax?.count)}</div>
    </div>
  </div></section>`;
}

function renderInsights(f,evolution){
  const today=cityToday(f.city.timezone);
  const dates=[...new Set(Object.values(f.seriesByModel||{}).flatMap(s=>s.daily.dates))].filter(d=>d>=today).sort().slice(0,6);
  const items=[];
  for(const d of dates){
    const a=cachedAggregateDay(f,d), c=a.confidence?.overallPercent;
    if(Number.isFinite(c)&&c<45) items.push({p:95,date:d,icon:'⚠️',text:`Fort désaccord des modèles (${c}% d’accord global).`});
    const pc=a.confidence?.precipitation;
    if(pc?.kind==='DIVIDED'&&pc.percent<50) items.push({p:90,date:d,icon:'☂️',text:`Pluie incertaine : ${pc.modelsForRain}/${pc.count} modèles annoncent au moins 1 mm.`});
    else if(Number.isFinite(a.precip)&&a.precip>=5) items.push({p:82,date:d,icon:'🌧️',text:`Signal pluvieux marqué : moyenne ${fmt(a.precip,1)} mm, plage ${fmtRange(...a.precipRange,' mm',1)}.`});
    if(Number.isFinite(a.wind)&&a.wind>=35) items.push({p:86,date:d,icon:'💨',text:`Vent notable : moyenne ${fmt(a.wind)} km/h${Number.isFinite(a.gust)?`, rafales ${fmt(a.gust)} km/h`:''}.`});
    if(Number.isFinite(c)&&c>=85) items.push({p:35,date:d,icon:'✓',text:`Accord élevé des modèles (${c}%).`});
  }
  for(let i=1;i<dates.length;i++){
    const prev=cachedAggregateDay(f,dates[i-1]),cur=cachedAggregateDay(f,dates[i]);
    if(Number.isFinite(prev.tempMax)&&Number.isFinite(cur.tempMax)&&Math.abs(cur.tempMax-prev.tempMax)>=7){const delta=cur.tempMax-prev.tempMax;items.push({p:80,date:dates[i],icon:'🌡️',text:`Changement thermique net : ${delta>0?'+':''}${fmt(delta,0)} °C sur la maximale moyenne.`});break;}
  }
  const ev=[];for(const day of evolution?.days||[])for(const [v,x] of Object.entries(day.variables||{})){if(x.trend!=='STABLE'&&Number.isFinite(x.medianAbsDelta)){const threshold=v==='temperature'?1:v==='precipitation'?2:5;if(x.medianAbsDelta>=threshold)ev.push({p:92,date:day.date,icon:v==='temperature'?'🌡️':v==='precipitation'?'☂️':'💨',text:`Prévision révisée depuis H−${x.previous?.[0]?.ageHours||'?'} : ${trendText(x.trend,x.medianDelta,v==='temperature'?' °C':v==='precipitation'?' mm':' km/h')}.`});}}
  const chosen=[...items,...ev].sort((a,b)=>b.p-a.p||a.date.localeCompare(b.date)).filter((x,i,a)=>a.findIndex(y=>y.text===x.text)===i).slice(0,3).sort((a,b)=>a.date.localeCompare(b.date));
  if(!chosen.length)return '';
  return `<section class="section"><div class="section-card"><div class="section-head"><div><h2>${esc(i18n().t('forecast_insights_title'))}</h2><p>${esc(i18n().t('forecast_insights_subtitle_generic'))}</p></div></div><div class="scenario-list">${chosen.map(x=>`<div class="scenario"><span class="scenario-icon">${x.icon}</span><span><span class="scenario-main">${esc(dateLabel(x.date,i18n().locale))}</span><span class="cell-sub">${esc(x.text)}</span></span></div>`).join('')}</div></div></section>`;
}

function scenarioLabel(s){
  const {t}=i18n();
  if(s.kind==='SHOWERS') return t({EARLY:'home_scenario_showers_early',MIDDLE:'home_scenario_showers_middle',LATE:'home_scenario_showers_late',THROUGHOUT:'home_scenario_showers_throughout'}[s.timing]||'weather_rain_showers');
  if(s.kind==='RAIN') return t({EARLY:'home_scenario_rain_early',MIDDLE:'home_scenario_rain_middle',LATE:'home_scenario_rain_late',THROUGHOUT:'home_scenario_rain_throughout'}[s.timing]||'weather_rain');
  const key={CLEAR:'home_scenario_clear',VARIABLE_SKY:'home_scenario_variable_sky',OVERCAST:'home_scenario_overcast',DRY_UNSPECIFIED:'home_scenario_dry_unspecified',SNOW:'home_scenario_snow',FREEZING_RAIN:'home_scenario_freezing_rain',THUNDERSTORM:'home_scenario_thunderstorm',OTHER:'home_scenario_other'}[s.kind];
  return key?t(key):s.kind;
}
function scenarioIcon(kind){return {CLEAR:'☀️',VARIABLE_SKY:'⛅',OVERCAST:'☁️',DRY_UNSPECIFIED:'🌤️',SHOWERS:'🌦️',RAIN:'🌧️',SNOW:'❄️',FREEZING_RAIN:'🧊',THUNDERSTORM:'⛈️',OTHER:'🧩'}[kind]||'🌦️';}
function renderScenarios(scenarios){if(!scenarios.length)return '';return `<section class="section"><div class="section-card"><div class="section-head"><div><h2>${esc(i18n().t('home_scenarios_title'))}</h2><p>${esc(i18n().t('forecast_insights_subtitle_generic'))}</p></div></div><div class="scenario-list">${scenarios.map(s=>`<div class="scenario"><div class="scenario-icon">${scenarioIcon(s.kind)}</div><div><div class="scenario-main">${esc(scenarioLabel(s))}</div><div class="scenario-sub">${Number.isFinite(s.tempMin)&&Number.isFinite(s.tempMax)?`${fmt(s.tempMin)}–${fmt(s.tempMax)} °C`:''}${Number.isFinite(s.precipMax)?` · pluie ${fmtRange(s.precipMin,s.precipMax,' mm',1)}`:''}${Number.isFinite(s.gustMax)?` · rafales jusqu’à ${fmt(s.gustMax)} km/h`:''}</div></div><span class="pill">${s.modelCount}/${s.totalModelCount} ${esc(i18n().t('models'))}</span></div>`).join('')}</div></div></section>`;}

function renderTimeline(f){
  const {t}=i18n();
  const hourlyAll=buildTimelinePoints(f,'HOURLY'); const dailyAll=buildTimelinePoints(f,'DAILY');
  let mode=state.settings.timelineMode||'HOURLY'; if(mode==='HOURLY'&&hourlyAll.length<2)mode='DAILY'; if(mode==='DAILY'&&!dailyAll.length&&hourlyAll.length)mode='HOURLY';
  const analysis=mode==='HOURLY'?hourlyAll:dailyAll; const points=selectRegularTimelinePoints(analysis,mode==='HOURLY'?8:7,3);
  if(!points.length)return '';
  return `<section class="section timeline-section" id="timeline"><div class="section-card timeline-card"><div class="section-head"><div><div class="section-eyebrow">Consensus multi-modèles</div><h2>${esc(t('forecastTimeline'))}</h2><p>${mode==='HOURLY'?'Prochaines 24 heures · repères réguliers toutes les 3 heures':'Prochains jours · synthèse du consensus des modèles disponibles'}</p></div><div class="segmented timeline-mode" aria-label="Mode de chronologie"><button class="seg-btn ${mode==='HOURLY'?'active':''}" data-timeline-mode="HOURLY" ${hourlyAll.length<2?'disabled':''}>24 h</button><button class="seg-btn ${mode==='DAILY'?'active':''}" data-timeline-mode="DAILY" ${!dailyAll.length?'disabled':''}>7 jours</button></div></div>
    <div class="timeline-scroll" style="--timeline-cols:${points.length}"><div class="timeline-ruler" aria-hidden="true">${points.map((p,i)=>timelineEventMarker(p,points[i-1])).join('')}</div>
    <div class="timeline-full" role="list" aria-label="${esc(t('forecastTimeline'))}">${points.map((p,i)=>renderTimelinePoint(p,mode,i===0,i===points.length-1)).join('')}</div></div>
    <div class="timeline-legend"><span><i class="legend-swatch temp-gradient"></i> Bande thermique</span><span>☂ probabilité médiane ou part de modèles pluvieux</span><span>☁ couverture nuageuse médiane</span><span>💨 vent médian · R rafales</span><span>⚠ variable en désaccord</span></div>
  </div></section>`;
}

function renderConfidenceSection(f,cityId){
  const {t}=i18n();
  const metric=state.settings.confidenceMetric||'TEMPERATURE';
  const horizon=[24,72,168].includes(Number(state.settings.chartHorizon))?Number(state.settings.chartHorizon):168;
  const bands=cachedBand(f,metric,horizon); const normals=state.normals[cityId]?.normals||null;
  return `<section class="section" id="agreement"><div class="section-card"><div class="section-head"><div><div class="section-eyebrow">Dispersion dans le temps</div><h2>${esc(t('confidenceBand'))}</h2><p>${esc(t('chart_confidence_band_desc'))}</p></div></div>
  <div class="chart-controls"><div class="segmented" data-control="confidence-metric">${[['TEMPERATURE',t('temperature')],['PRECIPITATION',t('precipitation')],['WIND',t('wind')]].map(([id,label])=>`<button class="seg-btn ${metric===id?'active':''}" data-confidence-metric="${id}">${esc(label)}</button>`).join('')}</div><div class="segmented" aria-label="Horizon du graphique">${[[24,'24 h'],[72,'72 h'],[168,'7 j']].map(([hours,label])=>`<button class="seg-btn ${horizon===hours?'active':''}" data-chart-horizon="${hours}">${label}</button>`).join('')}</div></div>
  ${renderBandLegend(metric,Boolean(normals))}<div class="chart-wrap" title="Faites défiler horizontalement sur petit écran. Utilisez 24 h, 72 h ou 7 j pour changer l'échelle.">${renderBandChart(bands,metric,normals)}</div>${renderConfidenceTimeline(bands)}${metric==='TEMPERATURE'&&!normals?`<div class="small">${esc(t('webNormals'))} : ${state.online?esc(t('webLoading')):esc(t('webUnavailableOffline'))}</div>`:''}</div></section>`;
}

function renderTimelinePoint(p,mode,isFirst,isLast){
  const empty=!p.modelCount; const ci=localizedConditionInfo(p.condition); const divergence=(p.divergenceReasons||[]);
  const dateText=mode==='HOURLY'?(isFirst?'Maintenant':timeLabel(p.timestamp)):dateLabel(p.date,i18n().locale);
  const context=mode==='HOURLY'?dateLabel(p.date,i18n().locale):'';
  const tempMain=mode==='HOURLY'?p.temperatureC:p.tempMaxC; const tempLow=mode==='DAILY'?p.tempMinC:p.temperatureMinAcrossModels; const tempHigh=mode==='DAILY'?p.tempMaxC:p.temperatureMaxAcrossModels;
  const topHeat=Number.isFinite(tempHigh)?heatColor('TEMPERATURE',tempHigh):Number.isFinite(tempMain)?heatColor('TEMPERATURE',tempMain):null;
  const bottomHeat=Number.isFinite(tempLow)?heatColor('TEMPERATURE',tempLow):Number.isFinite(tempMain)?heatColor('TEMPERATURE',tempMain):null;
  const tempStyle=(topHeat||bottomHeat)?`style="--heat:${topHeat||bottomHeat};--heat-top:${topHeat||bottomHeat};--heat-bottom:${bottomHeat||topHeat}"`:'';
  const source=p.precipitationSource==='PROBABILITY'?'probabilité modèle':p.precipitationSource==='MODEL_AGREEMENT'&&p.precipitationModelCount>=2?`${p.wetModelCount}/${p.precipitationModelCount} modèles`:'';
  const rainProb=Number.isFinite(p.precipitationPercent)?Math.max(0,Math.min(100,p.precipitationPercent)):null;
  const rainDot=rainProb>=30?`<div class="timeline-precip-heat" aria-hidden="true"><i style="--rain-size:${(4+4*((rainProb-30)/70)).toFixed(1)}px;--rain-opacity:${(.55+.4*((rainProb-30)/70)).toFixed(2)}"></i></div>`:'<div class="timeline-precip-heat" aria-hidden="true"></div>';
  return `<article class="timeline-point ${empty?'empty':''}" role="listitem"><div class="timeline-point-head"><strong>${esc(dateText)}</strong><span>${esc(context)}</span></div><div class="timeline-condition">${p.condition?conditionMarkup(p.condition,'small'):'<span class="muted">—</span>'}<span>${p.condition?esc(ci.label):'Donnée indisponible'}</span></div><div class="timeline-temp-band" ${tempStyle}><strong>${Number.isFinite(tempMain)?`${fmt(tempMain)}°`:'—'}</strong>${Number.isFinite(tempLow)&&Number.isFinite(tempHigh)&&Math.abs(tempHigh-tempLow)>=1?`<small>${fmt(tempLow)}–${fmt(tempHigh)}°</small>`:''}</div>${rainDot}<div class="timeline-metric"><span>☂</span><strong>${rainProb!=null?`${Math.round(rainProb)}%`:'—'}</strong><small>${esc(source||'signal limité')}</small></div><div class="timeline-metric"><span>☁</span><strong>${Number.isFinite(p.cloudCoverPercent)?`${p.cloudCoverPercent}%`:'—'}</strong><small>${Number.isFinite(p.cloudCoverMinAcrossModels)&&Number.isFinite(p.cloudCoverMaxAcrossModels)?`${p.cloudCoverMinAcrossModels}–${p.cloudCoverMaxAcrossModels}%`:'couverture'}</small></div><div class="timeline-metric"><span>💨</span><strong>${Number.isFinite(p.windKmh)?`${fmt(p.windKmh)} km/h`:'—'}</strong><small>${Number.isFinite(p.windGustKmh)?`R ${fmt(p.windGustKmh)} km/h`:'rafales —'}</small></div><div class="timeline-consensus">${Number.isFinite(p.consensusPercent)?confidencePill(p.consensusPercent,p.modelCount):'<span class="pill">Comparaison limitée</span>'}${divergence.length?`<div class="divergence-list" aria-label="Variables en désaccord">${divergence.map(d=>`<span title="${esc(divergenceLabel(d))}">⚠ ${esc(divergenceShort(d))}</span>`).join('')}</div>`:'<div class="divergence-list stable"><span>✓ cohérent</span></div>'}</div></article>`;
}

function timelineEventMarker(p,prev){
  let kind='stable',label='Stable',icon='·';
  if((p.divergenceReasons||[]).length){kind='uncertain';label='Prévision incertaine';icon='!';}
  else if(Number.isFinite(p.precipitationPercent)&&p.precipitationPercent>=60){kind='rain';label='Signal pluie';icon='☂';}
  else if(Number.isFinite(p.windKmh)&&p.windKmh>=40){kind='wind';label='Vent notable';icon='↗';}
  else if(prev&&Number.isFinite(p.temperatureC)&&Number.isFinite(prev.temperatureC)&&Math.abs(p.temperatureC-prev.temperatureC)>=4){kind='temp';label='Variation thermique';icon='°';}
  else if(prev&&p.condition&&prev.condition&&p.condition!==prev.condition){kind='weather';label='Changement de temps';icon='◆';}
  return `<div class="timeline-ruler-slot ${kind}" title="${esc(label)}"><span>${icon}</span></div>`;
}
function divergenceLabel(x){return {TEMPERATURE:'Température : dispersion forte entre modèles',PRECIPITATION:'Pluie : modèles divisés ou probabilités dispersées',WIND:'Vent : dispersion forte entre modèles',CONDITION:'Conditions : scénario dominant non partagé'}[x]||x;}
function divergenceShort(x){return {TEMPERATURE:'Temp.',PRECIPITATION:'Pluie',WIND:'Vent',CONDITION:'Conditions'}[x]||x;}

function heatColor(metric,value){
  if(!Number.isFinite(value))return null;
  if(metric==='TEMPERATURE') return value>=30?'#c62828':value>=25?'#ff7043':value>=20?'#ffb74d':value>=15?'#fff59d':value>=10?'#dcedc8':value>=5?'#b3e5fc':value>=0?'#4fc3f7':value>=-5?'#1e88e5':value>=-10?'#1565c0':'#0d47a1';
  if(metric==='PRECIPITATION') return value<.05?null:value<.1?'#e3f2fd':value<.2?'#bbdefb':value<.5?'#90caf9':value<1?'#64b5f6':value<2?'#42a5f5':value<3?'#2196f3':value<5?'#1e88e5':value<7?'#1976d2':value<10?'#1565c0':'#0d47a1';
  if(metric==='WIND') return value<20?null:value<30?'#fff9c4':value<40?'#fff176':value<50?'#ffeb3b':value<60?'#ffca28':value<70?'#ffb74d':value<80?'#ff9800':value<90?'#fb8c00':value<100?'#f57c00':value<120?'#e64a19':'#c62828';
  return null;
}
function heatStyle(metric,value){const color=heatColor(metric,value);return color?`style="--heat:${color}"`:'';}
function dailyIntensityStyle(metric,value){
  let color=null;
  if(metric==='PRECIPITATION') color=value<.05?null:value<1?'#4fc3f7':value<5?'#1e88e5':value<15?'#1565c0':'#0d47a1';
  if(metric==='WIND') color=value<20?null:value<40?'#ffb74d':value<60?'#fb8c00':value<80?'#e64a19':'#c62828';
  return color?`style="--heat:${color}"`:'';
}
function renderBandLegend(metric,hasNormals){
  const unit=metric==='TEMPERATURE'?'°C':metric==='PRECIPITATION'?'mm':'km/h';
  return `<div class="chart-legend" aria-label="Légende du graphique"><span><i class="legend-line mean"></i>Moyenne des modèles (${unit})</span><span><i class="legend-area agreement-range"></i>Plage min–max inter-modèles · couleur = niveau d’accord</span>${metric==='TEMPERATURE'&&hasNormals?'<span><i class="legend-line normal"></i>Repères thermiques ERA5 sur 10 ans</span>':''}</div>`;
}
function renderConfidenceTimeline(bands){
  if(!bands?.length)return '';
  const maxSegments=24,step=Math.max(1,Math.ceil(bands.length/maxSegments));
  const sample=bands.filter((_,i)=>i%step===0).slice(0,maxSegments);
  if(sample[sample.length-1]!==bands[bands.length-1])sample[sample.length-1]=bands[bands.length-1];
  const first=bands[0],last=bands[bands.length-1];
  const start=Date.parse(first.timestamp),end=Date.parse(last.timestamp),hours=Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.round((end-start)/36e5)):0;
  const horizon=hours>=48?`J+${Math.max(1,Math.round(hours/24))}`:`+${hours} h`;
  return `<div class="agreement-timeline" aria-label="Évolution colorée de l’accord inter-modèles"><div class="agreement-timeline-head"><div><strong>Niveau d’accord dans le temps</strong><span>La couleur suit la convergence des modèles à chaque échéance.</span></div><div class="agreement-level-legend"><span class="high"><i></i>Élevé ≥80%</span><span class="medium"><i></i>Moyen 50–79%</span><span class="low"><i></i>Faible &lt;50%</span></div></div><div class="agreement-strip">${sample.map(b=>`<button type="button" class="${confidenceClass(b.percent)}" data-agreement-time="${attr(b.timestamp)}" aria-label="Analyser ${esc(b.timestamp)} · accord ${Math.round(b.percent)}%" title="${esc(b.timestamp)} · accord ${Math.round(b.percent)}% · ${modelCountLabel(b.modelCount)}"></button>`).join('')}</div><div class="agreement-strip-labels"><span>Maintenant <strong class="confidence ${confidenceClass(first.percent)}">${Math.round(first.percent)}%</strong> · ${modelCountLabel(first.modelCount)}</span><span>${horizon} <strong class="confidence ${confidenceClass(last.percent)}">${Math.round(last.percent)}%</strong> · ${modelCountLabel(last.modelCount)}</span></div></div>`;
}
function renderTableLegend(tab,mode,normals=null){
  if(tab==='CONDITIONS')return `<div class="table-legend weather-legend"><span>☀ Soleil</span><span>🌤 Partiellement nuageux</span><span>☁ Couvert</span><span>🌧 Pluie</span><span>❄ Neige</span><span>⛈ Orage</span><small>Le % sous l’icône indique la couverture nuageuse ou la probabilité de pluie. « ≈ inféré » = condition dérivée des variables du même modèle.</small></div>`;
  if(tab==='TEMPERATURE'&&mode==='HOURLY')return heatmapLegend(['#0d47a1','#1565c0','#1e88e5','#4fc3f7','#b3e5fc','#dcedc8','#fff59d','#ffb74d','#ff7043','#c62828'],['<-10','-10','-5','0','5','10','15','20','25','≥30°'],'Température horaire : du froid au chaud');
  if(tab==='TEMPERATURE'&&mode==='DAILY'&&normals)return `<div class="table-legend chips-legend"><span><i style="--legend:#e53935"></i>plus de 2 °C au-dessus de la normale</span><span><i style="--legend:#1e88e5"></i>plus de 2 °C sous la normale</span><span><i class="legend-neutral"></i>proche de la normale (±2 °C)</span><small>Référence : normales thermiques ERA5 sur 10 ans.</small></div>`;
  if(tab==='TEMPERATURE'&&mode==='DAILY')return `<div class="table-legend"><span>Les valeurs min/max sont affichées sans coloration tant que les normales ERA5 ne sont pas disponibles.</span></div>`;
  if(tab==='PRECIPITATION'&&mode==='HOURLY')return heatmapLegend(['#e3f2fd','#bbdefb','#90caf9','#64b5f6','#42a5f5','#2196f3','#1e88e5','#1976d2','#1565c0','#0d47a1'],['.05','.1','.2','.5','1','2','3','5','7','≥10 mm'],'Précipitations horaires · sec = cellule neutre');
  if(tab==='PRECIPITATION')return `<div class="table-legend chips-legend"><span><i style="--legend:#4fc3f7"></i>légère &lt; 1 mm</span><span><i style="--legend:#1e88e5"></i>modérée 1–5 mm</span><span><i style="--legend:#1565c0"></i>forte 5–15 mm</span><span><i style="--legend:#0d47a1"></i>très forte ≥ 15 mm</span></div>`;
  if(tab==='WIND'&&mode==='HOURLY')return heatmapLegend(['#fff9c4','#fff176','#ffeb3b','#ffca28','#ffb74d','#ff9800','#fb8c00','#f57c00','#e64a19','#c62828'],['20','30','40','50','60','70','80','90','100','≥120 km/h'],'Vent horaire · calme < 20 km/h = cellule neutre · R = rafales');
  return `<div class="table-legend chips-legend"><span><i style="--legend:#ffb74d"></i>léger 20–40 km/h</span><span><i style="--legend:#fb8c00"></i>modéré 40–60</span><span><i style="--legend:#e64a19"></i>fort 60–80</span><span><i style="--legend:#c62828"></i>tempête ≥ 80</span><small>R = rafales · flèche = direction du vent à 10 m.</small></div>`;
}
function heatmapLegend(colors,labels,title){
  return `<div class="table-legend heatmap-legend"><div class="legend-title">${esc(title)}</div><div class="heatmap-scale">${colors.map((c,i)=>`<span style="--legend:${c}"><i></i><small>${esc(labels[i])}</small></span>`).join('')}</div></div>`;
}

function renderBandChart(bands,metric,normals){
  if(bands.length<2)return `<div class="empty-state" style="padding:28px">${esc(i18n().t('webNoBand'))}</div>`;
  const width=920,height=270,pad={l:48,r:18,t:18,b:38}; let ys=bands.flatMap(x=>[x.minValue,x.maxValue]);
  if(metric==='TEMPERATURE'&&normals){for(const b of bands){const n=normals[b.timestamp.slice(5,10)];if(n)ys.push(n.tempMaxNormal,n.tempMinNormal);}}
  if(metric!=='TEMPERATURE')ys.push(0);let ymin=Math.min(...ys),ymax=Math.max(...ys);const margin=Math.max(.5,(ymax-ymin)*.12);ymin-=margin;ymax+=margin;const x=i=>pad.l+i*(width-pad.l-pad.r)/(bands.length-1);const y=v=>pad.t+(ymax-v)*(height-pad.t-pad.b)/(ymax-ymin);
  const upper=bands.map((b,i)=>`${x(i)},${y(b.maxValue)}`).join(' ');const lower=bands.map((b,i)=>`${x(i)},${y(b.minValue)}`).join(' ');const mean=bands.map((b,i)=>`${x(i)},${y(b.meanValue)}`).join(' ');
  const rangeSegments=bands.slice(0,-1).map((b,i)=>{const next=bands[i+1],agreementValues=[b.percent,next.percent].filter(Number.isFinite),percent=agreementValues.length?agreementValues.reduce((a,v)=>a+v,0)/agreementValues.length:null;const level=Number.isFinite(percent)?confidenceClass(percent):'unknown';const points=`${x(i)},${y(b.maxValue)} ${x(i+1)},${y(next.maxValue)} ${x(i+1)},${y(next.minValue)} ${x(i)},${y(b.minValue)}`;return `<polygon class="chart-band-segment ${level}" points="${points}"><title>${esc(b.timestamp)} → ${esc(next.timestamp)} · accord ${Number.isFinite(percent)?Math.round(percent)+'%':'indisponible'}</title></polygon>`;}).join('');
  let normalsSvg='';if(metric==='TEMPERATURE'&&normals){const maxPts=[],minPts=[];bands.forEach((b,i)=>{const n=normals[b.timestamp.slice(5,10)];if(n){maxPts.push(`${x(i)},${y(n.tempMaxNormal)}`);minPts.push(`${x(i)},${y(n.tempMinNormal)}`);}});if(maxPts.length>1)normalsSvg=`<polyline class="chart-normal-max" points="${maxPts.join(' ')}"/><polyline class="chart-normal-min" points="${minPts.join(' ')}"/>`;}
  const ticks=5;let grid='';for(let i=0;i<=ticks;i++){const val=ymin+(ymax-ymin)*i/ticks;const yy=y(val);grid+=`<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}"/><text class="chart-axis" x="${pad.l-7}" y="${yy+4}" text-anchor="end">${fmt(val,metric==='PRECIPITATION'?1:0)}</text>`;}
  let xlabels='';const every=Math.max(1,Math.floor(bands.length/6));bands.forEach((b,i)=>{if(i%every===0||i===bands.length-1)xlabels+=`<text class="chart-axis" x="${x(i)}" y="${height-12}" text-anchor="middle">${esc(b.timestamp.slice(5,10)+' '+timeLabel(b.timestamp))}</text>`;});
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bande d'accord inter-modèles">${grid}${rangeSegments}<polyline class="chart-range-edge" points="${upper}"/><polyline class="chart-range-edge" points="${lower}"/><polyline class="chart-line" points="${mean}"/>${normalsSvg}${xlabels}</svg>`;
}

function renderEvolutionSection(report){
  const {t}=i18n();
  if(!report.days?.length)return `<section class="section" id="evolution"><div class="section-card"><div class="section-head"><div><h2>${esc(t('evolution'))}</h2><p>${esc(t('forecast_evolution_subtitle'))}</p></div></div><div class="banner info">Aucun point ~24/48/72 h comparable n’est encore disponible. Cette section apparaîtra progressivement.</div></div></section>`;
  const variableLabel={temperature:t('temperature'),precipitation:t('precipitation'),wind:t('wind')};
  const unit={temperature:' °C',precipitation:' mm',wind:' km/h'};
  const icon={temperature:'🌡️',precipitation:'☂️',wind:'💨'};
  const cards=[];
  for(const day of report.days.slice(0,5))for(const [v,e] of Object.entries(day.variables)){cards.push(`<div class="evolution-item"><div><b>${icon[v]} ${esc(dateLabel(day.date,i18n().locale))} · ${esc(variableLabel[v])}</b></div><div class="small" style="margin-top:4px">Actuel : ${fmt(e.currentMedian,1)}${unit[v]} · ${trendText(e.trend,e.medianDelta,unit[v])}</div><div class="evolution-snapshots">${e.previous.map(p=>`<span class="snapshot">H−${p.ageHours} · ${fmt(p.median,1)}${unit[v]}</span>`).join('')}</div></div>`);}
  return `<section class="section" id="evolution"><div class="section-card"><div class="section-head"><div><h2>${esc(t('evolution'))}</h2><p>${esc(t('forecast_evolution_subtitle'))}</p></div></div><div class="evolution-grid">${cards.join('')}</div></div></section>`;
}
function trendText(trend,delta,unit){const sign=delta>0?'+':'';return {INCREASING:`en hausse (${sign}${fmt(delta,1)}${unit})`,DECREASING:`en baisse (${fmt(delta,1)}${unit})`,STABLE:'stable',VOLATILE:`révisions partagées (${sign}${fmt(delta,1)}${unit})`}[trend]||trend;}

function renderReliabilitySection(city,biases){
  const {t}=i18n(); const vars=[['TEMPERATURE','🌡️',t('temperature'),' °C'],['PRECIPITATION','☂️',t('precipitation'),' mm/j'],['WIND_SPEED','💨',t('wind'),' km/h']];
  const any=Object.values(biases).some(x=>Object.values(x).some(v=>v.ready));
  return `<section class="section" id="reliability"><div class="section-card"><div class="section-head"><div><h2>${esc(t('reliability'))}</h2><p>${esc(t('webBiasDesc'))}</p></div></div>
  ${!any?`<div class="banner info">${esc(t('biasNotReady'))} — il faut au moins 14 journées complètes par modèle et variable.</div>`:''}
  <div class="reliability-grid">${vars.map(([key,ico,label,unit])=>{const rank=reliabilityRanking(biases,key);return `<div class="reliability-column"><div class="reliability-column-title"><b>${ico} ${esc(label)}</b><span>${rank.length?`${rank.length} ${esc(t('models'))}`:''}</span></div>${rank.length?rank.slice(0,8).map((x,i)=>`<button type="button" class="rank-row rank-row-link" data-bias-model="${attr(x.modelId)}" data-bias-variable="${attr(key)}" data-bias-city="${attr(city.id)}" aria-label="Ouvrir la fiabilité locale de ${attr(getModel(x.modelId)?.name||x.modelId)} pour ${attr(label)}"><span class="rank-number">${i+1}</span><span class="rank-model"><b>${esc(getModel(x.modelId)?.name||x.modelId)}</b><span class="cell-sub">${x.bias.sampleSize} jours</span></span>${renderBiasChip(x.bias,key,unit)}<span class="rank-chevron" aria-hidden="true">›</span></button>`).join(''):`<div class="small" style="padding:12px 0">${esc(t('biasNotReady'))}</div>`}</div>`;}).join('')}</div></div></section>`;
}
function biasSignificance(bias,variable){if(!bias?.ready)return 'NONE';const a=Math.abs(bias.meanBias),ratio=bias.stdDev>0?a/bias.stdDev:Infinity;const th=variable==='TEMPERATURE'?[.3,1]:variable==='PRECIPITATION'?[.5,2]:[3,8];if(a>=th[1]&&ratio>=1)return 'HIGH';if(a>=th[0]&&ratio>=.5)return 'MODERATE';return 'LOW';}
function renderBiasChip(bias,variable,unit){if(!bias?.ready)return `<span class="bias-chip pending">${bias?.sampleSize||0}/14 j</span>`;const sig=biasSignificance(bias,variable),sign=bias.meanBias>0?'+':'';return `<span class="bias-chip confidence ${sig==='HIGH'?'low':sig==='MODERATE'?'medium':'high'}" title="écart-type ${fmt(bias.stdDev,1)}${unit}">${sign}${fmt(bias.meanBias,1)}${unit}</span>`;}
function tableBiasVariable(tab){return tab==='TEMPERATURE'?'TEMPERATURE':tab==='PRECIPITATION'?'PRECIPITATION':tab==='WIND'?'WIND_SPEED':null;}
function biasUnit(variable){return variable==='TEMPERATURE'?' °C':variable==='PRECIPITATION'?' mm/j':' km/h';}
function renderTableBiasChip(bias,modelId,variable,cityId){
  if(!variable)return '';
  const samples=bias?.sampleSize||0;
  if(!bias?.ready)return `<button type="button" class="bias-chip bias-chip-button pending table-bias-chip" data-bias-model="${attr(modelId)}" data-bias-variable="${attr(variable)}" data-bias-city="${attr(cityId)}" title="Ouvrir la fiabilité locale · calibration ${samples}/14 journées complètes"><span>Calibration</span><small>${samples}/14 j</small></button>`;
  const sig=biasSignificance(bias,variable),sign=bias.meanBias>0?'+':'',unit=biasUnit(variable);
  return `<button type="button" class="bias-chip bias-chip-button table-bias-chip confidence ${sig==='HIGH'?'low':sig==='MODERATE'?'medium':'high'}" data-bias-model="${attr(modelId)}" data-bias-variable="${attr(variable)}" data-bias-city="${attr(cityId)}" title="Ouvrir la fiabilité locale · écart-type ${fmt(bias.stdDev,1)}${esc(unit)}">Biais ${sign}${fmt(bias.meanBias,1)}${esc(unit)}</button>`;
}
function renderForecastModelHeader(modelId,tab,biases,cityId,showFamily=false){
  const m=getModel(modelId),variable=tableBiasVariable(tab),bias=variable?biases?.[modelId]?.[variable]:null,run=modelRunInfo(state.forecasts[cityId],modelId);
  return `<span class="model-header-stack"><span class="model-header">${esc(m?.name||modelId)}</span><span class="model-meta cell-sub">${m?.resolutionKm||'?'} km${showFamily?` · ${esc(m?.family||'')}`:''}</span><span class="model-run ${run.older?'stale':''}" title="${esc(run.coverage)}">${esc(run.label)}${run.older?' · plus ancien':''}</span>${variable?`<span class="model-bias-slot">${renderTableBiasChip(bias,modelId,variable,cityId)}</span>`:''}</span>`;
}

function renderDetailedComparison(f,biases){
  const {t}=i18n(); const mode=state.settings.detailViewMode||'DAILY'; const tab=state.settings.detailTab||'CONDITIONS'; const normals=state.normals[f.city.id]?.normals||null;
  const tabs=[['CONDITIONS',t('conditions')],['TEMPERATURE',t('temperature')],['PRECIPITATION',t('precipitation')],['WIND',t('wind')]];
  return `<section class="section" id="details"><div class="section-card detailed-card"><div class="section-head"><div><div class="section-eyebrow">Valeurs brutes</div><h2>${esc(t('detailedComparison'))}</h2><p>${esc(t('webDetailedDesc'))}</p></div><div class="section-actions"><button class="btn subtle" data-export-format="csv">Exporter CSV</button><button class="btn subtle" data-export-format="json">Exporter JSON</button></div></div>
  <div class="comparison-toolbar"><div class="segmented">${[['DAILY',t('daily')],['HOURLY',t('hourly')]].map(([id,l])=>`<button class="seg-btn ${mode===id?'active':''}" data-detail-mode="${id}">${esc(l)}</button>`).join('')}</div><div class="segmented">${tabs.map(([id,l])=>`<button class="seg-btn ${tab===id?'active':''}" data-detail-tab="${id}">${esc(l)}</button>`).join('')}</div></div>
  ${renderTargetedModelComparison(f,tab,mode)}${renderTableLegend(tab,mode,normals)}${mode==='DAILY'?renderDailyTable(f,tab,biases,normals):renderHourlyTable(f,tab,biases)}</div></section>`;
}


function comparisonMetricForTab(tab){return tab==='PRECIPITATION'?'PRECIPITATION':tab==='WIND'?'WIND':'TEMPERATURE';}
function comparisonSeries(f,modelId,tab,mode){
  const s=f.seriesByModel?.[modelId];if(!s)return [];const metric=comparisonMetricForTab(tab);
  if(mode==='HOURLY')return s.hourly.timestamps.slice(0,48).map((ts,i)=>({key:ts,value:metric==='TEMPERATURE'?s.hourly.temperature2m[i]:metric==='PRECIPITATION'?s.hourly.precipitation[i]:s.hourly.windSpeed10m[i]})).filter(x=>Number.isFinite(x.value));
  return s.daily.dates.slice(0,7).map((date,i)=>({key:date,value:metric==='TEMPERATURE'?s.daily.tempMax[i]:metric==='PRECIPITATION'?s.daily.precipitationSum[i]:s.daily.windSpeedMax[i]})).filter(x=>Number.isFinite(x.value));
}
function renderTargetedComparisonChart(f,ids,tab,mode){
  const metric=comparisonMetricForTab(tab),unit=metric==='TEMPERATURE'?'°C':metric==='PRECIPITATION'?'mm':'km/h',series=ids.map(id=>({id,values:comparisonSeries(f,id,tab,mode)})).filter(x=>x.values.length>1);if(series.length<2)return '';
  const keys=[...new Set(series.flatMap(x=>x.values.map(v=>v.key)))].sort(),all=series.flatMap(x=>x.values.map(v=>v.value));if(keys.length<2||!all.length)return '';
  const width=900,height=220,p={l:46,r:16,t:18,b:32},ymin=Math.min(...all),ymax=Math.max(...all),span=Math.max(.5,ymax-ymin),lo=ymin-span*.08,hi=ymax+span*.08,x=i=>p.l+i*(width-p.l-p.r)/(keys.length-1),y=v=>p.t+(hi-v)*(height-p.t-p.b)/(hi-lo);
  const colors=['#2563eb','#0f9f8f','#7c3aed','#e07a19'];
  const lines=series.map((row,si)=>{const by=new Map(row.values.map(v=>[v.key,v.value])),pts=keys.map((k,i)=>Number.isFinite(by.get(k))?`${x(i)},${y(by.get(k))}`:null).filter(Boolean);return `<polyline class="compare-line" style="--series:${colors[si]}" points="${pts.join(' ')}"/>`;}).join('');
  const legend=series.map((row,si)=>`<span><i style="--series:${colors[si]}"></i>${esc(getModel(row.id)?.name||row.id)}</span>`).join('');
  return `<div class="target-compare-chart"><div class="target-compare-title"><strong>Comparaison directe · ${metric==='TEMPERATURE'?'température':metric==='PRECIPITATION'?'précipitations':'vent'}</strong><span>${mode==='HOURLY'?'48 premières heures':'7 jours'} · ${unit}</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparaison directe de ${series.length} modèles">${lines}<line class="compare-axis" x1="${p.l}" y1="${height-p.b}" x2="${width-p.r}" y2="${height-p.b}"/></svg><div class="compare-legend">${legend}</div></div>`;
}
function renderTargetedModelComparison(f,tab,mode){
  const ids=visibleModelIds(f),selected=state.compareModelIds.filter(id=>ids.includes(id));
  return `<details class="target-compare" ${selected.length>=2?'open':''}><summary><span>Comparer 2 à 4 modèles</span><span class="pill">${selected.length}/4 sélectionnés</span></summary><div class="target-compare-body"><div class="model-compare-picker">${ids.map(id=>{const on=selected.includes(id),m=getModel(id);return `<button class="compare-model-chip ${on?'active':''}" aria-pressed="${on}" data-compare-model="${attr(id)}">${esc(m?.name||id)}<small>${m?.resolutionKm||'?'} km</small></button>`;}).join('')}</div>${selected.length>=2?renderTargetedComparisonChart(f,selected,tab,mode):'<div class="small">Sélectionnez au moins 2 modèles. Cette sélection est temporaire et ne modifie pas les modèles activés dans les paramètres.</div>'}</div></details>`;
}

function csvCell(v){const text=v==null?'':String(v);return /[";,\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function downloadText(filename,text,type){
  try{const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Export ${filename} préparé.`);}catch(err){toast(`Export impossible : ${humanError(err)}`);}
}
function buildExportRows(cityId){
  const f=state.forecasts[cityId];if(!f)return [];const mode=state.settings.detailViewMode||'DAILY',biases=cachedBiases(f,state.bias[cityId]||{forecasts:[],observations:[]},cityToday(f.city.timezone)),rows=[],bandMaps=Object.fromEntries(['TEMPERATURE','PRECIPITATION','WIND'].map(metric=>[metric,new Map(cachedBand(f,metric,168).map(b=>[b.timestamp,b.percent]))]));
  for(const modelId of visibleModelIds(f)){const s=f.seriesByModel[modelId],m=getModel(modelId);if(mode==='HOURLY'){for(let i=0;i<Math.min(168,s.hourly.timestamps.length);i++){const ts=s.hourly.timestamps[i];rows.push({time:ts,modelId,model:m?.name||modelId,temperature:s.hourly.temperature2m[i],precipitation:s.hourly.precipitation[i],precipProbability:s.hourly.precipitationProbability[i],wind:s.hourly.windSpeed10m[i],gust:s.hourly.windGusts10m[i],condition:fromWmoCode(s.hourly.weatherCode[i]),temperatureAgreement:bandMaps.TEMPERATURE.get(ts),precipitationAgreement:bandMaps.PRECIPITATION.get(ts),windAgreement:bandMaps.WIND.get(ts),temperatureBias:biases?.[modelId]?.TEMPERATURE?.meanBias,precipitationBias:biases?.[modelId]?.PRECIPITATION?.meanBias,windBias:biases?.[modelId]?.WIND_SPEED?.meanBias});}}else{for(let i=0;i<s.daily.dates.length;i++){const date=s.daily.dates[i],conf=dayConfidence(f,date);rows.push({time:date,modelId,model:m?.name||modelId,tempMin:s.daily.tempMin[i],tempMax:s.daily.tempMax[i],precipitation:s.daily.precipitationSum[i],precipProbability:s.daily.precipitationProbabilityMax[i],wind:s.daily.windSpeedMax[i],gust:s.daily.windGustsMax[i],condition:dailyCondition(s,date).condition,agreement:conf?.overallPercent,temperatureAgreement:conf?.tempMax?.percent,precipitationAgreement:conf?.precipitation?.percent,windAgreement:conf?.windMax?.percent,temperatureBias:biases?.[modelId]?.TEMPERATURE?.meanBias,precipitationBias:biases?.[modelId]?.PRECIPITATION?.meanBias,windBias:biases?.[modelId]?.WIND_SPEED?.meanBias});}}}
  return rows;
}
function exportCityData(cityId,format){
  const city=state.cities.find(c=>c.id===cityId),f=state.forecasts[cityId];if(!city||!f){toast('Aucune donnée à exporter.');return;}const rows=buildExportRows(cityId),stamp=new Date().toISOString().slice(0,10),base=`meteocompare-${city.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-')}-${stamp}`;
  if(format==='json'){const payload={exportedAt:new Date().toISOString(),city,view:{mode:state.settings.detailViewMode,tab:state.settings.detailTab,metric:state.settings.confidenceMetric,horizon:state.settings.chartHorizon,compareModels:state.compareModelIds},forecast:f,agreement:{temperature:cachedBand(f,'TEMPERATURE',168),precipitation:cachedBand(f,'PRECIPITATION',168),wind:cachedBand(f,'WIND',168)},bias:state.bias[cityId],rows};downloadText(`${base}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');return;}
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))],csv=[keys.map(csvCell).join(';'),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(';'))].join('\n');downloadText(`${base}.csv`,csv,'text/csv;charset=utf-8');
}

function seriesIndexes(series){
  let cached=seriesIndexCache.get(series);
  if(!cached){cached={hourly:new Map(series.hourly.timestamps.map((ts,i)=>[ts,i])),daily:new Map(series.daily.dates.map((date,i)=>[date,i]))};seriesIndexCache.set(series,cached);}
  return cached;
}
function visibleModelIds(f){return Object.keys(f.seriesByModel).sort((a,b)=>(getModel(a)?.resolutionKm||999)-(getModel(b)?.resolutionKm||999));}
function renderDailyTable(f,tab,biases,normals=null){
  const ids=visibleModelIds(f),today=cityToday(f.city.timezone); const dates=[...new Set(ids.flatMap(id=>f.seriesByModel[id].daily.dates))].filter(d=>d>=today).sort().slice(0,7);
  return `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>Jour</th>${ids.map(id=>{const m=getModel(id);return `<th title="${m?.family||''} · ${m?.resolutionKm||'?'} km">${renderForecastModelHeader(id,tab,biases,f.city.id||state.route.id,true)}</th>`;}).join('')}</tr></thead><tbody>${dates.map(date=>`<tr class="${date===today?'current':''}"><td><strong>${esc(dateLabel(date,i18n().locale,'long'))}</strong>${date===today?'<span class="cell-sub">Aujourd’hui</span>':''}</td>${ids.map(id=>renderDailyCell(f.seriesByModel[id],date,tab,biases?.[id],normals?.[date.slice(5)])).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderDailyCell(s,date,tab,modelBias,normal=null){
  const i=seriesIndexes(s).daily.get(date)??-1;if(i<0)return '<td class="no-data">—</td>';
  if(tab==='CONDITIONS'){const x=dailyCondition(s,date),ci=localizedConditionInfo(x.condition),prob=s.daily.precipitationProbabilityMax[i],cloud=dailyCloudCoverMean(s,date);const isWet=['RAIN','RAIN_SHOWERS','THUNDERSTORM','FREEZING_RAIN','SNOW','SNOW_SHOWERS'].includes(x.condition);const badge=isWet?(Number.isFinite(prob)?prob+'%':null):(['PARTLY_CLOUDY','OVERCAST'].includes(x.condition)&&Number.isFinite(cloud)?cloud+'%':null);return `<td title="${esc(ci.label)}${x.inferred?' · condition inférée du même modèle':''}">${conditionMarkup(x.condition,'small')}<span class="condition-label">${esc(ci.label)}</span>${badge?`<span class="cell-sub">${badge}</span>`:''}${x.inferred?'<span class="cell-sub">≈ inféré</span>':''}</td>`;}
  if(tab==='TEMPERATURE'){const max=s.daily.tempMax[i],min=s.daily.tempMin[i];const maxClass=temperatureNormalClass(max,normal?.tempMaxNormal),minClass=temperatureNormalClass(min,normal?.tempMinNormal);return `<td class="normal-temp-cell"><span class="${maxClass}">${Number.isFinite(max)?fmt(max,1)+'°':'—'}</span><span class="temp-separator"> / </span><span class="${minClass}">${Number.isFinite(min)?fmt(min,1)+'°':'—'}</span></td>`;}
  if(tab==='PRECIPITATION'){const p=s.daily.precipitationSum[i],prob=s.daily.precipitationProbabilityMax[i];const style=Number.isFinite(p)?dailyIntensityStyle('PRECIPITATION',p):'';return `<td class="heatmap-data-cell" ${style}>${Number.isFinite(p)?fmt(p,1)+' mm':'—'}${Number.isFinite(prob)?`<span class="cell-sub">max ${prob}%</span>`:''}</td>`;}
  const w=s.daily.windSpeedMax[i],g=s.daily.windGustsMax[i],dir=s.daily.windDirection10mDominant[i],arrow=windArrow(dir,w);const style=Number.isFinite(w)?dailyIntensityStyle('WIND',w):'';return `<td class="heatmap-data-cell" ${style}>${Number.isFinite(w)?fmt(w)+' km/h':'—'} ${arrow?`<span class="wind-arrow" style="transform:rotate(${arrow.deg}deg)">${arrow.char}</span>`:''}${Number.isFinite(dir)?`<span class="cell-sub">${formatWindDirection(dir)}${Number.isFinite(g)?` · R ${fmt(g)}`:''}</span>`:''}</td>`;
}

function temperatureNormalClass(value,normal){if(!Number.isFinite(value)||!Number.isFinite(normal))return 'temp-normal';const d=value-normal;return d>2?'temp-above':d<-2?'temp-below':'temp-normal';}

function renderHourlyTable(f,tab,biases){
  const ids=visibleModelIds(f),nowLocal=(new Date()); const today=cityToday(f.city.timezone);const all=[...new Set(ids.flatMap(id=>f.seriesByModel[id].hourly.timestamps))].filter(ts=>ts.slice(0,10)>=today).sort();
  const rows=all.slice(0,48); const hourNow=new Intl.DateTimeFormat('en-GB',{timeZone:f.city.timezone||'UTC',hour:'2-digit',hourCycle:'h23'}).format(nowLocal).slice(0,2);const nowKey=`${today}T${hourNow}:00`;const nowMs=Date.parse(nowKey+'Z');
  const targetHour=rows.reduce((best,ts)=>Math.abs(Date.parse(ts+'Z')-nowMs)<Math.abs(Date.parse((best||ts)+'Z')-nowMs)?ts:best,rows[0]);
  return `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>Heure</th>${ids.map(id=>`<th>${renderForecastModelHeader(id,tab,biases,f.city.id||state.route.id,false)}</th>`).join('')}</tr></thead><tbody>${rows.map(ts=>`<tr class="${ts===targetHour?'current':''}"><td><strong>${esc(ts.slice(5,10))}</strong><span class="cell-sub">${esc(timeLabel(ts))}${ts===targetHour?' · maintenant':''}</span></td>${ids.map(id=>renderHourlyCell(f.seriesByModel[id],ts,tab)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderHourlyCell(s,ts,tab){
  const i=seriesIndexes(s).hourly.get(ts)??-1;if(i<0)return '<td class="no-data">—</td>';
  if(tab==='CONDITIONS'){const c=fromWmoCode(s.hourly.weatherCode[i])||null,ci=localizedConditionInfo(c);const pp=s.hourly.precipitationProbability[i],cl=s.hourly.cloudCover[i];return `<td>${c?conditionMarkup(c,'small'):'—'}${c?`<span class="condition-label">${esc(ci.label)}</span>`:''}${Number.isFinite(pp)?`<span class="cell-sub">☂ ${pp}%</span>`:Number.isFinite(cl)?`<span class="cell-sub">☁ ${cl}%</span>`:''}</td>`;}
  if(tab==='TEMPERATURE'){const v=s.hourly.temperature2m[i];return `<td class="heatmap-data-cell" ${Number.isFinite(v)?heatStyle('TEMPERATURE',v):''}>${Number.isFinite(v)?fmt(v,1)+' °C':'—'}</td>`;}
  if(tab==='PRECIPITATION'){const v=s.hourly.precipitation[i],pp=s.hourly.precipitationProbability[i];return `<td class="heatmap-data-cell" ${Number.isFinite(v)?heatStyle('PRECIPITATION',v):''}>${Number.isFinite(v)?fmt(v,1)+' mm':'—'}${Number.isFinite(pp)?`<span class="cell-sub">${pp}%</span>`:''}</td>`;}
  const w=s.hourly.windSpeed10m[i],g=s.hourly.windGusts10m[i],dir=s.hourly.windDirection10m[i],arrow=windArrow(dir,w);return `<td class="heatmap-data-cell" ${Number.isFinite(w)?heatStyle('WIND',w):''}>${Number.isFinite(w)?fmt(w)+' km/h':'—'} ${arrow?`<span class="wind-arrow" style="transform:rotate(${arrow.deg}deg)">${arrow.char}</span>`:''}${Number.isFinite(g)?`<span class="cell-sub">R ${fmt(g)} km/h</span>`:''}</td>`;
}


const BIAS_MIN_SAMPLES=14;
function biasVariableLabel(variable){const {t}=i18n();return variable==='TEMPERATURE'?t('temperature'):variable==='PRECIPITATION'?t('precipitation'):t('wind');}
function biasScale(variable){return variable==='TEMPERATURE'?{closeTolerance:1.5,maeScale:2.4,biasScale:1.2,spreadScale:3}:variable==='PRECIPITATION'?{closeTolerance:1,maeScale:3,biasScale:1.5,spreadScale:4}:{closeTolerance:5,maeScale:8,biasScale:5,spreadScale:10};}
function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function sampleStdDev(values,mean){if(values.length<=1)return 0;return Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/(values.length-1));}
function rawBiasSamples(cityId,modelId,variable,windowDays=30){
  const city=state.cities.find(c=>c.id===cityId),source=state.bias[cityId]||{forecasts:[],observations:[]};if(!city)return [];
  const today=cityToday(city.timezone),start=addDays(today,-windowDays),obs=new Map();
  for(const o of source.observations||[])if(o.variable===variable&&o.targetDate>=start&&o.targetDate<today&&Number.isFinite(o.value))obs.set(o.targetDate,o.value);
  const forecastByDate=new Map();
  for(const f of source.forecasts||[])if(f.modelId===modelId&&f.variable===variable&&f.targetDate>=start&&f.targetDate<today&&Number.isFinite(f.value))forecastByDate.set(f.targetDate,f.value);
  return [...forecastByDate].map(([date,forecast])=>({date,forecast,observation:obs.get(date)})).filter(x=>Number.isFinite(x.observation)).map(x=>({...x,error:x.forecast-x.observation})).sort((a,b)=>a.date.localeCompare(b.date));
}
function computeLocalReliability(variable,samples,windowDays=30){
  if(samples.length<BIAS_MIN_SAMPLES)return null;
  const errors=samples.map(x=>x.error),absErrors=errors.map(Math.abs),meanBias=average(errors),mae=average(absErrors),rmse=Math.sqrt(average(errors.map(x=>x*x))),stdDev=sampleStdDev(errors,meanBias),scale=biasScale(variable);
  const withinToleranceRate=absErrors.filter(x=>x<=scale.closeTolerance).length/errors.length;
  const overestimateRate=errors.filter(x=>x>0).length/errors.length,underestimateRate=errors.filter(x=>x<0).length/errors.length;
  const overToleranceOverestimateRate=errors.filter(x=>x>scale.closeTolerance).length/errors.length,underToleranceUnderestimateRate=errors.filter(x=>x<-scale.closeTolerance).length/errors.length;
  const expScore=(value,scaleValue)=>Math.exp(-Math.max(0,value)/scaleValue);
  const score=Math.max(0,Math.min(100,Math.round((expScore(mae,scale.maeScale)*.42+expScore(Math.abs(meanBias),scale.biasScale)*.20+expScore(stdDev,scale.spreadScale)*.16+withinToleranceRate*.17+Math.min(1,samples.length/windowDays)*.05)*100)));
  const level=score>=85?'EXCELLENT':score>=70?'GOOD':score>=50?'FAIR':'LIMITED';
  let recentMeanAbsoluteError=null,previousMeanAbsoluteError=null,trend='INSUFFICIENT_DATA';
  if(absErrors.length>=10){const recentCount=Math.min(7,Math.floor(absErrors.length/2)),previousCount=Math.min(recentCount,absErrors.length-recentCount);if(previousCount>=3){recentMeanAbsoluteError=average(absErrors.slice(-recentCount));previousMeanAbsoluteError=average(absErrors.slice(-(recentCount+previousCount),-recentCount));const meaningful=Math.max(scale.closeTolerance*.15,previousMeanAbsoluteError*.12);trend=recentMeanAbsoluteError<previousMeanAbsoluteError-meaningful?'IMPROVING':recentMeanAbsoluteError>previousMeanAbsoluteError+meaningful?'DECLINING':'STABLE';}}
  let precipitation=null;
  if(variable==='PRECIPITATION'){let hits=0,misses=0,falseAlarms=0,observedWetDays=0,forecastWetDays=0;for(const x of samples){const fw=x.forecast>=.5,ow=x.observation>=.5;if(fw)forecastWetDays++;if(ow)observedWetDays++;if(fw&&ow)hits++;else if(fw&&!ow)falseAlarms++;else if(!fw&&ow)misses++;}precipitation={hitRate:observedWetDays?hits/observedWetDays:null,falseAlarmRate:forecastWetDays?falseAlarms/forecastWetDays:null,missedEventRate:observedWetDays?misses/observedWetDays:null,hitCount:hits,falseAlarmCount:falseAlarms,missedEventCount:misses,observedWetDays,forecastWetDays};}
  return {variable,score,level,meanBias,meanAbsoluteError:mae,rootMeanSquareError:rmse,standardDeviation:stdDev,withinToleranceRate,overestimateRate,underestimateRate,closeRate:withinToleranceRate,overToleranceOverestimateRate,underToleranceUnderestimateRate,closeTolerance:scale.closeTolerance,sampleSize:samples.length,windowDays,recentMeanAbsoluteError,previousMeanAbsoluteError,trend,precipitation};
}
function biasHistoriesByModel(cityId,variable){
  const source=state.bias[cityId]||{forecasts:[]};const ids=[...new Set((source.forecasts||[]).filter(x=>x.variable===variable).map(x=>x.modelId))];
  return Object.fromEntries(ids.map(id=>[id,rawBiasSamples(cityId,id,variable)]).filter(([,samples])=>samples.length));
}
function comparableBiasCohort(histories,minimumSamples=BIAS_MIN_SAMPLES){
  const entries=Object.entries(histories).filter(([,samples])=>samples.length>=minimumSamples).sort(([a],[b])=>a.localeCompare(b));if(entries.length<2)return null;
  let best=null;
  const better=(ids,dates)=>{if(ids.length<2||dates.size<minimumSamples)return;const key=ids.join('|');if(!best||ids.length>best.ids.length||(ids.length===best.ids.length&&dates.size>best.dates.size)||(ids.length===best.ids.length&&dates.size===best.dates.size&&key<best.key))best={ids:[...ids],dates:new Set(dates),key};};
  const visit=(index,ids,common)=>{
    if(ids.length+(entries.length-index)<(best?.ids.length||2))return;
    if(ids.length>=2&&common)better(ids,common);
    if(index>=entries.length)return;
    const [id,samples]=entries[index],dateSet=new Set(samples.map(x=>x.date));
    const nextCommon=common?new Set([...common].filter(d=>dateSet.has(d))):dateSet;
    if(nextCommon.size>=minimumSamples)visit(index+1,[...ids,id],nextCommon);
    visit(index+1,ids,common);
  };
  visit(0,[],null);return best;
}
function computeMultiModelBiasBaseline(variable,histories,cohort){
  if(!cohort)return null;const byModel=Object.fromEntries(cohort.ids.map(id=>[id,new Map((histories[id]||[]).map(x=>[x.date,x]))]));const samples=[];
  for(const date of [...cohort.dates].sort()){const rows=cohort.ids.map(id=>byModel[id].get(date)).filter(Boolean);if(rows.length<2)continue;samples.push({date,forecast:average(rows.map(x=>x.forecast)),observation:average(rows.map(x=>x.observation))});}
  return computeLocalReliability(variable,samples.map(x=>({...x,error:x.forecast-x.observation})),30);
}
function buildBiasSelectionWeb(cityId,modelId,variable){
  const histories=biasHistoriesByModel(cityId,variable),sourceSamples=histories[modelId]||rawBiasSamples(cityId,modelId,variable),cohort=comparableBiasCohort(histories);
  const comparable=Boolean(cohort?.ids.includes(modelId));const samples=comparable?sourceSamples.filter(x=>cohort.dates.has(x.date)):sourceSamples;const reliability=computeLocalReliability(variable,samples,30);
  if(!reliability)return {ready:false,samples,sourceSamples,cohort};
  let rank=null,ranking=[];
  if(comparable){ranking=cohort.ids.map(id=>{const rows=(histories[id]||[]).filter(x=>cohort.dates.has(x.date));return {modelId:id,reliability:computeLocalReliability(variable,rows,30)};}).filter(x=>x.reliability).sort((a,b)=>b.reliability.score-a.reliability.score||a.reliability.meanAbsoluteError-b.reliability.meanAbsoluteError||(getModel(a.modelId)?.name||a.modelId).localeCompare(getModel(b.modelId)?.name||b.modelId));const index=ranking.findIndex(x=>x.modelId===modelId);if(index>=0)rank={rank:index+1,modelCount:ranking.length};}
  return {ready:true,samples,reliability,rank,ranking,baseline:computeMultiModelBiasBaseline(variable,histories,comparable?cohort:null),cohort};
}
function reliabilityLevelLabel(level){return {EXCELLENT:'Excellente',GOOD:'Bonne',FAIR:'Moyenne',LIMITED:'Limitée'}[level]||level;}
function reliabilityLevelClass(level){return level==='EXCELLENT'?'high':level==='GOOD'?'high':level==='FAIR'?'medium':'low';}
function biasTrendLabel(r){if(r.trend==='IMPROVING')return 'En amélioration';if(r.trend==='DECLINING')return 'En dégradation';if(r.trend==='STABLE')return 'Stable';return 'Historique récent insuffisant';}
function formatBiasValue(value,variable,d=1){return `${fmt(value,d)}${biasUnit(variable)}`;}
function formatSignedBias(value,variable){return `${value>0?'+':''}${fmt(value,1)}${biasUnit(variable)}`;}
function biasDirectionText(r){if(Math.abs(r.meanBias)<.05)return 'globalement calibré';return r.meanBias>0?'tendance à surestimer':'tendance à sous-estimer';}
function renderBiasHistoryChart(samples,variable){
  if(samples.length<2)return `<div class="empty-state compact">Historique insuffisant pour tracer le graphique.</div>`;
  const width=960,height=300,pad={l:54,r:20,t:22,b:46},values=samples.flatMap(x=>[x.forecast,x.observation]);let ymin=Math.min(...values),ymax=Math.max(...values);if(variable!=='TEMPERATURE')ymin=0;const extra=variable==='TEMPERATURE'?1:variable==='PRECIPITATION'?.5:3;ymin-=variable==='TEMPERATURE'?extra:0;ymax+=extra;if(ymax-ymin<1)ymax=ymin+1;
  const x=i=>pad.l+i*(width-pad.l-pad.r)/Math.max(1,samples.length-1),y=v=>pad.t+(ymax-v)*(height-pad.t-pad.b)/(ymax-ymin);let grid='',labels='';
  for(let i=0;i<=4;i++){const value=ymin+(ymax-ymin)*i/4,yy=y(value);grid+=`<line class="bias-chart-grid" x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}"/><text class="bias-chart-axis" x="${pad.l-8}" y="${yy+4}" text-anchor="end">${fmt(value,variable==='PRECIPITATION'?1:0)}</text>`;}
  const every=Math.max(1,Math.floor(samples.length/5));samples.forEach((s,i)=>{if(i%every===0||i===samples.length-1)labels+=`<text class="bias-chart-axis" x="${x(i)}" y="${height-14}" text-anchor="middle">${esc(s.date.slice(5))}</text>`;});
  const forecast=samples.map((s,i)=>`${x(i)},${y(s.forecast)}`).join(' '),observation=samples.map((s,i)=>`${x(i)},${y(s.observation)}`).join(' ');
  return `<div class="bias-chart-shell"><div class="chart-legend"><span><i class="legend-line bias-forecast"></i>Prévision J+1</span><span><i class="legend-line bias-observation"></i>Observation</span></div><svg class="bias-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historique prévision et observation pour ${esc(biasVariableLabel(variable))}">${grid}<polyline class="bias-chart-observation" points="${observation}"/><polyline class="bias-chart-forecast" points="${forecast}"/>${labels}</svg></div>`;
}
function renderPrecipitationDiagnostics(r){const p=r.precipitation;if(!p)return '';const rate=v=>Number.isFinite(v)?`${Math.round(v*100)} %`:'—';return `<section class="bias-panel"><div class="bias-panel-head"><h2>Diagnostic pluie</h2><p>Seuil d’un jour humide : 0,5 mm.</p></div><div class="bias-metrics-grid bias-metrics-three"><div class="bias-metric"><span>Taux de détection</span><strong>${rate(p.hitRate)}</strong><small>${p.hitCount} détections / ${p.observedWetDays} jours humides observés</small></div><div class="bias-metric"><span>Fausses alertes</span><strong>${rate(p.falseAlarmRate)}</strong><small>${p.falseAlarmCount} fausses alertes / ${p.forecastWetDays} jours humides prévus</small></div><div class="bias-metric"><span>Épisodes manqués</span><strong>${rate(p.missedEventRate)}</strong><small>${p.missedEventCount} jours humides non détectés</small></div></div></section>`;}
function renderBiasDetailPage(route){
  const city=state.cities.find(c=>c.id===route.id),model=getModel(route.modelId),variable=['TEMPERATURE','PRECIPITATION','WIND_SPEED'].includes(route.variable)?route.variable:null;if(!city||!model||!variable)return `<main class="page"><div class="empty-state"><h2>Page de biais introuvable</h2><button class="btn" data-action="back">Retour</button></div></main>`;
  const selection=buildBiasSelectionWeb(city.id,model.id,variable),source=state.bias[city.id]||{},unit=biasUnit(variable),updated=source.updatedAt?relativeAge(new Date(source.updatedAt).toISOString(),i18n().lang):'jamais';
  const heading=`${model.name} · ${biasVariableLabel(variable)}`;
  if(!selection.ready)return `<main class="page bias-page"><section class="bias-page-header"><div><div class="eyebrow">Fiabilité locale J+1</div><h1>${esc(heading)}</h1><p>${esc(city.name)} · historique local sur 30 jours</p></div></section><section class="bias-panel bias-empty-panel"><div class="bias-progress-ring">${selection.samples.length}<small>/14</small></div><div><h2>Calibration en cours</h2><p>${selection.samples.length} journées complètes sont disponibles pour ce modèle et cette variable. Il en faut au moins 14 pour afficher le biais et la fiabilité locale.</p><p class="small">Dernière actualisation de l’historique : ${esc(updated)}.</p></div></section></main>`;
  const r=selection.reliability,rank=selection.rank,baseline=selection.baseline,deltaBaseline=baseline?r.meanAbsoluteError-baseline.meanAbsoluteError:null;
  return `<main class="page bias-page">
    <section class="bias-page-header"><div><div class="eyebrow">Fiabilité locale J+1</div><h1>${esc(heading)}</h1><p>${esc(city.name)} · ${r.sampleSize} journées comparables sur une fenêtre de ${r.windowDays} jours · historique ${esc(updated)}</p></div></section>
    <section class="bias-hero ${reliabilityLevelClass(r.level)}"><div class="bias-score-block"><span class="bias-overline">Indice local de fiabilité</span><div class="bias-score"><strong>${r.score}</strong><span>/100</span></div><div class="bias-score-track"><i style="width:${r.score}%"></i></div></div><div class="bias-hero-copy"><span class="bias-level">${reliabilityLevelLabel(r.level)}</span><h2>${esc(model.name)} est ${esc(biasDirectionText(r))} sur ${esc(city.name)}.</h2><p>L’erreur absolue moyenne est de <strong>${formatBiasValue(r.meanAbsoluteError,variable)}</strong>. Le biais signé est de <strong>${formatSignedBias(r.meanBias,variable)}</strong>.</p><div class="bias-hero-meta"><span>${rank?`Rang ${rank.rank}/${rank.modelCount} ${esc(i18n().t('models'))}`:'Pas de cohorte multi-modèles comparable'}</span><span>${r.sampleSize} jours</span><span>${esc(biasVariableLabel(variable))}</span></div></div></section>
    <section class="bias-panel"><div class="bias-panel-head"><h2>Performance locale</h2><p>Erreur ressentie, calibration et régularité du modèle sur les mêmes journées.</p></div><div class="bias-metrics-grid"><div class="bias-metric emphasized"><span>Erreur absolue moyenne</span><strong>${formatBiasValue(r.meanAbsoluteError,variable)}</strong><small>RMSE ${formatBiasValue(r.rootMeanSquareError,variable)}</small></div><div class="bias-metric"><span>Biais moyen</span><strong>${formatSignedBias(r.meanBias,variable)}</strong><small>${esc(biasDirectionText(r))}</small></div><div class="bias-metric"><span>Jours proches</span><strong>${Math.round(r.withinToleranceRate*100)} %</strong><small>écart ≤ ${formatBiasValue(r.closeTolerance,variable)}</small></div><div class="bias-metric"><span>Variabilité de l’erreur</span><strong>${formatBiasValue(r.standardDeviation,variable)}</strong><small>écart-type des erreurs quotidiennes</small></div></div></section>
    <section class="bias-panel"><div class="bias-panel-head"><h2>Évolution récente</h2><p>${biasTrendLabel(r)}</p></div>${Number.isFinite(r.recentMeanAbsoluteError)&&Number.isFinite(r.previousMeanAbsoluteError)?`<div class="bias-trend"><div><span>Période précédente</span><strong>${formatBiasValue(r.previousMeanAbsoluteError,variable)}</strong></div><div class="bias-trend-arrow">→</div><div><span>7 derniers jours</span><strong>${formatBiasValue(r.recentMeanAbsoluteError,variable)}</strong></div><span class="pill confidence ${r.trend==='IMPROVING'?'high':r.trend==='DECLINING'?'low':'medium'}">${biasTrendLabel(r)}</span></div>`:`<div class="banner info">Pas encore assez de recul pour comparer la période récente à la précédente.</div>`}</section>
    ${baseline?`<section class="bias-panel"><div class="bias-panel-head"><h2>Comparaison multi-modèles</h2><p>Référence locale calculée en moyennant les prévisions des modèles sur les dates communes.</p></div><div class="bias-baseline"><div><span>${esc(model.name)}</span><strong>${formatBiasValue(r.meanAbsoluteError,variable)} MAE</strong></div><div><span>Moyenne multi-modèles</span><strong>${formatBiasValue(baseline.meanAbsoluteError,variable)} MAE</strong></div><div class="bias-baseline-result ${deltaBaseline<=0?'better':'worse'}">${deltaBaseline<=0?`${esc(model.name)} fait mieux de ${formatBiasValue(Math.abs(deltaBaseline),variable)}`:`La moyenne multi-modèles fait mieux de ${formatBiasValue(Math.abs(deltaBaseline),variable)}`}</div></div></section>`:''}
    <section class="bias-panel"><div class="bias-panel-head"><h2>Historique prévision / observation</h2><p>Chaque point représente une journée J+1 utilisée pour les statistiques ci-dessus.</p></div>${renderBiasHistoryChart(selection.samples,variable)}</section>
    ${renderPrecipitationDiagnostics(r)}
    <section class="bias-panel"><div class="bias-panel-head"><h2>Répartition des erreurs</h2><p>Lecture autour de la tolérance locale de ${formatBiasValue(r.closeTolerance,variable)}.</p></div><div class="bias-distribution"><div class="under" style="--share:${Math.round(r.underToleranceUnderestimateRate*100)}%"><span>Sous-estimation</span><strong>${Math.round(r.underToleranceUnderestimateRate*100)} %</strong></div><div class="close" style="--share:${Math.round(r.closeRate*100)}%"><span>Proche</span><strong>${Math.round(r.closeRate*100)} %</strong></div><div class="over" style="--share:${Math.round(r.overToleranceOverestimateRate*100)}%"><span>Surestimation</span><strong>${Math.round(r.overToleranceOverestimateRate*100)} %</strong></div></div></section>
    <section class="bias-panel bias-reading"><div><div class="bias-panel-head"><h2>Lecture du biais</h2></div><div class="bias-reading-value">${formatSignedBias(r.meanBias,variable)}</div><p>Le biais indique le <strong>sens moyen</strong> de l’erreur ; il ne suffit pas à mesurer la qualité. C’est pourquoi cette page affiche aussi la MAE, le RMSE, la variabilité et le taux de jours proches.</p></div><div class="bias-reading-note"><strong>${r.sampleSize} journées</strong><span>Échantillon utilisé</span><strong>${formatBiasValue(r.standardDeviation,variable)}</strong><span>Écart-type</span></div></section>
    <p class="small bias-method-note">Indice pédagogique local, calculé sur les prévisions J+1 appariées aux observations. Il ne constitue ni une probabilité de justesse ni un indicateur de vigilance météorologique.</p>
  </main>`;
}

function renderBiasHistoryManagementRow(city){
  const history=state.bias[city.id]||{},busy=state.biasRefresh.has(city.id),updated=history.updatedAt?relativeAge(new Date(history.updatedAt).toISOString(),i18n().lang):'jamais',plan=biasRefreshPlan(city.id);
  const forecastCount=Array.isArray(history.forecasts)?history.forecasts.length:0,observationCount=Array.isArray(history.observations)?history.observations.length:0,status=forecastCount||observationCount?`${forecastCount} prévisions · ${observationCount} références`:'Aucun historique local',complete=!plan.missingDays.length;
  return `<div class="history-refresh-row"><div class="history-refresh-copy"><strong>${esc(city.name)}</strong><span>Dernière mise à jour : ${esc(updated)} · ${esc(status)}</span><span class="history-plan ${complete?'complete':''}">${complete?'Historique complet sur 30 jours':`${plan.missingDays.length} jour${plan.missingDays.length>1?'s':''} manquant${plan.missingDays.length>1?'s':''} · ${modelCountLabel(plan.models.length)} · ~${plan.requestCount} appel${plan.requestCount>1?'s':''} prévu${plan.requestCount>1?'s':''}`}</span></div><button class="btn tonal history-refresh-action" data-bias-refresh-city="${attr(city.id)}" ${busy||complete?'disabled':''}>${busy?'Mise à jour…':complete?'À jour':'Compléter'}</button></div>`;
}

function renderSettings(){
  const {t}=i18n();const sort=state.settings.modelSort||'ZONE';const groups=modelGroups(sort);const refresh=REFRESH_INTERVALS.find(x=>x.id===state.settings.refreshInterval)||REFRESH_INTERVALS[2];
  return `<main class="page"><section class="page-header"><div class="page-header-copy"><div class="eyebrow">Configuration</div><h1>${esc(t('settings'))}</h1><p>Personnalisez l’affichage, les modèles comparés et la stratégie de mise à jour de MeteoCompare.</p></div></section><div class="settings-list">
    <section class="settings-section"><h2>${esc(t('theme'))}</h2><div class="option-row">${[['SYSTEM',t('system')],['LIGHT',t('light')],['DARK',t('dark')]].map(([id,l])=>`<button class="chip ${state.settings.theme===id?'active':''}" aria-pressed="${state.settings.theme===id}" data-theme="${id}">${esc(l)}</button>`).join('')}</div></section>
    <section class="settings-section"><h2>${esc(t('language'))}</h2><div class="option-row">${[['SYSTEM','Système'],['FRENCH','Français'],['ENGLISH','English'],['SPANISH','Español'],['GERMAN','Deutsch'],['ITALIAN','Italiano']].map(([id,l])=>`<button class="chip ${state.settings.language===id?'active':''}" aria-pressed="${state.settings.language===id}" data-language="${id}">${esc(l)}</button>`).join('')}</div></section>
    <section class="settings-section"><h2>Densité d’affichage</h2><p>Le mode compact réduit les espacements des tableaux et panneaux sans masquer d’information.</p><div class="option-row">${[['COMFORTABLE','Confortable'],['COMPACT','Compact']].map(([id,l])=>`<button class="chip ${state.settings.density===id?'active':''}" aria-pressed="${state.settings.density===id}" data-density="${id}">${l}</button>`).join('')}</div></section>
    <section class="settings-section"><h2>${esc(t('refreshInterval'))}</h2><p>${esc(t('webRefreshDesc'))}</p><div class="option-row">${REFRESH_INTERVALS.map(x=>`<button class="chip ${refresh.id===x.id?'active':''}" aria-pressed="${refresh.id===x.id}" data-refresh-interval="${x.id}">${esc(x.label)}</button>`).join('')}</div></section>
    <section class="settings-section settings-wide history-management"><div class="settings-section-head"><div><h2>${esc(t('reliability'))}</h2><p>La reconstruction de l’historique J+1 interroge plusieurs archives météo et peut générer beaucoup de requêtes. Les pages de biais consultent uniquement les données déjà stockées : lancez une mise à jour seulement lorsqu’elle est nécessaire.</p></div><span class="cost-badge">Opération coûteuse</span></div><div class="history-refresh-list">${state.cities.length?state.cities.map(city=>renderBiasHistoryManagementRow(city)).join(''):`<div class="empty-state compact">Ajoutez une ville pour initialiser son historique de fiabilité locale.</div>`}</div><p class="history-refresh-note">Conseil : initialisez chaque ville une première fois, puis laissez MeteoCompare enrichir progressivement l’historique au fil des prévisions. Une mise à jour manuelle n’est utile qu’après une longue interruption ou pour reconstruire les données.</p></section>
    <section class="settings-section settings-wide"><h2>${esc(t('weatherModels'))}</h2><p>${esc(t('settings_models_desc'))}</p><div class="segmented">${[['ZONE',t('sortZone')],['FAMILLE',t('sortFamily')],['FINESSE',t('sortResolution')]].map(([id,l])=>`<button class="seg-btn ${sort===id?'active':''}" data-model-sort="${id}">${esc(l)}</button>`).join('')}</div>${groups.map(g=>`${g.label?`<div class="model-group-title">${esc(g.label)}</div>`:''}${g.models.map(renderModelRow).join('')}`).join('')}</section>
    <section class="settings-section"><h2>${esc(t('about'))}</h2><p>${esc(t('webAboutBody'))}</p><div class="banner info">🌐 ${esc(t('noWidgets'))}</div><p>${esc(t('source'))}</p><button class="btn tonal" data-action="donate">♡ ${esc(t('support'))}</button></section>
    <section class="settings-section"><h2>${esc(t('privacy'))}</h2><p>${esc(t('webPrivacyBody'))}</p><button class="btn danger" data-action="clear-data">${esc(t('clearLocalData'))}</button></section>
  </div></main>`;
}

function modelGroups(sort){let models=[...WEATHER_MODELS];if(sort==='FINESSE')return [{label:'',models:models.sort((a,b)=>a.resolutionKm-b.resolutionKm)}];if(sort==='FAMILLE'){const order=[...new Set(models.map(m=>m.family))];return order.map(f=>({label:f,models:models.filter(m=>m.family===f).sort((a,b)=>a.resolutionKm-b.resolutionKm)}));}const order=['FRANCE','EUROPE','UNITED_STATES','GLOBAL'];return order.map(z=>({label:COVERAGE_LABELS[z],models:models.filter(m=>m.coverage===z).sort((a,b)=>a.resolutionKm-b.resolutionKm)})).filter(g=>g.models.length);}
function renderModelRow(m){const on=state.settings.enabledModelIds.includes(m.id);return `<div class="model-row"><div><div class="model-title">${esc(m.name)}</div><div class="model-meta">${esc(m.family)} · ${m.resolutionKm} km · horizon ~${m.horizonHours} h</div></div><button class="switch ${on?'on':''}" role="switch" aria-checked="${on}" data-model-toggle="${m.id}" aria-label="${esc(m.name)}"></button></div>`;}

function nearestBandPercent(bands,timestamp){if(!bands?.length)return null;const target=Date.parse(timestamp),best=bands.reduce((a,b)=>Math.abs(Date.parse(b.timestamp)-target)<Math.abs(Date.parse(a.timestamp)-target)?b:a,bands[0]);return best?.percent;}
function disagreementAnalysis(cityId){
  const f=state.forecasts[cityId];if(!f)return null;const points=selectRegularTimelinePoints(buildTimelinePoints(f,'HOURLY'),8,3),bands={TEMPERATURE:cachedBand(f,'TEMPERATURE',24),PRECIPITATION:cachedBand(f,'PRECIPITATION',24),WIND:cachedBand(f,'WIND',24)},variables=['TEMPERATURE','PRECIPITATION','WIND','CONDITION'];
  const rows=points.map(p=>{const values={TEMPERATURE:nearestBandPercent(bands.TEMPERATURE,p.timestamp),PRECIPITATION:nearestBandPercent(bands.PRECIPITATION,p.timestamp),WIND:nearestBandPercent(bands.WIND,p.timestamp),CONDITION:Number.isFinite(p.consensusPercent)?p.consensusPercent:null};for(const reason of p.divergenceReasons||[])if(reason==='CONDITION'&&Number.isFinite(values.CONDITION))values.CONDITION=Math.min(values.CONDITION,49);return {timestamp:p.timestamp,modelCount:p.modelCount,values,reasons:p.divergenceReasons||[]};});
  const summary=Object.fromEntries(variables.map(v=>{const vals=rows.map(r=>r.values[v]).filter(Number.isFinite);return [v,{average:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null,weak:vals.filter(x=>x<80).length,low:vals.filter(x=>x<50).length}];}));return {rows,summary};
}
function renderDisagreementModal(cityId,focusTimestamp=null){
  const a=disagreementAnalysis(cityId);if(!a)return '<p>Données insuffisantes pour analyser le désaccord.</p>';const names={TEMPERATURE:'Température',PRECIPITATION:'Pluie',WIND:'Vent',CONDITION:'Conditions'},focusKey=focusTimestamp&&a.rows.length?a.rows.reduce((best,r)=>Math.abs(Date.parse(r.timestamp)-Date.parse(focusTimestamp))<Math.abs(Date.parse(best.timestamp)-Date.parse(focusTimestamp))?r:best,a.rows[0]).timestamp:null;
  const variableCards=Object.entries(a.summary).map(([k,v])=>`<div class="disagreement-card ${Number.isFinite(v.average)?confidenceClass(v.average):''}"><span>${names[k]}</span><strong>${Number.isFinite(v.average)?v.average+'%':'—'}</strong><small>${v.low} échéance${v.low>1?'s':''} en désaccord fort · ${v.weak} sous 80%</small></div>`).join('');
  const rows=a.rows.map(r=>`<tr class="${focusKey&&r.timestamp===focusKey?'focus':''}"><td><strong>${esc(timeLabel(r.timestamp))}</strong><span class="cell-sub">${esc(dateLabel(r.timestamp.slice(0,10),i18n().locale))}</span></td>${['TEMPERATURE','PRECIPITATION','WIND','CONDITION'].map(k=>{const v=r.values[k];return `<td><span class="confidence-cell ${Number.isFinite(v)?confidenceClass(v):''}">${Number.isFinite(v)?Math.round(v)+'%':'—'}</span></td>`;}).join('')}<td>${r.reasons.length?r.reasons.map(x=>`<span class="reason-chip">${esc(divergenceShort(x))}</span>`).join(' '):'<span class="reason-chip stable">Cohérent</span>'}</td></tr>`).join('');
  return `<p>L’accord global masque parfois une divergence concentrée sur une seule variable. Cette vue décompose les prochaines 24 h.</p><div class="disagreement-grid">${variableCards}</div><div class="table-wrap disagreement-table"><table><thead><tr><th>Échéance</th><th>Temp.</th><th>Pluie</th><th>Vent</th><th>Conditions</th><th>Cause détectée</th></tr></thead><tbody>${rows}</tbody></table></div><div class="banner info"><b>Lecture :</b> vert ≥ 80 %, ambre 50–79 %, rouge &lt; 50 %. Le score de condition est basé sur le consensus de scénario ; température, pluie et vent utilisent leur dispersion dédiée.</div>`;
}

function renderModal(){
  const {t}=i18n(); if(!state.modal)return '';
  if(state.modal.type==='addCity')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(t('searchCity'))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><input id="city-search" class="search-input" value="${attr(state.modal.query||'')}" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off" autofocus><div id="city-search-status" role="status" aria-live="polite">${renderSearchStatus()}</div><div class="search-results" id="city-search-results">${renderSearchResults()}</div></div></div></div>`;
  if(state.modal.type==='cityMenu'){const c=state.cities.find(x=>x.id===state.modal.cityId);return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(c?.name||'Ville')}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="modal-actions"><button class="btn tonal" data-refresh-city="${attr(c?.id)}">↻ ${esc(t('refresh'))}</button><button class="btn danger" data-remove-city="${attr(c?.id)}">🗑 ${esc(t('remove'))}</button></div></div></div></div>`;}
  if(state.modal.type==='confidence')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${esc(t('whyAgreement'))}</h2><span class="small">Analyse variable par variable</span></div><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="banner info"><b>Ce n’est pas une probabilité de justesse.</b>&nbsp; Un accord élevé signifie que les modèles convergent entre eux.</div>${renderDisagreementModal(state.modal.cityId||state.route.id,state.modal.focusTimestamp||null)}<details class="method-details"><summary>Méthode de calcul</summary><p><b>Température :</b> accord maximal lorsque σ ≤ 0,5 °C, divergence forte à partir de 3 °C.</p><p><b>Vent :</b> accord maximal lorsque σ ≤ 2 km/h, divergence forte à partir de 12 km/h.</p><p><b>Pluie :</b> la vue journalière distingue sec/pluie et la bande horaire utilise une mesure continue de dispersion.</p></details></div></div></div>`;
  if(state.modal.type==='cityCompare'){const selected=new Set(state.modal.selectedIds||[]);return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">Comparer des villes</h2><span class="small">2 à 3 villes · données locales déjà chargées</span></div><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="city-compare-picker">${state.cities.map(c=>`<button class="city-compare-choice ${selected.has(c.id)?'active':''}" aria-pressed="${selected.has(c.id)}" data-city-compare-toggle="${attr(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(placeLine(c))}</small></span><i>${selected.has(c.id)?'✓':'+'}</i></button>`).join('')}</div><div class="modal-footer"><span class="small">${selected.size}/3 sélectionnées</span><button class="btn primary" data-action="apply-city-compare" ${selected.size<2?'disabled':''}>Comparer</button></div></div></div></div>`;}
  if(state.modal.type==='donate')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">♡ Soutenir MeteoCompare</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><p>MeteoCompare reste gratuit, open-source, sans publicité et sans version premium.</p><div class="grid"><a class="btn tonal" href="https://liberapay.com/Pat0chat" target="_blank" rel="noopener">💝 Liberapay</a><a class="btn tonal" href="https://github.com/sponsors/Pat0chat" target="_blank" rel="noopener">❤️ GitHub Sponsors</a><a class="btn tonal" href="https://ko-fi.com/pat0chat" target="_blank" rel="noopener">☕ Ko-Fi</a></div></div></div></div>`;
  return '';
}

function closeModal(){
  if(!state.modal)return;
  const closing={...state.modal};
  const previous=lastFocusedBeforeModal;
  cancelCitySearch(); state.modal=null; render();
  requestAnimationFrame(()=>{
    let target=null;
    if(closing.type==='addCity')target=document.querySelector('[data-action="open-add-city"]');
    else if(closing.type==='cityMenu')target=document.querySelector(`[data-city-menu="${CSS.escape(closing.cityId||'')}"]`);
    else if(closing.type==='confidence')target=document.querySelector('[data-action="why-confidence"]');
    else if(closing.type==='cityCompare')target=document.querySelector('[data-action="open-city-compare"]');
    else if(closing.type==='donate')target=document.querySelector('[data-action="donate"]');
    (target||(previous?.isConnected?previous:null))?.focus?.({preventScroll:true});
  });
}
function handleGlobalKeydown(e){
  if(e.key==='Escape'&&state.modal){e.preventDefault();closeModal();return;}
  if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('.brand[role="link"]')){e.preventDefault();go('#/');return;}
  if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('[data-city-open][role="link"]')){e.preventDefault();go(`#/city/${encodeURIComponent(e.target.dataset.cityOpen)}`);return;}
  if(e.key!=='Tab'||!state.modal)return;
  const dialog=document.querySelector('.modal');if(!dialog)return;
  const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}

function handleDetailsToggle(e){
  const details=e.target?.closest?.('details[data-city-scenarios]');
  if(!details||!details.open||details.dataset.loaded==='1')return;
  const f=state.forecasts[details.dataset.cityScenarios],body=details.querySelector('[data-scenario-body]');if(!f||!body)return;
  const scenarios=cachedScenarios(f,3);
  body.innerHTML=scenarios.length?scenarios.map(s=>`<div class="scenario"><span class="scenario-icon">${scenarioIcon(s.kind)}</span><span><span class="scenario-main">${esc(scenarioLabel(s))}</span><span class="cell-sub">${s.modelCount}/${s.totalModelCount} modèles</span></span></div>`).join(''):'<div class="small">Aucun scénario disponible.</div>';
  details.dataset.loaded='1';
}
function handleAppInput(e){
  if(e.target?.id==='city-search')scheduleSearch(e.target.value);
}
function handleAppClick(e){
  const target=e.target.closest?.('[data-action],[data-city-open],[data-city-menu],[data-refresh-city],[data-remove-city],[data-add-city-id],[data-confidence-metric],[data-chart-horizon],[data-detail-mode],[data-detail-tab],[data-timeline-mode],[data-theme],[data-language],[data-refresh-interval],[data-model-sort],[data-model-toggle],[data-bias-refresh-city],[data-bias-model],[data-scroll-section],[data-compare-model],[data-export-format],[data-agreement-time],[data-density],[data-city-compare-toggle]');
  if(!target||!app.contains(target))return;
  const previousInteractionScroll=interactionScrollContext;interactionScrollContext=captureScrollContext(target);
  try{
  if(target.dataset.action){handleAction({currentTarget:target,target:e.target});return;}
  if(target.dataset.cityMenu){e.stopPropagation();lastFocusedBeforeModal=document.activeElement;state.modal={type:'cityMenu',cityId:target.dataset.cityMenu};render();return;}
  if(target.dataset.refreshCity){e.stopPropagation();state.modal=null;refreshCity(target.dataset.refreshCity,true);return;}
  if(target.dataset.removeCity){removeCity(target.dataset.removeCity);return;}
  if(target.dataset.addCityId){addCityFromSearch(target.dataset.addCityId);return;}
  if(target.dataset.confidenceMetric){state.settings.confidenceMetric=target.dataset.confidenceMetric;persistSettings();syncCityViewUrl();render();return;}
  if(target.dataset.chartHorizon){state.settings.chartHorizon=Number(target.dataset.chartHorizon);persistSettings();syncCityViewUrl();render();return;}
  if(target.dataset.detailMode){state.settings.detailViewMode=target.dataset.detailMode;persistSettings();syncCityViewUrl();render();return;}
  if(target.dataset.detailTab){state.settings.detailTab=target.dataset.detailTab;persistSettings();syncCityViewUrl();render();return;}
  if(target.dataset.timelineMode){state.settings.timelineMode=target.dataset.timelineMode;persistSettings();syncCityViewUrl();render();return;}
  if(target.dataset.theme){state.settings.theme=target.dataset.theme;persistSettings();applyTheme();render();return;}
  if(target.dataset.language){state.settings.language=target.dataset.language;i18nCacheKey=null;persistSettings();render();return;}
  if(target.dataset.refreshInterval){state.settings.refreshInterval=target.dataset.refreshInterval;persistSettings();render();refreshDueCities();return;}
  if(target.dataset.modelSort){state.settings.modelSort=target.dataset.modelSort;persistSettings();render();return;}
  if(target.dataset.modelToggle){toggleModel(target.dataset.modelToggle);return;}
  if(target.dataset.density){state.settings.density=target.dataset.density;persistSettings();applyTheme();render();return;}
  if(target.dataset.compareModel){const id=target.dataset.compareModel,set=new Set(state.compareModelIds);if(set.has(id))set.delete(id);else{if(set.size>=4){toast('La comparaison ciblée accepte au maximum 4 modèles.');return;}set.add(id);}state.compareModelIds=[...set];syncCityViewUrl();render();return;}
  if(target.dataset.exportFormat){exportCityData(state.route.id,target.dataset.exportFormat);return;}
  if(target.dataset.agreementTime){lastFocusedBeforeModal=document.activeElement;state.modal={type:'confidence',cityId:state.route.id,focusTimestamp:target.dataset.agreementTime};render();return;}
  if(target.dataset.cityCompareToggle&&state.modal?.type==='cityCompare'){const id=target.dataset.cityCompareToggle,set=new Set(state.modal.selectedIds||[]);if(set.has(id))set.delete(id);else{if(set.size>=3){toast('Vous pouvez comparer au maximum 3 villes.');return;}set.add(id);}state.modal.selectedIds=[...set];render();return;}
  if(target.dataset.biasModel&&target.dataset.biasVariable){const cityId=target.dataset.biasCity||state.route.id;if(cityId)go(`#/city/${encodeURIComponent(cityId)}/bias/${encodeURIComponent(target.dataset.biasModel)}/${encodeURIComponent(target.dataset.biasVariable)}`);return;}
  if(target.dataset.biasRefreshCity){const city=state.cities.find(c=>c.id===target.dataset.biasRefreshCity),plan=biasRefreshPlan(target.dataset.biasRefreshCity);if(city&&!plan.missingDays.length){toast(`${city.name} : historique déjà à jour.`);return;}if(city&&confirm(`Compléter l’historique de ${city.name} ?\n\n${plan.missingDays.length} jours manquants · ${modelCountLabel(plan.models.length)} · environ ${plan.requestCount} appel${plan.requestCount>1?'s':''} d’archive.\n\nSeules les périodes manquantes seront demandées.`))refreshBiasForCity(target.dataset.biasRefreshCity);return;}
  if(target.dataset.scrollSection){document.getElementById?.(target.dataset.scrollSection)?.scrollIntoView?.({behavior:'smooth',block:'start'});return;}
  if(target.dataset.cityOpen){if(e.target.closest('button'))return;go(`#/city/${encodeURIComponent(target.dataset.cityOpen)}`);}
  }finally{interactionScrollContext=previousInteractionScroll;}
}

function handleAction(e){
  const action=e.currentTarget.dataset.action;
  if(action==='back')history.length>1?history.back():go('#/');
  else if(action==='home')go('#/');
  else if(action==='settings')go('#/settings');
  else if(action==='copy-link'){if(state.route.name==='city')syncCityViewUrl();const url=location.href;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>toast('Lien de cette vue copié.')).catch(()=>prompt('Copiez ce lien :',url));else prompt('Copiez ce lien :',url);}
  else if(action==='open-city-compare'){lastFocusedBeforeModal=document.activeElement;const initial=state.route.name==='compare'?(state.route.ids||[]):state.cities.slice(0,Math.min(2,state.cities.length)).map(c=>c.id);state.modal={type:'cityCompare',selectedIds:[...initial]};render();}
  else if(action==='apply-city-compare'){const ids=state.modal?.type==='cityCompare'?(state.modal.selectedIds||[]):[];if(ids.length<2){toast('Sélectionnez au moins 2 villes.');return;}state.modal=null;go(`#/compare?cities=${ids.map(encodeURIComponent).join(',')}`);}
  else if(action==='refresh-all')refreshAll(true);
  else if(action==='open-add-city'){lastFocusedBeforeModal=document.activeElement;cancelCitySearch();state.modal={type:'addCity',query:'',results:[],searching:false,pending:false};render();}
  else if(action==='close-modal'){closeModal();}
  else if(action==='modal-backdrop'&&e.target===e.currentTarget){closeModal();}
  else if(action==='why-confidence'){lastFocusedBeforeModal=document.activeElement;state.modal={type:'confidence',cityId:state.route.id};render();}
  else if(action==='donate'){lastFocusedBeforeModal=document.activeElement;state.modal={type:'donate'};render();}
  else if(action==='clear-data'){if(confirm('Effacer tous les favoris, réglages et caches MeteoCompare de ce navigateur ?')){clearAllData().finally(()=>location.reload());}}
}

function persistSettings(){saveSettings(state.settings);applyTheme();}
function placeLine(c){return [c.admin1,c.country].filter(Boolean).join(', ')||`${c.latitude?.toFixed?.(2)||c.latitude}, ${c.longitude?.toFixed?.(2)||c.longitude}`;}

function cancelCitySearch(){
  clearTimeout(searchTimer);searchTimer=null;searchSeq++;
  if(searchAbort){searchAbort.abort();searchAbort=null;}
}
function renderSearchStatus(){
  if(!state.modal||state.modal.type!=='addCity')return '';
  const q=(state.modal.query||'').trim();
  if(state.modal.error)return `<div class="banner error">${esc(state.modal.error)}</div>`;
  if(state.modal.searching)return `<div class="banner info"><span class="loader"></span>${esc(i18n().t('loading'))}</div>`;
  if(q.length>0&&q.length<3)return `<div class="small search-hint">Saisissez au moins 3 caractères.</div>`;
  if(state.modal.pending)return `<div class="small search-hint">Recherche après une courte pause de saisie…</div>`;
  return '';
}
function renderSearchResults(){
  return (state.modal?.results||[]).map(c=>`<button class="search-result" data-add-city-id="${attr(c.id)}"><span style="font-size:1.5rem">📍</span><span><b>${esc(c.name)}</b><span class="cell-sub">${esc(placeLine(c))}</span></span></button>`).join('');
}
function updateSearchModal(){
  if(!state.modal||state.modal.type!=='addCity')return;
  const status=document.querySelector('#city-search-status'),results=document.querySelector('#city-search-results');
  if(status)status.innerHTML=renderSearchStatus();
  if(results)results.innerHTML=renderSearchResults();
}
function scheduleSearch(query){
  if(!state.modal||state.modal.type!=='addCity')return;
  state.modal.query=query;state.modal.error=null;state.modal.searching=false;state.modal.pending=false;
  cancelCitySearch();
  const q=query.trim();
  if(q.length<3){state.modal.results=[];updateSearchModal();return;}
  state.modal.pending=true;updateSearchModal();
  const seq=searchSeq;
  searchTimer=setTimeout(()=>performSearch(q,seq),600);
}
async function performSearch(query,seq=searchSeq){
  if(!state.modal||state.modal.type!=='addCity'||seq!==searchSeq)return;
  searchAbort=new AbortController();state.modal.pending=false;state.modal.searching=true;updateSearchModal();
  try{
    const results=await searchCities(query,i18n().lang,searchAbort.signal);
    if(!state.modal||state.modal.type!=='addCity'||seq!==searchSeq||state.modal.query.trim()!==query)return;
    state.modal.results=results;state.modal.searching=false;updateSearchModal();
  }catch(err){
    if(err?.name==='AbortError')return;
    if(!state.modal||state.modal.type!=='addCity'||seq!==searchSeq)return;
    state.modal.error=humanError(err);state.modal.searching=false;updateSearchModal();
  }finally{if(seq===searchSeq)searchAbort=null;}
}

function addCityFromSearch(id){const city=state.modal?.results?.find(c=>c.id===id);if(!city)return;cancelCitySearch();if(!state.cities.some(c=>c.id===city.id)){state.cities.push(city);saveCities(state.cities);state.evolution[city.id]=[];state.bias[city.id]={forecasts:[],observations:[],updatedAt:null};}state.modal=null;render();refreshCity(city.id,true);}
function removeCity(id){state.cities=state.cities.filter(c=>c.id!==id);saveCities(state.cities);delete state.forecasts[id];delete state.errors[id];delete state.evolution[id];delete state.bias[id];deleteForecast(id);state.modal=null;if(state.route.name==='city'&&state.route.id===id)go('#/');else render();}
function toggleModel(id){const set=new Set(state.settings.enabledModelIds);if(set.has(id)){if(set.size<=1){toast('Au moins un modèle doit rester activé.');return;}set.delete(id);}else set.add(id);state.settings.enabledModelIds=WEATHER_MODELS.filter(m=>set.has(m.id)).map(m=>m.id);persistSettings();render();toast('Sélection des modèles mise à jour. Actualisez pour charger la nouvelle comparaison.');}

function refreshIntervalMinutes(){return REFRESH_INTERVALS.find(x=>x.id===state.settings.refreshInterval)?.minutes??60;}
function isForecastFresh(f){const minutes=refreshIntervalMinutes();if(!f?.fetchedAt)return false;if(minutes===0)return true;const age=Date.now()-Date.parse(f.fetchedAt);return age>=0&&age<minutes*60000;}
async function refreshDueCities(){
  if(!state.online||dueRefreshRunning)return;const minutes=refreshIntervalMinutes();if(minutes===0)return;
  const due=state.cities.filter(city=>{const f=state.forecasts[city.id];return !f||!isForecastFresh(f);});
  if(!due.length)return;dueRefreshRunning=true;render();
  try{for(const city of due)await refreshCity(city.id,false,false);}finally{dueRefreshRunning=false;render();}
}
async function refreshAll(force=false){
  const cities=[...state.cities];if(!cities.length)return;const workers=Math.min(2,cities.length);let i=0;
  const tasks=Array.from({length:workers},async()=>{while(i<cities.length){const c=cities[i++];await refreshCity(c.id,force,false);}});
  render();
  try{await Promise.all(tasks);}finally{render();}
}
async function refreshCity(cityId,force=false,renderUpdates=true){
  const city=state.cities.find(c=>c.id===cityId);if(!city||state.loading.has(cityId))return;if(!state.online){if(!state.forecasts[cityId])state.errors[cityId]='Pas de réseau et aucun cache local.';if(renderUpdates)render();return;}if(!force&&state.forecasts[cityId]&&isForecastFresh(state.forecasts[cityId]))return;
  state.loading.add(cityId);delete state.errors[cityId];if(renderUpdates)render();
  try{const f=await fetchForecast(city,state.settings.enabledModelIds,7);state.forecasts[cityId]=f;await saveForecast(cityId,f);state.evolution[cityId]=recordEvolutionSnapshot(cityId,f);delete state.errors[cityId];if(state.route.name==='city'&&state.route.id===cityId)scheduleIdle(()=>ensureNormals(cityId));}
  catch(err){state.errors[cityId]=humanError(err);if(!state.forecasts[cityId])toast(state.errors[cityId]);}
  finally{state.loading.delete(cityId);if(renderUpdates)render();}
}
function humanError(err){if(err?.name==='AbortError')return 'La requête météo a expiré.';const m=String(err?.message||err||'Erreur inconnue');if(/Failed to fetch/i.test(m))return 'Impossible de joindre Open-Meteo. Vérifiez la connexion et les règles CORS de l’hébergement.';return m;}

function onRouteSettled(){if(state.route.name==='city'||state.route.name==='bias'){const id=state.route.id;if(!state.forecasts[id])refreshCity(id,false);else if(state.route.name==='city')scheduleIdle(()=>ensureNormals(id));}else if(state.route.name==='compare'){const missing=(state.route.ids||[]).filter(id=>!state.forecasts[id]);if(missing.length)Promise.all(missing.map(id=>refreshCity(id,false,false))).finally(()=>render());}}
function scheduleIdle(fn){if('requestIdleCallback' in window)requestIdleCallback(()=>fn(),{timeout:1200});else setTimeout(fn,80);}
async function ensureNormals(cityId){
  const city=state.cities.find(c=>c.id===cityId);if(!city||!state.online)return;const cached=state.normals[cityId]||loadNormals(cityId);if(cached&&Date.now()-(cached.computedAt||0)<180*24*3600e3){state.normals[cityId]=cached;return;}
  if(state.normals[cityId]?.loading)return;state.normals[cityId]={...(cached||{}),loading:true};
  const today=cityToday(city.timezone);const lastYear=+today.slice(0,4)-1;const start=`${lastYear-9}-01-01`,end=`${lastYear}-12-31`;
  try{const raw=await fetchClimateNormals(city,start,end);const agg=aggregateNormals(raw,start,end);if(!agg.complete)throw new Error('Archive ERA5 incomplète : cache non remplacé.');const payload={computedAt:Date.now(),startDate:start,endDate:end,normals:agg.normals};state.normals[cityId]=payload;saveNormals(cityId,payload);if(state.route.name==='city'&&state.route.id===cityId)render();}
  catch(err){state.normals[cityId]=cached||null;console.warn('Climate normals:',err);}
}

function dateRangeList(start,end){const out=[];for(let d=start;d<=end;d=addDays(d,1))out.push(d);return out;}
function contiguousDateRanges(dates){const sorted=[...new Set(dates)].sort();if(!sorted.length)return [];const ranges=[];let start=sorted[0],prev=sorted[0];for(const d of sorted.slice(1)){if(d===addDays(prev,1)){prev=d;continue;}ranges.push({start,end:prev});start=prev=d;}ranges.push({start,end:prev});return ranges;}
function biasRefreshPlan(cityId,windowDays=30){
  const city=state.cities.find(c=>c.id===cityId);if(!city)return {models:[],missingDays:[],forecastRanges:[],observationRanges:[],requestCount:0};
  const availableIds=Object.keys(state.forecasts[cityId]?.seriesByModel||{}),models=selectedModels(availableIds.length?availableIds:state.settings.enabledModelIds),today=cityToday(city.timezone),end=addDays(today,-1),start=addDays(end,-windowDays+1),dates=dateRangeList(start,end),source=state.bias[cityId]||{forecasts:[],observations:[]},variables=['TEMPERATURE','PRECIPITATION','WIND_SPEED'];
  const fset=new Set((source.forecasts||[]).map(x=>`${x.modelId}|${x.variable}|${x.targetDate}`)),oset=new Set((source.observations||[]).map(x=>`${x.variable}|${x.targetDate}`));
  const missingForecastDates=dates.filter(date=>models.some(m=>variables.some(v=>!fset.has(`${m.id}|${v}|${date}`)))),missingObservationDates=dates.filter(date=>variables.some(v=>!oset.has(`${v}|${date}`))),missingDays=[...new Set([...missingForecastDates,...missingObservationDates])].sort(),forecastRanges=contiguousDateRanges(missingForecastDates),observationRanges=contiguousDateRanges(missingObservationDates);
  return {models,start,end,missingDays,forecastRanges,observationRanges,requestCount:forecastRanges.length+observationRanges.length};
}
async function refreshBiasForCity(cityId){
  const city=state.cities.find(c=>c.id===cityId);if(!city||state.biasRefresh.has(cityId))return;if(!state.online){toast('Connexion requise pour actualiser le biais.');return;}const plan=biasRefreshPlan(cityId);if(!plan.missingDays.length){toast(`${city.name} : historique déjà complet sur les 30 derniers jours.`);render();return;}state.biasRefresh.add(cityId);render();
  try{
    const forecasts=[],observations=[];
    for(const r of plan.forecastRanges){const prev=await fetchPreviousRuns(city,plan.models,r.start,r.end);forecasts.push(...normalizePreviousRuns(prev,city,plan.models,r.start,r.end));}
    for(const r of plan.observationRanges){const archive=await fetchBiasArchive(city,r.start,r.end);observations.push(...normalizeBiasObservations(archive,r.start,r.end));}
    const today=cityToday(city.timezone),old=state.bias[cityId]||{forecasts:[],observations:[],updatedAt:null},mergedForecasts=dedupe([...old.forecasts,...forecasts],x=>`${x.modelId}|${x.variable}|${x.targetDate}`),mergedObs=dedupe([...old.observations,...observations],x=>`${x.variable}|${x.targetDate}`),cutoff=addDays(today,-45);
    const nextBias={forecasts:mergedForecasts.filter(x=>x.targetDate>=cutoff),observations:mergedObs.filter(x=>x.targetDate>=cutoff),updatedAt:Date.now()};state.bias[cityId]=nextBias;saveBias(cityId,nextBias);toast(`${city.name} : ${plan.missingDays.length} jours complétés via ${plan.requestCount} appel${plan.requestCount>1?'s':''} d’archive.`);
  }catch(err){toast(`Biais ${city.name} : ${humanError(err)}`);}finally{state.biasRefresh.delete(cityId);render();}
}
function dedupe(list,key){const m=new Map();for(const x of list)m.set(key(x),x);return [...m.values()];}
