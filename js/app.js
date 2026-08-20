import { WEATHER_MODELS, REFRESH_INTERVALS, getModel, selectedModels, consensusGroupFor } from './models.js';
import { loadSettings, saveSettings, loadCities, saveCities, loadForecast, loadForecastAsync, saveForecast, deleteForecast, deleteCityData, recordEvolutionSnapshot, loadEvolution, loadNormals, saveNormals, loadBias, saveBias, loadMarine, saveMarine, loadModelHealth, saveModelHealth, createLocalBackup, restoreLocalBackup, clearAllData, clearPwaRuntime, inspectLocalData, verifyLocalDataIntegrity, DATA_SCHEMA_VERSION, getStorageIssues, clearStorageIssues } from './storage.js';
import { searchCities, fetchForecast, fetchClimateNormals, fetchPreviousRuns, fetchBiasArchive } from './api.js';
import { fromWmoCode, conditionInfo, cityToday, addDays, dayConfidence, currentConditions, hourlyConfidenceBand, aggregateDay, homeHeatmap, buildScenarios, aggregateNormals, windArrow, dateLabel, timeLabel, relativeAge, dailyCondition, hourlyCondition, dailyCloudCoverMean, buildTimelinePoints, selectRegularTimelinePoints, roundedHourLocal, localTimestampValue, zonedTimestampEpochs, zonedLocalTimestampEpoch } from './domain.js';
import { makeI18n, languageCode, ensureLanguage } from './i18n.js';
import { analyticsStatus, trackPageView, trackAnalyticsEvent, setAnalyticsOptOut } from './analytics.js';
import { ErrorCenter, classifyError, storageIssueDescriptor, ERROR_ACTIONS } from './errors.js';
import { APP_VERSION } from './version.js';
import { apiUsageSnapshot } from './api-budget.js';

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
  comparePanelOpen: {},
  evolutionVariable: 'temperature',
  reliabilityVariable: 'TEMPERATURE',
  localDataStats: null,
  localDataLoading: false,
  localDataError: null,
  integrityReport: null,
  integrityLoading: false,
  errorCenter: new ErrorCenter(),
  diagnosticsOpen: new Set(),
  marine: {},
  marineLoading: new Set(),
  modelHealth: {},
  modelHealthHistory: {},
  modelHealthLoading: new Set(),
  backupOptions: { forecasts:false, normals:true, bias:true, evolution:true, marine:true, health:true },
  localDataUi: { advancedOpen:false, privacyOpen:false, cacheOpen:false },
};
await ensureLanguage(state.settings.language);
applyRouteViewState(state.route);
// Keep startup light: only hydrate a cache synchronously when the initial route actually needs it.
// All other Forecast payloads are loaded from IndexedDB in the background, while analysis
// payloads (bias / evolution / normals) are loaded lazily when their city is opened.
const eagerForecastIds = new Set(
  state.route.name==='city'||state.route.name==='bias' ? [state.route.id] :
  state.route.name==='compare' ? (state.route.ids||[]) : []
);
state.cities.forEach(c => {
  if(!eagerForecastIds.has(c.id))return;
  const f=loadForecast(c.id); if(f) state.forecasts[c.id]=f;
});

const app = document.querySelector('#app');
let searchTimer = null;
let searchAbort = null;
let searchSeq = 0;
let autoRefreshTimer = null;
let lastViewTimeKey = null;
let stickyResizeObserver = null;
let dueRefreshRunning = false;
let renderQueued = false;
let renderFrame = 0;
let lastFocusedBeforeModal = null;
let i18nCacheKey = null;
let i18nCache = null;
let deferredInstallPrompt = null;
let pwaInstalled = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
const PWA_CLEAR_RELOAD_GUARD = 'meteocompare.skip-pwa-registration-after-clear.v1';
let pwaPostClearCleanup=Promise.resolve();
function consumePwaClearReloadGuard(){try{const skip=sessionStorage.getItem(PWA_CLEAR_RELOAD_GUARD)==='1';if(skip)sessionStorage.removeItem(PWA_CLEAR_RELOAD_GUARD);return skip;}catch{return false;}}
function armPwaClearReloadGuard(){try{sessionStorage.setItem(PWA_CLEAR_RELOAD_GUARD,'1');}catch{}}
const numberFormatters = new Map();
const forecastViewCache = new WeakMap();
const seriesIndexCache = new WeakMap();
const chartHoverDataCache = new WeakMap();
const routeScrollPositions = new Map();
let pendingScrollDirective = null;
let interactionScrollContext = null;
let historyScrollRaf = 0;
let routeTransitionToken = 0;
let localScrollStabilizationToken = 0;
const supportsHistoryRouting = typeof history?.pushState === 'function' && typeof history?.replaceState === 'function';
const BIAS_MIN_SAMPLES=14;
const BIAS_REFERENCE_ID='ERA5',BIAS_REFERENCE_LAG_DAYS=6;
const cityRefreshTokens=new Map();
const biasRefreshTokens=new Map();
const normalsRefreshTokens=new Map();
const localAnalysisLoaded={bias:new Set(),evolution:new Set(),normals:new Set(),marine:new Set(),health:new Set()};
const lazyFeatures={bias:null,evolution:null,diagnostics:null,comparison:null,marine:null,health:null};
const lazyFeaturePromises={bias:null,evolution:null,diagnostics:null,comparison:null,marine:null,health:null};
function loadFeature(name){
  if(lazyFeatures[name])return Promise.resolve(lazyFeatures[name]);
  if(lazyFeaturePromises[name])return lazyFeaturePromises[name];
  const loader=name==='bias'?import('./features/bias.js'):name==='evolution'?import('./features/evolution.js'):name==='diagnostics'?import('./features/diagnostics.js'):name==='comparison'?import('./features/comparison.js'):name==='marine'?import('./features/marine.js'):name==='health'?import('./features/model-health.js'):Promise.reject(new Error(`UNKNOWN_FEATURE:${name}`));
  lazyFeaturePromises[name]=loader.then(mod=>(lazyFeatures[name]=mod)).finally(()=>{lazyFeaturePromises[name]=null;});
  return lazyFeaturePromises[name];
}
function warmCityFeatures(){void loadFeature('bias').then(()=>{if(state.route.name==='city'||state.route.name==='bias')render();});void loadFeature('evolution').then(()=>{if(state.route.name==='city')render();});}


for(const issue of getStorageIssues())state.errorCenter.report(`storage:${issue.code}`,storageIssueDescriptor(issue));

function ensureBiasLoaded(cityId){if(!localAnalysisLoaded.bias.has(cityId)){state.bias[cityId]=loadBias(cityId);localAnalysisLoaded.bias.add(cityId);}return state.bias[cityId];}
function ensureEvolutionLoaded(cityId){if(!localAnalysisLoaded.evolution.has(cityId)){state.evolution[cityId]=loadEvolution(cityId);localAnalysisLoaded.evolution.add(cityId);}return state.evolution[cityId];}
function ensureNormalsLoaded(cityId){if(!localAnalysisLoaded.normals.has(cityId)){const n=loadNormals(cityId);if(n)state.normals[cityId]=n;localAnalysisLoaded.normals.add(cityId);}return state.normals[cityId]||null;}
function ensureMarineLoaded(cityId){if(!localAnalysisLoaded.marine.has(cityId)){const m=loadMarine(cityId);if(m)state.marine[cityId]=m;localAnalysisLoaded.marine.add(cityId);}return state.marine[cityId]||null;}
function ensureHealthLoaded(cityId){if(!localAnalysisLoaded.health.has(cityId)){state.modelHealthHistory[cityId]=loadModelHealth(cityId);localAnalysisLoaded.health.add(cityId);}return state.modelHealthHistory[cityId]||[];}
function ensureCityAnalysisLoaded(cityId){ensureEvolutionLoaded(cityId);ensureBiasLoaded(cityId);ensureNormalsLoaded(cityId);ensureHealthLoaded(cityId);const city=state.cities.find(c=>c.id===cityId);if(city?.marineEnabled)ensureMarineLoaded(cityId);}

init();

function init() {
  applyTheme();
  const skipPwaRegistration=consumePwaClearReloadGuard();
  if(skipPwaRegistration)pwaPostClearCleanup=clearPwaRuntime();
  if (!skipPwaRegistration && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker:', err));
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;if(state.route.name==='about')render();});
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;pwaInstalled=true;void trackAnalyticsEvent('PWA Installed',state.route);toast(i18n().t('pwaInstallSuccess'));if(state.route.name==='about')render();});
  app.addEventListener('click', handleAppClick);
  app.addEventListener('input', handleAppInput);
  app.addEventListener('toggle', handleDetailsToggle, true);
  app.addEventListener('pointermove', handleChartPointerMove, {passive:true});
  app.addEventListener('pointerdown', handleChartPointerMove, {passive:true});
  app.addEventListener('pointerout', handleChartPointerOut, {passive:true});
  document.addEventListener?.('keydown', handleGlobalKeydown);
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDueCities();});
  if(supportsHistoryRouting){
    try{ history.scrollRestoration='manual'; history.replaceState({...history.state,mcRouteKey:routeKey(state.route),mcScrollY:currentScrollY()},'',location.href); }catch{}
    window.addEventListener('popstate',event=>handleHistoryNavigation(event));
    window.addEventListener('scroll',scheduleHistoryScrollSnapshot,{passive:true});
  }else{
    window.addEventListener('hashchange',()=>{state.route=parseRoute();applyRouteViewState(state.route);state.modal=null;cancelCitySearch();const saved=routeScrollPositions.get(routeKey(state.route));render({scroll:{type:'absolute',y:state.route.name==='bias'?0:(Number.isFinite(saved)?saved:0)}});void trackPageView(state.route);onRouteSettled();});
  }
  window.addEventListener('online',()=>{state.online=true;render();refreshDueCities();});
  window.addEventListener('offline',()=>{state.online=false;render();});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='SYSTEM')applyTheme();});
  render({scroll:{type:'absolute',y:0}});
  void trackPageView(state.route);
  hydrateForecastStorage().finally(()=>{onRouteSettled();refreshDueCities();});
  lastViewTimeKey=viewTimeKey();
  autoRefreshTimer=setInterval(()=>{const nextKey=viewTimeKey();if(lastViewTimeKey!==null&&nextKey!==lastViewTimeKey)render();lastViewTimeKey=nextKey;refreshDueCities();},60_000);
}
function viewTimeKey(){const keys=state.cities.map(city=>roundedHourLocal(city.timezone||state.forecasts[city.id]?.city?.timezone||'UTC'));return keys.join('|')||new Date().toISOString().slice(0,13);}
async function hydrateForecastStorage(){
  let changed=false;
  await Promise.all([...state.cities].map(async city=>{
    const f=await loadForecastAsync(city.id),stillFavorite=state.cities.some(c=>c.id===city.id);
    if(!stillFavorite){if(f)deleteCityData(city.id);return;}
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
  if(parts[0]==='data')return {name:'data'};
  if(parts[0]==='about')return {name:'about'};
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
  const keys=[['confidenceMetric','data-confidence-metric'],['chartHorizon','data-chart-horizon'],['detailMode','data-detail-mode'],['detailTab','data-detail-tab'],['timelineMode','data-timeline-mode'],['theme','data-theme'],['language','data-language'],['refreshInterval','data-refresh-interval'],['modelSort','data-model-sort'],['modelToggle','data-model-toggle'],['biasRefreshCity','data-bias-refresh-city'],['compareModel','data-compare-model'],['density','data-density'],['evolutionVariable','data-evolution-variable'],['reliabilityVariable','data-reliability-variable'],['action','data-action']];
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
    scrollInstantTo((Number.isFinite(directive.y)?directive.y:currentScrollY())+delta);
    return;
  }
  scrollInstantTo(directive.y);
}
function stabilizeLocalScroll(directive){
  if(!directive||directive.type==='route-top'||(!directive.selector&&!directive.id))return false;
  let anchor=null;if(directive.type==='selector')anchor=document.querySelector?.(directive.selector);else if(directive.type==='anchor')anchor=document.getElementById?.(directive.id);
  if(!anchor||typeof anchor.getBoundingClientRect!=='function')return false;
  const targetY=Math.max(0,(Number.isFinite(directive.y)?directive.y:currentScrollY())+anchor.getBoundingClientRect().top-directive.top),token=++localScrollStabilizationToken;
  const pin=()=>{if(token===localScrollStabilizationToken)scrollInstantTo(targetY);};
  pin();queueMicrotask(pin);requestAnimationFrame(()=>{pin();requestAnimationFrame(pin);});return true;
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
    localScrollStabilizationToken++;
    const token=++routeTransitionToken;
    render({scroll:{type:'route-top',y:0,token,routeKey:routeKey(state.route)},immediate:true});
  }else render({scroll:{type:'absolute',y},immediate:Boolean(options.immediate)});
  if(options.newRoute)void trackPageView(state.route);
  onRouteSettled();
}
function handleHistoryNavigation(event){
  localScrollStabilizationToken++;
  const route=parseRoute(),key=routeKey(route),saved=Number(event?.state?.mcScrollY);
  state.route=route;applyRouteViewState(route);state.modal=null;cancelCitySearch();
  const fallback=routeScrollPositions.get(key),y=Number.isFinite(saved)?saved:(Number.isFinite(fallback)?fallback:0);
  render({scroll:{type:'absolute',y},immediate:true});void trackPageView(state.route);onRouteSettled();
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

function syncDocumentMeta(){
  const {t}=i18n();
  document.title=t('siteTitle');
  const description=document.querySelector('meta[name="description"]');if(description)description.setAttribute('content',t('siteDescription'));const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.setAttribute('href',`manifest.${i18n().lang}.webmanifest`);
}
function syncStickyOffsets(){
  stickyResizeObserver?.disconnect?.();
  const topbar=app?.querySelector?.('.topbar');
  const update=()=>{
    const topbarHeight=Math.ceil(topbar?.getBoundingClientRect?.().height||66);
    document.documentElement?.style?.setProperty?.('--topbar-height',`${topbarHeight}px`);
  };
  update();
  if(typeof ResizeObserver!=='undefined'&&topbar){
    stickyResizeObserver=new ResizeObserver(update);
    stickyResizeObserver.observe(topbar);
  }
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
function conditionMarkup(condition,size='normal',inferred=false){const inf=localizedConditionInfo(condition),{t}=i18n(),label=inferred?`${inf.label} · ${t('conditionInferred')}`:inf.label;return `<span class="condition-icon ${inferred?'is-inferred':''}" title="${esc(label)}" role="img" aria-label="${esc(label)}"><span class="weather-icon" aria-hidden="true" style="font-size:${size==='small'?'1.25rem':'2.35rem'}">${inf.icon}</span></span>`;}
function confidenceClass(percent){return !Number.isFinite(percent)?'unknown':percent>=80?'high':percent>=50?'medium':'low';}
function modelCountLabel(count){const n=Number(count)||0;const {t}=i18n();return `${n} ${t(n===1?'modelSingular':'models')}`;}
function archiveCallLabel(count){const n=Number(count)||0;return i18n().t(n===1?'archiveCallOne':'archiveCallMany',{count:n});}
function localizedWindDirection(direction){if(!Number.isFinite(direction))return '';const keys=['windDirN','windDirNE','windDirE','windDirSE','windDirS','windDirSW','windDirW','windDirNW'];return i18n().t(keys[Math.round(direction/45)%8]);}
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
    plus:'<path d="M12 5v14M5 12h14"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 10.8v5.2"/><path d="M12 7.6h.01"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
    download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    external:'<path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
    database:'<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/><path d="M4.5 11.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/>'
  };
  return `<svg ${common}>${paths[kind]||paths.home}</svg>`;
}
function formatExactAge(iso){
  const {t}=i18n(),ms=Date.now()-Date.parse(iso||'');if(!Number.isFinite(ms)||ms<0)return t('unknownAge');
  const min=Math.floor(ms/60000);if(min<1)return t('justNow');if(min<60)return `${min} min`;const h=Math.floor(min/60),m=min%60;if(h<24)return `${h} h${m?` ${m} min`:''}`;const d=Math.floor(h/24);return `${d} ${t('dayShort')} ${h%24} h`;
}
function forecastHealth(f){
  const {t}=i18n(),age=Date.now()-Date.parse(f?.fetchedAt||''),refreshMs=Math.max(60,refreshIntervalMinutes()||60)*60000;
  const stale=!Number.isFinite(age)||age>Math.max(refreshMs*2,3*3600e3);
  if(!state.online)return {class:stale?'stale':'cached',label:t(stale?'offlineOldCache':'offlineRecentCache'),detail:f?.fetchedAt?t('dataAge',{age:formatExactAge(f.fetchedAt)}):t('noDataLower')};
  if(stale)return {class:'stale',label:t('cacheOld'),detail:f?.fetchedAt?t('loadedAgoSingular',{age:formatExactAge(f.fetchedAt)}):t('unknownDate')};
  return {class:'live',label:t('onlineData'),detail:f?.fetchedAt?t('loadedAgo',{age:formatExactAge(f.fetchedAt)}):t('recentData')};
}
function modelCoverageKey(tab){return tab==='TEMPERATURE'?'temperature':tab==='PRECIPITATION'?'precipitation':tab==='WIND'?'wind':'conditions';}
function modelRunInfo(f,modelId,tab='CONDITIONS'){
  const {t}=i18n(),meta=f?.modelMeta?.[modelId]||{},run=meta.runTimestamp?Date.parse(meta.runTimestamp):NaN;
  const runAge=Number.isFinite(run)?Math.max(0,Date.now()-run):null,c=f?viewCache(f):null;
  if(c&&c.newestRunTimestamp===undefined){const runs=Object.values(f?.modelMeta||{}).map(x=>Date.parse(x?.runTimestamp||'')).filter(Number.isFinite);c.newestRunTimestamp=runs.length?Math.max(...runs):null;}
  const newest=c?.newestRunTimestamp??null,older=runAge!=null&&newest!=null&&newest-run>6*3600e3,key=modelCoverageKey(tab);
  const variableCoverage=meta.coverageByVariable?.[key]||meta.byVariable?.[key]||null;
  const lastTimestamp=variableCoverage?.lastTimestamp||meta.lastTimestamp||null;
  const coverage=lastTimestamp?t('coversUntil',{date:dateLabel(lastTimestamp.slice(0,10),i18n().locale),time:timeLabel(lastTimestamp)}):t('coverageUnknown');
  // Open-Meteo does not consistently expose an exact initialization time for
  // every model in batched responses. Do not fill the UI with an unhelpful
  // “exact run unavailable” label: when the run is unknown, show the useful
  // variable-specific data coverage instead.
  return {known:runAge!=null,older,label:runAge!=null?`${t('runAge',{age:formatExactAge(meta.runTimestamp)})} · ${coverage}`:coverage,coverage,lastTimestamp};
}
function currentCityForecast(){return state.route.name==='city'?state.forecasts[state.route.id]:state.route.name==='bias'?state.forecasts[state.route.id]:null;}
function toast(message){const root=document.querySelector('#toast-root');if(!root)return;const el=document.createElement('div');el.className='toast';el.textContent=message;root.appendChild(el);setTimeout(()=>el.remove(),3500);}

function errorDescriptorMessage(item){
  const {t}=i18n();if(!item)return '';
  if(item.code==='HTTP_ERROR')return t(item.messageKey,{status:item.status||'?'});
  return t(item.messageKey||'unknownError');
}
function renderErrorIssue(item,{cityId=null}={}){
  if(!item)return '';const {t}=i18n(),actions=(item.actions||[]).map(action=>`<button class="btn ${action==='retry'?'tonal':'subtle'}" data-error-action="${attr(action)}" ${cityId?`data-error-city="${attr(cityId)}"`:''} data-error-scope="${attr(item.scope||'')}">${esc(t(ERROR_ACTIONS[action]||action))}</button>`).join('');
  return `<section class="error-panel ${attr(item.severity||'warning')}" role="${item.severity==='error'?'alert':'status'}"><div class="error-panel-icon" aria-hidden="true">${item.severity==='error'?'!':'i'}</div><div class="error-panel-copy"><strong>${esc(t(item.titleKey||'errorUnknownTitle'))}</strong><span>${esc(errorDescriptorMessage(item))}</span>${item.technical&&item.code==='UNKNOWN'?`<small>${esc(item.technical)}</small>`:''}</div>${actions?`<div class="error-panel-actions">${actions}</div>`:''}</section>`;
}
function renderCityErrors(cityId){return state.errorCenter.list(`city:${cityId}:`).map(item=>renderErrorIssue(item,{cityId})).join('');}
function syncStorageErrors(){for(const issue of getStorageIssues())state.errorCenter.report(`storage:${issue.code}`,storageIssueDescriptor(issue));}

function viewCache(f){let c=forecastViewCache.get(f);if(!c){c={days:new Map(),scenarios:new Map(),bands:new Map(),heat:new Map(),evolutionSource:null,evolutionReport:null,biasSource:null,biasToday:null,biasReport:null,visibleModelIds:null,newestRunTimestamp:undefined};forecastViewCache.set(f,c);}return c;}
function consensusWeightSignature(weights){if(!weights)return 'family';return ['temperature','precipitation','wind'].map(k=>`${k}:${Object.entries(weights[k]||{}).sort(([a],[b])=>a.localeCompare(b)).map(([id,w])=>`${id}=${Number(w).toFixed(3)}`).join(',')}`).join('|');}
function cachedAggregateDay(f,date,weights=null){const c=viewCache(f),key=`${date}|${consensusWeightSignature(weights)}`;if(!c.days.has(key))c.days.set(key,aggregateDay(f,date,{weightsByVariable:weights||{}}));return c.days.get(key);}
function cachedScenarios(f,limit=null){const anchor=roundedHourLocal(f.city.timezone),key=`${anchor}|${limit==null?'all':String(limit)}`,c=viewCache(f);if(!c.scenarios.has(key))c.scenarios.set(key,limit==null?buildScenarios(f):buildScenarios(f,limit));return c.scenarios.get(key);}
function cachedBand(f,metric,horizon){const weights=arguments[3]||null,key=`${Math.floor(Date.now()/3600000)}|${roundedHourLocal(f.city.timezone)}|${metric}|${horizon}|${consensusWeightSignature(weights)}`,c=viewCache(f);if(!c.bands.has(key))c.bands.set(key,hourlyConfidenceBand(f,metric,horizon,new Date(),{weightsByVariable:weights||{}}));return c.bands.get(key);}
function cachedHeatmap(f,hours){const weights=arguments[2]||null,c=viewCache(f),key=`${roundedHourLocal(f.city.timezone)}|${hours}|${consensusWeightSignature(weights)}`;if(!c.heat.has(key))c.heat.set(key,homeHeatmap(f,hours,{weightsByVariable:weights||{}}));return c.heat.get(key);}
function cachedEvolution(f,snapshots){const c=viewCache(f);if(!lazyFeatures.evolution){void loadFeature('evolution').then(()=>{if(state.route.name==='city'&&state.forecasts[state.route.id]===f)rerenderCitySectionOrPage('evolution');});return c.evolutionReport||{days:[]};}if(c.evolutionSource!==snapshots){c.evolutionSource=snapshots;c.evolutionReport=lazyFeatures.evolution.buildEvolution(f,snapshots);}return c.evolutionReport||{days:[]};}
function cachedBiases(f,biasSource,today){const c=viewCache(f);if(!lazyFeatures.bias){void loadFeature('bias').then(()=>{if((state.route.name==='city'||state.route.name==='bias')&&state.forecasts[state.route.id]===f)render();});return c.biasReport||{};}if(c.biasSource!==biasSource||c.biasToday!==today){c.biasSource=biasSource;c.biasToday=today;c.biasReport=lazyFeatures.bias.computeBiases(biasSource,today);}return c.biasReport||{};}

function applyTheme(){
  let dark=state.settings.theme==='DARK'||(state.settings.theme==='SYSTEM'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light'; document.documentElement.dataset.density=state.settings.density==='COMPACT'?'compact':'comfortable'; document.documentElement.lang=languageCode(state.settings.language); syncDocumentMeta();
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
  const {t}=i18n();syncStorageErrors();
  let content=''; if(state.route.name==='home')content=renderHome(); else if(state.route.name==='settings')content=renderSettings(); else if(state.route.name==='data')content=renderLocalDataPage(); else if(state.route.name==='about')content=renderAbout(); else if(state.route.name==='bias'){if(!lazyFeatures.bias){void loadFeature('bias').then(()=>render());content=renderFeatureLoadingPage('bias');}else content=renderBiasDetailPage(state.route);} else if(state.route.name==='compare'){if(!lazyFeatures.comparison){void loadFeature('comparison').then(()=>{if(state.route.name==='compare')render();});content=renderFeatureLoadingPage('comparison');}else content=renderCityComparisonLazy(state.route);} else content=renderCityDetail(state.route.id);
  app.innerHTML=`${renderTopbar()}${renderPageBack()}${!state.online?`<div class="page"><div class="banner warn" role="status">📡 ${esc(t('offline'))}</div></div>`:''}${content}${renderModal()}`;
  enhanceCollapsibleCards(app);
  syncStickyOffsets();
  if(!stabilizeLocalScroll(scrollDirective))applyScrollDirective(scrollDirective);
  stabilizeRouteTop(scrollDirective);
  document.body?.classList?.toggle?.('modal-open',Boolean(state.modal));
  if(state.modal){queueMicrotask(()=>{const input=document.querySelector('#city-search');const dialog=document.querySelector('.modal');(input||dialog?.querySelector('button,input,a,[tabindex]:not([tabindex="-1"])'))?.focus?.({preventScroll:true});});}
}

function rerenderCitySection(sectionId){
  if(state.route.name!=='city'||typeof Element==='undefined')return false;
  const target=document.getElementById?.(sectionId);
  if(!(target instanceof Element))return false;
  const cityId=state.route.id,f=state.forecasts[cityId];if(!f)return false;
  ensureCityAnalysisLoaded(cityId);
  const today=cityToday(f.city.timezone),biasSource=state.bias[cityId]||{forecasts:[],observations:[]},biases=cachedBiases(f,biasSource,today);
  let html='';
  if(sectionId==='timeline')html=renderTimeline(f);
  else if(sectionId==='agreement')html=renderConfidenceSection(f,cityId);
  else if(sectionId==='evolution')html=renderEvolutionSection(cachedEvolution(f,state.evolution[cityId]||[]));
  else if(sectionId==='reliability')html=renderReliabilitySection(state.cities.find(c=>c.id===cityId),biases);
  else if(sectionId==='details')html=renderDetailedComparison(f,biases);
  else if(sectionId==='marine')html=renderMarineSection(state.cities.find(c=>c.id===cityId));
  else if(sectionId==='diagnostics')html=renderDataDiagnosticsSection(state.cities.find(c=>c.id===cityId),f);
  else return false;
  const directive=interactionScrollContext||captureScrollContext();
  target.outerHTML=html;
  enhanceCollapsibleCards(app);
  if(!stabilizeLocalScroll(directive))applyScrollDirective(directive);
  return true;
}
function rerenderTargetedComparisonPanel(){
  if(state.route.name!=='city'||typeof Element==='undefined')return false;
  const panel=document.querySelector?.('#details [data-target-compare]');
  if(!(panel instanceof Element))return false;
  const f=state.forecasts[state.route.id];if(!f)return false;
  const directive=interactionScrollContext||captureScrollContext(panel),tab=state.settings.detailTab||'CONDITIONS',mode=state.settings.detailViewMode||'DAILY';
  panel.outerHTML=renderTargetedModelComparison(f,tab,mode);
  if(!stabilizeLocalScroll(directive))applyScrollDirective(directive);
  return true;
}
function rerenderCitySectionOrPage(sectionId){if(!rerenderCitySection(sectionId))render();}

function renderFeatureLoadingPage(name){const {t}=i18n();return `<main class="page"><section class="section-card feature-loading"><div class="loader"></div><h2>${esc(t('loading'))}</h2><p>${esc(t(name==='bias'?'loadingBiasModule':'loadingFeatureModule'))}</p></section></main>`;}

function renderPageBack(){
  if(state.route.name==='home'||state.route.name==='city')return '';
  const {t}=i18n(),sticky=['data','settings','about'].includes(state.route.name);
  return `<div class="page-back-shell${sticky?' is-sticky':''}"><button class="page-back-button" data-action="back"><span class="detail-back-icon">${uiIcon('back',18)}</span><span>${esc(t('back'))}</span></button></div>`;
}
function renderTopbar(){
  const {t}=i18n();
  const isHome=state.route.name==='home',isCity=state.route.name==='city',isData=state.route.name==='data',isSettings=state.route.name==='settings',isAbout=state.route.name==='about',activeForecast=currentCityForecast(),health=activeForecast?forecastHealth(activeForecast):null,statusLabel=health?.label||(state.online?t('connectionActive'):t('offlineShort')),statusTitle=health?`${health.label} · ${health.detail}`:(state.online?t('connectionActive'):t('offlineLocalData'));
  const cityLinks=state.cities.length?state.cities.map(city=>{const forecast=state.forecasts[city.id],cityHealth=forecast?forecastHealth(forecast):null;return `<button class="quick-city-link" role="menuitem" data-action="quick-city" data-city-id="${attr(city.id)}"><span class="quick-city-status ${cityHealth?.class||'unknown'}" aria-hidden="true"></span><span class="quick-city-copy"><strong>${esc(city.name)}</strong><small>${esc(placeLine(city))}</small></span><span class="quick-city-arrow" aria-hidden="true">→</span></button>`;}).join(''):`<div class="quick-city-empty">${esc(t('emptyTitle'))}</div>`;
  const citiesNav=`<div class="nav-cities-menu"><button class="nav-btn ${isHome?'active':''}" data-action="home" ${isHome?'aria-current="page"':''} aria-haspopup="menu"><span class="nav-icon">${uiIcon('home')}</span><span>${esc(t('cities'))}</span></button><div class="nav-cities-popover" role="menu" aria-label="${esc(t('cities'))}"><div class="nav-cities-popover-head"><strong>${esc(t('cities'))}</strong><span>${state.cities.length}</span></div><div class="nav-cities-list">${cityLinks}</div><button class="quick-city-add" data-action="open-add-city"><span>${uiIcon('plus',15)}</span>${esc(t('addCity'))}</button></div></div>`;
  return `<header class="topbar"><div class="topbar-inner">
    <div class="brand" role="link" tabindex="0" data-action="home" aria-label="MeteoCompare — ${esc(t('cities'))}"><img class="logo" src="assets/icon.png" alt=""><div><div class="brand-title-row"><div class="brand-title">MeteoCompare</div><span class="brand-version" title="${esc(t('versionInfoLabel',{version:APP_VERSION,schema:DATA_SCHEMA_VERSION}))}">v${esc(APP_VERSION)}</span></div><div class="brand-subtitle">${esc(t('subtitle'))}</div></div></div>
    <nav class="topbar-nav" aria-label="${esc(t('navMain'))}">${citiesNav}<button class="nav-btn ${isData?'active':''}" data-action="local-data" ${isData?'aria-current="page"':''}><span class="nav-icon">${uiIcon('database')}</span><span>${esc(t('localDataNav'))}</span></button><button class="nav-btn ${isSettings?'active':''}" data-action="settings" ${isSettings?'aria-current="page"':''}><span class="nav-icon">${uiIcon('settings')}</span><span>${esc(t('settings'))}</span></button><button class="nav-btn ${isAbout?'active':''}" data-action="about" ${isAbout?'aria-current="page"':''}><span class="nav-icon">${uiIcon('info')}</span><span>${esc(t('about'))}</span></button><a class="nav-btn android-nav" href="https://play.google.com/store/apps/details?id=com.meteocompare.app" target="_blank" rel="noopener" aria-label="${esc(t('openAndroidApp'))}" title="${esc(t('openAndroidApp'))}"><span class="nav-icon">${uiIcon('download')}</span><span>Google Play</span></a><button class="nav-btn support-nav" data-action="donate"><span class="nav-icon">${uiIcon('heart')}</span><span>${esc(t('supportShort'))}</span></button></nav>
    <div class="topbar-spacer"></div><div class="topbar-system-status ${health?.class|| (state.online?'online':'offline')}" title="${esc(statusTitle)}"><span class="system-led" aria-hidden="true"></span><span>${esc(statusLabel)}</span></div>
  </div></header>`;
}

function collapseSectionKey(sectionId){return state.route.name==='city'?`city:${state.route.id}:${sectionId}`:`${state.route.name}:${sectionId}`;}
function sectionCollapsed(sectionId){return Boolean(state.settings.collapsedSections?.[collapseSectionKey(sectionId)]);}
function setSectionCollapsed(sectionId,collapsed){state.settings.collapsedSections={...(state.settings.collapsedSections||{}),[collapseSectionKey(sectionId)]:Boolean(collapsed)};persistSettings();}
function collapsibleCitySpecs(){return [
  ['timeline','.section-card','.section-head'],
  ['agreement','.section-card','.section-head'],
  ['evolution','.section-card','.section-head'],
  ['reliability','.section-card','.section-head'],
  ['details','.section-card','.section-head'],
  ['marine','.section-card','.section-head']
];}
function decorateCollapsibleCard(card,head,sectionId,t){
  if(!card||!head)return;
  card.classList.add('collapsible-card');
  const collapsed=sectionCollapsed(sectionId);card.dataset.collapsed=String(collapsed);
  let btn=head.querySelector?.('[data-collapse-section]');
  if(!btn){btn=document.createElement('button');btn.type='button';btn.className='collapse-card-btn';btn.dataset.collapseSection=sectionId;head.append(btn);}
  btn.setAttribute('aria-expanded',String(!collapsed));btn.setAttribute('aria-label',collapsed?t('expandSection'):t('collapseSection'));btn.title=collapsed?t('expandSection'):t('collapseSection');btn.innerHTML='<span aria-hidden="true">⌃</span>';
}
function enhanceCollapsibleCards(root=document){
  const {t}=i18n();
  if(state.route.name==='city'){
    for(const [sectionId,cardSelector,headSelector] of collapsibleCitySpecs()){
      const section=root.querySelector?.(`#${sectionId}`);if(!section)continue;
      const card=section.matches?.(cardSelector)?section:section.querySelector?.(cardSelector);if(!card)continue;
      decorateCollapsibleCard(card,card.querySelector?.(headSelector),sectionId,t);
    }
    return;
  }
}

function pwaInstallGuidance(){
  const ua=navigator.userAgent||'',ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),firefoxMatch=ua.match(/Firefox\/(\d+)/i),firefox=Boolean(firefoxMatch),firefoxVersion=firefoxMatch?Number(firefoxMatch[1]):0,windows=/Windows/i.test(ua),android=/Android/i.test(ua);
  if(pwaInstalled)return {kind:'installed',text:i18n().t('pwaInstalled')};
  if(deferredInstallPrompt)return {kind:'ready',text:i18n().t('pwaInstallReady')};
  if(ios)return {kind:'manual',text:i18n().t('pwaInstallIos')};
  if(firefox&&!android&&windows&&firefoxVersion>=143)return {kind:'manual',text:i18n().t('pwaInstallFirefoxWindows')};
  if(firefox&&!android)return {kind:'manual',text:i18n().t('pwaInstallFirefoxDesktop')};
  return {kind:'manual',text:i18n().t('pwaInstallBrowser')};
}
function renderAbout(){
  const {t}=i18n(),install=pwaInstallGuidance();
  const steps=[[t('aboutStepModelsTitle'),t('aboutStepModelsBody')],[t('aboutStepCompareTitle'),t('aboutStepCompareBody')],[t('aboutStepReadTitle'),t('aboutStepReadBody')]];
  return `<main class="page about-page about-page-simple">
    <section class="about-hero about-hero-simple"><div><h1>${esc(t('aboutTitle'))}</h1><p>${esc(t('aboutLead'))}</p><div class="about-hero-badges"><span>${esc(t('aboutBadgeMultiModel'))}</span><span>${esc(t('aboutBadgeTransparent'))}</span><span>${esc(t('aboutBadgeLocalFirst'))}</span></div></div><img src="assets/icon.png" alt="" class="about-app-icon"></section>
    <section class="section-card about-method"><div class="section-head"><div><h2>${esc(t('aboutMethodTitle'))}</h2><p>${esc(t('aboutMethodLead'))}</p></div></div><div class="about-method-flow">${steps.map(([title,body],i)=>`<article><span class="about-step-index">${i+1}</span><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></article>`).join('')}</div></section>
    <section class="section-card about-reading"><div class="section-head"><div><h2>${esc(t('aboutIndicatorsTitle'))}</h2><p>${esc(t('aboutAgreementBody'))}</p></div></div><div class="about-reading-grid"><article><span class="about-reading-icon">↔</span><div><h3>${esc(t('aboutConvergenceTitle'))}</h3><p>${esc(t('aboutConvergenceBody'))}</p></div></article><article><span class="about-reading-icon">✓</span><div><h3>${esc(t('aboutHistoryTitle'))}</h3><p>${esc(t('aboutHistoryBody'))}</p></div></article><article><span class="about-reading-icon">≡</span><div><h3>${esc(t('aboutRawTitle'))}</h3><p>${esc(t('aboutRawBody'))}</p></div></article></div><div class="about-callout">${esc(t('aboutAgreementCallout'))}</div></section>
    <div class="about-layout about-layout-simple"><section class="section-card about-principle-card"><div class="about-section-head"><div><h2>${esc(t('aboutDataTitle'))}</h2><p>${esc(t('aboutDataBody'))}</p></div><span class="about-mini-badge">Open-Meteo</span></div><div class="about-callout">${esc(t('aboutLocalCallout'))}</div></section><section class="section-card about-principle-card"><div class="about-section-head"><div><h2>${esc(t('aboutMarineTitle'))}</h2><p>${esc(t('aboutMarineBody'))}</p></div><span class="about-mini-badge">Marine</span></div><div class="about-callout warning">${esc(t('marineDisclaimer'))}</div></section></div>
    <section class="section-card about-install"><div class="section-head about-install-head"><div><h2>${esc(t('aboutInstallTitle'))}</h2><p>${esc(t('aboutInstallBody'))}</p></div><span class="about-version" title="${esc(t('versionInfoLabel',{version:APP_VERSION,schema:DATA_SCHEMA_VERSION}))}">${esc(t('versionInfoLabel',{version:APP_VERSION,schema:DATA_SCHEMA_VERSION}))}</span></div><div class="about-install-grid"><article><div><span class="pwa-badge">PWA</span><h3>${esc(t('pwaTitle'))}</h3><p>${esc(t('pwaBody'))}</p></div><div class="install-status ${install.kind}">${uiIcon(install.kind==='ready'?'download':'info',18)}<span>${esc(install.text)}</span></div>${install.kind==='ready'?`<button class="btn primary" data-action="install-pwa"><span class="btn-icon">${uiIcon('download')}</span>${esc(t('installPwa'))}</button>`:''}</article><article><div><span class="android-badge">Android</span><h3>${esc(t('androidTitle'))}</h3><p>${esc(t('androidBody'))}</p></div><a class="btn tonal" href="https://play.google.com/store/apps/details?id=com.meteocompare.app" target="_blank" rel="noopener"><span class="btn-icon">${uiIcon('external')}</span>${esc(t('openAndroidApp'))}</a></article></div></section>
  </main>`;
}

function homeConsensusWeights(cityId){
  const profile=localConsensusWeights(cityId);
  return state.settings.localWeightedConsensus&&profile.ready?profile.maps:null;
}
function homeTimelinePoints(f,weights,maxPoints=5){
  return selectRegularTimelinePoints(buildTimelinePoints(f,'HOURLY',new Date(),{weightsByVariable:weights||{}}),maxPoints,3);
}
function homeAgreementText(percent,familyCount){
  const {t}=i18n();
  if(!Number.isFinite(percent))return familyCount<2?t('homeAgreementUnavailable'):t('homeAgreementPending');
  if(percent>=80)return t('homeAgreementHigh');
  if(percent>=60)return t('homeAgreementGood');
  return t('homeAgreementLow');
}
function homeCoherenceText(percent,familyCount){
  const {t}=i18n();
  if(!Number.isFinite(percent))return familyCount<2?t('homeCoherenceUnavailable'):t('homeCoherencePending');
  if(percent>=80)return t('homeCoherenceHigh');
  if(percent>=60)return t('homeCoherenceMedium');
  return t('homeCoherenceLow');
}
function homeTemperatureHeatColor(temp){
  const stops=[[-15,[91,111,249]],[-2,[63,142,232]],[8,[53,184,200]],[16,[95,198,141]],[22,[230,195,79]],[28,[243,154,69]],[34,[235,102,93]],[42,[201,74,131]]];
  if(!Number.isFinite(temp))return 'rgb(148 163 184)';
  if(temp<=stops[0][0])return `rgb(${stops[0][1].join(' ')})`;
  if(temp>=stops.at(-1)[0])return `rgb(${stops.at(-1)[1].join(' ')})`;
  for(let i=1;i<stops.length;i++){
    if(temp>stops[i][0])continue;
    const [a,av]=stops[i-1],[b,bv]=stops[i],n=(temp-a)/(b-a),rgb=av.map((v,j)=>Math.round(v+(bv[j]-v)*n));
    return `rgb(${rgb.join(' ')})`;
  }
  return 'rgb(148 163 184)';
}
function renderHomeMiniTimeline(points){
  const {t}=i18n();
  if(!points.length)return '';
  return `<div class="home-mini-timeline-wrap"><div class="home-mini-timeline" aria-label="${esc(t('homeMiniTimelineAria'))}">${points.map(point=>{
    const prob=point.precipitationPercent,amount=point.precipitationConditionalMm,temp=point.temperatureC,heat=homeTemperatureHeatColor(temp);
    return `<div class="home-mini-hour ${Number.isFinite(prob)&&prob>=30?'wet':''}" style="--heat-color:${heat}" title="${attr(`${timeLabel(point.timestamp)} · ${Number.isFinite(temp)?`${fmt(temp,1)} °C`:'—'}${Number.isFinite(prob)?` · ${Math.round(prob)} %`:''}${Number.isFinite(amount)&&amount>=.1?` · ${fmt(amount,1)} mm`:''}`)}"><span class="home-mini-time">${esc(timeLabel(point.timestamp))}</span><strong>${Number.isFinite(temp)?`${fmt(temp)}°`:'—'}</strong><span class="home-mini-rain">${Number.isFinite(prob)&&prob>=20?`☂ ${Math.round(prob)}%`:'·'}</span><small>${Number.isFinite(amount)&&amount>=.1?`${fmt(amount,1)} mm`:'—'}</small></div>`;
  }).join('')}</div><div class="home-heat-key" aria-label="${esc(t('homeHeatScaleHint'))}" title="${attr(t('homeHeatScaleHint'))}"><span>−10°</span><i></i><span>40°+</span></div></div>`;
}
function homeWatchCandidate(city,f,weights){
  const {t}=i18n(),points=homeTimelinePoints(f,weights,8).slice(0,8);if(!points.length)return null;
  const candidates=[];
  const low=points.filter(p=>Number.isFinite(p.convergencePercent)).sort((a,b)=>a.convergencePercent-b.convergencePercent)[0];
  if(low&&low.convergencePercent<50)candidates.push({score:110-low.convergencePercent,tone:'warning',icon:'⚠',city,body:t('homeWatchDivergence',{time:timeLabel(low.timestamp),percent:Math.round(low.convergencePercent)})});
  const rain=points.filter(p=>Number.isFinite(p.precipitationPercent)&&p.precipitationPercent>=60).sort((a,b)=>(b.precipitationPercent||0)-(a.precipitationPercent||0))[0];
  if(rain){const amount=Number.isFinite(rain.precipitationConditionalMm)?` · ${t('homeWatchRainAmount',{amount:fmt(rain.precipitationConditionalMm,1)})}`:'';candidates.push({score:78+(rain.precipitationPercent||0)/10,tone:'rain',icon:'🌧️',city,body:`${t('homeWatchRain',{time:timeLabel(rain.timestamp),percent:Math.round(rain.precipitationPercent)})}${amount}`});}
  const windy=points.filter(p=>Number.isFinite(p.windGustKmh)&&p.windGustKmh>=60||Number.isFinite(p.windKmh)&&p.windKmh>=40).sort((a,b)=>Math.max(b.windGustKmh||0,b.windKmh||0)-Math.max(a.windGustKmh||0,a.windKmh||0))[0];
  if(windy)candidates.push({score:72+Math.max(windy.windGustKmh||0,windy.windKmh||0)/10,tone:'wind',icon:'💨',city,body:t('homeWatchWind',{time:timeLabel(windy.timestamp),value:fmt(windy.windGustKmh||windy.windKmh)})});
  const first=points.find(p=>Number.isFinite(p.temperatureC));if(first){let shift=null;for(const p of points){if(!Number.isFinite(p.temperatureC))continue;const delta=p.temperatureC-first.temperatureC;if(!shift||Math.abs(delta)>Math.abs(shift.delta))shift={delta,p};}if(shift&&Math.abs(shift.delta)>=5)candidates.push({score:58+Math.abs(shift.delta),tone:'temperature',icon:'🌡️',city,body:t(shift.delta>0?'homeWatchTempUp':'homeWatchTempDown',{time:timeLabel(shift.p.timestamp),value:fmt(Math.abs(shift.delta))})});}
  return candidates.sort((a,b)=>b.score-a.score)[0]||null;
}
function renderHomeWatchlist(){
  const {t}=i18n(),items=state.cities.map(city=>{const f=state.forecasts[city.id];return f?homeWatchCandidate(city,f,homeConsensusWeights(city.id)):null;}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,4);
  return `<aside class="home-watch-section" aria-label="${esc(t('homeWatchTitle'))}"><p class="home-watch-lead">${esc(t('homeWatchLead'))}</p>${items.length?`<div class="home-watch-grid">${items.map(item=>`<button class="home-watch-item ${item.tone}" data-action="open-watch-city" data-city-id="${attr(item.city.id)}"><span class="home-watch-icon">${item.icon}</span><span><strong>${esc(item.city.name)}</strong><small>${esc(item.body)}</small></span><span class="home-watch-arrow">→</span></button>`).join('')}</div>`:`<div class="home-watch-clear"><span>✓</span><div><strong>${esc(t('homeWatchClearTitle'))}</strong><p>${esc(t('homeWatchClearBody'))}</p></div></div>`}</aside>`;
}
function renderHome(){
  const {t}=i18n(),cards=state.cities.map(renderCityCard).join(''),busy=state.loading.size,hasCities=state.cities.length>0;
  const heroActions=`<div class="home-hero-actions"><button class="btn primary" data-action="open-add-city"><span class="btn-icon">${uiIcon('plus')}</span>${esc(t('addCity'))}</button>${state.cities.length>=2?`<button class="btn tonal" data-action="open-city-compare">${esc(t('compareCities'))}</button>`:''}<button class="btn tonal" data-action="refresh-all" ${busy?'disabled':''}><span class="btn-icon ${busy?'spinning':''}">${uiIcon('refresh')}</span>${esc(t('refresh'))}</button></div>`;
  const columnHeading=(kicker,title)=>`<div class="home-section-heading home-column-heading"><div><span class="home-section-kicker">${esc(kicker)}</span><h2>${esc(title)}</h2></div></div>`;
  return `<main class="page home-page"><section class="home-hero"><div class="home-hero-copy"><span class="home-hero-kicker">${esc(t('homeModernKicker'))}</span><h1>${esc(t('homeModernTitle'))}</h1><p>${esc(t('homeModernLead'))}</p>${heroActions}</div><div class="home-hero-search-panel"><button class="home-search-trigger" data-action="open-add-city"><span class="home-search-icon">⌕</span><span>${esc(t('homeSearchPrompt'))}</span><kbd>+</kbd></button></div></section>${hasCities?`<div class="home-dashboard"><section class="home-cities-section">${columnHeading(t('homeFavoritesKicker'),t('cities'))}<div class="home-city-grid" aria-label="${esc(t('cities'))}">${cards}</div></section><div class="home-watch-column">${columnHeading(t('homeWatchKicker'),t('homeWatchTitle'))}${renderHomeWatchlist()}</div></div>`:`<section class="empty-state home-empty"><div class="big">🌦️</div><h2>${esc(t('emptyTitle'))}</h2><p>${esc(t('emptyBody'))}</p><button class="btn primary" data-action="open-add-city">＋ ${esc(t('addCity'))}</button></section>`}</main>`;
}

function renderCityCard(city){
  const {t}=i18n(),f=state.forecasts[city.id],loading=state.loading.has(city.id),err=state.errors[city.id];
  if(!f&&loading)return `<article class="home-city-card skeleton" aria-label="${esc(t('loading'))}"></article>`;
  if(!f)return `<article class="home-city-card home-city-card-empty" role="link" tabindex="0" data-city-open="${attr(city.id)}"><div class="home-city-head"><div><h2>${esc(city.name)}</h2><p>${esc(placeLine(city))}</p></div></div><div class="banner ${err?'error':'info'}">${err?esc(err):esc(t('noCache'))}</div><button class="btn tonal" data-refresh-city="${attr(city.id)}">↻ ${esc(t('refresh'))}</button></article>`;
  const consensusWeights=homeConsensusWeights(city.id),now=currentConditions(f,new Date(),{weightsByVariable:consensusWeights||{}}),today=cityToday(f.city.timezone),day=cachedAggregateDay(f,today,consensusWeights),info=localizedConditionInfo(now.condition||day.condition),conf=day.confidence?.overallPercent,minT=day.tempMin,maxT=day.tempMax,precipProb=day.precipProbability,precipAmount=day.precipConditional,wind=Number.isFinite(now.wind)?now.wind:day.wind,points=homeTimelinePoints(f,consensusWeights,5),modelCount=Object.keys(f.seriesByModel).length,familyCount=Math.max(day.consensusFamilyCount||0,day.confidence?.tempMax?.familyCount||0,day.confidence?.windMax?.familyCount||0,day.confidence?.precipitation?.familyCount||0),health=forecastHealth(f);
  return `<article class="home-city-card" role="link" tabindex="0" data-city-open="${attr(city.id)}" style="--weather-accent:${info.accent}"><div class="home-city-accent"></div><div class="home-city-head"><div><h2>${esc(city.name)}</h2><p>${esc(placeLine(city))}</p></div><button class="icon-btn" data-city-menu="${attr(city.id)}" aria-label="${esc(t('options'))}">⋮</button></div><div class="home-weather-primary"><div class="home-weather-icon">${conditionMarkup(now.condition||day.condition,'normal',now.condition?Boolean(now.conditionInferred):Boolean(day.conditionInferred))}</div><div class="home-weather-value"><strong>${Number.isFinite(now.temperature)?`${fmt(now.temperature,1)}°`:'—'}</strong><span>${esc(info.label)}</span></div><div class="home-weather-coherence ${Number.isFinite(conf)?confidenceClass(conf):'neutral'}" title="${attr(homeAgreementText(conf,familyCount))}"><span>${esc(t('homeCoherenceLabel'))}</span><strong>${Number.isFinite(conf)?`${Math.round(conf)}%`:'—'}</strong><small>${esc(homeCoherenceText(conf,familyCount))}</small></div></div><div class="home-weather-facts"><div><span>${esc(t('tempMinMax'))}</span><strong>${Number.isFinite(minT)&&Number.isFinite(maxT)?`${fmt(minT)}° / ${fmt(maxT)}°`:'—'}</strong></div><div><span>${esc(t('precipitation'))}</span><strong>${Number.isFinite(precipProb)?`${Math.round(precipProb)} %`:'—'}</strong><small>${Number.isFinite(precipAmount)&&precipAmount>=.1?`${fmt(precipAmount,1)} mm ${esc(t('homeIfRainShort'))}`:esc(t('homeDryOrLowRain'))}</small></div><div><span>${esc(t('wind'))}</span><strong>${Number.isFinite(wind)?`${fmt(wind)} km/h`:'—'}</strong><small>${Number.isFinite(day.gust)?`${esc(t('gusts'))} ${fmt(day.gust)} km/h`:esc(t('homeNoGustData'))}</small></div></div>${renderHomeMiniTimeline(points)}<div class="home-city-footer"><span>${modelCountLabel(modelCount)}</span><span class="cache-inline ${health.class}">${esc(health.label)} · ${esc(formatExactAge(f.fetchedAt))}${loading?' · ⟳':''}</span></div>${err?`<div class="banner error home-city-error">${esc(err)}</div>`:''}</article>`;
}

function renderHeatmap(heat){
  const {t}=i18n(),temps=heat.map(x=>x.temp).filter(Number.isFinite),lo=temps.length?Math.min(...temps):0,hi=temps.length?Math.max(...temps):1,span=Math.max(.1,hi-lo);
  return `<div class="heatmap-strip" aria-label="${esc(t('tempForecast12Aria'))}">${heat.map(x=>{const n=Number.isFinite(x.temp)?(x.temp-lo)/span:.5,hue=Math.round(210-(210*n)),bg=`hsl(${hue} 65% ${document.documentElement.dataset.theme==='dark'?30:80}%)`;return `<div class="heat-cell" style="background:${bg}" title="${attr(timeLabel(x.timestamp))} · ${Number.isFinite(x.temp)?fmt(x.temp,1)+'°C':'—'}${Number.isFinite(x.precipProbability)?' · '+t('rainProbabilityShort',{value:x.precipProbability}):''}"><span class="heat-temp">${Number.isFinite(x.temp)?Math.round(x.temp)+'°':''}</span>${x.precipProbability>=30?'<span class="rain-dot"></span>':''}</div>`;}).join('')}</div>`;
}


function niceStep(raw){
  if(!Number.isFinite(raw)||raw<=0)return 1;
  const power=Math.pow(10,Math.floor(Math.log10(raw))),fraction=raw/power;
  const nice=fraction<=1?1:fraction<=2?2:fraction<=5?5:10;
  return nice*power;
}
function chartScale(values,{includeZero=false,agreement=false,ticks=5,minSpan=.5,padding=.08}={}){
  const nums=values.filter(Number.isFinite);if(!nums.length)return {min:0,max:1,ticks:[0,1]};
  if(agreement)return {min:0,max:100,ticks:[0,25,50,75,100]};
  let rawMin=Math.min(...nums),rawMax=Math.max(...nums);if(includeZero){rawMin=Math.min(0,rawMin);rawMax=Math.max(0,rawMax);}
  if(rawMax-rawMin<minSpan){const mid=(rawMin+rawMax)/2;rawMin=mid-minSpan/2;rawMax=mid+minSpan/2;}
  const padded=(rawMax-rawMin)*padding;rawMin-=padded;rawMax+=padded;
  const step=niceStep((rawMax-rawMin)/Math.max(2,ticks-1));let min=Math.floor(rawMin/step)*step,max=Math.ceil(rawMax/step)*step;
  if(includeZero){min=Math.min(0,min);max=Math.max(0,max);}const out=[];for(let v=min,guard=0;v<=max+step*.25&&guard<12;v+=step,guard++)out.push(Math.abs(v)<step/1000?0:v);
  return {min,max,ticks:out};
}
function chartTickIndices(length,maxTicks=7){
  if(length<=1)return [0];const step=Math.max(1,Math.ceil((length-1)/(maxTicks-1))),out=[];for(let i=0;i<length;i+=step)out.push(i);if(out[out.length-1]!==length-1)out.push(length-1);return out;
}
function chartMetricUnit(metric){return metric==='TEMPERATURE'?'°C':metric==='PRECIPITATION'?'mm':metric==='AGREEMENT'?'%':'km/h';}
function chartMetricDigits(metric){return metric==='PRECIPITATION'?1:0;}
function chartPointTitle(label,key,value,unit){return `${label} · ${key} · ${fmt(value,unit==='mm'?1:0)} ${unit}`;}
function svgLinePath(points){let drawing=false;return (points||[]).map(p=>{if(!p){drawing=false;return '';}const cmd=drawing?'L':'M';drawing=true;return `${cmd} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`;}).filter(Boolean).join(' ');}

function comparisonRenderContext(){const {t,locale}=i18n(),comparisonAggregateDay=(f,date)=>{const cityId=f?.city?.id,profile=cityId?localConsensusWeights(cityId):null,weights=state.settings.localWeightedConsensus&&profile?.ready?profile.maps:null;return cachedAggregateDay(f,date,weights);};return {t,locale,state,esc,attr,fmt,dateLabel,timeLabel,cachedAggregateDay:comparisonAggregateDay,visibleModelIds,selectedModelIds:state.compareModelIds,targetCompareOpen:state.route.name==='city'?state.comparePanelOpen[state.route.id]:undefined};}
function renderCityComparisonLazy(route){return lazyFeatures.comparison?.renderCityComparison(route,comparisonRenderContext())||renderFeatureLoadingPage('comparison');}

function marineChartWindow(data,hours=48){
  const ts=data?.hourly?.timestamps||[],epochs=Array.isArray(data?.hourly?.timestampEpochMs)&&data.hourly.timestampEpochMs.length===ts.length?data.hourly.timestampEpochMs:zonedTimestampEpochs(ts,data?.timezone||'UTC'),now=Date.now();let start=epochs.findIndex(x=>Number.isFinite(x)&&x>=now-3600e3);if(start<0)start=0;return {start,ts:ts.slice(start,start+hours)};
}
function marineChartDateTick(timestamp){
  const [year,month,day]=String(timestamp||'').slice(0,10).split('-').map(Number);if(!year||!month||!day)return '';
  try{return new Intl.DateTimeFormat(i18n().locale,{weekday:'short',day:'numeric'}).format(new Date(Date.UTC(year,month-1,day,12)));}catch{return String(timestamp||'').slice(5,10);}
}
function marineSparkline(data){
  const allTs=data?.hourly?.timestamps||[],allValues=data?.hourly?.waveHeight||[],window=marineChartWindow(data,48),ts=window.ts,values=allValues.slice(window.start,window.start+ts.length),finite=values.filter(Number.isFinite);if(finite.length<2)return `<div class="empty-state compact marine-chart-empty">${esc(i18n().t('marineChartUnavailable'))}</div>`;
  const w=960,h=240,pad={l:56,r:26,t:24,b:52},min=0,max=Math.max(1,...finite)*1.12,x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(1,values.length-1),y=v=>h-pad.b-(v-min)*(h-pad.t-pad.b)/(max-min),pts=values.map((v,i)=>Number.isFinite(v)?[x(i),y(v)]:null),path=svgLinePath(pts),finitePts=pts.filter(Boolean),area=path&&finitePts.length===pts.length?`${path} L ${finitePts.at(-1)[0].toFixed(2)} ${h-pad.b} L ${finitePts[0][0].toFixed(2)} ${h-pad.b} Z`:'';
  const yTickValues=Array.from({length:5},(_,i)=>min+(max-min)*i/4),yTicks=yTickValues.map(v=>`<line x1="${pad.l}" y1="${y(v)}" x2="${w-pad.r}" y2="${y(v)}" class="marine-grid"/><text x="${pad.l-10}" y="${y(v)+4}" text-anchor="end" class="marine-axis">${fmt(v,1)} m</text>`).join('');
  const tickIdx=chartTickIndices(ts.length,7),xTicks=tickIdx.map(i=>`<line x1="${x(i)}" y1="${pad.t}" x2="${x(i)}" y2="${h-pad.b}" class="marine-grid vertical"/><text x="${x(i)}" y="${h-27}" text-anchor="middle" class="marine-axis">${esc(timeLabel(ts[i]))}</text><text x="${x(i)}" y="${h-12}" text-anchor="middle" class="marine-axis secondary">${esc(marineChartDateTick(ts[i]))}</text>`).join('');
  return `<div class="marine-chart-block marine-chart-integrated"><svg class="marine-chart wave-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(i18n().t('marineWaveHeight'))}" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="marineWaveFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" class="marine-wave-fill-start"/><stop offset="100%" class="marine-wave-fill-end"/></linearGradient></defs><rect x="${pad.l}" y="${pad.t}" width="${w-pad.l-pad.r}" height="${h-pad.t-pad.b}" rx="10" class="marine-plot-bg"/>${yTicks}${xTicks}${area?`<path d="${area}" class="marine-wave-area"/>`:''}<path d="${path}" class="marine-wave-line"/></svg></div>`;
}
function marineTideChart(data,events=[]){
  const allTs=data?.hourly?.timestamps||[],allVals=data?.hourly?.seaLevelHeightMsl||[],allEpochs=Array.isArray(data?.hourly?.timestampEpochMs)&&data.hourly.timestampEpochMs.length===allTs.length?data.hourly.timestampEpochMs:zonedTimestampEpochs(allTs,data?.timezone||'UTC'),window=marineChartWindow(data,72),ts=window.ts,vals=allVals.slice(window.start,window.start+ts.length),finite=vals.filter(Number.isFinite);if(finite.length<3)return `<div class="empty-state compact marine-chart-empty">${esc(i18n().t('marineTideUnavailable'))}</div>`;
  const w=960,h=360,pad={l:58,r:26,t:30,b:50},rawMin=Math.min(...finite),rawMax=Math.max(...finite),rawSpan=Math.max(.05,rawMax-rawMin),min=rawMin-rawSpan*.12,max=rawMax+rawSpan*.12,span=max-min,x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(1,vals.length-1),y=v=>pad.t+(max-v)*(h-pad.t-pad.b)/span,points=vals.map((v,i)=>Number.isFinite(v)?[x(i),y(v)]:null),path=svgLinePath(points),finitePoints=points.filter(Boolean),area=path&&finitePoints.length===points.length?`${path} L ${finitePoints.at(-1)[0].toFixed(2)} ${h-pad.b} L ${finitePoints[0][0].toFixed(2)} ${h-pad.b} Z`:'';
  const mean=finite.reduce((a,b)=>a+b,0)/finite.length,yTicks=Array.from({length:6},(_,i)=>min+(max-min)*i/5),grid=yTicks.map(v=>`<line x1="${pad.l}" y1="${y(v)}" x2="${w-pad.r}" y2="${y(v)}" class="marine-grid"/><text x="${pad.l-10}" y="${y(v)+4}" text-anchor="end" class="marine-axis">${fmt(v,2)} m</text>`).join('');
  const xIdx=chartTickIndices(ts.length,7),xGrid=xIdx.map(i=>`<line x1="${x(i)}" y1="${pad.t}" x2="${x(i)}" y2="${h-pad.b}" class="marine-grid vertical"/><text x="${x(i)}" y="${h-23}" text-anchor="middle" class="marine-axis">${esc(timeLabel(ts[i]))}</text><text x="${x(i)}" y="${h-10}" text-anchor="middle" class="marine-axis secondary">${esc(marineChartDateTick(ts[i]))}</text>`).join('');
  const eventMarks=events.map(e=>{let absoluteIndex=Number.isFinite(e.epochMs)?allEpochs.findIndex(ms=>ms===e.epochMs):allTs.indexOf(e.timestamp);if(absoluteIndex<0&&Number.isFinite(e.epochMs)){let best=-1,delta=Infinity;allEpochs.forEach((ms,j)=>{const d=Math.abs(ms-e.epochMs);if(Number.isFinite(d)&&d<delta){delta=d;best=j;}});absoluteIndex=best;}const i=absoluteIndex-window.start;if(i<0||i>=vals.length||!Number.isFinite(e.value))return '';const cls=e.type==='HIGH'?'high':'low',label=e.type==='HIGH'?i18n().t('marineHighShort'):i18n().t('marineLowShort');return `<g class="tide-marker ${cls}"><circle cx="${x(i)}" cy="${y(e.value)}" r="5"/><text x="${x(i)}" y="${y(e.value)+(e.type==='HIGH'?-10:18)}" text-anchor="middle">${esc(label)} · ${fmt(e.value,2)} m</text></g>`;}).join('');
  const zeroY=y(0),zeroLine=zeroY>=pad.t&&zeroY<=h-pad.b?`<line x1="${pad.l}" y1="${zeroY}" x2="${w-pad.r}" y2="${zeroY}" class="chart-zero-line"/>`:'';
  return `<div class="marine-chart-block tide-chart-block marine-chart-integrated"><svg class="marine-chart tide-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${attr(i18n().t('marineTideChartAria'))}" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="marineTideFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" class="marine-tide-fill-start"/><stop offset="100%" class="marine-tide-fill-end"/></linearGradient></defs><rect x="${pad.l}" y="${pad.t}" width="${w-pad.l-pad.r}" height="${h-pad.t-pad.b}" rx="10" class="marine-plot-bg"/>${grid}${xGrid}${zeroLine}<line x1="${pad.l}" y1="${y(mean)}" x2="${w-pad.r}" y2="${y(mean)}" class="marine-mean-line"/><text x="${w-pad.r-5}" y="${y(mean)-6}" text-anchor="end" class="marine-axis mean-label">${esc(i18n().t('marineMeanLevel'))} ${fmt(mean,2)} m</text>${area?`<path d="${area}" class="marine-tide-area"/>`:''}<path d="${path}" class="marine-tide-line"/>${eventMarks}</svg><div class="tide-chart-legend"><span><i class="line"></i>${esc(i18n().t('marineSeaLevel'))}</span><span><i class="dot high"></i>${esc(i18n().t('marineHighWater'))}</span><span><i class="dot low"></i>${esc(i18n().t('marineLowWater'))}</span><span><i class="dash"></i>${esc(i18n().t('marineMeanLevel'))}</span></div></div>`;
}
function renderMarineSection(city){
  if(!city?.marineEnabled)return '';
  const {t}=i18n(),data=ensureMarineLoaded(city.id),loading=state.marineLoading.has(city.id);
  if(!lazyFeatures.marine){void loadFeature('marine').then(()=>rerenderCitySectionOrPage('marine'));return `<section class="section section-card marine-section" id="marine"><div class="section-head"><div><h2>${esc(t('marineTitle'))}</h2><p>${esc(t('marineIntro'))}</p></div></div><div class="loader"></div></section>`;}
  if(!data&&!loading&&state.online)queueMicrotask(()=>refreshMarineData(city.id,false,false));
  if(!data)return `<section class="section section-card marine-section" id="marine"><div class="section-head"><div><h2>${esc(t('marineTitle'))}</h2><p>${esc(t('marineIntro'))}</p></div></div>${loading?'<div class="loader"></div>':`<div class="empty-state compact">${esc(t('marineUnavailable'))}</div>`}</section>`;
  const idx=lazyFeatures.marine.nearestMarineIndex(data),h=data.hourly||{},value=(a,d=1)=>idx>=0&&Number.isFinite(a?.[idx])?fmt(a[idx],d):'—',direction=idx>=0&&Number.isFinite(h.waveDirection?.[idx])?`${Math.round(h.waveDirection[idx])}° ${localizedWindDirection(h.waveDirection[idx])}`:'—',tideEvents=lazyFeatures.marine.detectTideEvents(data,{hours:72}).slice(0,6),tideRange=lazyFeatures.marine.tideRangeNext24h(data),currentLevel=idx>=0&&Number.isFinite(h.seaLevelHeightMsl?.[idx])?h.seaLevelHeightMsl[idx]:null,nextLevel=idx>=0&&Number.isFinite(h.seaLevelHeightMsl?.[idx+1])?h.seaLevelHeightMsl[idx+1]:null,tideTrend=Number.isFinite(currentLevel)&&Number.isFinite(nextLevel)?(nextLevel-currentLevel>.015?'rising':currentLevel-nextLevel>.015?'falling':'steady'):'unknown';
  const days=(data.daily?.dates||[]).slice(0,7).map((date,i)=>{const wave=Number.isFinite(data.daily.waveHeightMax?.[i])?fmt(data.daily.waveHeightMax[i],1)+' m':'—',period=Number.isFinite(data.daily.wavePeriodMax?.[i])?fmt(data.daily.wavePeriodMax[i],1)+' s':'—',dir=Number.isFinite(data.daily.waveDirectionDominant?.[i])?`${Math.round(data.daily.waveDirectionDominant[i])}° ${localizedWindDirection(data.daily.waveDirectionDominant[i])}`:'—',swell=Number.isFinite(data.daily.swellHeightMax?.[i])?fmt(data.daily.swellHeightMax[i],1)+' m':'—';return `<div class="marine-day"><strong class="marine-day-date">${esc(dateLabel(date,i18n().locale))}</strong><div class="marine-day-wave"><span>${esc(t('marineWaveHeight'))}</span><strong>${wave}</strong></div><div class="marine-day-meta"><span title="${attr(t('marineWavePeriod'))}">${period}</span><span title="${attr(t('marineSwellHeight'))}">${swell}</span></div><div class="marine-day-direction">${esc(dir)}</div></div>`;}).join('');
  const tideRows=tideEvents.slice(0,4).map(e=>`<div class="marine-tide-row ${e.type.toLowerCase()}"><span class="marine-tide-row-mark">${e.type==='HIGH'?'↥':'↧'}</span><div><strong>${esc(t(e.type==='HIGH'?'marineHighWater':'marineLowWater'))}</strong><small>${esc(dateLabel(e.timestamp.slice(0,10),i18n().locale))} · ${esc(timeLabel(e.timestamp))}</small></div><b>${fmt(e.value,2)} m</b></div>`).join('');
  const trendKey=tideTrend==='rising'?'marineTrendRising':tideTrend==='falling'?'marineTrendFalling':tideTrend==='steady'?'marineTrendSteady':'unavailable';
  return `<section class="section section-card marine-section" id="marine"><div class="section-head marine-section-head"><div><h2>${esc(t('marineTitle'))}</h2><p>${esc(t('marineDistance',{distance:fmt(data.grid?.distanceKm,1)}))}</p></div></div><div class="marine-kpis"><div class="marine-kpi"><span>${esc(t('marineWaveHeight'))}</span><strong>${value(h.waveHeight)} m</strong></div><div class="marine-kpi"><span>${esc(t('marineWavePeriod'))}</span><strong>${value(h.wavePeriod)} s</strong></div><div class="marine-kpi"><span>${esc(t('marineWaveDirection'))}</span><strong>${esc(direction)}</strong></div><div class="marine-kpi"><span>${esc(t('marineSwellHeight'))}</span><strong>${value(h.swellHeight)} m</strong></div><div class="marine-kpi"><span>${esc(t('marineSeaTemp'))}</span><strong>${value(h.seaSurfaceTemperature)} °C</strong></div></div><div class="marine-dashboard"><article class="marine-surface marine-sea-surface"><div class="marine-surface-head"><div><h3>${esc(t('marineWaveEvolution'))}</h3><p>${esc(t('marineNext48h'))}</p></div></div>${marineSparkline(data)}<div class="marine-outlook"><div class="marine-outlook-head"><strong>${esc(t('marineDailyOutlook'))}</strong><span>${esc(t('marineWaveHeight'))} · ${esc(t('marineWavePeriod'))} · ${esc(t('marineSwellHeight'))}</span></div><div class="marine-days">${days}</div></div></article><article class="marine-surface marine-tide-surface"><div class="marine-surface-head"><div><h3>${esc(t('marineTides'))}</h3><p>${esc(t('marineTidesIntro'))}</p></div></div><div class="marine-tide-layout"><div class="marine-tide-chart-zone">${marineTideChart(data,tideEvents)}</div><aside class="marine-tide-rail"><div class="marine-level-hero"><span>${esc(t('marineCurrentLevel'))}</span><div class="marine-level-value">${Number.isFinite(currentLevel)?fmt(currentLevel,2)+' m':'—'}</div><div class="marine-level-meta"><small>${esc(t('marineReferenceMsl'))}</small><span class="marine-trend-pill ${tideTrend}">${esc(t(trendKey))}</span></div></div><div class="marine-tide-facts single"><div><span>${esc(t('marineTideRangeShort'))}</span><strong>${tideRange?fmt(tideRange.range,2)+' m':'—'}</strong><small>${esc(t('marineNext24h'))}</small></div></div><div class="marine-next-tides-block"><div class="marine-next-tides-head">${esc(t('marineUpcomingTides'))}</div><div class="marine-next-tides">${tideRows||`<div class="small">${esc(t('marineTideUnavailable'))}</div>`}</div></div></aside></div><p class="marine-datum-note">${esc(t('marineTideDatumNote'))}</p></article></div><div class="marine-footer-note"><span>${esc(t('marineDisclaimer'))}</span><span>${esc(t('marineSource'))}</span></div></section>`;
}

async function refreshMarineData(cityId,force=false,activate=false){
  const city=state.cities.find(c=>c.id===cityId);if(!city||state.marineLoading.has(cityId))return;const {t}=i18n();if(!state.online){toast(t('historyOnlineRequired'));return;}
  const marine=await loadFeature('marine'),cached=ensureMarineLoaded(cityId);if(!force&&cached&&marine.marineCacheFresh(cached))return;
  state.marineLoading.add(cityId);if(state.route.name==='city'&&state.route.id===cityId)rerenderCitySectionOrPage('marine');
  try{const data=await marine.fetchMarineForCity(city);if(!data.coastal){if(activate)toast(t('marineNotCoastal'));return;}state.marine[cityId]=data;localAnalysisLoaded.marine.add(cityId);saveMarine(cityId,data);if(activate&&!city.marineEnabled){city.marineEnabled=true;saveCities(state.cities);toast(t('marineEnabled'));}if(state.route.name==='city'&&state.route.id===cityId)render();}
  catch(err){toast(humanError(err));}
  finally{state.marineLoading.delete(cityId);if(state.route.name==='city'&&state.route.id===cityId)rerenderCitySectionOrPage('marine');}
}

function renderCityDetail(cityId){
  ensureCityAnalysisLoaded(cityId);
  const {t}=i18n(),city=state.cities.find(c=>c.id===cityId); if(!city)return `<main class="page"><div class="empty-state"><h2>${esc(t('cityNotFound'))}</h2><button class="btn" data-action="home">${esc(t('back'))}</button></div></main>`;
  const f=state.forecasts[cityId],loading=state.loading.has(cityId);
  if(!f)return `<main class="page"><section class="detail-hero"><div class="detail-title"><h1>${esc(city.name)}</h1><p>${esc(placeLine(city))}</p></div></section>${renderCityErrors(cityId)}<div class="section-card">${loading?'<div class="loader"></div> '+esc(t('loading')):`<button class="btn primary" data-refresh-city="${attr(city.id)}">↻ ${esc(t('refresh'))}</button>`}</div></main>`;
  const today=cityToday(f.city.timezone),consensusProfile=localConsensusWeights(cityId),consensusWeights=state.settings.localWeightedConsensus&&consensusProfile.ready?consensusProfile.maps:null,agg=cachedAggregateDay(f,today,consensusWeights),now=currentConditions(f,new Date(),{weightsByVariable:consensusWeights||{}}),inf=localizedConditionInfo(now.condition||agg.condition),scenarios=cachedScenarios(f),evolution=cachedEvolution(f,state.evolution[cityId]||[]),biasSource=state.bias[cityId]||{forecasts:[],observations:[]},biases=cachedBiases(f,biasSource,today),modelCount=Object.keys(f.seriesByModel).length;
  const health=forecastHealth(f),healthDetail=`${health.detail}${loading?` · ${t('updatingSuffix')}`:''}`;
  return `<main class="page detail-page"><section class="detail-hero professional-hero"><div class="detail-weather-mark" aria-hidden="true">${inf.icon}</div><div class="detail-title"><div class="eyebrow">${esc(t('multiModelForecast'))}</div><h1>${esc(city.name)}</h1><p>${esc(placeLine(city))}</p><div class="hero-meta"><span class="data-health ${health.class}"><i></i>${esc(health.label)}</span><span>${esc(healthDetail)}</span><span>${esc(t('availableModelsCount',{models:modelCountLabel(modelCount)}))}</span><span>${esc(f.city.timezone||'UTC')}</span></div></div><div class="detail-hero-actions">${city.marineEnabled?`<button class="btn tonal marine-hero-refresh" data-action="refresh-marine" data-marine-city="${attr(city.id)}" ${state.marineLoading.has(city.id)?'disabled':''}><span class="btn-icon ${state.marineLoading.has(city.id)?'spinning':''}">${uiIcon('refresh')}</span>${esc(state.marineLoading.has(city.id)?t('marineLoading'):t('refreshMarine'))}</button>`:''}<button class="btn subtle" data-action="copy-link">${esc(t('shareView'))}</button><button class="btn tonal" data-refresh-city="${attr(city.id)}" ${loading?'disabled':''}>${esc(t(loading?'refreshing':'refreshWeather'))}</button></div></section>${renderCityErrors(cityId)}<div class="detail-workspace"><aside class="detail-sidebar" aria-label="${esc(t('navForecast'))}"><div class="sidebar-card"><div class="sidebar-title">${esc(t('overview'))}</div><nav class="detail-nav" aria-label="${esc(t('forecastSections'))}"><button data-scroll-section="today-summary">${esc(t('today'))}</button><button data-scroll-section="timeline">${esc(t('forecastTimeline'))}</button><button data-scroll-section="agreement">${esc(t('confidenceBand'))}</button><button data-scroll-section="evolution">${esc(t('evolution'))}</button><button data-scroll-section="reliability">${esc(t('reliability'))}</button><button data-scroll-section="details">${esc(t('detailedComparison'))}</button>${city.marineEnabled?`<button data-scroll-section="marine">${esc(t('marineTitle'))}</button>`:''}<button data-scroll-section="diagnostics">${esc(t('dataDiagnostics'))}</button></nav></div><button class="detail-back-button detail-sidebar-back" data-action="back"><span class="detail-back-icon">${uiIcon('back',18)}</span><span>${esc(t('back'))}</span></button></aside><div class="detail-main"><div class="overview-layout"><div class="overview-primary">${renderTodaySummary(f,agg,now,city.id,consensusProfile)}</div><div class="overview-secondary">${renderInsights(f,evolution,consensusWeights)}${renderScenarios(scenarios)}</div></div>${renderTimeline(f,consensusWeights)}${renderConfidenceSection(f,cityId,consensusWeights)}${renderEvolutionSection(evolution)}${renderReliabilitySection(city,biases)}${renderDetailedComparison(f,biases)}${renderMarineSection(city)}${renderDataDiagnosticsSection(city,f)}<div class="small source-note">${esc(t('source'))}</div></div></div></main>`;
}


function diagnosticStatusLabel(status){const {t}=i18n();return t({OK:'diagOk',RECOVERED:'diagRecovered',PARTIAL:'diagPartial',VARIABLE_MISSING:'diagVariableMissing',OUT_OF_DOMAIN_OR_UNAVAILABLE:'diagOutOfDomain',UNAVAILABLE:'diagUnavailable',DISABLED:'diagDisabled'}[status]||'diagUnavailable');}
function diagnosticStatusClass(status){return status==='OK'?'high':status==='RECOVERED'?'medium':['PARTIAL','VARIABLE_MISSING'].includes(status)?'low':status==='DISABLED'?'muted':'low';}
function diagnosticCoverageCell(v){const {t}=i18n();if(!v?.count)return `<span class="diag-empty">—</span>`;return `<strong>${v.count}</strong><small>${esc(v.lastTimestamp?`${t('until')} ${v.lastTimestamp.slice(5,16).replace('T',' ')}`:'—')}</small>`;}
function healthStatusClass(status){return ['OK','RECOVERED'].includes(status)?'high':status==='DELAYED'?'medium':['MISSED_RUNS','DEGRADED'].includes(status)?'low':'muted';}
function healthStatusLabel(status){const {t}=i18n();return t({OK:'healthOk',RECOVERED:'healthRecovered',DELAYED:'healthDelayed',MISSED_RUNS:'healthMissedRuns',DEGRADED:'healthDegraded',OUT_OF_DOMAIN:'healthOutOfDomain',METADATA_UNAVAILABLE:'healthMetadataUnavailable',DISABLED:'diagDisabled'}[status]||'healthUnknown');}
function coverageCompact(v){const {t}=i18n();if(!v?.count)return '—';const last=v.lastTimestamp?`${t('until')} ${timeLabel(v.lastTimestamp)} ${dateLabel(v.lastTimestamp.slice(0,10),i18n().locale)}`:'';return `<strong>${v.count}</strong><small>${esc(last)}</small>`;}
async function refreshModelHealthData(cityId,force=false){
  const city=state.cities.find(c=>c.id===cityId),f=state.forecasts[cityId];if(!city||!f||state.modelHealthLoading.has(cityId)||!state.online)return;
  const existing=state.modelHealth[cityId];if(!force&&existing&&Date.now()-existing.generatedAt<15*60_000)return;
  state.modelHealthLoading.add(cityId);if(state.route.name==='city'&&state.route.id===cityId)rerenderCitySectionOrPage('diagnostics');
  try{const health=await loadFeature('health'),metadata=await health.fetchModelRunMetadata(WEATHER_MODELS),history=ensureHealthLoaded(cityId),report=health.buildModelHealthReport(f,WEATHER_MODELS,state.settings.enabledModelIds,metadata,history,Date.now()),nextHistory=health.appendHealthSnapshot(history,report);state.modelHealth[cityId]=report;state.modelHealthHistory[cityId]=nextHistory;saveModelHealth(cityId,nextHistory);}
  catch(err){console.warn('Model health:',err);toast(humanError(err));}
  finally{state.modelHealthLoading.delete(cityId);if(state.route.name==='city'&&state.route.id===cityId)rerenderCitySectionOrPage('diagnostics');}
}
function renderDataDiagnosticsSection(city,f){
  const {t}=i18n(),open=state.diagnosticsOpen.has(city.id),active=state.settings.enabledModelIds||[],meta=f.modelMeta||{},quick={partial:active.filter(id=>meta[id]?.dataWarning==='PARTIAL_HOURLY_SERIES').length,recovered:active.filter(id=>meta[id]?.recoveredFromBatch).length,unavailable:active.filter(id=>!f.seriesByModel?.[id]).length};
  if(!open)return `<section class="section section-card diagnostics-section" id="diagnostics"><div class="section-head"><div><h2>${esc(t('modelHealthMonitor'))}</h2><p>${esc(t('modelHealthMonitorIntro'))}</p></div><button class="btn tonal" data-action="toggle-diagnostics">${esc(t('openDiagnostics'))}</button></div><div class="diagnostic-summary"><span class="diag-chip high">${esc(t('diagHealthyCount',{count:Math.max(0,active.length-quick.partial-quick.unavailable)}))}</span>${quick.recovered?`<span class="diag-chip medium">${esc(t('diagRecoveredCount',{count:quick.recovered}))}</span>`:''}${quick.partial?`<span class="diag-chip low">${esc(t('diagPartialCount',{count:quick.partial}))}</span>`:''}${quick.unavailable?`<span class="diag-chip muted">${esc(t('diagUnavailableCount',{count:quick.unavailable}))}</span>`:''}</div></section>`;
  if(!lazyFeatures.health){void loadFeature('health').then(()=>{void refreshModelHealthData(city.id,false);rerenderCitySectionOrPage('diagnostics');});return `<section class="section section-card diagnostics-section" id="diagnostics"><div class="section-head"><div><h2>${esc(t('modelHealthMonitor'))}</h2><p>${esc(t('loadingDiagnosticModule'))}</p></div><button class="btn subtle" data-action="toggle-diagnostics">${esc(t('close'))}</button></div><div class="loader"></div></section>`;}
  ensureHealthLoaded(city.id);let report=state.modelHealth[city.id];
  if(!report&&state.online){queueMicrotask(()=>refreshModelHealthData(city.id,false));return `<section class="section section-card diagnostics-section health-monitor" id="diagnostics"><div class="section-head"><div><h2>${esc(t('modelHealthMonitor'))}</h2><p>${esc(t('modelHealthDetailedIntro'))}</p></div><div class="section-actions"><button class="btn tonal" disabled>${esc(t('refreshing'))}</button><button class="btn subtle" data-action="toggle-diagnostics">${esc(t('close'))}</button></div></div><div class="loader"></div></section>`;}
  if(!report)report=lazyFeatures.health.buildModelHealthReport(f,WEATHER_MODELS,active,{},state.modelHealthHistory[city.id]||[]);
  const loading=state.modelHealthLoading.has(city.id),rows=report.rows.map(row=>{const missing=row.missingVariables?.length?row.missingVariables.map(v=>t({temperature:'temperature',precipitation:'precipitation',wind:'wind'}[v]||v)).join(', '):t('none'),expected=row.expectedRunAt?esc(t('healthExpectedAt',{time:timeLabel(row.expectedRunAt)})):'';return `<tr class="diag-row ${healthStatusClass(row.healthStatus)}"><th><strong>${esc(row.name)}</strong><small>${esc(row.family)} · ${row.resolutionKm} km</small></th><td><span class="status-pill ${healthStatusClass(row.healthStatus)}">${esc(healthStatusLabel(row.healthStatus))}</span>${row.recoveredFromBatch?`<small>${esc(t('diagFallbackUsed'))}</small>`:''}</td><td>${row.referenceTime?`<strong>${esc(dateLabel(row.referenceTime.slice(0,10),i18n().locale))} ${esc(timeLabel(row.referenceTime))}</strong>`:'—'}${expected?`<small>${expected}</small>`:''}<small>${Number.isFinite(row.delayMinutes)&&row.delayMinutes>0?esc(t('healthDelayMinutes',{count:row.delayMinutes})):row.metadataAvailable?esc(t('healthOnSchedule')):''}</small></td><td>${coverageCompact(row.variables.temperature)}</td><td>${coverageCompact(row.variables.precipitation)}</td><td>${coverageCompact(row.variables.wind)}</td><td>${esc(missing)}</td><td>${Number.isFinite(row.responseMs)?`${row.responseMs} ms`:'—'}</td><td><strong>${row.incident24h}</strong><small>24 h</small></td><td><strong>${row.incident7d}</strong><small>7 j</small></td></tr>`;}).join('');
  return `<section class="section section-card diagnostics-section health-monitor" id="diagnostics"><div class="section-head"><div><h2>${esc(t('modelHealthMonitor'))}</h2><p>${esc(t('modelHealthDetailedIntro'))}</p></div><div class="section-actions"><button class="btn tonal" data-action="refresh-model-health" ${loading?'disabled':''}>${esc(loading?t('refreshing'):t('refreshHealth'))}</button><button class="btn subtle" data-action="toggle-diagnostics">${esc(t('close'))}</button></div></div><div class="diagnostic-summary"><span class="diag-chip high">${esc(t('healthHealthyCount',{count:report.summary.healthy}))}</span><span class="diag-chip medium">${esc(t('healthDelayedCount',{count:report.summary.delayed}))}</span><span class="diag-chip low">${esc(t('healthIncidentCount',{count:report.summary.incidents}))}</span></div><div class="table-wrap diagnostic-table-wrap"><table class="diagnostic-table health-table"><thead><tr><th>${esc(t('model'))}</th><th>${esc(t('status'))}</th><th>${esc(t('latestRun'))}</th><th>${esc(t('temperature'))}</th><th>${esc(t('precipitation'))}</th><th>${esc(t('wind'))}</th><th>${esc(t('missingVariables'))}</th><th>${esc(t('responseTime'))}</th><th>${esc(t('incidents24h'))}</th><th>${esc(t('incidents7d'))}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small">${esc(t('healthMetadataNote'))}</p></section>`;
}

function localConsensusWeights(cityId){
  const variables=[['TEMPERATURE','temperature'],['PRECIPITATION','precipitation'],['WIND_SPEED','wind']],maps={},historicalByVariable={},calibrated=new Set(),calibratedFamilies=new Set();
  for(const [variable,key] of variables){
    const histories=biasHistoriesByModel(cityId,variable),cohort=comparableBiasCohort(histories);maps[key]={};historicalByVariable[key]=null;if(!cohort||cohort.ids.length<3)continue;
    const scored=cohort.ids.map(modelId=>{const rows=(histories[modelId]||[]).filter(x=>cohort.dates.has(x.date)),r=computeLocalReliability(variable,rows,30);return r?{modelId,score:r.score}:null;}).filter(Boolean);if(scored.length<3)continue;
    const raw=scored.map(x=>0.8+(x.score/100)*0.4),avg=raw.reduce((a,b)=>a+b,0)/raw.length;
    scored.forEach((x,i)=>{maps[key][x.modelId]=Math.max(.75,Math.min(1.25,raw[i]/avg));calibrated.add(x.modelId);calibratedFamilies.add(consensusGroupFor(x.modelId));});
    const groups=new Map();for(const x of scored){const g=consensusGroupFor(x.modelId),a=groups.get(g)||[];a.push(x.score);groups.set(g,a);}const familyScores=[...groups.values()].map(a=>average(a));
    if(familyScores.length>=2)historicalByVariable[key]=Math.round(average(familyScores));
  }
  const availableHistorical=Object.values(historicalByVariable).filter(Number.isFinite),historicalOverall=availableHistorical.length>=2?Math.round(average(availableHistorical)):null;
  return {maps,calibratedCount:calibrated.size,calibratedFamilyCount:calibratedFamilies.size,ready:calibrated.size>=3&&calibratedFamilies.size>=2,historicalByVariable,historicalOverall};
}

function summaryDispersionCard({agg,key,metricFamily,label,hint,iconKind,iconClass,central,range,confidence,unit,digits=1,probability=null,secondary=null}){
  const {t}=i18n(),rows=(agg.data||[]).filter(x=>x.comparable?.[metricFamily]&&Number.isFinite(x[key])),values=rows.map(x=>x[key]),fallbackMin=values.length?Math.min(...values):null,fallbackMax=values.length?Math.max(...values):null,min=Number.isFinite(range?.[0])?range[0]:fallbackMin,max=Number.isFinite(range?.[1])?range[1]:fallbackMax;
  const span=Number.isFinite(min)&&Number.isFinite(max)?Math.max(.0001,max-min):null,pos=value=>Number.isFinite(value)&&Number.isFinite(span)?(span<=.0001?50:8+Math.max(0,Math.min(1,(value-min)/span))*84):50;
  const formatted=value=>Number.isFinite(value)?`${fmt(value,digits)}${unit}`:'—',modelDots=rows.map((row,index)=>{const model=getModel(row.modelId),name=model?.shortName||model?.name||row.modelId;return `<i class="summary-model-dot" style="--dot:${pos(row[key])}%;--dot-row:${index%2}" title="${attr(`${name} · ${formatted(row[key])}`)}" aria-label="${attr(`${name} ${formatted(row[key])}`)}"></i>`;}).join('');
  const confidenceValue=Number.isFinite(confidence?.percent)?Math.round(confidence.percent):null,confidenceClassName=Number.isFinite(confidenceValue)?confidenceClass(confidenceValue):'muted',count=Number.isFinite(confidence?.count)?confidence.count:rows.length,rangeLabel=Number.isFinite(min)&&Number.isFinite(max)?`${formatted(min)} – ${formatted(max)}`:'—';
  const probabilityChip=Number.isFinite(probability)?`<span class="summary-dispersion-chip probability">${esc(t('rainProbabilityShort',{probability:Math.round(probability)}))}</span>`:'';
  const secondaryChip=secondary?`<span class="summary-dispersion-chip secondary">${secondary}</span>`:'';
  return `<article class="summary-dispersion metric-${iconClass} ${confidenceClassName}"><div class="summary-dispersion-head"><span class="summary-metric-icon ${iconClass}">${summaryMetricIcon(iconKind)}</span><div class="summary-dispersion-title"><div class="tile-label">${esc(label)}</div><div class="tile-hint">${esc(hint)}</div></div><strong class="summary-dispersion-value">${formatted(central)}</strong></div><div class="summary-dispersion-visual"><div class="summary-dispersion-rail" aria-label="${attr(`${label} · ${t('modelRange')} ${rangeLabel}`)}"><span class="summary-dispersion-envelope"></span>${modelDots}<i class="summary-dispersion-center" style="--center:${pos(central)}%" title="${attr(`${t('weightedMedianCentral')} · ${formatted(central)}`)}"></i></div><div class="summary-dispersion-scale"><span>${formatted(min)}</span><strong>${formatted(central)}</strong><span>${formatted(max)}</span></div></div><div class="summary-dispersion-meta"><span class="summary-dispersion-chip ${confidenceClassName}"><b>${esc(t('modelConvergence'))}</b>${confidenceValue!=null?`${confidenceValue}%`:'—'}</span><span class="summary-dispersion-chip"><b>${esc(t('modelRange'))}</b>${esc(rangeLabel)}</span>${probabilityChip}${secondaryChip}<span class="summary-dispersion-models">${esc(modelCountLabel(count))}</span></div><div class="summary-agreement-track" aria-hidden="true"><i style="--agreement:${confidenceValue!=null?Math.max(0,Math.min(100,confidenceValue)):0}%"></i></div></article>`;
}

function renderTodaySummary(f,agg,now,cityId,profile=localConsensusWeights(cityId)){
  const {t}=i18n(),c=agg.confidence,overall=c?.overallPercent,modelIds=Object.keys(f.seriesByModel||{}),modelCount=modelIds.length,familyCount=new Set(modelIds.map(consensusGroupFor)).size,historical=profile?.historicalOverall,precipConfidence=c.precipitation,info=localizedConditionInfo(now.condition||agg.condition),convergence=Number.isFinite(overall)?t(overall>=80?'convergenceHigh':overall>=50?'convergenceMedium':'convergenceLow'):t('insufficientData'),localActive=Boolean(state.settings.localWeightedConsensus&&profile?.ready),method=t(localActive?'centralMethodLocal':'centralMethodFamily');
  const rainHint=Number.isFinite(agg.precipProbability)?t('rainCentralHint',{probability:Math.round(agg.precipProbability),amount:Number.isFinite(agg.precipConditional)?fmt(agg.precipConditional,1):'—'}):t('rainCentralNoProbability');
  const historicalBlock=Number.isFinite(historical)?`<div class="weighted-consensus historical-confidence"><span>${esc(t('historicalConfidence'))}</span><strong>${Math.round(historical)}%</strong><small>${esc(t('historicalConfidenceMeta',{count:profile.calibratedCount,families:profile.calibratedFamilyCount}))}</small></div>`:`<div class="weighted-consensus unavailable"><span>${esc(t('historicalConfidence'))}</span><strong>—</strong><small>${esc(t('historicalConfidenceInsufficient'))}</small></div>`;
  const cards=[
    summaryDispersionCard({agg,key:'tempMin',metricFamily:'temperature',label:t('tempMinimum'),hint:t('weightedMedianCentral'),iconKind:'temperature',iconClass:'temp-min',central:agg.tempMin,range:agg.tempMinRange,confidence:c.tempMin,unit:' °C',digits:1}),
    summaryDispersionCard({agg,key:'tempMax',metricFamily:'temperature',label:t('tempMaximum'),hint:t('weightedMedianCentral'),iconKind:'temperature',iconClass:'temp-max',central:agg.tempMax,range:agg.tempMaxRange,confidence:c.tempMax,unit:' °C',digits:1}),
    summaryDispersionCard({agg,key:'precip',metricFamily:'precipitation',label:t('precipitation'),hint:rainHint,iconKind:'precipitation',iconClass:'rain',central:agg.precip,range:agg.precipRange,confidence:precipConfidence,unit:' mm',digits:1,probability:agg.precipProbability,secondary:Number.isFinite(agg.precipExpected)?`${esc(t('rainExpectedAmount',{amount:fmt(agg.precipExpected,1)}))}`:null}),
    summaryDispersionCard({agg,key:'wind',metricFamily:'wind',label:t('wind'),hint:t('weightedMedianCentral'),iconKind:'wind',iconClass:'wind',central:agg.wind,range:agg.windRange,confidence:c.windMax,unit:' km/h',digits:0,secondary:Number.isFinite(agg.gust)?`${esc(t('gusts'))} ${fmt(agg.gust)} km/h`:null})
  ].join('');
  return `<section class="section today-summary" id="today-summary"><div class="summary-card"><div class="summary-accent" style="--summary-accent:${info.accent||'var(--primary)'}"></div><div class="summary-header"><div class="summary-now"><div class="summary-weather-icon">${conditionMarkup(now.condition||agg.condition,'normal',now.condition?Boolean(now.conditionInferred):Boolean(agg.conditionInferred))}</div><div><div class="summary-kicker">${esc(dateLabel(agg.date,i18n().locale,'long'))}</div><div class="summary-now-line"><span class="summary-current-temp">${Number.isFinite(now.temperature)?`${fmt(now.temperature,1)}°`:'—'}</span><span class="summary-condition">${esc(info.label)}</span></div><div class="summary-context-chips"><span>${esc(t('analysedModels',{models:modelCountLabel(modelCount)}))}</span><span>${esc(t('independentFamilies',{count:familyCount}))}</span><span>${esc(method)}</span>${agg.sunrise||agg.sunset?`<span class="summary-solar-pair">${agg.sunrise?`<span class="summary-solar-chip">☀ ${esc(t('sunrise'))} ${timeLabel(agg.sunrise)}</span>`:''}${agg.sunset?`<span class="summary-solar-chip">◐ ${esc(t('sunset'))} ${timeLabel(agg.sunset)}</span>`:''}</span>`:''}</div></div></div><div class="global-agreement ${Number.isFinite(overall)?confidenceClass(overall):''}"><div class="global-agreement-label">${esc(t('modelConvergence'))}</div><div class="global-agreement-value">${Number.isFinite(overall)?`${overall}%`:'—'}</div><div class="global-agreement-meta">${esc(Number.isFinite(overall)?`${convergence} · ${familyCount} ${t('familiesShort')} · ${modelCountLabel(modelCount)}`:`${t('insufficientData')} · ${familyCount} ${t('familiesShort')} · ${modelCountLabel(modelCount)}`)}</div>${historicalBlock}<button class="btn agreement-link" data-action="why-confidence">ⓘ ${esc(t('whyConvergence'))}</button></div></div><div class="today-grid summary-dispersion-grid">${cards}</div></div></section>`;
}

function renderInsights(f,evolution,consensusWeights=null){
  const {t}=i18n(),today=cityToday(f.city.timezone),dates=[...new Set(Object.values(f.seriesByModel||{}).flatMap(s=>s.daily.dates))].filter(d=>d>=today).sort().slice(0,6),items=[];
  for(const d of dates){
    const a=cachedAggregateDay(f,d,consensusWeights),c=a.confidence?.overallPercent;
    if(Number.isFinite(c)&&c<45)items.push({kind:'weather',p:95,date:d,icon:'⚠️',text:t('insightStrongDisagreement',{percent:c})});
    const pc=a.confidence?.precipitation;
    if(Number.isFinite(pc?.probabilityPercent)&&Number.isFinite(pc?.percent)&&pc.percent<50)items.push({kind:'weather',p:90,date:d,icon:'☂️',text:t('insightRainUncertainV2',{probability:pc.probabilityPercent,families:pc.familyCount||0})});
    else if(Number.isFinite(a.precip)&&a.precip>=5)items.push({kind:'weather',p:82,date:d,icon:'🌧️',text:t('insightRainStrong',{mean:fmt(a.precip,1),range:fmtRange(...a.precipRange,' mm',1)})});
    if(Number.isFinite(a.wind)&&a.wind>=35)items.push({kind:'weather',p:86,date:d,icon:'💨',text:t('insightWind',{mean:fmt(a.wind),gusts:Number.isFinite(a.gust)?t('insightGusts',{value:fmt(a.gust)}):''})});
    if(Number.isFinite(c)&&c>=85)items.push({kind:'weather',p:35,date:d,icon:'✓',text:t('insightHighAgreement',{percent:c})});
  }
  for(let i=1;i<dates.length;i++){const prev=cachedAggregateDay(f,dates[i-1],consensusWeights),cur=cachedAggregateDay(f,dates[i],consensusWeights);if(Number.isFinite(prev.tempMax)&&Number.isFinite(cur.tempMax)&&Math.abs(cur.tempMax-prev.tempMax)>=7){const delta=cur.tempMax-prev.tempMax;items.push({kind:'weather',p:80,date:dates[i],icon:'🌡️',text:t('insightThermalChange',{delta:`${delta>0?'+':''}${fmt(delta,0)}`})});break;}}
  const ev=[];for(const day of evolution?.days||[])for(const [v,x] of Object.entries(day.variables||{})){if(x.trend!=='STABLE'&&Number.isFinite(x.medianAbsDelta)){const threshold=v==='temperature'?1:v==='precipitation'?2:5;if(x.medianAbsDelta>=threshold)ev.push({kind:'revision',p:92,date:day.date,icon:v==='temperature'?'🌡️':v==='precipitation'?'☂️':'💨',text:t('insightForecastRevised',{hours:x.previous?.[0]?.ageHours||'?',trend:trendText(x.trend,x.medianDelta,v==='temperature'?' °C':v==='precipitation'?' mm':' km/h')})});}}
  const dedupe=list=>list.sort((a,b)=>b.p-a.p||a.date.localeCompare(b.date)).filter((x,i,a)=>a.findIndex(y=>y.text===x.text)===i),weather=dedupe(items),revisions=dedupe(ev),chosen=[];
  if(weather.length)chosen.push(weather.shift());
  if(revisions.length)chosen.push(revisions[0]);
  while(chosen.length<3&&weather.length)chosen.push(weather.shift());
  if(!chosen.length)return '';
  chosen.sort((a,b)=>a.date.localeCompare(b.date)||b.p-a.p);
  return `<section class="section"><div class="section-card"><div class="section-head"><div><h2>${esc(t('forecast_insights_title'))}</h2><p>${esc(t('forecast_insights_subtitle_generic'))}</p></div></div><div class="scenario-list">${chosen.map(x=>`<div class="scenario"><span class="scenario-icon">${x.icon}</span><span><span class="scenario-main">${esc(dateLabel(x.date,i18n().locale))}</span><span class="cell-sub">${esc(x.text)}</span></span></div>`).join('')}</div></div></section>`;
}

function scenarioLabel(s){
  const {t}=i18n();
  if(s.kind==='SHOWERS') return t({EARLY:'home_scenario_showers_early',MIDDLE:'home_scenario_showers_middle',LATE:'home_scenario_showers_late',THROUGHOUT:'home_scenario_showers_throughout'}[s.timing]||'weather_rain_showers');
  if(s.kind==='RAIN') return t({EARLY:'home_scenario_rain_early',MIDDLE:'home_scenario_rain_middle',LATE:'home_scenario_rain_late',THROUGHOUT:'home_scenario_rain_throughout'}[s.timing]||'weather_rain');
  const key={CLEAR:'home_scenario_clear',VARIABLE_SKY:'home_scenario_variable_sky',OVERCAST:'home_scenario_overcast',DRY_UNSPECIFIED:'home_scenario_dry_unspecified',SNOW:'home_scenario_snow',FREEZING_RAIN:'home_scenario_freezing_rain',THUNDERSTORM:'home_scenario_thunderstorm',OTHER:'home_scenario_other'}[s.kind];
  return key?t(key):s.kind;
}
function scenarioIcon(kind){return {CLEAR:'☀️',VARIABLE_SKY:'⛅',OVERCAST:'☁️',DRY_UNSPECIFIED:'🌤️',SHOWERS:'🌦️',RAIN:'🌧️',SNOW:'❄️',FREEZING_RAIN:'🧊',THUNDERSTORM:'⛈️',OTHER:'🧩'}[kind]||'🌦️';}
function renderScenarios(scenarios){
  const {t}=i18n();if(!scenarios.length)return '';
  return `<section class="section"><div class="section-card"><div class="section-head"><div><h2>${esc(t('home_scenarios_title'))}</h2><p>${esc(t('forecast_insights_subtitle_generic'))}</p></div></div><div class="scenario-list">${scenarios.map(s=>{const parts=[];if(Number.isFinite(s.tempMin)&&Number.isFinite(s.tempMax))parts.push(`${fmt(s.tempMin)}–${fmt(s.tempMax)} °C`);if(Number.isFinite(s.precipMax))parts.push(t('scenarioRainPart',{range:fmtRange(s.precipMin,s.precipMax,' mm',1)}));if(Number.isFinite(s.gustMax))parts.push(t('scenarioGustPart',{value:fmt(s.gustMax)}));return `<div class="scenario"><div class="scenario-icon">${scenarioIcon(s.kind)}</div><div><div class="scenario-main">${esc(scenarioLabel(s))}</div><div class="scenario-sub">${esc(parts.join(' · '))}</div></div><span class="pill">${s.modelCount}/${s.totalModelCount} ${esc(t('models'))}</span></div>`;}).join('')}</div></div></section>`;
}

function renderTimeline(f,consensusWeights=null){
  const opts={weightsByVariable:consensusWeights||{}},{t}=i18n(),hourlyAll=buildTimelinePoints(f,'HOURLY',new Date(),opts),dailyAll=buildTimelinePoints(f,'DAILY',new Date(),opts);let mode=state.settings.timelineMode||'HOURLY';if(mode==='HOURLY'&&hourlyAll.length<2)mode='DAILY';if(mode==='DAILY'&&!dailyAll.length&&hourlyAll.length)mode='HOURLY';const analysis=mode==='HOURLY'?hourlyAll:dailyAll,points=selectRegularTimelinePoints(analysis,mode==='HOURLY'?8:7,3);if(!points.length)return '';
  return `<section class="section timeline-section" id="timeline"><div class="section-card timeline-card"><div class="section-head"><div><h2>${esc(t('forecastTimeline'))}</h2><p>${esc(t(mode==='HOURLY'?'next24Regular':'nextDaysConsensus'))}</p></div><div class="segmented timeline-mode" aria-label="${esc(t('timelineModeAria'))}"><button class="seg-btn ${mode==='HOURLY'?'active':''}" data-timeline-mode="HOURLY" ${hourlyAll.length<2?'disabled':''}>24 h</button><button class="seg-btn ${mode==='DAILY'?'active':''}" data-timeline-mode="DAILY" ${!dailyAll.length?'disabled':''}>${esc(t('dayMode7'))}</button></div></div><div class="timeline-scroll" style="--timeline-cols:${points.length}"><div class="timeline-ruler" aria-hidden="true">${points.map((p,i)=>timelineEventMarker(p,points[i-1])).join('')}</div><div class="timeline-full" role="list" aria-label="${esc(t('forecastTimeline'))}">${points.map((p,i)=>renderTimelinePoint(p,mode,i===0,i===points.length-1)).join('')}</div></div><div class="timeline-legend"><span><i class="legend-swatch temp-gradient"></i> ${esc(t('thermalBand'))}</span><span>☂ ${esc(t('precipSignalLegend'))}</span><span>☁ ${esc(t('cloudMedianLegend'))}</span><span>💨 ${esc(t('windMedianLegend'))}</span><span>⚠ ${esc(t('disagreementVariableLegend'))}</span></div></div></section>`;
}

function renderConfidenceSection(f,cityId,consensusWeights=null){
  const {t}=i18n(),metric=state.settings.confidenceMetric||'TEMPERATURE',horizon=[24,72,168].includes(Number(state.settings.chartHorizon))?Number(state.settings.chartHorizon):168,bands=cachedBand(f,metric,horizon,consensusWeights),normals=state.normals[cityId]?.normals||null;
  return `<section class="section" id="agreement"><div class="section-card"><div class="section-head"><div><h2>${esc(t('confidenceBand'))}</h2><p>${esc(t('chart_confidence_band_desc'))}</p></div></div><div class="chart-controls"><div class="segmented" data-control="confidence-metric">${[['TEMPERATURE',t('temperature')],['PRECIPITATION',t('precipitation')],['WIND',t('wind')]].map(([id,label])=>`<button class="seg-btn ${metric===id?'active':''}" data-confidence-metric="${id}">${esc(label)}</button>`).join('')}</div><div class="segmented" aria-label="${esc(t('chartHorizonAria'))}">${[[24,'24 h'],[72,'72 h'],[168,t('dayMode7')]].map(([hours,label])=>`<button class="seg-btn ${horizon===hours?'active':''}" data-chart-horizon="${hours}">${esc(label)}</button>`).join('')}</div></div>${renderBandLegend(metric,Boolean(normals))}<div class="chart-wrap agreement-chart-wrap" title="${esc(t('chartScrollTitle'))}">${renderBandChart(bands,metric,normals)}</div>${renderConfidenceTimeline(bands)}${metric==='TEMPERATURE'&&!normals?`<div class="small">${esc(t('webNormals'))} : ${state.online?esc(t('webLoading')):esc(t('webUnavailableOffline'))}</div>`:''}</div></section>`;
}

function renderTimelinePoint(p,mode,isFirst,isLast){
  const {t}=i18n(),empty=!p.modelCount,ci=localizedConditionInfo(p.condition),divergence=p.divergenceReasons||[],dateText=mode==='HOURLY'?(isFirst?t('now'):timeLabel(p.timestamp)):dateLabel(p.date,i18n().locale),context=mode==='HOURLY'?dateLabel(p.date,i18n().locale):'',tempMain=mode==='HOURLY'?p.temperatureC:p.tempMaxC,tempLow=mode==='DAILY'?p.tempMinC:p.temperatureMinAcrossModels,tempHigh=mode==='DAILY'?p.tempMaxC:p.temperatureMaxAcrossModels,topHeat=Number.isFinite(tempHigh)?heatColor('TEMPERATURE',tempHigh):Number.isFinite(tempMain)?heatColor('TEMPERATURE',tempMain):null,bottomHeat=Number.isFinite(tempLow)?heatColor('TEMPERATURE',tempLow):Number.isFinite(tempMain)?heatColor('TEMPERATURE',tempMain):null,tempStyle=(topHeat||bottomHeat)?`style="--heat:${topHeat||bottomHeat};--heat-top:${topHeat||bottomHeat};--heat-bottom:${bottomHeat||topHeat}"`:'',source=p.precipitationSource==='PROBABILITY'?t('modelProbability'):p.precipitationSource==='MIXED'?t('mixedRainProbability'):p.precipitationSource==='MODEL_AGREEMENT'&&p.precipitationModelCount>=2?t('modelsProbability',{wet:p.wetModelCount,total:p.precipitationModelCount}):'',rainProb=Number.isFinite(p.precipitationPercent)?p.precipitationPercent:null,rainStrength=rainProb==null?0:Math.max(0,Math.min(100,rainProb)),rainDot=rainProb!=null?`<div class="timeline-precip-heat" title="${esc(source||t('limitedSignal'))}"><i style="--rain-size:${Math.round(5+rainStrength*.1)}px;--rain:var(--primary);--rain-opacity:${(0.28+rainStrength*.0065).toFixed(2)}"></i></div>`:'<div class="timeline-precip-heat empty"></div>';
  return `<article class="timeline-point ${empty?'empty':''}" role="listitem"><div class="timeline-point-head"><strong>${esc(dateText)}</strong><span>${esc(context)}</span></div><div class="timeline-condition">${p.condition?conditionMarkup(p.condition,'small',Boolean(p.conditionInferred)):'<span class="muted">—</span>'}<span>${p.condition?esc(ci.label):esc(t('dataUnavailable'))}</span></div><div class="timeline-temp-band" ${tempStyle}><strong>${Number.isFinite(tempMain)?`${fmt(tempMain)}°`:'—'}</strong>${Number.isFinite(tempLow)&&Number.isFinite(tempHigh)&&Math.abs(tempHigh-tempLow)>=1?`<small>${fmt(tempLow)}–${fmt(tempHigh)}°</small>`:''}</div>${rainDot}<div class="timeline-metric timeline-rain-metric" title="${attr(source||t('limitedSignal'))}"><span>☂</span><strong>${rainProb!=null?`${Math.round(rainProb)}%`:'—'}</strong><small>${Number.isFinite(p.precipitationConditionalMm)?esc(t('rainIfWetAmountShort',{amount:fmt(p.precipitationConditionalMm,1)})):esc(t('rainAmountUnavailable'))}</small></div><div class="timeline-metric"><span>☁</span><strong>${Number.isFinite(p.cloudCoverPercent)?`${p.cloudCoverPercent}%`:'—'}</strong><small>${Number.isFinite(p.cloudCoverMinAcrossModels)&&Number.isFinite(p.cloudCoverMaxAcrossModels)?`${p.cloudCoverMinAcrossModels}–${p.cloudCoverMaxAcrossModels}%`:esc(t('cloudCoverage'))}</small></div><div class="timeline-metric"><span>💨</span><strong>${Number.isFinite(p.windKmh)?`${fmt(p.windKmh)} km/h`:'—'}</strong><small>${Number.isFinite(p.windGustKmh)?`${esc(t('gustAbbr'))} ${fmt(p.windGustKmh)} km/h`:esc(t('gustsUnavailable'))}</small></div><div class="timeline-consensus">${Number.isFinite(p.consensusPercent)?confidencePill(p.consensusPercent,p.modelCount):`<span class="pill">${esc(t('limitedComparison'))}</span>`}${divergence.length?`<div class="divergence-list" aria-label="${esc(t('disagreementVariableLegend'))}">${divergence.map(d=>`<span title="${esc(divergenceLabel(d))}">⚠ ${esc(divergenceShort(d))}</span>`).join('')}</div>`:`<div class="divergence-list stable"><span>✓ ${esc(t('coherent'))}</span></div>`}</div></article>`;
}

function timelineEventMarker(p,prev){
  const {t}=i18n();let kind='stable',label=t('timelineStable'),icon='·';
  if((p.divergenceReasons||[]).length){kind='uncertain';label=t('timelineUncertain');icon='!';}
  else if(Number.isFinite(p.precipitationPercent)&&p.precipitationPercent>=60){kind='rain';label=t('timelineRain');icon='☂';}
  else if(Number.isFinite(p.windKmh)&&p.windKmh>=40){kind='wind';label=t('timelineWind');icon='↗';}
  else if(prev&&Number.isFinite(p.temperatureC)&&Number.isFinite(prev.temperatureC)&&Math.abs(p.temperatureC-prev.temperatureC)>=4){kind='temp';label=t('timelineTemp');icon='°';}
  else if(prev&&p.condition&&prev.condition&&p.condition!==prev.condition){kind='weather';label=t('timelineWeather');icon='◆';}
  return `<div class="timeline-ruler-slot ${kind}" title="${esc(label)}"><span>${icon}</span></div>`;
}

function divergenceLabel(x){const {t}=i18n();return {TEMPERATURE:t('divergenceTemperature'),PRECIPITATION:t('divergenceRain'),WIND:t('divergenceWind'),CONDITION:t('divergenceConditions')}[x]||x;}

function divergenceShort(x){const {t}=i18n();return {TEMPERATURE:t('shortTemp'),PRECIPITATION:t('precipitation'),WIND:t('wind'),CONDITION:t('conditions')}[x]||x;}

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
  const {t}=i18n(),unit=metric==='TEMPERATURE'?'°C':metric==='PRECIPITATION'?'mm':'km/h';
  return `<div class="chart-legend" aria-label="${esc(t('chartLegendAria'))}"><span><i class="legend-line mean"></i>${esc(t('centralForecastLine',{unit}))}</span><span><i class="legend-area agreement-range"></i>${esc(t('minMaxAgreement'))}</span>${metric==='TEMPERATURE'&&hasNormals?`<span><i class="legend-line normal"></i>${esc(t('era5Thermal'))}</span>`:''}</div>`;
}

function renderConfidenceTimeline(bands){
  const {t}=i18n();if(!bands?.length)return '';const maxSegments=24,step=Math.max(1,Math.ceil(bands.length/maxSegments)),sample=bands.filter((_,i)=>i%step===0).slice(0,maxSegments);if(sample[sample.length-1]!==bands[bands.length-1])sample[sample.length-1]=bands[bands.length-1];const first=bands[0],last=bands[bands.length-1],start=Number.isFinite(first.epochMs)?first.epochMs:localTimestampValue(first.timestamp),end=Number.isFinite(last.epochMs)?last.epochMs:localTimestampValue(last.timestamp),hours=Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.round((end-start)/36e5)):0,horizon=hours>=48?`J+${Math.max(1,Math.round(hours/24))}`:`+${hours} h`,percentLabel=b=>Number.isFinite(b?.percent)?`${Math.round(b.percent)}%`:'—',agreementLabel=b=>Number.isFinite(b?.percent)?t('agreementAt',{time:b.timestamp,percent:Math.round(b.percent),models:modelCountLabel(b.modelCount)}):`${timeLabel(b.timestamp)} · ${t('agreement')} ${t('unavailable')} · ${modelCountLabel(b.modelCount)}`;
  return `<div class="agreement-timeline" aria-label="${esc(t('agreementEvolutionAria'))}"><div class="agreement-timeline-head"><div><strong>${esc(t('agreementOverTime'))}</strong><span>${esc(t('agreementColorExplanation'))}</span></div><div class="agreement-level-legend"><span class="high"><i></i>${esc(t('levelHigh'))}</span><span class="medium"><i></i>${esc(t('levelMedium'))}</span><span class="low"><i></i>${esc(t('levelLow'))}</span></div></div><div class="agreement-strip">${sample.map(b=>`<button type="button" class="${confidenceClass(b.percent)}" data-agreement-time="${attr(b.timestamp)}" ${Number.isFinite(b.epochMs)?`data-agreement-epoch="${b.epochMs}"`:''} aria-label="${esc(agreementLabel(b))}" title="${esc(agreementLabel(b))}"></button>`).join('')}</div><div class="agreement-strip-labels"><span>${esc(t('now'))} <strong class="confidence ${confidenceClass(first.percent)}">${percentLabel(first)}</strong> · ${modelCountLabel(first.modelCount)}</span><span>${horizon} <strong class="confidence ${confidenceClass(last.percent)}">${percentLabel(last)}</strong> · ${modelCountLabel(last.modelCount)}</span></div></div>`;
}

function renderTableLegend(tab,mode,normals=null){
  const {t}=i18n();
  if(tab==='CONDITIONS')return `<div class="table-legend weather-legend"><span>☀ ${esc(t('legendSun'))}</span><span>🌤 ${esc(t('legendPartlyCloudy'))}</span><span>☁ ${esc(t('legendOvercast'))}</span><span>🌧 ${esc(t('legendRain'))}</span><span>❄ ${esc(t('legendSnow'))}</span><span>⛈ ${esc(t('legendStorm'))}</span><small>${esc(t('conditionsLegendNote'))}</small></div>`;
  if(tab==='TEMPERATURE'&&mode==='HOURLY')return heatmapLegend(['#0d47a1','#1565c0','#1e88e5','#4fc3f7','#b3e5fc','#dcedc8','#fff59d','#ffb74d','#ff7043','#c62828'],['<-10','-10','-5','0','5','10','15','20','25','≥30°'],t('hourlyTemperatureLegend'));
  if(tab==='TEMPERATURE'&&mode==='DAILY'&&normals)return `<div class="table-legend chips-legend"><span><i style="--legend:#e53935"></i>${esc(t('aboveNormal'))}</span><span><i style="--legend:#1e88e5"></i>${esc(t('belowNormal'))}</span><span><i class="legend-neutral"></i>${esc(t('nearNormal'))}</span><small>${esc(t('era5Reference'))}</small></div>`;
  if(tab==='TEMPERATURE'&&mode==='DAILY')return `<div class="table-legend"><span>${esc(t('dailyTempNoNormals'))}</span></div>`;
  if(tab==='PRECIPITATION'&&mode==='HOURLY')return heatmapLegend(['#e3f2fd','#bbdefb','#90caf9','#64b5f6','#42a5f5','#2196f3','#1e88e5','#1976d2','#1565c0','#0d47a1'],['.05','.1','.2','.5','1','2','3','5','7','≥10 mm'],t('hourlyPrecipLegend'));
  if(tab==='PRECIPITATION')return `<div class="table-legend chips-legend"><span><i style="--legend:#4fc3f7"></i>${esc(t('lightRain'))}</span><span><i style="--legend:#1e88e5"></i>${esc(t('moderateRain'))}</span><span><i style="--legend:#1565c0"></i>${esc(t('strongRain'))}</span><span><i style="--legend:#0d47a1"></i>${esc(t('veryStrongRain'))}</span><small>${esc(t('dailyRainProbabilityLegend'))}</small></div>`;
  if(tab==='WIND'&&mode==='HOURLY')return heatmapLegend(['#fff9c4','#fff176','#ffeb3b','#ffca28','#ffb74d','#ff9800','#fb8c00','#f57c00','#e64a19','#c62828'],['20','30','40','50','60','70','80','90','100','≥120 km/h'],t('hourlyWindLegend'));
  return `<div class="table-legend chips-legend"><span><i style="--legend:#ffb74d"></i>${esc(t('lightWind'))}</span><span><i style="--legend:#fb8c00"></i>${esc(t('moderateWind'))}</span><span><i style="--legend:#e64a19"></i>${esc(t('strongWind'))}</span><span><i style="--legend:#c62828"></i>${esc(t('stormWind'))}</span><small>${esc(t('windLegendNote'))}</small></div>`;
}

function heatmapLegend(colors,labels,title){
  return `<div class="table-legend heatmap-legend"><div class="legend-title">${esc(title)}</div><div class="heatmap-scale">${colors.map((c,i)=>`<span style="--legend:${c}"><i></i><small>${esc(labels[i])}</small></span>`).join('')}</div></div>`;
}

function renderBandChart(bands,metric,normals){
  if(bands.length<2)return `<div class="empty-state" style="padding:28px">${esc(i18n().t('webNoBand'))}</div>`;
  const {t}=i18n(),width=940,height=326,pad={l:62,r:24,t:30,b:54},unit=chartMetricUnit(metric),digits=chartMetricDigits(metric);let ys=bands.flatMap(x=>[x.minValue,x.maxValue,x.meanValue]);
  if(metric==='TEMPERATURE'&&normals){for(const b of bands){const n=normals[b.timestamp.slice(5,10)];if(n)ys.push(n.tempMaxNormal,n.tempMinNormal);}}
  const scale=chartScale(ys,{includeZero:metric!=='TEMPERATURE',ticks:6,minSpan:metric==='TEMPERATURE'?2:1,padding:.06}),x=i=>pad.l+i*(width-pad.l-pad.r)/(bands.length-1),y=v=>pad.t+(scale.max-v)*(height-pad.t-pad.b)/(scale.max-scale.min);
  const upper=bands.map((b,i)=>[x(i),y(b.maxValue)]),lower=bands.map((b,i)=>[x(i),y(b.minValue)]),mean=bands.map((b,i)=>[x(i),y(b.meanValue)]);
  const rangeSegments=bands.slice(0,-1).map((b,i)=>{const next=bands[i+1],agreementValues=[b.percent,next.percent].filter(Number.isFinite),percent=agreementValues.length?agreementValues.reduce((a,v)=>a+v,0)/agreementValues.length:null,level=Number.isFinite(percent)?confidenceClass(percent):'unknown',points=`${x(i)},${y(b.maxValue)} ${x(i+1)},${y(next.maxValue)} ${x(i+1)},${y(next.minValue)} ${x(i)},${y(b.minValue)}`;return `<polygon class="chart-band-segment ${level}" points="${points}"><title>${esc(timeLabel(b.timestamp))} → ${esc(timeLabel(next.timestamp))} · ${esc(t('agreement'))} ${Number.isFinite(percent)?Math.round(percent)+'%':t('unavailable')}</title></polygon>`;}).join('');
  let normalsSvg='';if(metric==='TEMPERATURE'&&normals){const maxPts=[],minPts=[];bands.forEach((b,i)=>{const n=normals[b.timestamp.slice(5,10)];if(n){maxPts.push([x(i),y(n.tempMaxNormal)]);minPts.push([x(i),y(n.tempMinNormal)]);}});if(maxPts.length>1)normalsSvg=`<path class="chart-normal-max" d="${svgLinePath(maxPts)}"/><path class="chart-normal-min" d="${svgLinePath(minPts)}"/>`;}
  const yGrid=scale.ticks.map(val=>{const yy=y(val);return `<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}"/><text class="chart-axis" x="${pad.l-10}" y="${yy+4}" text-anchor="end">${fmt(val,digits)}</text>`;}).join('');
  const xTickIdx=chartTickIndices(bands.length,7),xGrid=xTickIdx.map(i=>`<line class="chart-grid vertical" x1="${x(i)}" y1="${pad.t}" x2="${x(i)}" y2="${height-pad.b}"/><text class="chart-axis" x="${x(i)}" y="${height-19}" text-anchor="middle">${esc(bands[i].timestamp.slice(5,10))}</text><text class="chart-axis secondary" x="${x(i)}" y="${height-7}" text-anchor="middle">${esc(timeLabel(bands[i].timestamp))}</text>`).join('');
  const pointStep=Math.max(1,Math.ceil(bands.length/36)),points=bands.map((b,i)=>i%pointStep===0||i===bands.length-1?`<circle class="chart-point mean" cx="${x(i)}" cy="${y(b.meanValue)}" r="4"><title>${esc(dateLabel(b.timestamp.slice(0,10),i18n().locale))} ${esc(timeLabel(b.timestamp))} · ${esc(t('centralForecastLine',{unit}))} ${fmt(b.meanValue,digits)} ${unit} · ${esc(t('agreement'))} ${Number.isFinite(b.percent)?Math.round(b.percent)+'%':'—'}</title></circle>`:'').join('');
  const hoverValues=bands.map(b=>[Number.isFinite(b.meanValue)?b.meanValue:null,Number.isFinite(b.minValue)?b.minValue:null,Number.isFinite(b.maxValue)?b.maxValue:null,Number.isFinite(b.percent)?b.percent:null,Number.isFinite(b.modelCount)?b.modelCount:null]);
  return `<div class="chart-pro hover-chart-shell agreement-band-hover"><div class="chart-pro-head"><div class="chart-stat"><span>${esc(t('centralForecastLine',{unit}))}</span><strong data-band-hover-mean>—</strong></div><div class="chart-stat"><span>${esc(t('chartRange'))}</span><strong data-band-hover-range>—</strong></div><div class="chart-stat compact"><span>${esc(t('agreement'))}</span><strong class="confidence" data-band-hover-agreement>—</strong><small data-band-hover-models></small></div></div><svg class="chart" data-hover-chart="agreement-band" data-hover-keys="${attr(JSON.stringify(bands.map(b=>b.timestamp)))}" data-hover-values="${attr(JSON.stringify(hoverValues))}" data-hover-mode="HOURLY" data-hover-unit="${attr(unit)}" data-hover-digits="${digits}" data-plot-left="${pad.l}" data-plot-right="${width-pad.r}" data-plot-top="${pad.t}" data-plot-bottom="${height-pad.b}" data-scale-min="${scale.min}" data-scale-max="${scale.max}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t('agreementBandAria'))}"><rect class="chart-plot-bg" x="${pad.l}" y="${pad.t}" width="${width-pad.l-pad.r}" height="${height-pad.t-pad.b}" rx="9"/>${yGrid}${xGrid}<text class="chart-axis-unit" x="${pad.l}" y="${pad.t-11}">${unit}</text>${rangeSegments}<path class="chart-range-edge" d="${svgLinePath(upper)}"/><path class="chart-range-edge" d="${svgLinePath(lower)}"/><path class="chart-line" d="${svgLinePath(mean)}"/>${normalsSvg}${points}<line class="chart-hover-crosshair" data-hover-crosshair x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height-pad.b}"/><circle class="chart-hover-marker mean" data-hover-marker="0" cx="${pad.l}" cy="${pad.t}" r="5"/><circle class="chart-hover-marker range-min" data-hover-marker="1" cx="${pad.l}" cy="${pad.t}" r="4"/><circle class="chart-hover-marker range-max" data-hover-marker="2" cx="${pad.l}" cy="${pad.t}" r="4"/></svg><div class="chart-hover-status" data-hover-status>${esc(t('chartHoverHint'))}</div></div>`;
}

function evolutionVariableMeta(){const {t}=i18n();return {temperature:{label:t('temperature'),unit:' °C',icon:'🌡️'},precipitation:{label:t('precipitation'),unit:' mm',icon:'☂️'},wind:{label:t('wind'),unit:' km/h',icon:'💨'}};}
function evolutionTrendClass(trend){return trend==='INCREASING'?'up':trend==='DECREASING'?'down':trend==='VOLATILE'?'volatile':'stable';}
function renderEvolutionTrajectory(e,unit){
  const {t}=i18n(),history=[...(e.previous||[])].sort((a,b)=>b.ageHours-a.ageHours).map(p=>({ageHours:p.ageHours,value:p.median,label:`H−${p.ageHours}`}));
  const points=[...history,{ageHours:0,value:e.currentMedian,label:t('current')}].filter(p=>Number.isFinite(p.value));
  if(points.length<2)return `<div class="evolution-no-track">${esc(t('evolutionNoTrack'))}</div>`;
  const width=410,height=86,pad={l:10,r:10,t:11,b:22},values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,Math.abs(max||1)*.02,.8),lo=min-span*.18,hi=max+span*.18;
  const x=i=>pad.l+i*(width-pad.l-pad.r)/Math.max(1,points.length-1),y=v=>pad.t+(hi-v)*(height-pad.t-pad.b)/(hi-lo),coords=points.map((p,i)=>[x(i),y(p.value)]),path=svgLinePath(coords);
  const nodes=points.map((p,i)=>`<g><circle class="evolution-track-point ${i===points.length-1?'current':''}" cx="${x(i)}" cy="${y(p.value)}" r="${i===points.length-1?4.5:3.5}"><title>${esc(p.label)} · ${fmt(p.value,1)}${unit}</title></circle><text class="evolution-track-label" x="${x(i)}" y="${height-5}" text-anchor="middle">${esc(p.label)}</text></g>`).join('');
  return `<svg class="evolution-track" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(t('evolutionTrajectoryAria'))}"><line class="evolution-track-guide" x1="${pad.l}" y1="${height-pad.b}" x2="${width-pad.r}" y2="${height-pad.b}"/><path class="evolution-track-line" d="${path}"/>${nodes}</svg>`;
}
function renderEvolutionSection(report){
  const {t}=i18n();if(!report.days?.length)return `<section class="section" id="evolution"><div class="section-card"><div class="section-head"><div><h2>${esc(t('evolution'))}</h2><p>${esc(t('forecast_evolution_subtitle'))}</p></div></div><div class="banner info">${esc(t('evolutionNoPoints'))}</div></div></section>`;
  const meta=evolutionVariableMeta(),available=Object.keys(meta).filter(v=>report.days.some(d=>d.variables?.[v])),selected=available.includes(state.evolutionVariable)?state.evolutionVariable:available[0];state.evolutionVariable=selected;
  const m=meta[selected],rows=report.days.filter(d=>d.variables?.[selected]).slice(0,7).map(day=>{const e=day.variables[selected],delta=e.medianDelta,sign=delta>0?'+':'',trend=trendText(e.trend,delta,m.unit);return `<div class="evolution-row"><div class="evolution-row-date"><strong>${esc(dateLabel(day.date,i18n().locale))}</strong><span>${esc(t('modelsCompared',{count:e.comparedModels}))}</span></div><div class="evolution-row-chart">${renderEvolutionTrajectory(e,m.unit)}</div><div class="evolution-row-now"><span>${esc(t('current'))}</span><strong>${fmt(e.currentMedian,1)}${m.unit}</strong><small class="evolution-trend ${evolutionTrendClass(e.trend)}">${esc(trend)}</small><span class="evolution-delta">${esc(t('evolutionRevision',{value:`${sign}${fmt(delta,1)}${m.unit}`}))}</span></div></div>`;}).join('');
  return `<section class="section" id="evolution"><div class="section-card evolution-panel"><div class="section-head"><div><h2>${esc(t('evolution'))}</h2><p>${esc(t('forecast_evolution_subtitle'))}</p></div></div><div class="evolution-toolbar"><div class="segmented evolution-variable-tabs" aria-label="${attr(t('evolutionVariableAria'))}">${available.map(v=>`<button class="seg-btn ${selected===v?'active':''}" data-evolution-variable="${attr(v)}">${meta[v].icon} ${esc(meta[v].label)}</button>`).join('')}</div><span class="small">${esc(t('evolutionTimelineHint'))}</span></div><div class="evolution-table-head"><span>${esc(t('day'))}</span><span>${esc(t('evolutionForecastHistory'))}</span><span>${esc(t('current'))}</span></div><div class="evolution-list">${rows}</div></div></section>`;
}

function trendText(trend,delta,unit){const {t}=i18n(),sign=delta>0?'+':'',value=`${sign}${fmt(delta,1)}${unit}`;return t({INCREASING:'increasing',DECREASING:'decreasing',STABLE:'stable',VOLATILE:'volatile'}[trend]||'stable',{delta:value});}

function reliabilitySummaryRanking(cityId,variable){
  const histories=biasHistoriesByModel(cityId,variable),cohort=comparableBiasCohort(histories);
  const ids=cohort?.ids?.length?cohort.ids:Object.keys(histories).filter(id=>(histories[id]||[]).length>=BIAS_MIN_SAMPLES);
  return ids.map(modelId=>{
    const samples=(histories[modelId]||[]).filter(x=>!cohort||cohort.dates.has(x.date)),reliability=computeLocalReliability(variable,samples,30);
    if(!reliability)return null;
    return {modelId,reliability,bias:{ready:true,sampleSize:reliability.sampleSize,meanBias:reliability.meanBias,stdDev:reliability.standardDeviation}};
  }).filter(Boolean).sort((a,b)=>b.reliability.score-a.reliability.score||a.reliability.meanAbsoluteError-b.reliability.meanAbsoluteError||(getModel(a.modelId)?.name||a.modelId).localeCompare(getModel(b.modelId)?.name||b.modelId));
}
function renderReliabilitySection(city,biases){
  const {t}=i18n(),vars=[['TEMPERATURE','🌡️',t('temperature'),' °C'],['PRECIPITATION','☂️',t('precipitation'),' mm'],['WIND_SPEED','💨',t('wind'),' km/h']],availableKeys=vars.map(x=>x[0]),selected=availableKeys.includes(state.reliabilityVariable)?state.reliabilityVariable:'TEMPERATURE';state.reliabilityVariable=selected;
  const selectedMeta=vars.find(x=>x[0]===selected),[,ico,label,unit]=selectedMeta,allRanks=Object.fromEntries(vars.map(([key])=>[key,reliabilitySummaryRanking(city.id,key)])),rank=allRanks[selected]||[],any=Object.values(allRanks).some(x=>x.length);
  const rows=rank.map((x,i)=>`<button type="button" class="reliability-rank-row" data-bias-model="${attr(x.modelId)}" data-bias-variable="${attr(selected)}" data-bias-city="${attr(city.id)}" aria-label="${attr(t('openReliability',{model:getModel(x.modelId)?.name||x.modelId,variable:label}))}"><span class="rank-number">${i+1}</span><span class="rank-model"><b>${esc(getModel(x.modelId)?.name||x.modelId)}</b><span class="cell-sub">${esc(t('daysCount',{count:x.bias.sampleSize}))}</span></span><span class="reliability-score"><b>${x.reliability.score}</b><small>/100</small><em>${esc(reliabilityLevelLabel(x.reliability.level))}</em></span>${renderBiasChip(x.bias,selected,unit)}<span class="rank-chevron" aria-hidden="true">›</span></button>`).join('');
  return `<section class="section" id="reliability"><div class="section-card reliability-compact"><div class="section-head"><div><h2>${esc(t('reliability'))}</h2><p>${esc(t('localReliabilityIntro'))}</p></div><div class="reliability-summary-count">${rank.length?esc(modelCountLabel(rank.length)):''}</div></div>${!any?`<div class="banner info">${esc(t('noReadyBias'))} ${esc(t('atLeast14Days'))}</div>`:''}<div class="reliability-toolbar"><div class="segmented" aria-label="${attr(t('reliabilityVariableAria'))}">${vars.map(([key,vico,vlabel])=>`<button class="seg-btn ${selected===key?'active':''}" data-reliability-variable="${attr(key)}">${vico} ${esc(vlabel)}${allRanks[key].length?` <span>${allRanks[key].length}</span>`:''}</button>`).join('')}</div><span class="small">${esc(t('reliabilityCompactHint'))}</span></div>${rank.length?`<div class="reliability-table-head"><span>#</span><span>${esc(t('models'))}</span><span>${esc(t('reliabilityScoreShort'))}</span><span>${esc(t('biasMean'))}</span><span></span></div><div class="reliability-rank-list">${rows}</div>`:`<div class="small reliability-empty">${esc(t('noReadyBias'))}</div>`}</div></section>`;
}

function biasSignificance(bias,variable){if(!bias?.ready)return 'NONE';const a=Math.abs(bias.meanBias),ratio=bias.stdDev>0?a/bias.stdDev:Infinity;const th=variable==='TEMPERATURE'?[.3,1]:variable==='PRECIPITATION'?[.5,2]:[3,8];if(a>=th[1]&&ratio>=1)return 'HIGH';if(a>=th[0]&&ratio>=.5)return 'MODERATE';return 'LOW';}
function renderBiasChip(bias,variable,unit){const {t}=i18n();if(!bias?.ready)return `<span class="bias-chip pending">${bias?.sampleSize||0}/14 ${esc(t('dayShort'))}</span>`;const sig=biasSignificance(bias,variable),sign=bias.meanBias>0?'+':'';return `<span class="bias-chip confidence ${sig==='HIGH'?'low':sig==='MODERATE'?'medium':'high'}" title="${attr(t('biasStdDevTitle',{value:`${fmt(bias.stdDev,1)}${unit}`}))}">${sign}${fmt(bias.meanBias,1)}${unit}</span>`;}

function tableBiasVariable(tab){return tab==='TEMPERATURE'?'TEMPERATURE':tab==='PRECIPITATION'?'PRECIPITATION':tab==='WIND'?'WIND_SPEED':null;}
function biasUnit(variable){return variable==='TEMPERATURE'?' °C':variable==='PRECIPITATION'?' mm':' km/h';}
function renderTableBiasChip(bias,modelId,variable,cityId){
  const {t}=i18n();if(!variable)return '';const model=getModel(modelId);if(model?.supportsDay1Bias===false)return `<span class="bias-chip pending bias-unavailable" title="${attr(t('day1BiasUnavailableHelp'))}">${esc(t('day1BiasUnavailable'))}</span>`;const samples=bias?.sampleSize||0;
  if(!bias?.ready)return `<button type="button" class="bias-chip bias-chip-button pending table-bias-chip" data-bias-model="${attr(modelId)}" data-bias-variable="${attr(variable)}" data-bias-city="${attr(cityId)}" title="${attr(t('openCalibration',{count:samples}))}"><span>${esc(t('calibration',{count:samples}).split(' ')[0])}</span><small>${samples}/14 ${esc(t('dayShort'))}</small></button>`;
  const sig=biasSignificance(bias,variable),sign=bias.meanBias>0?'+':'',unit=biasUnit(variable),value=`${sign}${fmt(bias.meanBias,1)}${unit}`;
  return `<button type="button" class="bias-chip bias-chip-button table-bias-chip confidence ${sig==='HIGH'?'low':sig==='MODERATE'?'medium':'high'}" data-bias-model="${attr(modelId)}" data-bias-variable="${attr(variable)}" data-bias-city="${attr(cityId)}" title="${attr(t('openBias',{value:`${fmt(bias.stdDev,1)}${unit}`}))}">${esc(t('biasLabel',{value}))}</button>`;
}

function renderForecastModelHeader(modelId,tab,biases,cityId,showFamily=false){
  const {t}=i18n(),m=getModel(modelId),variable=tableBiasVariable(tab),bias=variable?biases?.[modelId]?.[variable]:null,forecast=state.forecasts[cityId],run=modelRunInfo(forecast,modelId,tab),partial=forecast?.modelMeta?.[modelId]?.dataWarning==='PARTIAL_HOURLY_SERIES';
  return `<span class="model-header-stack"${variable?' data-has-bias="true"':''}><span class="model-header-slot"><span class="model-header">${esc(m?.name||modelId)}</span></span><span class="model-description-slot"><span class="model-meta cell-sub">${m?.resolutionKm||'?'} km${showFamily?` · ${esc(m?.family||'')}`:''}</span></span><span class="model-run-slot"><span class="model-run ${run.older?'stale':''}" title="${esc(run.coverage)}">${esc(run.label)}${run.older?esc(t('olderRunSuffix')):''}</span></span><span class="model-warning-slot">${partial?`<span class="model-data-warning" title="${attr(t('partialHourlyDataTitle'))}">${esc(t('partialHourlyData'))}</span>`:''}</span>${variable?`<span class="model-bias-slot">${renderTableBiasChip(bias,modelId,variable,cityId)}</span>`:''}</span>`;
}

function renderDetailedComparison(f,biases){
  const {t}=i18n(),mode=state.settings.detailViewMode||'DAILY',tab=state.settings.detailTab||'CONDITIONS',normals=state.normals[f.city.id]?.normals||null,tabs=[['CONDITIONS',t('conditions')],['TEMPERATURE',t('temperature')],['PRECIPITATION',t('precipitation')],['WIND',t('wind')]];
  return `<section class="section" id="details"><div class="section-card detailed-card"><div class="section-head"><div><h2>${esc(t('detailedComparison'))}</h2><p>${esc(t('webDetailedDesc'))}</p></div><div class="section-actions"><button class="btn subtle" data-export-format="csv">${esc(t('exportCsv'))}</button><button class="btn subtle" data-export-format="json">${esc(t('exportJson'))}</button></div></div><div class="comparison-toolbar"><div class="segmented">${[['DAILY',t('daily')],['HOURLY',t('hourly')]].map(([id,l])=>`<button class="seg-btn ${mode===id?'active':''}" data-detail-mode="${id}">${esc(l)}</button>`).join('')}</div><div class="segmented">${tabs.map(([id,l])=>`<button class="seg-btn ${tab===id?'active':''}" data-detail-tab="${id}">${esc(l)}</button>`).join('')}</div></div>${renderTargetedModelComparison(f,tab,mode)}${renderTableLegend(tab,mode,normals)}${mode==='DAILY'?renderDailyTable(f,tab,biases,normals):renderHourlyTable(f,tab,biases)}</div></section>`;
}

function renderTargetedModelComparison(f,tab,mode){
  if(!lazyFeatures.comparison){void loadFeature('comparison').then(()=>{if(state.route.name==='city'&&state.forecasts[state.route.id]===f)rerenderCitySectionOrPage('details');});return `<div class="feature-inline-loading"><span class="loader small"></span>${esc(i18n().t('loadingComparisonModule'))}</div>`;}
  return lazyFeatures.comparison.renderTargetedModelComparison(f,tab,mode,comparisonRenderContext());
}

function csvCell(v){const text=v==null?'':String(v);return /[";,\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function downloadText(filename,text,type){
  try{const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(i18n().t('exportPrepared',{file:filename}));}catch(err){toast(i18n().t('exportImpossible',{error:humanError(err)}));}
}
function buildExportRows(cityId){
  const f=state.forecasts[cityId];if(!f)return [];
  const mode=state.settings.detailViewMode||'DAILY',biases=cachedBiases(f,state.bias[cityId]||{forecasts:[],observations:[]},cityToday(f.city.timezone)),rows=[],bands=Object.fromEntries(['TEMPERATURE','PRECIPITATION','WIND'].map(metric=>[metric,cachedBand(f,metric,168)])),bandMaps=Object.fromEntries(Object.entries(bands).map(([metric,list])=>[metric,new Map(list.map(b=>[Number.isFinite(b.epochMs)?b.epochMs:b.timestamp,b.percent]))]));
  const anchorLocal=roundedHourLocal(f.city.timezone),anchorEpoch=zonedLocalTimestampEpoch(anchorLocal,f.city.timezone,Date.now());
  for(const modelId of visibleModelIds(f)){
    const s=f.seriesByModel[modelId],m=getModel(modelId);
    if(mode==='HOURLY'){
      const epochs=Array.isArray(s.hourly.timestampEpochMs)&&s.hourly.timestampEpochMs.length===s.hourly.timestamps.length?s.hourly.timestampEpochMs:zonedTimestampEpochs(s.hourly.timestamps,f.city.timezone),indices=s.hourly.timestamps.map((ts,i)=>({ts,i,epochMs:epochs[i]})).filter(x=>Number.isFinite(x.epochMs)&&x.epochMs>=anchorEpoch).slice(0,168);
      for(const {ts,i,epochMs} of indices)rows.push({time:ts,epochMs,modelId,model:m?.name||modelId,temperature:s.hourly.temperature2m[i],precipitation:s.hourly.precipitation[i],precipProbability:s.hourly.precipitationProbability[i],wind:s.hourly.windSpeed10m[i],gust:s.hourly.windGusts10m[i],condition:fromWmoCode(s.hourly.weatherCode[i]),temperatureAgreement:bandMaps.TEMPERATURE.get(epochMs)??bandMaps.TEMPERATURE.get(ts),precipitationAgreement:bandMaps.PRECIPITATION.get(epochMs)??bandMaps.PRECIPITATION.get(ts),windAgreement:bandMaps.WIND.get(epochMs)??bandMaps.WIND.get(ts),temperatureBias:biases?.[modelId]?.TEMPERATURE?.meanBias,precipitationBias:biases?.[modelId]?.PRECIPITATION?.meanBias,windBias:biases?.[modelId]?.WIND_SPEED?.meanBias});
    }else{
      for(let i=0;i<s.daily.dates.length;i++){const date=s.daily.dates[i],conf=dayConfidence(f,date),status=metric=>s.daily.completeness?.[metric]?.[i]?.status||'UNKNOWN';rows.push({time:date,modelId,model:m?.name||modelId,tempMin:s.daily.tempMin[i],tempMax:s.daily.tempMax[i],precipitation:s.daily.precipitationSum[i],precipProbability:s.daily.precipitationProbabilityMax[i],wind:s.daily.windSpeedMax[i],gust:s.daily.windGustsMax[i],condition:dailyCondition(s,date).condition,temperatureCompleteness:status('temperature'),precipitationCompleteness:status('precipitation'),windCompleteness:status('wind'),conditionCompleteness:status('condition'),agreement:conf?.overallPercent,temperatureAgreement:conf?.tempMax?.percent,precipitationAgreement:conf?.precipitation?.percent,windAgreement:conf?.windMax?.percent,temperatureBias:biases?.[modelId]?.TEMPERATURE?.meanBias,precipitationBias:biases?.[modelId]?.PRECIPITATION?.meanBias,windBias:biases?.[modelId]?.WIND_SPEED?.meanBias});}
    }
  }
  return rows;
}
function exportCityData(cityId,format){
  const city=state.cities.find(c=>c.id===cityId),f=state.forecasts[cityId];if(!city||!f){toast(i18n().t('nothingToExport'));return;}const rows=buildExportRows(cityId),stamp=new Date().toISOString().slice(0,10),base=`meteocompare-${city.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-')}-${stamp}`;
  if(format==='json'){const payload={exportedAt:new Date().toISOString(),city,view:{mode:state.settings.detailViewMode,tab:state.settings.detailTab,metric:state.settings.confidenceMetric,horizon:state.settings.chartHorizon,compareModels:state.compareModelIds},forecast:f,agreement:{temperature:cachedBand(f,'TEMPERATURE',168),precipitation:cachedBand(f,'PRECIPITATION',168),wind:cachedBand(f,'WIND',168)},bias:state.bias[cityId],rows};downloadText(`${base}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');return;}
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))],csv=[keys.map(csvCell).join(';'),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(';'))].join('\n');downloadText(`${base}.csv`,csv,'text/csv;charset=utf-8');
}

function seriesIndexes(series){
  let cached=seriesIndexCache.get(series);
  if(!cached){const ts=series.hourly.timestamps||[],epochs=Array.isArray(series.hourly.timestampEpochMs)&&series.hourly.timestampEpochMs.length===ts.length?series.hourly.timestampEpochMs:[];cached={hourly:new Map(ts.map((value,i)=>[value,i])),hourlyEpoch:new Map(epochs.map((value,i)=>[value,i]).filter(([value])=>Number.isFinite(value))),daily:new Map(series.daily.dates.map((date,i)=>[date,i]))};seriesIndexCache.set(series,cached);}
  return cached;
}
function visibleModelIds(f){const c=viewCache(f);if(!c.visibleModelIds)c.visibleModelIds=Object.keys(f.seriesByModel||{}).sort((a,b)=>(getModel(a)?.resolutionKm||999)-(getModel(b)?.resolutionKm||999));return c.visibleModelIds;}
function renderDailyTable(f,tab,biases,normals=null){
  const {t}=i18n(),ids=visibleModelIds(f),today=cityToday(f.city.timezone),dates=[...new Set(ids.flatMap(id=>f.seriesByModel[id].daily.dates))].filter(d=>d>=today).sort().slice(0,7);
  return `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>${esc(t('day'))}</th>${ids.map(id=>{const m=getModel(id);return `<th title="${m?.family||''} · ${m?.resolutionKm||'?'} km">${renderForecastModelHeader(id,tab,biases,f.city.id||state.route.id,true)}</th>`;}).join('')}</tr></thead><tbody>${dates.map(date=>`<tr class="${date===today?'current':''}"><td><strong>${esc(dateLabel(date,i18n().locale,'long'))}</strong>${date===today?`<span class="cell-sub">${esc(t('currentDay'))}</span>`:''}</td>${ids.map(id=>renderDailyCell(f.seriesByModel[id],date,tab,biases?.[id],normals?.[date.slice(5)])).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function dailyCellCompleteness(s,i,tab){const metric=tab==='TEMPERATURE'?'temperature':tab==='PRECIPITATION'?'precipitation':tab==='WIND'?'wind':'condition';return s?.daily?.completeness?.[metric]?.[i]||null;}
function dailyPartialNote(info){if(info?.status!=='PARTIAL')return '';const {t}=i18n(),available=Number(info.availableHours)||0,expected=Number(info.expectedHours)||24;return `<span class="cell-sub partial-day-note" title="${attr(t('partialDayValueTitle',{available,expected}))}">◐ ${esc(t('partialDayValue',{available,expected}))}</span>`;}

function renderDailyCell(s,date,tab,modelBias,normal=null){
  const i=seriesIndexes(s).daily.get(date)??-1;if(i<0)return '<td class="no-data">—</td>';const partial=dailyPartialNote(dailyCellCompleteness(s,i,tab));
  if(tab==='CONDITIONS'){const x=dailyCondition(s,date),ci=localizedConditionInfo(x.condition),prob=s.daily.precipitationProbabilityMax[i],cloud=dailyCloudCoverMean(s,date);const isWet=['RAIN','RAIN_SHOWERS','THUNDERSTORM','FREEZING_RAIN','SNOW','SNOW_SHOWERS'].includes(x.condition);const badge=isWet?(Number.isFinite(prob)?prob+'%':null):(['PARTLY_CLOUDY','OVERCAST'].includes(x.condition)&&Number.isFinite(cloud)?cloud+'%':null);return `<td title="${esc(ci.label)}${x.inferred?' · '+i18n().t('conditionInferred'):''}">${conditionMarkup(x.condition,'small',x.inferred)}<span class="condition-label">${esc(ci.label)}</span>${badge?`<span class="cell-sub">${badge}</span>`:''}${partial}</td>`;}
  if(tab==='TEMPERATURE'){const max=s.daily.tempMax[i],min=s.daily.tempMin[i];const maxClass=temperatureNormalClass(max,normal?.tempMaxNormal),minClass=temperatureNormalClass(min,normal?.tempMinNormal);return `<td class="normal-temp-cell"><span class="${maxClass}">${Number.isFinite(max)?fmt(max,1)+'°':'—'}</span><span class="temp-separator"> / </span><span class="${minClass}">${Number.isFinite(min)?fmt(min,1)+'°':'—'}</span>${partial}</td>`;}
  if(tab==='PRECIPITATION'){const p=s.daily.precipitationSum[i],prob=s.daily.precipitationProbabilityMax[i];const style=Number.isFinite(p)?dailyIntensityStyle('PRECIPITATION',p):'';return `<td class="heatmap-data-cell" ${style}>${Number.isFinite(p)?fmt(p,1)+' mm':'—'}${Number.isFinite(prob)?`<span class="cell-sub" title="${attr(i18n().t('maxProbabilityTitle'))}">${esc(i18n().t('maxProbability',{value:prob}))}</span>`:''}${partial}</td>`;}
  const w=s.daily.windSpeedMax[i],g=s.daily.windGustsMax[i],dir=s.daily.windDirection10mDominant[i],arrow=windArrow(dir,w);const style=Number.isFinite(w)?dailyIntensityStyle('WIND',w):'';return `<td class="heatmap-data-cell" ${style}>${Number.isFinite(w)?fmt(w)+' km/h':'—'} ${arrow?`<span class="wind-arrow" style="transform:rotate(${arrow.deg}deg)">${arrow.char}</span>`:''}${Number.isFinite(dir)?`<span class="cell-sub">${esc(localizedWindDirection(dir))}${Number.isFinite(g)?` · ${esc(i18n().t('gustAbbr'))} ${fmt(g)}`:''}</span>`:''}${partial}</td>`;
}

function temperatureNormalClass(value,normal){if(!Number.isFinite(value)||!Number.isFinite(normal))return 'temp-normal';const d=value-normal;return d>2?'temp-above':d<-2?'temp-below':'temp-normal';}

function renderHourlyTable(f,tab,biases){
  const {t}=i18n(),ids=visibleModelIds(f),anchorLocal=roundedHourLocal(f.city.timezone),anchorEpoch=zonedLocalTimestampEpoch(anchorLocal,f.city.timezone,Date.now()),rowByEpoch=new Map();
  for(const id of ids){const h=f.seriesByModel[id].hourly,timestamps=h.timestamps||[],epochs=Array.isArray(h.timestampEpochMs)&&h.timestampEpochMs.length===timestamps.length?h.timestampEpochMs:zonedTimestampEpochs(timestamps,f.city.timezone);timestamps.forEach((ts,i)=>{const epochMs=epochs[i];if(Number.isFinite(epochMs)&&epochMs>=anchorEpoch&&!rowByEpoch.has(epochMs))rowByEpoch.set(epochMs,{ts,epochMs});});}
  const rows=[...rowByEpoch.values()].sort((a,b)=>a.epochMs-b.epochMs).slice(0,48),targetEpoch=rows[0]?.epochMs??null;
  return `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>${esc(t('hour'))}</th>${ids.map(id=>`<th>${renderForecastModelHeader(id,tab,biases,f.city.id||state.route.id,false)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="${row.epochMs===targetEpoch?'current':''}"><td><strong>${esc(row.ts.slice(5,10))}</strong><span class="cell-sub">${esc(timeLabel(row.ts))}${row.epochMs===targetEpoch?` · ${esc(t('nowSuffix'))}`:''}</span></td>${ids.map(id=>renderHourlyCell(f.seriesByModel[id],row,tab)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderHourlyCell(s,row,tab){
  const indexes=seriesIndexes(s),i=Number.isFinite(row?.epochMs)&&indexes.hourlyEpoch.has(row.epochMs)?indexes.hourlyEpoch.get(row.epochMs):(indexes.hourly.get(row?.ts)??-1);if(i<0)return '<td class="no-data">—</td>';
  if(tab==='CONDITIONS'){const x=hourlyCondition(s,i),c=x.condition,ci=localizedConditionInfo(c),pp=s.hourly.precipitationProbability[i],cl=s.hourly.cloudCover[i];return `<td title="${c?esc(ci.label):''}${x.inferred?' · '+esc(i18n().t('conditionInferred')):''}">${c?conditionMarkup(c,'small',x.inferred):'—'}${c?`<span class="condition-label">${esc(ci.label)}</span>`:''}${Number.isFinite(pp)?`<span class="cell-sub">☂ ${pp}%</span>`:Number.isFinite(cl)?`<span class="cell-sub">☁ ${cl}%</span>`:''}</td>`;}
  if(tab==='TEMPERATURE'){const v=s.hourly.temperature2m[i];return `<td class="heatmap-data-cell" ${Number.isFinite(v)?heatStyle('TEMPERATURE',v):''}>${Number.isFinite(v)?fmt(v,1)+' °C':'—'}</td>`;}
  if(tab==='PRECIPITATION'){const v=s.hourly.precipitation[i],pp=s.hourly.precipitationProbability[i];return `<td class="heatmap-data-cell" ${Number.isFinite(v)?heatStyle('PRECIPITATION',v):''}>${Number.isFinite(v)?fmt(v,1)+' mm':'—'}${Number.isFinite(pp)?`<span class="cell-sub">${pp}%</span>`:''}</td>`;}
  const w=s.hourly.windSpeed10m[i],g=s.hourly.windGusts10m[i],dir=s.hourly.windDirection10m[i],arrow=windArrow(dir,w);return `<td class="heatmap-data-cell" ${Number.isFinite(w)?heatStyle('WIND',w):''}>${Number.isFinite(w)?fmt(w)+' km/h':'—'} ${arrow?`<span class="wind-arrow" style="transform:rotate(${arrow.deg}deg)">${arrow.char}</span>`:''}${Number.isFinite(g)?`<span class="cell-sub">${esc(i18n().t('gustAbbr'))} ${fmt(g)} km/h</span>`:''}</td>`;
}


function biasVariableLabel(variable){const {t}=i18n();return variable==='TEMPERATURE'?t('temperature'):variable==='PRECIPITATION'?t('precipitation'):t('wind');}
function biasScale(variable){return variable==='TEMPERATURE'?{closeTolerance:1.5,maeScale:2.4,biasScale:1.2,spreadScale:3}:variable==='PRECIPITATION'?{closeTolerance:1,maeScale:3,biasScale:1.5,spreadScale:4}:{closeTolerance:5,maeScale:8,biasScale:5,spreadScale:10};}
function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function sampleStdDev(values,mean){if(values.length<=1)return 0;return Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/(values.length-1));}
function rawBiasSamples(cityId,modelId,variable,windowDays=30){
  const city=state.cities.find(c=>c.id===cityId),source=state.bias[cityId]||{forecasts:[],observations:[]};if(!city||source.reference!==BIAS_REFERENCE_ID)return [];
  const today=cityToday(city.timezone),end=addDays(today,-BIAS_REFERENCE_LAG_DAYS),start=addDays(end,-windowDays+1),obs=new Map();
  for(const o of source.observations||[])if(o.variable===variable&&o.targetDate>=start&&o.targetDate<=end&&Number.isFinite(o.value))obs.set(o.targetDate,o.value);
  const forecastByDate=new Map();
  for(const f of source.forecasts||[])if(f.modelId===modelId&&f.variable===variable&&f.targetDate>=start&&f.targetDate<=end&&Number.isFinite(f.value))forecastByDate.set(f.targetDate,f.value);
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
function reliabilityLevelLabel(level){const {t}=i18n();return t({EXCELLENT:'reliabilityExcellent',GOOD:'reliabilityGood',FAIR:'reliabilityFair',LIMITED:'reliabilityLimited'}[level]||'reliabilityLimited');}

function reliabilityLevelClass(level){return level==='EXCELLENT'?'high':level==='GOOD'?'high':level==='FAIR'?'medium':'low';}
function biasTrendLabel(r){const {t}=i18n();return t(r.trend==='IMPROVING'?'trendImproving':r.trend==='DECLINING'?'trendDeclining':r.trend==='STABLE'?'trendStable':'trendInsufficient');}

function formatBiasValue(value,variable,d=1){return `${fmt(value,d)}${biasUnit(variable)}`;}
function formatSignedBias(value,variable){return `${value>0?'+':''}${fmt(value,1)}${biasUnit(variable)}`;}
function biasDirectionText(r){const {t}=i18n();if(Math.abs(r.meanBias)<.05)return t('biasCalibrated');return t(r.meanBias>0?'biasOverestimate':'biasUnderestimate');}

function renderBiasHistoryChart(samples,variable){
  const {t}=i18n();if(samples.length<2)return `<div class="empty-state compact">${esc(t('biasNoHistory'))}</div>`;
  const width=980,height=350,pad={l:64,r:24,t:30,b:56},unit=biasUnit(variable).trim(),values=samples.flatMap(x=>[x.forecast,x.observation]),scale=chartScale(values,{includeZero:variable!=='TEMPERATURE',ticks:6,minSpan:variable==='TEMPERATURE'?2:variable==='PRECIPITATION'?1:5,padding:.07}),x=i=>pad.l+i*(width-pad.l-pad.r)/Math.max(1,samples.length-1),y=v=>pad.t+(scale.max-v)*(height-pad.t-pad.b)/(scale.max-scale.min);
  const yGrid=scale.ticks.map(value=>`<line class="bias-chart-grid" x1="${pad.l}" y1="${y(value)}" x2="${width-pad.r}" y2="${y(value)}"/><text class="bias-chart-axis" x="${pad.l-10}" y="${y(value)+4}" text-anchor="end">${fmt(value,variable==='PRECIPITATION'?1:0)}</text>`).join(''),tickIdx=chartTickIndices(samples.length,7),xGrid=tickIdx.map(i=>`<line class="bias-chart-grid vertical" x1="${x(i)}" y1="${pad.t}" x2="${x(i)}" y2="${height-pad.b}"/><text class="bias-chart-axis" x="${x(i)}" y="${height-18}" text-anchor="middle">${esc(samples[i].date.slice(5))}</text>`).join('');
  const forecastPts=samples.map((s,i)=>[x(i),y(s.forecast)]),observationPts=samples.map((s,i)=>[x(i),y(s.observation)]),connectors=samples.map((s,i)=>{const error=s.forecast-s.observation,cls=Math.abs(error)<=.0001?'neutral':error>0?'over':'under';return `<line class="bias-error-connector ${cls}" x1="${x(i)}" y1="${y(s.forecast)}" x2="${x(i)}" y2="${y(s.observation)}"><title>${esc(dateLabel(s.date,i18n().locale))} · ${esc(t('chartError'))} ${error>0?'+':''}${fmt(error,variable==='PRECIPITATION'?1:0)} ${unit}</title></line>`;}).join(''),dots=samples.map((s,i)=>`<circle class="bias-point observation" cx="${x(i)}" cy="${y(s.observation)}" r="4"><title>${esc(dateLabel(s.date,i18n().locale))} · ${esc(t('observation'))} ${fmt(s.observation,variable==='PRECIPITATION'?1:0)} ${unit}</title></circle><circle class="bias-point forecast" cx="${x(i)}" cy="${y(s.forecast)}" r="4"><title>${esc(dateLabel(s.date,i18n().locale))} · ${esc(t('forecastD1'))} ${fmt(s.forecast,variable==='PRECIPITATION'?1:0)} ${unit}</title></circle>`).join('');
  const errors=samples.map(s=>Math.abs(s.forecast-s.observation)),mae=errors.reduce((a,v)=>a+v,0)/errors.length,last=samples[samples.length-1],lastError=last.forecast-last.observation;
  return `<div class="bias-chart-shell chart-pro"><div class="chart-pro-head"><div class="chart-stat"><span>${esc(t('biasMae'))}</span><strong>${fmt(mae,variable==='PRECIPITATION'?1:0)} ${unit}</strong></div><div class="chart-stat"><span>${esc(t('chartLastGap'))}</span><strong class="${lastError>0?'chart-over':lastError<0?'chart-under':''}">${lastError>0?'+':''}${fmt(lastError,variable==='PRECIPITATION'?1:0)} ${unit}</strong></div><div class="chart-stat compact"><span>${esc(t('biasSamples',{count:samples.length}))}</span></div></div><div class="chart-legend"><span><i class="legend-line bias-forecast"></i>${esc(t('forecastD1'))}</span><span><i class="legend-line bias-observation"></i>${esc(t('observation'))}</span><span><i class="legend-line bias-gap"></i>${esc(t('chartForecastObservationGap'))}</span></div><svg class="bias-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(`${t('biasHistoryTitle')} · ${biasVariableLabel(variable)}`)}"><rect class="chart-plot-bg" x="${pad.l}" y="${pad.t}" width="${width-pad.l-pad.r}" height="${height-pad.t-pad.b}" rx="9"/>${yGrid}${xGrid}<text class="chart-axis-unit" x="${pad.l}" y="${pad.t-11}">${esc(unit)}</text>${connectors}<path class="bias-chart-observation" d="${svgLinePath(observationPts)}"/><path class="bias-chart-forecast" d="${svgLinePath(forecastPts)}"/>${dots}</svg></div>`;
}

function renderPrecipitationDiagnostics(r){const {t}=i18n(),p=r.precipitation;if(!p)return '';const rate=v=>Number.isFinite(v)?`${Math.round(v*100)} %`:'—';return `<section class="bias-panel"><div class="bias-panel-head"><h2>${esc(t('rainDiagnostics'))}</h2><p>${esc(t('wetDayThreshold'))}</p></div><div class="bias-metrics-grid bias-metrics-three"><div class="bias-metric"><span>${esc(t('detectionRate'))}</span><strong>${rate(p.hitRate)}</strong><small>${esc(t('detectionsCount',{hits:p.hitCount,wet:p.observedWetDays}))}</small></div><div class="bias-metric"><span>${esc(t('falseAlarms'))}</span><strong>${rate(p.falseAlarmRate)}</strong><small>${esc(t('falseAlarmsCount',{falseCount:p.falseAlarmCount,forecastWet:p.forecastWetDays}))}</small></div><div class="bias-metric"><span>${esc(t('missedEvents'))}</span><strong>${rate(p.missedEventRate)}</strong><small>${esc(t('missedCount',{missed:p.missedEventCount}))}</small></div></div></section>`;}

function renderBiasDetailPage(route){
  ensureCityAnalysisLoaded(route.id);
  const {t}=i18n(),city=state.cities.find(c=>c.id===route.id),model=getModel(route.modelId),variable=['TEMPERATURE','PRECIPITATION','WIND_SPEED'].includes(route.variable)?route.variable:null;if(!city||!model||!variable)return `<main class="page"><div class="empty-state"><h2>${esc(t('biasNotFound'))}</h2><button class="btn" data-action="back">${esc(t('back'))}</button></div></main>`;
  const selection=buildBiasSelectionWeb(city.id,model.id,variable),source=state.bias[city.id]||{},updated=source.updatedAt?relativeAge(new Date(source.updatedAt).toISOString(),i18n().locale):t('never'),heading=`${model.name} · ${biasVariableLabel(variable)}`;
  if(model.supportsDay1Bias===false)return `<main class="page bias-page"><section class="bias-page-header"><div><div class="eyebrow">${esc(t('biasPageEyebrow'))}</div><h1>${esc(heading)}</h1><p>${esc(city.name)}</p></div></section><section class="bias-panel bias-empty-panel"><div><h2>${esc(t('day1BiasUnavailable'))}</h2><p>${esc(t('day1BiasUnavailableHelp'))}</p></div></section></main>`;
  if(!selection.ready)return `<main class="page bias-page"><section class="bias-page-header"><div><div class="eyebrow">${esc(t('biasPageEyebrow'))}</div><h1>${esc(heading)}</h1><p>${esc(city.name)} · ${esc(t('localHistory30'))}</p></div></section><section class="bias-panel bias-empty-panel"><div class="bias-progress-ring">${selection.samples.length}<small>/14</small></div><div><h2>${esc(t('biasPendingTitle'))}</h2><p>${esc(t('calibrationBody',{count:selection.samples.length}))}</p><p class="small">${esc(t('historyLastUpdated',{date:updated}))}</p></div></section></main>`;
  const r=selection.reliability,rank=selection.rank,baseline=selection.baseline,deltaBaseline=baseline?r.meanAbsoluteError-baseline.meanAbsoluteError:null;
  return `<main class="page bias-page"><section class="bias-page-header"><div><div class="eyebrow">${esc(t('biasPageEyebrow'))}</div><h1>${esc(heading)}</h1><p>${esc(city.name)} · ${esc(t('comparableWindow',{count:r.sampleSize,days:r.windowDays,updated}))}</p></div></section><section class="bias-hero ${reliabilityLevelClass(r.level)}"><div class="bias-score-block"><span class="bias-overline">${esc(t('biasReliabilityIndex'))}</span><div class="bias-score"><strong>${r.score}</strong><span>/100</span></div><div class="bias-score-track"><i style="width:${r.score}%"></i></div></div><div class="bias-hero-copy"><span class="bias-level">${esc(reliabilityLevelLabel(r.level))}</span><h2>${esc(t('modelReliabilitySentence',{model:model.name,direction:biasDirectionText(r),city:city.name}))}</h2><p>${esc(t('biasErrorSummary',{mae:formatBiasValue(r.meanAbsoluteError,variable),bias:formatSignedBias(r.meanBias,variable)}))}</p><div class="bias-hero-meta"><span>${esc(rank?t('biasRank',{rank:rank.rank,count:rank.modelCount}):t('noComparableCohort'))}</span><span>${esc(t('daysCount',{count:r.sampleSize}))}</span><span>${esc(biasVariableLabel(variable))}</span></div></div></section>
  <section class="bias-panel"><div class="bias-panel-head"><h2>${esc(t('performanceLocal'))}</h2><p>${esc(t('performanceLocalDesc'))}</p></div><div class="bias-metrics-grid"><div class="bias-metric emphasized"><span>${esc(t('biasMae'))}</span><strong>${formatBiasValue(r.meanAbsoluteError,variable)}</strong><small>${esc(t('biasRmse'))} ${formatBiasValue(r.rootMeanSquareError,variable)}</small></div><div class="bias-metric"><span>${esc(t('meanBias'))}</span><strong>${formatSignedBias(r.meanBias,variable)}</strong><small>${esc(biasDirectionText(r))}</small></div><div class="bias-metric"><span>${esc(t('closeDays'))}</span><strong>${Math.round(r.withinToleranceRate*100)} %</strong><small>${esc(t('closeDifference',{value:formatBiasValue(r.closeTolerance,variable)}))}</small></div><div class="bias-metric"><span>${esc(t('errorVariability'))}</span><strong>${formatBiasValue(r.standardDeviation,variable)}</strong><small>${esc(t('errorStdDev'))}</small></div></div></section>
  <section class="bias-panel"><div class="bias-panel-head"><h2>${esc(t('recentEvolution'))}</h2><p>${esc(biasTrendLabel(r))}</p></div>${Number.isFinite(r.recentMeanAbsoluteError)&&Number.isFinite(r.previousMeanAbsoluteError)?`<div class="bias-trend"><div><span>${esc(t('previousPeriod'))}</span><strong>${formatBiasValue(r.previousMeanAbsoluteError,variable)}</strong></div><div class="bias-trend-arrow">→</div><div><span>${esc(t('lastSevenDays'))}</span><strong>${formatBiasValue(r.recentMeanAbsoluteError,variable)}</strong></div><span class="pill confidence ${r.trend==='IMPROVING'?'high':r.trend==='DECLINING'?'low':'medium'}">${esc(biasTrendLabel(r))}</span></div>`:`<div class="banner info">${esc(t('insufficientRecentComparison'))}</div>`}</section>
  ${baseline?`<section class="bias-panel"><div class="bias-panel-head"><h2>${esc(t('multiModelComparison'))}</h2><p>${esc(t('multiModelReferenceDesc'))}</p></div><div class="bias-baseline"><div><span>${esc(model.name)}</span><strong>${formatBiasValue(r.meanAbsoluteError,variable)} MAE</strong></div><div><span>${esc(t('multiModelAverage'))}</span><strong>${formatBiasValue(baseline.meanAbsoluteError,variable)} MAE</strong></div><div class="bias-baseline-result ${deltaBaseline<=0?'better':'worse'}">${esc(deltaBaseline<=0?t('modelBetterBy',{model:model.name,value:formatBiasValue(Math.abs(deltaBaseline),variable)}):t('ensembleBetterBy',{value:formatBiasValue(Math.abs(deltaBaseline),variable)}))}</div></div></section>`:''}
  <section class="bias-panel"><div class="bias-panel-head"><h2>${esc(t('biasHistoryTitle'))}</h2><p>${esc(t('biasHistoryExplain'))}</p></div>${renderBiasHistoryChart(selection.samples,variable)}</section>${renderPrecipitationDiagnostics(r)}<section class="bias-panel"><div class="bias-panel-head"><h2>${esc(t('biasDistribution'))}</h2><p>${esc(t('biasDistributionExplain',{value:formatBiasValue(r.closeTolerance,variable)}))}</p></div><div class="bias-distribution"><div class="under" style="--share:${Math.round(r.underToleranceUnderestimateRate*100)}%"><span>${esc(t('underestimation'))}</span><strong>${Math.round(r.underToleranceUnderestimateRate*100)} %</strong></div><div class="close" style="--share:${Math.round(r.closeRate*100)}%"><span>${esc(t('closeLabel'))}</span><strong>${Math.round(r.closeRate*100)} %</strong></div><div class="over" style="--share:${Math.round(r.overToleranceOverestimateRate*100)}%"><span>${esc(t('overestimation'))}</span><strong>${Math.round(r.overToleranceOverestimateRate*100)} %</strong></div></div></section><section class="bias-panel bias-reading"><div><div class="bias-panel-head"><h2>${esc(t('biasReading'))}</h2></div><div class="bias-reading-value">${formatSignedBias(r.meanBias,variable)}</div><p>${esc(t('biasReadingText'))}</p></div><div class="bias-reading-note"><strong>${esc(t('biasSamples',{count:r.sampleSize}))}</strong><span>${esc(t('sampleUsed'))}</span><strong>${formatBiasValue(r.standardDeviation,variable)}</strong><span>${esc(t('standardDeviation'))}</span></div></section><p class="small bias-method-note">${esc(t('biasMethodNote'))}</p></main>`;
}

function renderBiasHistoryManagementRow(city){
  ensureBiasLoaded(city.id);
  const {t}=i18n(),history=state.bias[city.id]||{},busy=state.biasRefresh.has(city.id),updated=history.updatedAt?relativeAge(new Date(history.updatedAt).toISOString(),i18n().locale):t('never'),plan=biasRefreshPlan(city.id),forecastCount=Array.isArray(history.forecasts)?history.forecasts.length:0,observationCount=Array.isArray(history.observations)?history.observations.length:0,status=forecastCount||observationCount?t('localHistoryCounts',{forecasts:forecastCount,observations:observationCount}):t('noLocalHistory'),complete=!plan.missingDays.length,planText=complete?t('historyComplete30'):t('missingDaysCalls',{days:plan.missingDays.length,calls:plan.requestCount})+` · ${modelCountLabel(plan.models.length)}`;
  return `<div class="history-refresh-row"><div class="history-refresh-copy"><strong>${esc(city.name)}</strong><span>${esc(t('lastUpdate',{date:updated}))} · ${esc(status)}</span><span class="history-plan ${complete?'complete':''}">${esc(planText)}</span></div><button class="btn tonal history-refresh-action" data-bias-refresh-city="${attr(city.id)}" ${busy||complete?'disabled':''}>${esc(t(busy?'updating':complete?'upToDate':'complete'))}</button></div>`;
}

function formatBytes(bytes){
  const n=Number(bytes);if(!Number.isFinite(n)||n<0)return '—';
  const units=['B','KB','MB','GB'];let value=n,index=0;while(value>=1024&&index<units.length-1){value/=1024;index++;}
  const digits=index===0?0:value>=100?0:value>=10?1:2;return `${fmt(value,digits)} ${units[index]}`;
}
function storageRatio(stats){const usage=stats?.origin?.usage,quota=stats?.origin?.quota;if(!Number.isFinite(usage)||!Number.isFinite(quota)||quota<=0)return null;return Math.max(0,Math.min(100,usage/quota*100));}
function localDataCategoryCard(icon,title,description,bytes,entries,itemsLabel=''){
  const {t}=i18n();return `<article class="storage-category-card"><div class="storage-category-icon" aria-hidden="true">${icon}</div><div class="storage-category-main"><div class="storage-category-head"><h3>${esc(title)}</h3><strong>${esc(formatBytes(bytes))}</strong></div><p>${esc(description)}</p><div class="storage-category-meta"><span>${esc(t('storageRecords',{count:entries||0}))}</span>${itemsLabel?`<span>${esc(itemsLabel)}</span>`:''}</div></div></article>`;
}
async function refreshLocalDataStats(scrollDirective=null){
  if(state.localDataLoading)return;const directive=scrollDirective||captureScrollContext();state.localDataLoading=true;state.localDataError=null;if(state.route.name==='data')render({scroll:directive,immediate:true});
  try{await pwaPostClearCleanup;state.localDataStats=await inspectLocalData(state.cities);}catch(err){state.localDataError=err?.message||String(err);}
  finally{state.localDataLoading=false;if(state.route.name==='data')render({scroll:directive,immediate:true});}
}

async function runIntegrityCheck(repair=false,scrollDirective=null){
  if(state.integrityLoading)return;const directive=scrollDirective||captureScrollContext();state.integrityLoading=true;if(state.route.name==='data')render({scroll:directive,immediate:true});
  try{state.integrityReport=await verifyLocalDataIntegrity(state.cities,{repair});if(repair){clearStorageIssues();state.errorCenter.list('storage:').forEach(x=>state.errorCenter.resolve(x.scope));state.localDataStats=await inspectLocalData(state.cities);toast(i18n().t('integrityRepairComplete',{count:state.integrityReport.repairs.length}));}}
  catch(err){state.integrityReport={healthy:false,issueCount:1,issues:[{code:'CHECK_FAILED',detail:{message:String(err?.message||err||'')}}],repairs:[]};}
  finally{state.integrityLoading=false;if(state.route.name==='data')render({scroll:directive,immediate:true});}
}
function integrityIssueLabel(issue){const {t}=i18n();const map={LEGACY_SCHEMA:'integrityLegacy',INVALID_RECORD:'integrityInvalid',ORPHAN_RECORD:'integrityOrphan',DUPLICATE_FORECAST:'integrityDuplicate',INDEXEDDB_UNAVAILABLE:'errorIndexedDbUnavailable',INDEXEDDB_BLOCKED:'errorIndexedDbBlocked',INDEXEDDB_WRITE_FAILED:'errorIndexedDbWrite',LOCAL_STORAGE_UNAVAILABLE:'errorLocalStorageUnavailable',STORAGE_QUOTA:'errorStorageQuotaBody',CORRUPT_LOCAL_RECORD:'errorIntegrityBody',CORRUPT_IDB_RECORD:'errorIntegrityBody',LOCAL_STORAGE_SCAN_FAILED:'integrityScanFailed',CHECK_FAILED:'integrityScanFailed'};return t(map[issue.code]||'integrityUnknown');}
function renderIntegritySection(){
  const {t}=i18n(),r=state.integrityReport,busy=state.integrityLoading;
  const status=!r?t('integrityNotChecked'):r.healthy?t('integrityHealthy'):t('integrityIssues',{count:r.issueCount});
  const issues=r&&!r.healthy?`<div class="integrity-issues">${r.issues.slice(0,12).map(issue=>`<div class="integrity-issue"><span class="status-pill ${issue.code==='LEGACY_SCHEMA'?'warning':'low'}">${esc(issue.code)}</span><div><strong>${esc(integrityIssueLabel(issue))}</strong><small>${esc(issue.detail?.key||issue.detail?.cityId||issue.detail?.message||'')}</small></div></div>`).join('')}${r.issues.length>12?`<small>${esc(t('integrityMoreIssues',{count:r.issues.length-12}))}</small>`:''}</div>`:'';
  return `<section class="section-card storage-section integrity-section"><div class="section-head"><div><h2>${esc(t('dataIntegrity'))}</h2><p>${esc(t('dataIntegrityIntro',{version:DATA_SCHEMA_VERSION}))}</p></div><div class="section-actions"><button class="btn tonal" data-action="check-integrity" ${busy?'disabled':''}>${busy?esc(t('checking')):esc(t('checkIntegrity'))}</button>${r&&!r.healthy?`<button class="btn primary" data-action="repair-integrity" ${busy?'disabled':''}>${esc(t('repairNecessary'))}</button>`:''}</div></div><div class="integrity-status ${r?.healthy?'healthy':r?'issues':'neutral'}"><strong>${esc(status)}</strong>${r?`<span>${esc(t('integritySummary',{checked:r.recordsChecked,migrated:r.migrated,invalid:r.invalid,orphans:r.orphans,duplicates:r.duplicates}))}</span>`:''}</div>${issues}<p class="small">${esc(t('integrityRepairNote'))}</p></section>`;
}


function renderBackupSection(){
  const {t}=i18n(),o=state.backupOptions;
  const check=(key,label)=>`<label class="backup-option"><input type="checkbox" data-backup-option="${key}" ${o[key]?'checked':''}><span>${esc(label)}</span></label>`;
  return `<section class="section-card storage-section backup-section"><div class="section-head"><div><h2>${esc(t('backupTitle'))}</h2><p>${esc(t('backupIntro'))}</p></div></div><div class="banner info">${esc(t('backupConfigOnly'))}</div><div class="backup-options">${check('forecasts',t('backupForecasts'))}${check('normals',t('backupNormals'))}${check('bias',t('backupBias'))}${check('evolution',t('backupEvolution'))}${check('marine',t('backupMarine'))}${check('health',t('backupHealth'))}</div><div class="section-actions"><button class="btn primary" data-action="export-backup">${uiIcon('download',16)} ${esc(t('exportBackup'))}</button><button class="btn tonal" data-action="import-backup">${esc(t('importBackup'))}</button><input id="backup-file-input" type="file" accept="application/json,.json" hidden></div><p class="small">${esc(t('backupPrivacyNote'))}</p></section>`;
}
function renderApiUsageSection(){
  const {t}=i18n(),u=apiUsageSnapshot(),p=u.providerLimits;
  const cell=(label,value,limit)=>`<div class="storage-kpi"><span>${esc(label)}</span><strong>${Number(value)||0}</strong><small>${esc(t('apiLocalLimit',{limit}))}</small></div>`;
  return `<section class="section-card storage-section api-usage-section"><div class="section-head"><div><h2>${esc(t('apiUsageTitle'))}</h2><p>${esc(t('apiUsageIntro'))}</p></div></div><div class="storage-kpis compact">${cell(t('apiCallsMinute'),u.minute,u.limits.minute)}${cell(t('apiCallsHour'),u.hour,u.limits.hour)}${cell(t('apiCallsDay'),u.day,u.limits.day)}${cell(t('apiCallsMonth'),u.month,p.month)}</div><p class="small">${esc(t('apiProviderLimit',{day:p.day,hour:p.hour,minute:p.minute}))}</p><p class="small">${esc(t('apiBillingNote'))}</p><p class="small">${esc(t('apiGuardNote'))}</p></section>`;
}
async function exportLocalBackupFile(){
  const backup=await createLocalBackup(state.cities,state.backupOptions),blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),a=document.createElement('a'),date=new Date().toISOString().slice(0,10);a.href=URL.createObjectURL(blob);a.download=`meteocompare-backup-v${APP_VERSION}-${date}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importLocalBackupFile(file){
  const {t}=i18n();if(!file)return;if(file.size>50*1024*1024){toast(t('backupFileTooLarge'));return;}
  try{const backup=JSON.parse(await file.text());if(!confirm(t('backupImportConfirm')))return;const result=await restoreLocalBackup(backup,{replace:true});toast(t('backupImported',{cities:result.cities}));setTimeout(()=>location.reload(),350);}
  catch(err){toast(t(err?.code==='BACKUP_FUTURE_SCHEMA'?'backupFuture':'backupInvalid'));}
}

function renderLocalDataPage(){
  const {t,locale}=i18n(),stats=state.localDataStats,analytics=analyticsStatus();
  if(!stats&&!state.localDataLoading&&!state.localDataError)queueMicrotask(()=>refreshLocalDataStats());
  const ratio=storageRatio(stats),originUsage=stats?.origin?.usage,quota=stats?.origin?.quota,categories=stats?.categories||{};
  const generated=stats?.generatedAt?new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'short'}).format(new Date(stats.generatedAt)):'';
  const cityRows=(stats?.cities||[]).filter(row=>row.isFavorite||row.totalBytes>0);
  const topCards=stats?`<section class="storage-kpis storage-kpis-simple" aria-label="${esc(t('storageOverview'))}"><article class="storage-kpi primary"><span>${esc(t('storageEstimatedApp'))}</span><strong>${esc(formatBytes(stats.appBytes))}</strong><small>${esc(t('storageEstimatedHint'))}</small></article><article class="storage-kpi"><span>${esc(t('storagePwaCache'))}</span><strong>${esc(formatBytes(stats.pwaCacheBytes))}</strong><small>${esc(t('storageFiles',{count:stats.pwaCacheEntries}))}</small></article><article class="storage-kpi"><span>${esc(t('storageOriginUsage'))}</span><strong>${Number.isFinite(originUsage)?esc(formatBytes(originUsage)):'—'}</strong><small>${Number.isFinite(quota)?esc(t('storageOfQuota',{quota:formatBytes(quota)})):esc(t('storageQuotaUnavailable'))}</small>${ratio!=null?`<div class="storage-meter" aria-label="${esc(t('storageUsagePercent',{percent:fmt(ratio,1)}))}"><i style="width:${ratio}%"></i></div>`:''}</article></section>`:`<section class="storage-kpis storage-kpis-simple"><div class="storage-kpi"><span>${esc(t('storageLoading'))}</span><strong>…</strong></div></section>`;
  const categoryTotal=(...keys)=>keys.reduce((acc,key)=>({bytes:acc.bytes+(Number(categories[key]?.bytes)||0),entries:acc.entries+(Number(categories[key]?.entries)||0)}),{bytes:0,entries:0});
  const configTotal=categoryTotal('favorites','settings'),forecastTotal=categoryTotal('forecasts','marine'),analysisTotal=categoryTotal('normals','bias','evolution','health');
  const categoryCards=stats?`<section class="section-card storage-section"><div class="section-head"><div><h2>${esc(t('storageBreakdown'))}</h2><p>${esc(t('storageBreakdownIntro'))}</p></div></div><div class="storage-category-grid storage-category-grid-simple">${localDataCategoryCard('⚙',t('storageConfigGroup'),t('storageConfigGroupDesc'),configTotal.bytes,configTotal.entries,t('storageConfigGroupMeta',{cities:categories.favorites?.items||0}))}${localDataCategoryCard('☁',t('storageWeatherGroup'),t('storageWeatherGroupDesc'),forecastTotal.bytes,forecastTotal.entries,t('storageWeatherGroupMeta',{models:categories.forecasts?.items||0,cities:categories.marine?.items||0}))}${localDataCategoryCard('±',t('storageAnalysisGroup'),t('storageAnalysisGroupDesc'),analysisTotal.bytes,analysisTotal.entries,t('storageAnalysisGroupMeta',{bias:categories.bias?.items||0,snapshots:categories.evolution?.items||0}))}</div></section>`:'';
  const cityTable=stats?`<section class="storage-subsection"><div class="section-head"><div><h3>${esc(t('storageByCity'))}</h3><p>${esc(t('storageByCityIntro'))}</p></div></div>${cityRows.length?`<div class="table-wrap storage-table-wrap"><table class="storage-table"><thead><tr><th>${esc(t('city'))}</th><th>${esc(t('storageForecasts'))}</th><th>${esc(t('models'))}</th><th>${esc(t('storageNormalsShort'))}</th><th>${esc(t('storageBiasShort'))}</th><th>${esc(t('storageEvolutionShort'))}</th><th>${esc(t('marineTitle'))}</th><th>${esc(t('healthShort'))}</th><th>${esc(t('storageTotal'))}</th></tr></thead><tbody>${cityRows.map(row=>`<tr class="${row.isFavorite?'':'storage-orphan'}"><th><strong>${esc(row.name||row.id)}</strong>${!row.isFavorite?`<small>${esc(t('storageOrphan'))}</small>`:''}</th><td>${esc(formatBytes(row.forecastBytes))}</td><td>${row.forecastModels||0}</td><td>${esc(formatBytes(row.normalsBytes))}</td><td><strong>${esc(formatBytes(row.biasBytes))}</strong><small>${esc(t('storageBiasCounts',{forecasts:row.biasForecasts||0,observations:row.biasObservations||0}))}</small></td><td><strong>${esc(formatBytes(row.evolutionBytes))}</strong><small>${esc(t('storageSnapshots',{count:row.evolutionSnapshots||0}))}</small></td><td>${esc(formatBytes(row.marineBytes||0))}</td><td><strong>${esc(formatBytes(row.healthBytes||0))}</strong><small>${esc(t('healthSnapshotsCount',{count:row.healthSnapshots||0}))}</small></td><td><strong>${esc(formatBytes(row.totalBytes))}</strong></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state compact">${esc(t('storageNoCityData'))}</div>`}</section>`:'';
  const cacheDetails=stats?.pwaCaches?.length?`<details class="storage-details" data-storage-cache-details ${state.localDataUi.cacheOpen?'open':''}><summary>${esc(t('storagePwaDetails'))}</summary><div class="storage-cache-list">${stats.pwaCaches.map(cache=>`<div><code>${esc(cache.name)}</code><span>${esc(t('storageFiles',{count:cache.entries}))} · ${esc(formatBytes(cache.bytes))}</span></div>`).join('')}</div></details>`:'';
  const technical=stats?`<section class="storage-subsection"><div class="section-head"><div><h3>${esc(t('storageTechnical'))}</h3><p>${esc(t('storageTechnicalIntro'))}</p></div></div><div class="storage-technical-grid"><div><span>IndexedDB</span><strong>${esc(formatBytes(stats.indexedDbBytes))}</strong><small>${esc(t('storageRecords',{count:stats.indexedDbEntries}))}</small></div><div><span>localStorage</span><strong>${esc(formatBytes(stats.localStorageBytes))}</strong><small>${esc(t('storageRecords',{count:stats.localStorageEntries}))}</small></div><div><span>CacheStorage</span><strong>${esc(formatBytes(stats.pwaCacheBytes))}</strong><small>${esc(t('storageFiles',{count:stats.pwaCacheEntries}))}</small></div><div><span>${esc(t('storageBrowserOrigin'))}</span><strong>${Number.isFinite(originUsage)?esc(formatBytes(originUsage)):'—'}</strong><small>${Number.isFinite(quota)?esc(t('storageOfQuota',{quota:formatBytes(quota)})):esc(t('storageQuotaUnavailable'))}</small></div></div>${cacheDetails}<p class="storage-method-note">${esc(t('storageMethodNote'))}</p></section>`:'';
  const analyticsDetails=`<div class="analytics-privacy-card analytics-privacy-compact"><div><div class="analytics-status-line"><strong>${esc(t('analyticsTitle'))}</strong><span class="status-pill ${analytics.active?'active':analytics.configured?'muted':'warning'}">${esc(analytics.active?t('analyticsActive'):analytics.privacySignal?t('analyticsPrivacySignal'):analytics.optedOut?t('analyticsDisabled'):t('analyticsNotConfigured'))}</span></div><p>${esc(t('analyticsPrivacyDetail'))}</p><details class="privacy-details" data-storage-privacy-details ${state.localDataUi.privacyOpen?'open':''}><summary>${esc(t('learnMore'))}</summary><p>${esc(t('analyticsEventsDetail'))}</p><div class="analytics-purpose-note"><p>${esc(t('analyticsPurposeDetail'))}</p></div><div class="analytics-cnil-note"><p>${esc(t('analyticsCnilNote'))} <a href="https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience" target="_blank" rel="noopener noreferrer">CNIL ↗</a></p></div></details></div>${analytics.configured&&!analytics.privacySignal?`<button class="btn tonal" data-action="toggle-analytics">${esc(analytics.optedOut?t('analyticsEnable'):t('analyticsDisable'))}</button>`:''}</div>`;
  return `<main class="page local-data-page"><section class="page-header storage-page-header"><div class="page-header-copy"><h1>${esc(t('localDataTitle'))}</h1><p>${esc(t('localDataIntro'))}</p></div><div class="page-header-actions"><button class="btn tonal" data-action="refresh-local-data" ${state.localDataLoading?'disabled':''}>${uiIcon('refresh',16)} ${esc(state.localDataLoading?t('storageLoading'):t('storageRecalculate'))}</button></div></section>${state.localDataError?`<div class="banner error">${esc(t('storageError',{error:state.localDataError}))}</div>`:''}${topCards}${stats?`<div class="storage-measured-note">${esc(t('storageMeasuredAt',{date:generated}))}</div>`:''}${categoryCards}${renderBackupSection()}<section class="section-card storage-section privacy-panel privacy-panel-simple"><div class="section-head"><div><h2>${esc(t('privacy'))}</h2><p>${esc(t('webPrivacyBody'))}</p></div></div><div class="privacy-grid"><article><h3>${esc(t('privacyLocalTitle'))}</h3><p>${esc(t('privacyLocalBody'))}</p></article><article><h3>${esc(t('privacyNetworkTitle'))}</h3><p>${esc(t('privacyNetworkBody'))}</p></article><article><h3>${esc(t('privacyTrackingTitle'))}</h3><p>${esc(t('privacyTrackingBody'))}</p></article></div>${analyticsDetails}<div class="privacy-danger"><div><strong>${esc(t('privacyEraseTitle'))}</strong><p>${esc(t('privacyEraseBody'))}</p></div><button class="btn danger" data-action="clear-data">${esc(t('clearLocalData'))}</button></div></section><details class="section-card storage-section storage-advanced" data-storage-advanced ${state.localDataUi.advancedOpen?'open':''}><summary><div><strong>${esc(t('storageAdvancedTitle'))}</strong><span>${esc(t('storageAdvancedIntro'))}</span></div><span class="details-chevron" aria-hidden="true">⌄</span></summary><div class="storage-advanced-body">${cityTable}${renderIntegritySection()}${renderApiUsageSection()}${technical}</div></details></main>`;
}

function renderSettings(){
  const {t}=i18n(),sort=state.settings.modelSort||'ZONE',groups=modelGroups(sort),refresh=REFRESH_INTERVALS.find(x=>x.id===state.settings.refreshInterval)||REFRESH_INTERVALS[2],refreshLabel=id=>({MINUTES_15:'15 min',MINUTES_30:t('refresh30m'),HOUR_1:t('refresh1h'),HOURS_3:t('refresh3h'),HOURS_6:t('refresh6h'),MANUAL:t('manual')}[id]||id);
  return `<main class="page settings-page"><section class="page-header settings-page-header"><div class="page-header-copy"><h1>${esc(t('settings'))}</h1><p>${esc(t('settingsIntro'))}</p></div></section><div class="settings-list settings-list-simple">
    <section class="settings-section settings-wide"><div class="settings-section-head"><div><h2>${esc(t('settingsInterfaceTitle'))}</h2><p>${esc(t('settingsInterfaceIntro'))}</p></div></div><div class="settings-control-grid"><div class="setting-control"><h3>${esc(t('theme'))}</h3><div class="option-row">${[['SYSTEM',t('system')],['LIGHT',t('light')],['DARK',t('dark')]].map(([id,l])=>`<button class="chip ${state.settings.theme===id?'active':''}" aria-pressed="${state.settings.theme===id}" data-theme="${id}">${esc(l)}</button>`).join('')}</div></div><div class="setting-control"><h3>${esc(t('language'))}</h3><div class="option-row">${[['SYSTEM',t('systemLanguage')],['FRENCH',t('french')],['ENGLISH',t('english')],['SPANISH',t('spanish')],['GERMAN',t('german')],['ITALIAN',t('italian')]].map(([id,l])=>`<button class="chip ${state.settings.language===id?'active':''}" aria-pressed="${state.settings.language===id}" data-language="${id}">${esc(l)}</button>`).join('')}</div></div><div class="setting-control"><h3>${esc(t('density'))}</h3><div class="option-row">${[['COMFORTABLE',t('comfortable')],['COMPACT',t('compact')]].map(([id,l])=>`<button class="chip ${state.settings.density===id?'active':''}" aria-pressed="${state.settings.density===id}" data-density="${id}">${esc(l)}</button>`).join('')}</div></div></div></section>
    <section class="settings-section settings-wide"><div class="settings-section-head"><div><h2>${esc(t('settingsForecastTitle'))}</h2><p>${esc(t('settingsForecastIntro'))}</p></div></div><div class="settings-control-grid settings-control-grid-two"><div class="setting-control"><h3>${esc(t('refreshInterval'))}</h3><p>${esc(t('webRefreshDesc'))}</p><div class="option-row">${REFRESH_INTERVALS.map(x=>`<button class="chip ${refresh.id===x.id?'active':''}" aria-pressed="${refresh.id===x.id}" data-refresh-interval="${x.id}">${esc(refreshLabel(x.id))}</button>`).join('')}</div></div><div class="setting-control"><h3>${esc(t('localWeightedConsensus'))}</h3><p>${esc(t('localWeightedConsensusIntro'))}</p><div class="option-row"><button class="chip ${!state.settings.localWeightedConsensus?'active':''}" aria-pressed="${!state.settings.localWeightedConsensus}" data-local-weighting="off">${esc(t('disabled'))}</button><button class="chip ${state.settings.localWeightedConsensus?'active':''}" aria-pressed="${state.settings.localWeightedConsensus}" data-local-weighting="on">${esc(t('enabled'))}</button></div><small>${esc(t('localWeightedConsensusNote'))}</small></div></div></section>
    <section class="settings-section settings-wide history-management"><div class="settings-section-head"><div><h2>${esc(t('reliability'))}</h2><p>${esc(t('historyRefreshIntro'))}</p></div><span class="cost-badge">${esc(t('costlyOperation'))}</span></div><div class="history-refresh-list">${state.cities.length?state.cities.map(city=>renderBiasHistoryManagementRow(city)).join(''):`<div class="empty-state compact">${esc(t('addCityForHistory'))}</div>`}</div><p class="history-refresh-note">${esc(t('historyAdvice'))}</p></section>
    <section class="settings-section settings-wide"><div class="settings-section-head"><div><h2>${esc(t('weatherModels'))}</h2><p>${esc(t('forecastModelSettingsDesc'))}</p></div></div><div class="segmented">${[['ZONE',t('sortZone')],['FAMILLE',t('sortFamily')],['FINESSE',t('sortResolution')]].map(([id,l])=>`<button class="seg-btn ${sort===id?'active':''}" data-model-sort="${id}">${esc(l)}</button>`).join('')}</div><div class="model-settings-groups">${groups.map(g=>`<div class="model-settings-group">${g.label?`<div class="model-group-title">${esc(g.label)}</div>`:''}<div class="model-settings-grid">${g.models.map(renderModelRow).join('')}</div></div>`).join('')}</div></section>
  </div></main>`;
}

function modelGroups(sort){const {t}=i18n();let models=[...WEATHER_MODELS];if(sort==='FINESSE')return [{label:'',models:models.sort((a,b)=>a.resolutionKm-b.resolutionKm)}];if(sort==='FAMILLE'){const order=[...new Set(models.map(m=>m.family))];return order.map(f=>({label:f,models:models.filter(m=>m.family===f).sort((a,b)=>a.resolutionKm-b.resolutionKm)}));}const labels={FRANCE:t('coverageFrance'),EUROPE:t('coverageEurope'),UNITED_STATES:t('coverageUs'),GLOBAL:t('coverageGlobal')},order=['FRANCE','EUROPE','UNITED_STATES','GLOBAL'];return order.map(z=>({label:labels[z],models:models.filter(m=>m.coverage===z).sort((a,b)=>a.resolutionKm-b.resolutionKm)})).filter(g=>g.models.length);}

function renderModelRow(m){const {t}=i18n(),on=state.settings.enabledModelIds.includes(m.id);return `<div class="model-row"><div class="model-row-head"><div class="model-title">${esc(m.name)}</div><button class="switch ${on?'on':''}" role="switch" aria-checked="${on}" data-model-toggle="${m.id}" aria-label="${esc(m.name)}"></button></div><div class="model-meta">${esc(m.family)} · ${m.resolutionKm} km · ${esc(t('modelHorizon',{hours:m.horizonHours}))}</div></div>`;}

function nearestBandPercent(bands,timestamp,epochMs=null){if(!bands?.length)return null;if(Number.isFinite(epochMs)){const absolute=bands.filter(b=>Number.isFinite(b.epochMs));if(absolute.length){const best=absolute.reduce((a,b)=>Math.abs(b.epochMs-epochMs)<Math.abs(a.epochMs-epochMs)?b:a,absolute[0]);return best?.percent;}}const target=localTimestampValue(timestamp),best=bands.reduce((a,b)=>Math.abs(localTimestampValue(b.timestamp)-target)<Math.abs(localTimestampValue(a.timestamp)-target)?b:a,bands[0]);return best?.percent;}
function disagreementAnalysis(cityId){
  const f=state.forecasts[cityId];if(!f)return null;const profile=localConsensusWeights(cityId),weights=state.settings.localWeightedConsensus&&profile.ready?profile.maps:null,opts={weightsByVariable:weights||{}},points=selectRegularTimelinePoints(buildTimelinePoints(f,'HOURLY',new Date(),opts),8,3),bands={TEMPERATURE:cachedBand(f,'TEMPERATURE',24,weights),PRECIPITATION:cachedBand(f,'PRECIPITATION',24,weights),WIND:cachedBand(f,'WIND',24,weights)},variables=['TEMPERATURE','PRECIPITATION','WIND','CONDITION'];
  const rows=points.map(p=>{const values={TEMPERATURE:nearestBandPercent(bands.TEMPERATURE,p.timestamp,p.epochMs),PRECIPITATION:nearestBandPercent(bands.PRECIPITATION,p.timestamp,p.epochMs),WIND:nearestBandPercent(bands.WIND,p.timestamp,p.epochMs),CONDITION:Number.isFinite(p.consensusPercent)?p.consensusPercent:null};for(const reason of p.divergenceReasons||[])if(reason==='CONDITION'&&Number.isFinite(values.CONDITION))values.CONDITION=Math.min(values.CONDITION,49);return {timestamp:p.timestamp,epochMs:p.epochMs,modelCount:p.modelCount,values,reasons:p.divergenceReasons||[]};});
  const summary=Object.fromEntries(variables.map(v=>{const vals=rows.map(r=>r.values[v]).filter(Number.isFinite);return [v,{average:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null,weak:vals.filter(x=>x<80).length,low:vals.filter(x=>x<50).length}];}));return {rows,summary};
}
function renderDisagreementModal(cityId,focusTimestamp=null,focusEpoch=null){
  const {t}=i18n(),a=disagreementAnalysis(cityId);if(!a)return `<p>${esc(t('noDisagreementData'))}</p>`;const names={TEMPERATURE:t('temperature'),PRECIPITATION:t('precipitation'),WIND:t('wind'),CONDITION:t('conditions')},focusRow=a.rows.length?(Number.isFinite(focusEpoch)?a.rows.reduce((best,r)=>Math.abs((Number.isFinite(r.epochMs)?r.epochMs:Infinity)-focusEpoch)<Math.abs((Number.isFinite(best.epochMs)?best.epochMs:Infinity)-focusEpoch)?r:best,a.rows[0]):focusTimestamp?a.rows.reduce((best,r)=>Math.abs(localTimestampValue(r.timestamp)-localTimestampValue(focusTimestamp))<Math.abs(localTimestampValue(best.timestamp)-localTimestampValue(focusTimestamp))?r:best,a.rows[0]):null):null,focusKey=focusRow?(Number.isFinite(focusRow.epochMs)?focusRow.epochMs:focusRow.timestamp):null,variableCards=Object.entries(a.summary).map(([k,v])=>`<div class="disagreement-card ${Number.isFinite(v.average)?confidenceClass(v.average):''}"><span>${esc(names[k])}</span><strong>${Number.isFinite(v.average)?v.average+'%':'—'}</strong><small>${esc(t(v.low===1?'strongDisagreementDeadline':'strongDisagreementDeadlines',{count:v.low}))} · ${esc(t('below80',{count:v.weak}))}</small></div>`).join(''),rows=a.rows.map(r=>`<tr class="${focusKey!=null&&(Number.isFinite(r.epochMs)?r.epochMs:r.timestamp)===focusKey?'focus':''}"><td><strong>${esc(timeLabel(r.timestamp))}</strong><span class="cell-sub">${esc(dateLabel(r.timestamp.slice(0,10),i18n().locale))}</span></td>${['TEMPERATURE','PRECIPITATION','WIND','CONDITION'].map(k=>{const v=r.values[k];return `<td><span class="confidence-cell ${Number.isFinite(v)?confidenceClass(v):''}">${Number.isFinite(v)?Math.round(v)+'%':'—'}</span></td>`;}).join('')}<td>${r.reasons.length?r.reasons.map(x=>`<span class="reason-chip">${esc(divergenceShort(x))}</span>`).join(' '):`<span class="reason-chip stable">${esc(t('noDetectedCause'))}</span>`}</td></tr>`).join('');
  return `<p>${esc(t('disagreementIntro'))}</p><div class="disagreement-grid">${variableCards}</div><div class="table-wrap disagreement-table"><table><thead><tr><th>${esc(t('deadline'))}</th><th>${esc(t('shortTemp'))}</th><th>${esc(t('precipitation'))}</th><th>${esc(t('wind'))}</th><th>${esc(t('conditions'))}</th><th>${esc(t('detectedCause'))}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="banner info"><b>${esc(t('reading'))} :</b> ${esc(t('disagreementReading'))}</div>`;
}

function renderModal(){
  const {t}=i18n();if(!state.modal)return '';
  if(state.modal.type==='addCity')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(t('searchCity'))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><input id="city-search" class="search-input" value="${attr(state.modal.query||'')}" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off" autofocus><div id="city-search-status" role="status" aria-live="polite">${renderSearchStatus()}</div><div class="search-results" id="city-search-results">${renderSearchResults()}</div></div></div></div>`;
  if(state.modal.type==='cityMenu'){const c=state.cities.find(x=>x.id===state.modal.cityId);return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(c?.name||t('city'))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="modal-actions"><button class="btn tonal" data-refresh-city="${attr(c?.id)}">↻ ${esc(t('refresh'))}</button><button class="btn tonal" data-action="${c?.marineEnabled?'refresh-marine':'activate-marine'}" data-marine-city="${attr(c?.id)}">🌊 ${esc(c?.marineEnabled?t('refreshMarine'):t('activateMarine'))}</button><button class="btn danger" data-remove-city="${attr(c?.id)}">🗑 ${esc(t('remove'))}</button></div></div></div></div>`;}
  if(state.modal.type==='confidence')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${esc(t('whyAgreement'))}</h2><span class="small">${esc(t('variableAnalysis'))}</span></div><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="banner info"><b>${esc(t('agreementNotAccuracy'))}</b>&nbsp; ${esc(t('agreementNotAccuracyBody'))}</div>${renderDisagreementModal(state.modal.cityId||state.route.id,state.modal.focusTimestamp||null,Number.isFinite(state.modal.focusEpoch)?state.modal.focusEpoch:null)}<details class="method-details"><summary>${esc(t('method'))}</summary><p>${esc(t('methodTemp'))}</p><p>${esc(t('methodWind'))}</p><p>${esc(t('methodRain'))}</p></details></div></div></div>`;
  if(state.modal.type==='cityCompare'){const selected=new Set(state.modal.selectedIds||[]);return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${esc(t('compareCities'))}</h2><span class="small">${esc(t('compareCitiesModal'))}</span></div><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="city-compare-picker">${state.cities.map(c=>`<button class="city-compare-choice ${selected.has(c.id)?'active':''}" aria-pressed="${selected.has(c.id)}" data-city-compare-toggle="${attr(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(placeLine(c))}</small></span><i>${selected.has(c.id)?'✓':'+'}</i></button>`).join('')}</div><div class="modal-footer"><span class="small">${esc(t('selectedOfThree',{count:selected.size}))}</span><button class="btn primary" data-action="apply-city-compare" ${selected.size<2?'disabled':''}>${esc(t('compare'))}</button></div></div></div></div>`;}
  if(state.modal.type==='donate')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal support-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">♡ ${esc(t('supportTitle'))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><p class="support-intro">${esc(t('supportBodyDetailed'))}</p><div class="donation-grid"><a class="donation-card" href="https://liberapay.com/Pat0chat" target="_blank" rel="noopener"><span class="donation-icon">💝</span><span><strong>Liberapay</strong><small>${esc(t('donationLiberapay'))}</small></span>${uiIcon('external',16)}</a><a class="donation-card" href="https://github.com/sponsors/Pat0chat" target="_blank" rel="noopener"><span class="donation-icon">❤️</span><span><strong>GitHub Sponsors</strong><small>${esc(t('donationGithub'))}</small></span>${uiIcon('external',16)}</a><a class="donation-card" href="https://ko-fi.com/pat0chat" target="_blank" rel="noopener"><span class="donation-icon">☕</span><span><strong>Ko-Fi</strong><small>${esc(t('donationKofi'))}</small></span>${uiIcon('external',16)}</a></div><div class="donation-disclaimer">${esc(t('donationDisclaimer'))}</div></div></div></div>`;
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
function chartHoverKeyLabel(key,mode){
  if(!key)return '';
  return mode==='HOURLY'?`${dateLabel(String(key).slice(0,10),i18n().locale)} ${timeLabel(String(key))}`:dateLabel(String(key).slice(0,10),i18n().locale);
}
function chartHoverContext(svg){
  let hover=chartHoverDataCache.get(svg);if(hover)return hover;
  try{
    const keys=JSON.parse(svg.dataset.hoverKeys||'[]'),values=JSON.parse(svg.dataset.hoverValues||'[]'),shell=svg.closest('.hover-chart-shell');
    hover={keys,values,shell,crosshair:svg.querySelector('[data-hover-crosshair]'),markers:[...svg.querySelectorAll('[data-hover-marker]')],seriesItems:[],status:shell?.querySelector('[data-hover-status]')||null};
    if(svg.dataset.hoverChart!=='agreement-band')hover.seriesItems=values.map((_,si)=>shell?.querySelector(`[data-hover-series="${si}"]`)||null);
    else hover.bandEls={mean:shell?.querySelector('[data-band-hover-mean]')||null,range:shell?.querySelector('[data-band-hover-range]')||null,agreement:shell?.querySelector('[data-band-hover-agreement]')||null,models:shell?.querySelector('[data-band-hover-models]')||null};
    chartHoverDataCache.set(svg,hover);return hover;
  }catch{return null;}
}
function handleChartPointerMove(e){
  const svg=e.target?.closest?.('svg[data-hover-chart]');if(!svg||!app.contains(svg))return;
  const rect=svg.getBoundingClientRect?.();if(!rect?.width)return;
  const hover=chartHoverContext(svg);if(!hover?.keys?.length||!hover.shell)return;const {keys,values,shell}=hover;
  const plotLeft=Number(svg.dataset.plotLeft),plotRight=Number(svg.dataset.plotRight),plotTop=Number(svg.dataset.plotTop),plotBottom=Number(svg.dataset.plotBottom),scaleMin=Number(svg.dataset.scaleMin),scaleMax=Number(svg.dataset.scaleMax),viewWidth=svg.viewBox?.baseVal?.width||Number(String(svg.getAttribute('viewBox')||'0 0 1 1').split(/\s+/)[2])||1;
  const sx=(e.clientX-rect.left)*viewWidth/rect.width,ratio=Math.max(0,Math.min(1,(sx-plotLeft)/Math.max(1,plotRight-plotLeft))),index=Math.max(0,Math.min(keys.length-1,Math.round(ratio*(keys.length-1)))),x=plotLeft+index*(plotRight-plotLeft)/Math.max(1,keys.length-1);
  const when=chartHoverKeyLabel(keys[index],svg.dataset.hoverMode),unit=svg.dataset.hoverUnit||'',digits=Number(svg.dataset.hoverDigits)||0;shell.classList.add('is-hovering');if(hover.status)hover.status.textContent=i18n().t('chartHoverAt',{when});
  if(hover.crosshair){hover.crosshair.setAttribute('x1',String(x));hover.crosshair.setAttribute('x2',String(x));}
  if(svg.dataset.hoverChart==='agreement-band'){
    const row=values?.[index]||[],mean=row[0],min=row[1],max=row[2],percent=row[3],modelCount=row[4],els=hover.bandEls||{};
    if(els.mean)els.mean.textContent=Number.isFinite(mean)?`${fmt(mean,digits)} ${unit}`:'—';
    if(els.range)els.range.textContent=Number.isFinite(min)&&Number.isFinite(max)?`${fmt(min,digits)}–${fmt(max,digits)} ${unit}`:'—';
    if(els.agreement){els.agreement.textContent=Number.isFinite(percent)?`${Math.round(percent)}%`:'—';els.agreement.classList.remove('high','medium','low');if(Number.isFinite(percent))els.agreement.classList.add(confidenceClass(percent));}
    if(els.models)els.models.textContent=Number.isFinite(modelCount)?modelCountLabel(modelCount):'';
    [mean,min,max].forEach((value,si)=>{const marker=hover.markers[si];if(marker){if(Number.isFinite(value)&&Number.isFinite(scaleMin)&&Number.isFinite(scaleMax)&&scaleMax!==scaleMin){const yy=plotTop+(scaleMax-value)*(plotBottom-plotTop)/(scaleMax-scaleMin);marker.setAttribute('cx',String(x));marker.setAttribute('cy',String(yy));marker.classList.add('active');}else marker.classList.remove('active');}});
    return;
  }
  values.forEach((row,si)=>{const value=row?.[index],item=hover.seriesItems[si],marker=hover.markers[si];if(item){const valueEl=item.querySelector('[data-hover-value]');if(valueEl)valueEl.textContent=Number.isFinite(value)?`${fmt(value,digits)} ${unit}`:'—';}if(marker){if(Number.isFinite(value)&&Number.isFinite(scaleMin)&&Number.isFinite(scaleMax)&&scaleMax!==scaleMin){const yy=plotTop+(scaleMax-value)*(plotBottom-plotTop)/(scaleMax-scaleMin);marker.setAttribute('cx',String(x));marker.setAttribute('cy',String(yy));marker.classList.add('active');}else marker.classList.remove('active');}});
}
function clearChartHover(svg){
  const hover=svg?chartHoverContext(svg):null,shell=hover?.shell||svg?.closest?.('.hover-chart-shell');if(!shell)return;shell.classList.remove('is-hovering');if(hover?.status)hover.status.textContent=i18n().t('chartHoverHint');else{const status=shell.querySelector('[data-hover-status]');if(status)status.textContent=i18n().t('chartHoverHint');}(hover?.markers||[...svg.querySelectorAll('[data-hover-marker]')]).forEach(el=>el.classList.remove('active'));shell.querySelectorAll('[data-hover-value]').forEach(el=>{el.textContent='—';});
  if(svg?.dataset?.hoverChart==='agreement-band'){const els=hover?.bandEls||{};if(els.mean)els.mean.textContent='—';if(els.range)els.range.textContent='—';if(els.agreement){els.agreement.textContent='—';els.agreement.classList.remove('high','medium','low');}if(els.models)els.models.textContent='';}
}
function handleChartPointerOut(e){
  const svg=e.target?.closest?.('svg[data-hover-chart]');if(!svg||!app.contains(svg)||e.pointerType==='touch')return;if(e.relatedTarget&&svg.contains(e.relatedTarget))return;clearChartHover(svg);
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
  const storageDetails=e.target?.closest?.('details[data-storage-advanced],details[data-storage-privacy-details],details[data-storage-cache-details]');
  if(storageDetails){
    if(storageDetails.hasAttribute('data-storage-advanced'))state.localDataUi.advancedOpen=storageDetails.open;
    else if(storageDetails.hasAttribute('data-storage-privacy-details'))state.localDataUi.privacyOpen=storageDetails.open;
    else if(storageDetails.hasAttribute('data-storage-cache-details'))state.localDataUi.cacheOpen=storageDetails.open;
    return;
  }
  const details=e.target?.closest?.('details[data-city-scenarios]');
  if(!details||!details.open||details.dataset.loaded==='1')return;
  const f=state.forecasts[details.dataset.cityScenarios],body=details.querySelector('[data-scenario-body]');if(!f||!body)return;
  const scenarios=cachedScenarios(f,3);
  body.innerHTML=scenarios.length?scenarios.map(s=>`<div class="scenario"><span class="scenario-icon">${scenarioIcon(s.kind)}</span><span><span class="scenario-main">${esc(scenarioLabel(s))}</span><span class="cell-sub">${esc(i18n().t('scenarioModels',{used:s.modelCount,total:s.totalModelCount,models:i18n().t(s.totalModelCount===1?'modelSingular':'models')}))}</span></span></div>`).join(''):`<div class="small">${esc(i18n().t('noScenarioAvailable'))}</div>`;
  details.dataset.loaded='1';
}
function handleAppInput(e){
  if(e.target?.id==='city-search')scheduleSearch(e.target.value);
  else if(e.target?.dataset?.backupOption){state.backupOptions[e.target.dataset.backupOption]=Boolean(e.target.checked);}
  else if(e.target?.id==='backup-file-input'){const file=e.target.files?.[0];e.target.value='';if(file)void importLocalBackupFile(file);}
}

function updateSettingsChoiceButtons(attr,value){
  document.querySelectorAll?.(`[${attr}]`).forEach(btn=>{const active=btn.getAttribute(attr)===String(value);btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
}
function refreshSettingsHistoryRows(){
  if(state.route.name!=='settings')return;const list=document.querySelector?.('.history-refresh-list');if(!list)return;
  const directive=interactionScrollContext||captureScrollContext();
  list.innerHTML=state.cities.length?state.cities.map(city=>renderBiasHistoryManagementRow(city)).join(''):`<div class="empty-state compact">${esc(i18n().t('addCityForHistory'))}</div>`;
  if(!stabilizeLocalScroll(directive))applyScrollDirective(directive);
}
function routeShowsWeatherActivity(){return ['home','city','compare','bias'].includes(state.route.name);}

function handleAppClick(e){
  const target=e.target.closest?.('[data-action],[data-city-open],[data-city-menu],[data-refresh-city],[data-remove-city],[data-add-city-id],[data-confidence-metric],[data-chart-horizon],[data-detail-mode],[data-detail-tab],[data-timeline-mode],[data-theme],[data-language],[data-refresh-interval],[data-model-sort],[data-model-toggle],[data-bias-refresh-city],[data-bias-model],[data-scroll-section],[data-compare-model],[data-export-format],[data-agreement-time],[data-density],[data-city-compare-toggle],[data-evolution-variable],[data-reliability-variable],[data-local-weighting],[data-collapse-section],[data-error-action]');
  if(!target||!app.contains(target))return;
  const previousInteractionScroll=interactionScrollContext;interactionScrollContext=captureScrollContext(target);
  try{
  if(target.dataset.errorAction){handleErrorAction(target);return;}
  if(target.dataset.action){handleAction({currentTarget:target,target:e.target});return;}
  if(target.dataset.cityMenu){e.stopPropagation();lastFocusedBeforeModal=document.activeElement;state.modal={type:'cityMenu',cityId:target.dataset.cityMenu};render();return;}
  if(target.dataset.refreshCity){e.stopPropagation();state.modal=null;refreshCity(target.dataset.refreshCity,true);return;}
  if(target.dataset.removeCity){removeCity(target.dataset.removeCity);return;}
  if(target.dataset.addCityId){addCityFromSearch(target.dataset.addCityId);return;}
  if(target.dataset.confidenceMetric){state.settings.confidenceMetric=target.dataset.confidenceMetric;persistSettings();syncCityViewUrl();rerenderCitySectionOrPage('agreement');return;}
  if(target.dataset.chartHorizon){state.settings.chartHorizon=Number(target.dataset.chartHorizon);persistSettings();syncCityViewUrl();rerenderCitySectionOrPage('agreement');return;}
  if(target.dataset.detailMode){state.settings.detailViewMode=target.dataset.detailMode;persistSettings();syncCityViewUrl();rerenderCitySectionOrPage('details');return;}
  if(target.dataset.detailTab){state.settings.detailTab=target.dataset.detailTab;persistSettings();syncCityViewUrl();rerenderCitySectionOrPage('details');return;}
  if(target.dataset.timelineMode){state.settings.timelineMode=target.dataset.timelineMode;persistSettings();syncCityViewUrl();rerenderCitySectionOrPage('timeline');return;}
  if(target.dataset.evolutionVariable){state.evolutionVariable=target.dataset.evolutionVariable;rerenderCitySectionOrPage('evolution');return;}
  if(target.dataset.reliabilityVariable){state.reliabilityVariable=target.dataset.reliabilityVariable;rerenderCitySectionOrPage('reliability');return;}
  if(target.dataset.localWeighting){state.settings.localWeightedConsensus=target.dataset.localWeighting==='on';persistSettings();updateSettingsChoiceButtons('data-local-weighting',target.dataset.localWeighting);stabilizeLocalScroll(interactionScrollContext);return;}
  if(target.dataset.theme){state.settings.theme=target.dataset.theme;persistSettings();updateSettingsChoiceButtons('data-theme',target.dataset.theme);stabilizeLocalScroll(interactionScrollContext);return;}
  if(target.dataset.language){const nextLanguage=target.dataset.language,directive=interactionScrollContext;void changeLanguage(nextLanguage,directive);return;}
  if(target.dataset.refreshInterval){state.settings.refreshInterval=target.dataset.refreshInterval;persistSettings();updateSettingsChoiceButtons('data-refresh-interval',target.dataset.refreshInterval);stabilizeLocalScroll(interactionScrollContext);void refreshDueCities();return;}
  if(target.dataset.modelSort){state.settings.modelSort=target.dataset.modelSort;persistSettings();render({scroll:interactionScrollContext,immediate:true});return;}
  if(target.dataset.modelToggle){toggleModel(target.dataset.modelToggle);return;}
  if(target.dataset.density){state.settings.density=target.dataset.density;persistSettings();updateSettingsChoiceButtons('data-density',target.dataset.density);stabilizeLocalScroll(interactionScrollContext);return;}
  if(target.dataset.compareModel){const key=state.route.name==='city'?state.route.id:'global',panel=target.closest?.('[data-target-compare]');if(panel)state.comparePanelOpen[key]=panel.dataset.open==='true';const id=target.dataset.compareModel,set=new Set(state.compareModelIds);if(set.has(id))set.delete(id);else{if(set.size>=4){toast(i18n().t('targetedComparisonMax4'));return;}set.add(id);}state.compareModelIds=[...set];syncCityViewUrl();rerenderTargetedComparisonPanel();return;}
  if(target.dataset.exportFormat){exportCityData(state.route.id,target.dataset.exportFormat);return;}
  if(target.dataset.agreementTime){lastFocusedBeforeModal=document.activeElement;state.modal={type:'confidence',cityId:state.route.id,focusTimestamp:target.dataset.agreementTime,focusEpoch:Number.isFinite(Number(target.dataset.agreementEpoch))?Number(target.dataset.agreementEpoch):null};render();return;}
  if(target.dataset.cityCompareToggle&&state.modal?.type==='cityCompare'){const id=target.dataset.cityCompareToggle,set=new Set(state.modal.selectedIds||[]);if(set.has(id))set.delete(id);else{if(set.size>=3){toast(i18n().t('cityComparisonMax3'));return;}set.add(id);}state.modal.selectedIds=[...set];render();return;}
  if(target.dataset.biasModel&&target.dataset.biasVariable){const cityId=target.dataset.biasCity||state.route.id;if(cityId)go(`#/city/${encodeURIComponent(cityId)}/bias/${encodeURIComponent(target.dataset.biasModel)}/${encodeURIComponent(target.dataset.biasVariable)}`);return;}
  if(target.dataset.biasRefreshCity){const city=state.cities.find(c=>c.id===target.dataset.biasRefreshCity),plan=biasRefreshPlan(target.dataset.biasRefreshCity);if(city&&!plan.missingDays.length){toast(i18n().t('historyAlreadyCurrent',{city:city.name}));return;}if(city&&confirm(i18n().t('historyRefreshConfirm',{city:city.name,days:plan.missingDays.length,models:modelCountLabel(plan.models.length),calls:archiveCallLabel(plan.requestCount)})))refreshBiasForCity(target.dataset.biasRefreshCity);return;}
  if(target.dataset.collapseSection){const sectionId=target.dataset.collapseSection,card=target.closest('.collapsible-card'),collapsed=card?.dataset.collapsed!=='true';setSectionCollapsed(sectionId,collapsed);if(card){card.dataset.collapsed=String(collapsed);target.setAttribute('aria-expanded',String(!collapsed));target.setAttribute('aria-label',collapsed?i18n().t('expandSection'):i18n().t('collapseSection'));target.title=collapsed?i18n().t('expandSection'):i18n().t('collapseSection');}return;}
  if(target.dataset.scrollSection){const sectionId=target.dataset.scrollSection;if(sectionCollapsed(sectionId)){setSectionCollapsed(sectionId,false);const card=document.getElementById?.(sectionId)?.querySelector?.('.collapsible-card')||document.getElementById?.(sectionId);if(card?.classList?.contains('collapsible-card')){card.dataset.collapsed='false';const btn=card.querySelector?.('[data-collapse-section]');if(btn){btn.setAttribute('aria-expanded','true');btn.setAttribute('aria-label',i18n().t('collapseSection'));btn.title=i18n().t('collapseSection');}}}document.getElementById?.(sectionId)?.scrollIntoView?.({behavior:'smooth',block:'start'});return;}
  if(target.dataset.cityOpen){if(e.target.closest('button,a')&&e.target.closest('[data-city-open]')!==e.target.closest('button,a'))return;go(`#/city/${encodeURIComponent(target.dataset.cityOpen)}`);}
  }finally{interactionScrollContext=previousInteractionScroll;}
}


function handleErrorAction(target){
  const action=target.dataset.errorAction,cityId=target.dataset.errorCity,scope=target.dataset.errorScope;
  if(action==='retry'&&cityId){state.errorCenter.resolve(scope);void refreshCity(cityId,true);return;}
  if(action==='use-cache'){state.errorCenter.dismiss(scope);render();return;}
  if(action==='diagnostics'&&cityId){state.diagnosticsOpen.add(cityId);state.errorCenter.dismiss(scope);rerenderCitySectionOrPage('diagnostics');requestAnimationFrame(()=>document.getElementById('diagnostics')?.scrollIntoView?.({behavior:'smooth',block:'start'}));return;}
  if(action==='settings'){go('#/settings');return;}
  if(action==='local-data'||action==='clear-old-data'){go('#/data');return;}
  state.errorCenter.dismiss(scope);render();
}

function handleAction(e){
  const action=e.currentTarget.dataset.action;
  if(action==='back')history.length>1?history.back():go('#/');
  else if(action==='home')go('#/');
  else if(action==='quick-city'){const id=e.currentTarget.dataset.cityId;if(id)go(`#/city/${encodeURIComponent(id)}`);}
  else if(action==='open-watch-city'){const id=e.currentTarget.dataset.cityId;if(id)go(`#/city/${encodeURIComponent(id)}`);}
  else if(action==='toggle-target-compare'){const key=state.route.name==='city'?state.route.id:'global',panel=e.currentTarget.closest?.('[data-target-compare]'),next=panel?.dataset.open!=='true';state.comparePanelOpen[key]=next;if(panel){panel.dataset.open=String(next);const btn=panel.querySelector?.('[data-action="toggle-target-compare"]');if(btn)btn.setAttribute('aria-expanded',String(next));const body=panel.querySelector?.('.target-compare-body');if(body)body.hidden=!next;} }
  else if(action==='settings')go('#/settings');
  else if(action==='local-data'){state.localDataStats=null;state.localDataError=null;go('#/data');}
  else if(action==='about')go('#/about');
  else if(action==='install-pwa'){if(!deferredInstallPrompt){toast(pwaInstallGuidance().text);return;}void trackAnalyticsEvent('PWA Install Click',state.route);const promptEvent=deferredInstallPrompt;promptEvent.prompt();promptEvent.userChoice?.then(choice=>{if(choice?.outcome==='accepted'){deferredInstallPrompt=null;}else toast(i18n().t('pwaInstallDismissed'));if(state.route.name==='about')render();}).catch(()=>toast(pwaInstallGuidance().text));}
  else if(action==='copy-link'){if(state.route.name==='city')syncCityViewUrl();const url=location.href;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>toast(i18n().t('linkCopied'))).catch(()=>prompt(i18n().t('copyLinkPrompt'),url));else prompt(i18n().t('copyLinkPrompt'),url);}
  else if(action==='open-city-compare'){lastFocusedBeforeModal=document.activeElement;const initial=state.route.name==='compare'?(state.route.ids||[]):state.cities.slice(0,Math.min(2,state.cities.length)).map(c=>c.id);state.modal={type:'cityCompare',selectedIds:[...initial]};render();}
  else if(action==='apply-city-compare'){const ids=state.modal?.type==='cityCompare'?(state.modal.selectedIds||[]):[];if(ids.length<2){toast(i18n().t('selectAtLeastTwoCities'));return;}state.modal=null;go(`#/compare?cities=${ids.map(encodeURIComponent).join(',')}`);}
  else if(action==='refresh-all')refreshAll(true);
  else if(action==='open-add-city'){lastFocusedBeforeModal=document.activeElement;cancelCitySearch();state.modal={type:'addCity',query:'',results:[],searching:false,pending:false};render();}
  else if(action==='close-modal'){closeModal();}
  else if(action==='modal-backdrop'&&e.target===e.currentTarget){closeModal();}
  else if(action==='why-confidence'){lastFocusedBeforeModal=document.activeElement;state.modal={type:'confidence',cityId:state.route.id};render();}
  else if(action==='donate'){lastFocusedBeforeModal=document.activeElement;state.modal={type:'donate'};render();}
  else if(action==='activate-marine'){const id=e.currentTarget.dataset.marineCity;state.modal=null;render();if(id)void refreshMarineData(id,true,true);}
  else if(action==='refresh-marine'){const id=e.currentTarget.dataset.marineCity||state.route.id;state.modal=null;if(id)void refreshMarineData(id,true,false);}
  else if(action==='refresh-local-data'){state.localDataStats=null;state.localDataError=null;void refreshLocalDataStats(interactionScrollContext);}
  else if(action==='refresh-model-health'){const id=state.route.id;if(id)void refreshModelHealthData(id,true);}
  else if(action==='toggle-diagnostics'){const id=state.route.id;if(!id)return;if(state.diagnosticsOpen.has(id))state.diagnosticsOpen.delete(id);else state.diagnosticsOpen.add(id);rerenderCitySectionOrPage('diagnostics');}
  else if(action==='toggle-analytics'){const status=analyticsStatus();setAnalyticsOptOut(!status.optedOut);if(status.optedOut)void trackPageView(state.route);render({scroll:interactionScrollContext,immediate:true});}
  else if(action==='check-integrity'){void runIntegrityCheck(false,interactionScrollContext);}
  else if(action==='repair-integrity'){if(confirm(i18n().t('integrityRepairConfirm')))void runIntegrityCheck(true,interactionScrollContext);}
  else if(action==='export-backup'){void exportLocalBackupFile();}
  else if(action==='import-backup'){document.getElementById('backup-file-input')?.click();}
  else if(action==='clear-data'){if(confirm(i18n().t('clearDataConfirm'))){cityRefreshTokens.clear();biasRefreshTokens.clear();normalsRefreshTokens.clear();state.loading.clear();state.biasRefresh.clear();armPwaClearReloadGuard();clearAllData({includePwa:true}).finally(()=>location.reload());}}
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
  if(q.length>0&&q.length<3)return `<div class="small search-hint">${esc(i18n().t('searchMinChars'))}</div>`;
  if(state.modal.pending)return `<div class="small search-hint">${esc(i18n().t('searchDebounce'))}</div>`;
  if(q.length>=3&&!state.modal.searching&&!(state.modal.results||[]).length)return `<div class="small search-hint">${esc(i18n().t('noCityResults'))}</div>`;
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
function removeCity(id){cityRefreshTokens.delete(id);biasRefreshTokens.delete(id);normalsRefreshTokens.delete(id);localAnalysisLoaded.bias.delete(id);localAnalysisLoaded.evolution.delete(id);localAnalysisLoaded.normals.delete(id);localAnalysisLoaded.marine.delete(id);localAnalysisLoaded.health.delete(id);state.loading.delete(id);state.marineLoading.delete(id);state.biasRefresh.delete(id);state.cities=state.cities.filter(c=>c.id!==id);saveCities(state.cities);delete state.forecasts[id];delete state.errors[id];delete state.evolution[id];delete state.bias[id];delete state.normals[id];delete state.marine[id];delete state.modelHealth[id];delete state.modelHealthHistory[id];deleteCityData(id);state.modal=null;if((state.route.name==='city'||state.route.name==='bias')&&state.route.id===id)go('#/');else render();}
function invalidateWeatherRefreshes(){cityRefreshTokens.clear();state.loading.clear();}
function toggleModel(id){const set=new Set(state.settings.enabledModelIds);if(set.has(id)){if(set.size<=1){toast(i18n().t('atLeastOneModel'));return;}set.delete(id);}else set.add(id);state.settings.enabledModelIds=WEATHER_MODELS.filter(m=>set.has(m.id)).map(m=>m.id);invalidateWeatherRefreshes();persistSettings();const on=set.has(id),btn=document.querySelector?.(`[data-model-toggle="${String(id).replace(/"/g,'\\"')}"]`);if(btn){btn.classList.toggle('on',on);btn.setAttribute('aria-checked',String(on));}refreshSettingsHistoryRows();toast(i18n().t('modelSelectionUpdated'));if(state.online)void refreshAll(true);}

async function changeLanguage(nextLanguage,directive){
  try{await ensureLanguage(nextLanguage);state.settings.language=nextLanguage;i18nCacheKey=null;persistSettings();render({scroll:directive,immediate:true});}
  catch(err){toast(humanError(err));}
}

function refreshIntervalMinutes(){return REFRESH_INTERVALS.find(x=>x.id===state.settings.refreshInterval)?.minutes??60;}
function isForecastFresh(f){const minutes=refreshIntervalMinutes();if(!f?.fetchedAt)return false;const requested=Array.isArray(f.requestedModelIds)&&f.requestedModelIds.length?f.requestedModelIds:[...new Set([...Object.keys(f.seriesByModel||{}),...Object.keys(f.errors||{})])],current=state.settings.enabledModelIds||[],sameModels=requested.length===current.length&&[...requested].sort().every((id,i)=>id===[...current].sort()[i]);if(!sameModels)return false;if(minutes===0)return true;const age=Date.now()-Date.parse(f.fetchedAt);return age>=0&&age<minutes*60000;}
async function refreshDueCities(){
  if(!state.online||dueRefreshRunning||document.visibilityState==='hidden')return;const minutes=refreshIntervalMinutes();if(minutes===0)return;
  const due=state.cities.filter(city=>{const f=state.forecasts[city.id];return !f||!isForecastFresh(f);});
  if(!due.length)return;dueRefreshRunning=true;const showActivity=routeShowsWeatherActivity();if(showActivity)render();
  try{for(const city of due)await refreshCity(city.id,false,false);}finally{dueRefreshRunning=false;if(showActivity)render();}
}
async function refreshAll(force=false){
  const cities=[...state.cities];if(!cities.length)return;const workers=Math.min(2,cities.length);let i=0;
  const tasks=Array.from({length:workers},async()=>{while(i<cities.length){const c=cities[i++];await refreshCity(c.id,force,false);}}),showActivity=routeShowsWeatherActivity();
  if(showActivity)render();
  try{await Promise.all(tasks);}finally{if(showActivity)render();}
}
async function refreshCity(cityId,force=false,renderUpdates=true){
  const city=state.cities.find(c=>c.id===cityId);if(!city||state.loading.has(cityId))return;if(!state.online){if(!state.forecasts[cityId]){const d=classifyError({code:'OFFLINE_NO_CACHE'},{hasCache:false});state.errorCenter.report(`city:${cityId}:network`,d);state.errors[cityId]=errorDescriptorMessage(d);}else{state.errorCenter.report(`city:${cityId}:network`,{...classifyError({code:'STALE_CACHE'},{hasCache:true}),scope:`city:${cityId}:network`});}if(renderUpdates)render();return;}if(!force&&state.forecasts[cityId]&&isForecastFresh(state.forecasts[cityId]))return;
  const token=Symbol(cityId);cityRefreshTokens.set(cityId,token);state.loading.add(cityId);delete state.errors[cityId];if(renderUpdates)render();
  try{const f=await fetchForecast(city,state.settings.enabledModelIds,7);if(cityRefreshTokens.get(cityId)!==token||!state.cities.some(c=>c.id===cityId))return;const resolvedTimezone=f?.city?.timezone||f?.timezone;if(resolvedTimezone&&city.timezone!==resolvedTimezone){city.timezone=resolvedTimezone;saveCities(state.cities);}state.forecasts[cityId]=f;await saveForecast(cityId,f);if(cityRefreshTokens.get(cityId)!==token||!state.cities.some(c=>c.id===cityId)){if(!cityRefreshTokens.get(cityId)||!state.cities.some(c=>c.id===cityId))deleteForecast(cityId);return;}state.evolution[cityId]=recordEvolutionSnapshot(cityId,f);localAnalysisLoaded.evolution.add(cityId);delete state.errors[cityId];state.errorCenter.resolve(`city:${cityId}:network`);const degraded=Object.values(f.modelMeta||{}).filter(m=>m?.dataWarning==='PARTIAL_HOURLY_SERIES').length;if(degraded)state.errorCenter.report(`city:${cityId}:partial`,{code:'PARTIAL_MODELS',severity:'warning',titleKey:'errorPartialModelsTitle',messageKey:'errorPartialModelsBody',actions:['diagnostics','retry'],technical:String(degraded)});else state.errorCenter.resolve(`city:${cityId}:partial`);if(state.route.name==='city'&&state.route.id===cityId)scheduleIdle(()=>ensureNormals(cityId));if((state.modelHealthHistory[cityId]||[]).length)scheduleIdle(()=>refreshModelHealthData(cityId,true));}
  catch(err){if(cityRefreshTokens.get(cityId)===token&&state.cities.some(c=>c.id===cityId)){const descriptor=classifyError(err,{hasCache:Boolean(state.forecasts[cityId])});state.errorCenter.report(`city:${cityId}:network`,descriptor);state.errors[cityId]=errorDescriptorMessage(descriptor);if(!state.forecasts[cityId])toast(state.errors[cityId]);}}
  finally{if(cityRefreshTokens.get(cityId)===token){cityRefreshTokens.delete(cityId);state.loading.delete(cityId);if(renderUpdates)render();}}
}
function humanError(err){const {t}=i18n();if(err?.name==='AbortError')return t('weatherTimeout');if(err?.code==='NO_MODELS_ENABLED')return t('noModelsEnabled');if(err?.code==='NO_USABLE_MODELS')return t('noUsableModels');if(err?.code==='HTTP_ERROR')return t('openMeteoHttpError',{status:err.status||'?'});if(err?.code==='OPEN_METEO_ERROR')return t('openMeteoRejected');if(err?.code==='LOCAL_API_BUDGET_EXCEEDED')return t('apiBudgetExceeded');const m=String(err?.message||err||t('unknownError'));if(/Failed to fetch/i.test(m))return t('openMeteoUnreachable');if(m==='NO_MODELS_ENABLED')return t('noModelsEnabled');if(m==='NO_USABLE_MODELS')return t('noUsableModels');return m;}

function onRouteSettled(){if(state.route.name==='city'||state.route.name==='bias'){warmCityFeatures();const id=state.route.id;if(!state.forecasts[id])refreshCity(id,false);else if(state.route.name==='city'){scheduleIdle(()=>ensureNormals(id));const city=state.cities.find(c=>c.id===id);if(city?.marineEnabled){ensureMarineLoaded(id);scheduleIdle(()=>refreshMarineData(id,false,false));}}}else if(state.route.name==='compare'){const missing=(state.route.ids||[]).filter(id=>!state.forecasts[id]);if(missing.length)Promise.all(missing.map(id=>refreshCity(id,false,false))).finally(()=>render());}}
function scheduleIdle(fn){if('requestIdleCallback' in window)requestIdleCallback(()=>fn(),{timeout:1200});else setTimeout(fn,80);}
async function ensureNormals(cityId){
  const city=state.cities.find(c=>c.id===cityId);if(!city||!state.online)return;const cached=state.normals[cityId]||loadNormals(cityId);if(cached&&Date.now()-(cached.computedAt||0)<180*24*3600e3){state.normals[cityId]=cached;return;}
  if(state.normals[cityId]?.loading)return;const token=Symbol(cityId);normalsRefreshTokens.set(cityId,token);state.normals[cityId]={...(cached||{}),loading:true};
  const today=cityToday(city.timezone);const lastYear=+today.slice(0,4)-1;const start=`${lastYear-9}-01-01`,end=`${lastYear}-12-31`,stillCurrent=()=>normalsRefreshTokens.get(cityId)===token&&state.cities.some(c=>c.id===cityId);
  try{const raw=await fetchClimateNormals(city,start,end);if(!stillCurrent())return;const agg=aggregateNormals(raw,start,end);if(!agg.complete)throw new Error(i18n().t('era5Incomplete'));const payload={computedAt:Date.now(),startDate:start,endDate:end,normals:agg.normals};if(!stillCurrent())return;state.normals[cityId]=payload;localAnalysisLoaded.normals.add(cityId);saveNormals(cityId,payload);if(state.route.name==='city'&&state.route.id===cityId)render();}
  catch(err){if(stillCurrent()){state.normals[cityId]=cached||null;console.warn('Climate normals:',err);}}
  finally{if(normalsRefreshTokens.get(cityId)===token)normalsRefreshTokens.delete(cityId);}
}

function dateRangeList(start,end){const out=[];for(let d=start;d<=end;d=addDays(d,1))out.push(d);return out;}
function contiguousDateRanges(dates){const sorted=[...new Set(dates)].sort();if(!sorted.length)return [];const ranges=[];let start=sorted[0],prev=sorted[0];for(const d of sorted.slice(1)){if(d===addDays(prev,1)){prev=d;continue;}ranges.push({start,end:prev});start=prev=d;}ranges.push({start,end:prev});return ranges;}
function biasRefreshPlan(cityId,windowDays=30){
  ensureBiasLoaded(cityId);
  const city=state.cities.find(c=>c.id===cityId);if(!city)return {models:[],missingDays:[],forecastRanges:[],observationRanges:[],requestCount:0};
  const enabledIds=new Set(state.settings.enabledModelIds||[]),availableIds=Object.keys(state.forecasts[cityId]?.seriesByModel||{}),targetIds=availableIds.length?availableIds.filter(id=>enabledIds.has(id)):state.settings.enabledModelIds,models=selectedModels(targetIds).filter(m=>m.supportsDay1Bias!==false),today=cityToday(city.timezone),end=addDays(today,-BIAS_REFERENCE_LAG_DAYS),start=addDays(end,-windowDays+1),dates=dateRangeList(start,end),source=state.bias[cityId]||{forecasts:[],observations:[]},variables=['TEMPERATURE','PRECIPITATION','WIND_SPEED'];
  const fset=new Set((source.forecasts||[]).map(x=>`${x.modelId}|${x.variable}|${x.targetDate}`)),referenceCurrent=source.reference===BIAS_REFERENCE_ID,oset=new Set((referenceCurrent?source.observations:[]).map(x=>`${x.variable}|${x.targetDate}`));
  const missingForecastDates=dates.filter(date=>models.some(m=>variables.some(v=>!fset.has(`${m.id}|${v}|${date}`)))),missingObservationDates=dates.filter(date=>variables.some(v=>!oset.has(`${v}|${date}`))),missingDays=[...new Set([...missingForecastDates,...missingObservationDates])].sort(),forecastRanges=contiguousDateRanges(missingForecastDates),observationRanges=contiguousDateRanges(missingObservationDates);
  return {models,start,end,missingDays,forecastRanges,observationRanges,requestCount:forecastRanges.length+observationRanges.length};
}
async function refreshBiasForCity(cityId){
  ensureBiasLoaded(cityId);
  const city=state.cities.find(c=>c.id===cityId);if(!city||state.biasRefresh.has(cityId))return;if(!state.online){toast(i18n().t('historyOnlineRequired'));return;}const plan=biasRefreshPlan(cityId);if(!plan.missingDays.length){toast(i18n().t('historyAlreadyComplete',{city:city.name}));render();return;}const token=Symbol(cityId);biasRefreshTokens.set(cityId,token);state.biasRefresh.add(cityId);render();
  try{
    const forecasts=[],observations=[],stillCurrent=()=>biasRefreshTokens.get(cityId)===token&&state.cities.some(c=>c.id===cityId);
    const biasEngine=await loadFeature('bias');if(!stillCurrent())return;
    for(const r of plan.forecastRanges){const prev=await fetchPreviousRuns(city,plan.models,r.start,r.end);if(!stillCurrent())return;forecasts.push(...biasEngine.normalizePreviousRuns(prev,city,plan.models,r.start,r.end));}
    for(const r of plan.observationRanges){const archive=await fetchBiasArchive(city,r.start,r.end);if(!stillCurrent())return;observations.push(...biasEngine.normalizeBiasObservations(archive,r.start,r.end));}
    if(!stillCurrent())return;const today=cityToday(city.timezone),old=state.bias[cityId]||{forecasts:[],observations:[],updatedAt:null},mergedForecasts=dedupe([...(old.forecasts||[]),...forecasts],x=>`${x.modelId}|${x.variable}|${x.targetDate}`),trustedOldObs=old.reference===BIAS_REFERENCE_ID?(old.observations||[]):[],mergedObs=dedupe([...trustedOldObs,...observations],x=>`${x.variable}|${x.targetDate}`),cutoff=addDays(today,-45);
    const nextBias={reference:BIAS_REFERENCE_ID,referenceLagDays:BIAS_REFERENCE_LAG_DAYS,forecasts:mergedForecasts.filter(x=>x.targetDate>=cutoff),observations:mergedObs.filter(x=>x.targetDate>=cutoff),updatedAt:Date.now()};state.bias[cityId]=nextBias;localAnalysisLoaded.bias.add(cityId);saveBias(cityId,nextBias);toast(i18n().t('historyCompleted',{city:city.name,days:plan.missingDays.length,calls:archiveCallLabel(plan.requestCount)}));
  }catch(err){if(biasRefreshTokens.get(cityId)===token&&state.cities.some(c=>c.id===cityId))toast(i18n().t('historyBiasError',{city:city.name,error:humanError(err)}));}finally{if(biasRefreshTokens.get(cityId)===token){biasRefreshTokens.delete(cityId);state.biasRefresh.delete(cityId);render();}}
}
function dedupe(list,key){const m=new Map();for(const x of list)m.set(key(x),x);return [...m.values()];}
