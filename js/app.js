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
};
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
let lastFocusedBeforeModal = null;
let i18nCacheKey = null;
let i18nCache = null;
const numberFormatters = new Map();
const forecastViewCache = new WeakMap();
const seriesIndexCache = new WeakMap();

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
  window.addEventListener('hashchange',()=>{state.route=parseRoute();state.modal=null;cancelCitySearch();render();onRouteSettled();});
  window.addEventListener('online',()=>{state.online=true;render();refreshDueCities();});
  window.addEventListener('offline',()=>{state.online=false;render();});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='SYSTEM')applyTheme();});
  render();
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
  const hash=(location.hash||'#/').replace(/^#/,''); const parts=hash.split('/').filter(Boolean);
  if(parts[0]==='settings')return {name:'settings'}; if(parts[0]==='city'&&parts[1])return {name:'city',id:decodeURIComponent(parts[1])}; return {name:'home'};
}
function go(path){ location.hash=path; }
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
function confidencePill(percent,count){ if(!Number.isFinite(percent))return '';return `<span class="pill confidence ${confidenceClass(percent)}">◎ ${percent}%${count?` · ${count}`:''}</span>`; }
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
  document.documentElement.dataset.theme=dark?'dark':'light'; document.documentElement.lang=languageCode(state.settings.language);
}

function render(){
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;renderNow();});
}
function renderNow(){
  const {t}=i18n();
  let content=''; if(state.route.name==='home')content=renderHome(); else if(state.route.name==='settings')content=renderSettings(); else content=renderCityDetail(state.route.id);
  app.innerHTML=`${renderTopbar()}${!state.online?`<div class="page"><div class="banner warn" role="status">📡 ${esc(t('offline'))}</div></div>`:''}${content}${renderModal()}`;
  document.body?.classList?.toggle?.('modal-open',Boolean(state.modal));
  if(state.modal){queueMicrotask(()=>{const input=document.querySelector('#city-search');const dialog=document.querySelector('.modal');(input||dialog?.querySelector('button,input,a,[tabindex]:not([tabindex="-1"])'))?.focus?.({preventScroll:true});});}
}

function renderTopbar(){
  const {t}=i18n();
  const isHome=state.route.name==='home', isSettings=state.route.name==='settings';
  const refreshBusy=state.loading.size>0;
  return `<header class="topbar"><div class="topbar-inner">
    ${!isHome?`<button class="icon-btn" data-action="back" aria-label="${esc(t('back'))}" title="${esc(t('back'))}">←</button>`:''}
    <div class="brand" role="link" tabindex="0" data-action="home" aria-label="MeteoCompare — ${esc(t('cities'))}"><img class="logo" src="assets/icon.png" alt=""><div><div class="brand-title">MeteoCompare</div><div class="brand-subtitle">${esc(t('subtitle'))}</div></div></div>
    <nav class="topbar-nav" aria-label="Navigation principale">
      <button class="nav-btn ${isHome?'active':''}" data-action="home" ${isHome?'aria-current="page"':''}><span>⌂</span><span>${esc(t('cities'))}</span></button>
      <button class="nav-btn ${isSettings?'active':''}" data-action="settings" ${isSettings?'aria-current="page"':''}><span>⚙</span><span>${esc(t('settings'))}</span></button>
    </nav>
    <div class="topbar-spacer"></div>
    <div class="topbar-actions">
      ${isHome?`<button class="btn tonal" data-action="refresh-all" ${refreshBusy?'disabled':''}><span class="btn-icon">${refreshBusy?'⟳':'↻'}</span><span class="btn-label">${esc(t('refresh'))}</span></button><button class="btn primary" data-action="open-add-city"><span class="btn-icon">＋</span><span class="btn-label">${esc(t('addCity'))}</span></button>`:''}
      ${!isHome&&!isSettings?`<button class="btn tonal" data-action="settings"><span class="btn-icon">⚙</span><span class="btn-label">${esc(t('settings'))}</span></button>`:''}
    </div>
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
  return `<main class="page"><section class="hero"><div class="hero-copy"><div class="eyebrow">Dashboard météo</div><h1>${esc(t('cities'))}</h1><p>${esc(t('webHomeIntro'))}</p></div><div class="page-actions"><button class="btn tonal" data-action="refresh-all" ${busy?'disabled':''}>${busy?'⟳':'↻'} ${esc(t('refresh'))}</button><button class="btn primary" data-action="open-add-city">＋ ${esc(t('addCity'))}</button></div></section>
  <section class="dashboard-kpis" aria-label="Résumé"><div class="kpi"><div class="kpi-label">Villes suivies</div><div class="kpi-value">${state.cities.length}</div><div class="kpi-note">favoris enregistrés localement</div></div><div class="kpi"><div class="kpi-label">Modèles actifs</div><div class="kpi-value">${state.settings.enabledModelIds.length}</div><div class="kpi-note">sélection configurée</div></div><div class="kpi"><div class="kpi-label">Modèles disponibles</div><div class="kpi-value">${avgModels}</div><div class="kpi-note">moyenne sur les données chargées</div></div><div class="kpi"><div class="kpi-label">Caches à jour</div><div class="kpi-value">${fresh}/${state.cities.length||0}</div><div class="kpi-note">selon la cadence choisie</div></div></section>
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
    <div class="footer-line"><span>${Object.keys(f.seriesByModel).length} ${esc(t('models'))}</span><span>${esc(t('updated'))} ${esc(relativeAge(f.fetchedAt,i18n().lang))}${loading?' · ⟳':''}</span></div>
    ${err?`<div class="banner error" style="margin-bottom:0">${esc(err)}</div>`:''}
  </div></article>`;
}

function renderHeatmap(heat){
  const temps=heat.map(x=>x.temp).filter(Number.isFinite); const lo=temps.length?Math.min(...temps):0,hi=temps.length?Math.max(...temps):1,span=Math.max(.1,hi-lo);
  return `<div class="heatmap-strip" aria-label="Prévision température sur 12 heures">${heat.map(x=>{const n=Number.isFinite(x.temp)?(x.temp-lo)/span:.5;const hue=Math.round(210-(210*n));const bg=`hsl(${hue} 65% ${document.documentElement.dataset.theme==='dark'?30:80}%)`;return `<div class="heat-cell" style="background:${bg}" title="${attr(timeLabel(x.timestamp))} · ${Number.isFinite(x.temp)?fmt(x.temp,1)+'°C':'—'}${Number.isFinite(x.precipProbability)?' · '+x.precipProbability+'% pluie':''}"><span class="heat-temp">${Number.isFinite(x.temp)?Math.round(x.temp)+'°':''}</span>${x.precipProbability>=30?'<span class="rain-dot"></span>':''}</div>`;}).join('')}</div>`;
}

function renderCityDetail(cityId){
  const {t}=i18n(); const city=state.cities.find(c=>c.id===cityId); if(!city)return `<main class="page"><div class="empty-state"><h2>Ville introuvable</h2><button class="btn" data-action="home">${esc(t('back'))}</button></div></main>`;
  const f=state.forecasts[cityId]; const loading=state.loading.has(cityId); const err=state.errors[cityId];
  if(!f)return `<main class="page"><section class="detail-hero"><div class="detail-title"><h1>${esc(city.name)}</h1><p>${esc(placeLine(city))}</p></div></section>${err?`<div class="banner error">${esc(err)}</div>`:''}<div class="section-card">${loading?'<div class="loader"></div> '+esc(t('loading')):`<button class="btn primary" data-refresh-city="${attr(city.id)}">↻ ${esc(t('refresh'))}</button>`}</div></main>`;
  const today=cityToday(f.city.timezone); const agg=cachedAggregateDay(f,today); const now=currentConditions(f); const inf=localizedConditionInfo(now.condition||agg.condition); const scenarios=cachedScenarios(f); const evolution=cachedEvolution(f,state.evolution[cityId]||[]); const biasSource=state.bias[cityId]||{forecasts:[],observations:[]}; const biases=cachedBiases(f,biasSource,today); const loadingLabel=loading?' · actualisation…':'';
  const modelCount=Object.keys(f.seriesByModel).length;
  return `<main class="page detail-page">
    <section class="detail-hero professional-hero"><div class="detail-weather-mark" aria-hidden="true">${inf.icon}</div><div class="detail-title"><div class="eyebrow">Prévision multi-modèles</div><h1>${esc(city.name)}</h1><p>${esc(placeLine(city))}</p><div class="hero-meta"><span>${modelCount} modèles disponibles</span><span>Fuseau ${esc(f.city.timezone||'UTC')}</span><span>${esc(t('updated'))} ${esc(relativeAge(f.fetchedAt,i18n().lang))}${esc(loadingLabel)}</span></div></div><button class="btn tonal" data-refresh-city="${attr(city.id)}" ${loading?'disabled':''}>${loading?'⟳':'↻'} ${esc(t('refresh'))}</button></section>
    ${err?`<div class="banner error">${esc(err)}</div>`:''}
    <div class="detail-workspace">
      <aside class="detail-sidebar" aria-label="Navigation de la prévision">
        <div class="sidebar-card"><div class="sidebar-title">Vue d’ensemble</div><nav class="detail-nav" aria-label="Sections de la prévision"><button data-scroll-section="today-summary">${esc(t('today'))}</button><button data-scroll-section="timeline">${esc(t('forecastTimeline'))}</button><button data-scroll-section="agreement">${esc(t('confidenceBand'))}</button><button data-scroll-section="evolution">${esc(t('evolution'))}</button><button data-scroll-section="reliability">${esc(t('reliability'))}</button><button data-scroll-section="details">${esc(t('detailedComparison'))}</button></nav></div>
        <div class="sidebar-card data-status"><div class="sidebar-title">Données</div><div class="status-row"><span>Modèles</span><strong>${modelCount}</strong></div><div class="status-row"><span>Dernière mise à jour</span><strong>${esc(relativeAge(f.fetchedAt,i18n().lang))}</strong></div><div class="status-row"><span>État réseau</span><strong>${state.online?'En ligne':'Cache local'}</strong></div></div>
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
  const precipConfidence=c.precipitation; const precipTxt=precipConfidence?.kind==='NO_RAIN'?`${precipConfidence.percent}% · ${t('dry')}`:precipConfidence?.kind==='DIVIDED'?`${precipConfidence.percent}% · ${precipConfidence.modelsForRain}/${precipConfidence.count} ${t('rain')}`:precipConfidence?`${precipConfidence.percent}%`:'';
  const info=localizedConditionInfo(now.condition||agg.condition);
  return `<section class="section today-summary" id="today-summary"><div class="summary-card">
    <div class="summary-accent" style="--summary-accent:${info.accent||'var(--primary)'}"></div>
    <div class="summary-header"><div class="summary-now"><div class="summary-weather-icon">${conditionMarkup(now.condition||agg.condition)}</div><div><div class="summary-kicker">${esc(dateLabel(agg.date,i18n().locale,'long'))}</div><div class="summary-now-line"><span class="summary-current-temp">${Number.isFinite(now.temperature)?`${fmt(now.temperature,1)}°`:'—'}</span><span class="summary-condition">${esc(info.label)}</span></div><div class="summary-context">${modelCount} modèles analysés${agg.sunrise?` · ☀ ${t('sunrise')} ${timeLabel(agg.sunrise)}`:''}${agg.sunset?` · ◐ ${t('sunset')} ${timeLabel(agg.sunset)}`:''}</div></div></div>
      <div class="global-agreement ${Number.isFinite(overall)?confidenceClass(overall):''}"><div class="global-agreement-label">${esc(t('agreement'))} global</div><div class="global-agreement-value">${Number.isFinite(overall)?`${overall}%`:'—'}</div><div class="global-agreement-meta">${Number.isFinite(overall)?`${overall>=80?'Convergence élevée':overall>=50?'Convergence moyenne':'Désaccord marqué'} · ${modelCount} modèles`:'Données insuffisantes'}</div><button class="btn agreement-link" data-action="why-confidence">ⓘ ${esc(t('whyAgreement'))}</button></div>
    </div>
    <div class="today-grid">
      <div class="summary-tile metric-temp-min"><div class="tile-label">T° min</div><div class="big-value">${Number.isFinite(agg.tempMin)?fmt(agg.tempMin,1)+' °C':'—'}</div><div class="range">Plage ${fmtRange(...agg.tempMinRange,' °C',1)}</div>${confidencePill(c.tempMin?.percent,c.tempMin?.count)}</div>
      <div class="summary-tile metric-temp-max"><div class="tile-label">T° max</div><div class="big-value">${Number.isFinite(agg.tempMax)?fmt(agg.tempMax,1)+' °C':'—'}</div><div class="range">Plage ${fmtRange(...agg.tempMaxRange,' °C',1)}</div>${confidencePill(c.tempMax?.percent,c.tempMax?.count)}</div>
      <div class="summary-tile metric-rain"><div class="tile-label">${esc(t('precipitation'))}</div><div class="big-value">${Number.isFinite(agg.precip)?fmt(agg.precip,1)+' mm':'—'}</div><div class="range">Plage ${fmtRange(...agg.precipRange,' mm',1)}</div>${precipTxt?`<span class="pill confidence ${confidenceClass(precipConfidence.percent)}">☂ ${esc(precipTxt)}</span>`:''}</div>
      <div class="summary-tile metric-wind"><div class="tile-label">${esc(t('wind'))}</div><div class="big-value">${Number.isFinite(agg.wind)?fmt(agg.wind)+' km/h':'—'}</div><div class="range">Plage ${fmtRange(...agg.windRange,' km/h')}${Number.isFinite(agg.gust)?` · raf. ${fmt(agg.gust)} km/h`:''}</div>${confidencePill(c.windMax?.percent,c.windMax?.count)}</div>
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
function renderScenarios(scenarios){if(!scenarios.length)return '';return `<section class="section"><div class="section-card"><div class="section-head"><div><h2>${esc(i18n().t('home_scenarios_title'))}</h2><p>${esc(i18n().t('forecast_insights_subtitle_generic'))}</p></div></div><div class="scenario-list">${scenarios.map(s=>`<div class="scenario"><div class="scenario-icon">${scenarioIcon(s.kind)}</div><div><div class="scenario-main">${esc(scenarioLabel(s))}</div><div class="scenario-sub">${Number.isFinite(s.tempMin)&&Number.isFinite(s.tempMax)?`${fmt(s.tempMin)}–${fmt(s.tempMax)} °C`:''}${Number.isFinite(s.precipMax)?` · pluie ${fmtRange(s.precipMin,s.precipMax,' mm',1)}`:''}${Number.isFinite(s.gustMax)?` · rafales jusqu’à ${fmt(s.gustMax)} km/h`:''}</div></div><span class="pill">${s.modelCount}/${s.totalModelCount}</span></div>`).join('')}</div></div></section>`;}

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
  ${renderBandLegend(metric,Boolean(normals))}<div class="chart-wrap" title="Faites défiler horizontalement sur petit écran. Utilisez 24 h, 72 h ou 7 j pour changer l'échelle.">${renderBandChart(bands,metric,normals)}</div>${metric==='TEMPERATURE'&&!normals?`<div class="small">${esc(t('webNormals'))} : ${state.online?esc(t('webLoading')):esc(t('webUnavailableOffline'))}</div>`:''}</div></section>`;
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
  return `<div class="chart-legend" aria-label="Légende du graphique"><span><i class="legend-line mean"></i>Moyenne des modèles (${unit})</span><span><i class="legend-area"></i>Plage min–max inter-modèles</span>${metric==='TEMPERATURE'&&hasNormals?'<span><i class="legend-line normal"></i>Repères thermiques ERA5 sur 10 ans</span>':''}</div>`;
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
  const upper=bands.map((b,i)=>`${x(i)},${y(b.maxValue)}`).join(' ');const lower=[...bands].reverse().map((b,j)=>{const i=bands.length-1-j;return `${x(i)},${y(b.minValue)}`;}).join(' ');const mean=bands.map((b,i)=>`${x(i)},${y(b.meanValue)}`).join(' ');
  let normalsSvg='';if(metric==='TEMPERATURE'&&normals){const maxPts=[],minPts=[];bands.forEach((b,i)=>{const n=normals[b.timestamp.slice(5,10)];if(n){maxPts.push(`${x(i)},${y(n.tempMaxNormal)}`);minPts.push(`${x(i)},${y(n.tempMinNormal)}`);}});if(maxPts.length>1)normalsSvg=`<polyline class="chart-normal-max" points="${maxPts.join(' ')}"/><polyline class="chart-normal-min" points="${minPts.join(' ')}"/>`;}
  const ticks=5;let grid='';for(let i=0;i<=ticks;i++){const val=ymin+(ymax-ymin)*i/ticks;const yy=y(val);grid+=`<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}"/><text class="chart-axis" x="${pad.l-7}" y="${yy+4}" text-anchor="end">${fmt(val,metric==='PRECIPITATION'?1:0)}</text>`;}
  let xlabels='';const every=Math.max(1,Math.floor(bands.length/6));bands.forEach((b,i)=>{if(i%every===0||i===bands.length-1)xlabels+=`<text class="chart-axis" x="${x(i)}" y="${height-12}" text-anchor="middle">${esc(b.timestamp.slice(5,10)+' '+timeLabel(b.timestamp))}</text>`;});
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bande d'accord inter-modèles">${grid}<polygon class="chart-band" points="${upper} ${lower}"/><polyline class="chart-line" points="${mean}"/>${normalsSvg}${xlabels}</svg>`;
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
  return `<section class="section" id="reliability"><div class="section-card"><div class="section-head"><div><h2>${esc(t('reliability'))}</h2><p>${esc(t('webBiasDesc'))}</p></div><button class="btn tonal" data-bias-refresh-city="${attr(city.id)}" ${state.biasRefresh.has(city.id)?'disabled':''}>${state.biasRefresh.has(city.id)?'⟳':'↻'} Historique</button></div>
  ${!any?`<div class="banner info">${esc(t('biasNotReady'))} — il faut au moins 14 journées complètes par modèle et variable.</div>`:''}
  <div class="reliability-grid">${vars.map(([key,ico,label,unit])=>{const rank=reliabilityRanking(biases,key);return `<div><b>${ico} ${esc(label)}</b>${rank.length?rank.slice(0,8).map((x,i)=>`<div class="rank-row"><span class="rank-number">${i+1}</span><span><b>${esc(getModel(x.modelId)?.name||x.modelId)}</b><span class="cell-sub">${x.bias.sampleSize} jours</span></span>${renderBiasChip(x.bias,key,unit)}</div>`).join(''):`<div class="small" style="padding:12px 0">${esc(t('biasNotReady'))}</div>`}</div>`;}).join('')}</div></div></section>`;
}
function biasSignificance(bias,variable){if(!bias?.ready)return 'NONE';const a=Math.abs(bias.meanBias),ratio=bias.stdDev>0?a/bias.stdDev:Infinity;const th=variable==='TEMPERATURE'?[.3,1]:variable==='PRECIPITATION'?[.5,2]:[3,8];if(a>=th[1]&&ratio>=1)return 'HIGH';if(a>=th[0]&&ratio>=.5)return 'MODERATE';return 'LOW';}
function renderBiasChip(bias,variable,unit){if(!bias?.ready)return `<span class="bias-chip">—</span>`;const sig=biasSignificance(bias,variable),sign=bias.meanBias>0?'+':'';return `<span class="bias-chip confidence ${sig==='HIGH'?'low':sig==='MODERATE'?'medium':'high'}" title="écart-type ${fmt(bias.stdDev,1)}${unit}">${sign}${fmt(bias.meanBias,1)}${unit}</span>`;}

function renderDetailedComparison(f,biases){
  const {t}=i18n(); const mode=state.settings.detailViewMode||'DAILY'; const tab=state.settings.detailTab||'CONDITIONS'; const normals=state.normals[f.city.id]?.normals||null;
  const tabs=[['CONDITIONS',t('conditions')],['TEMPERATURE',t('temperature')],['PRECIPITATION',t('precipitation')],['WIND',t('wind')]];
  return `<section class="section" id="details"><div class="section-card detailed-card"><div class="section-head"><div><div class="section-eyebrow">Valeurs brutes</div><h2>${esc(t('detailedComparison'))}</h2><p>${esc(t('webDetailedDesc'))}</p></div></div>
  <div class="comparison-toolbar"><div class="segmented">${[['DAILY',t('daily')],['HOURLY',t('hourly')]].map(([id,l])=>`<button class="seg-btn ${mode===id?'active':''}" data-detail-mode="${id}">${esc(l)}</button>`).join('')}</div><div class="segmented">${tabs.map(([id,l])=>`<button class="seg-btn ${tab===id?'active':''}" data-detail-tab="${id}">${esc(l)}</button>`).join('')}</div></div>
  ${renderTableLegend(tab,mode,normals)}${mode==='DAILY'?renderDailyTable(f,tab,biases,normals):renderHourlyTable(f,tab,biases)}</div></section>`;
}

function seriesIndexes(series){
  let cached=seriesIndexCache.get(series);
  if(!cached){cached={hourly:new Map(series.hourly.timestamps.map((ts,i)=>[ts,i])),daily:new Map(series.daily.dates.map((date,i)=>[date,i]))};seriesIndexCache.set(series,cached);}
  return cached;
}
function visibleModelIds(f){return Object.keys(f.seriesByModel).sort((a,b)=>(getModel(a)?.resolutionKm||999)-(getModel(b)?.resolutionKm||999));}
function renderDailyTable(f,tab,biases,normals=null){
  const ids=visibleModelIds(f),today=cityToday(f.city.timezone); const dates=[...new Set(ids.flatMap(id=>f.seriesByModel[id].daily.dates))].filter(d=>d>=today).sort().slice(0,7);
  return `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>Jour</th>${ids.map(id=>{const m=getModel(id);return `<th title="${m?.family||''} · ${m?.resolutionKm||'?'} km"><span class="model-header">${esc(m?.name||id)}</span><span class="cell-sub">${m?.resolutionKm||'?'} km · ${esc(m?.family||'')}</span></th>`;}).join('')}</tr></thead><tbody>${dates.map(date=>`<tr class="${date===today?'current':''}"><td><strong>${esc(dateLabel(date,i18n().locale,'long'))}</strong>${date===today?'<span class="cell-sub">Aujourd’hui</span>':''}</td>${ids.map(id=>renderDailyCell(f.seriesByModel[id],date,tab,biases?.[id],normals?.[date.slice(5)])).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderDailyCell(s,date,tab,modelBias,normal=null){
  const i=seriesIndexes(s).daily.get(date)??-1;if(i<0)return '<td class="no-data">—</td>';
  if(tab==='CONDITIONS'){const x=dailyCondition(s,date),ci=localizedConditionInfo(x.condition),prob=s.daily.precipitationProbabilityMax[i],cloud=dailyCloudCoverMean(s,date);const isWet=['RAIN','RAIN_SHOWERS','THUNDERSTORM','FREEZING_RAIN','SNOW','SNOW_SHOWERS'].includes(x.condition);const badge=isWet?(Number.isFinite(prob)?prob+'%':null):(['PARTLY_CLOUDY','OVERCAST'].includes(x.condition)&&Number.isFinite(cloud)?cloud+'%':null);return `<td title="${esc(ci.label)}${x.inferred?' · condition inférée du même modèle':''}">${conditionMarkup(x.condition,'small')}<span class="condition-label">${esc(ci.label)}</span>${badge?`<span class="cell-sub">${badge}</span>`:''}${x.inferred?'<span class="cell-sub">≈ inféré</span>':''}</td>`;}
  if(tab==='TEMPERATURE'){const max=s.daily.tempMax[i],min=s.daily.tempMin[i];const maxClass=temperatureNormalClass(max,normal?.tempMaxNormal),minClass=temperatureNormalClass(min,normal?.tempMinNormal);return `<td class="normal-temp-cell"><span class="${maxClass}">${Number.isFinite(max)?fmt(max,1)+'°':'—'}</span><span class="temp-separator"> / </span><span class="${minClass}">${Number.isFinite(min)?fmt(min,1)+'°':'—'}</span>${renderInlineBias(modelBias?.TEMPERATURE,'TEMPERATURE','°')}</td>`;}
  if(tab==='PRECIPITATION'){const p=s.daily.precipitationSum[i],prob=s.daily.precipitationProbabilityMax[i];const style=Number.isFinite(p)?dailyIntensityStyle('PRECIPITATION',p):'';return `<td class="heatmap-data-cell" ${style}>${Number.isFinite(p)?fmt(p,1)+' mm':'—'}${Number.isFinite(prob)?`<span class="cell-sub">max ${prob}%</span>`:''}${renderInlineBias(modelBias?.PRECIPITATION,'PRECIPITATION',' mm/j')}</td>`;}
  const w=s.daily.windSpeedMax[i],g=s.daily.windGustsMax[i],dir=s.daily.windDirection10mDominant[i],arrow=windArrow(dir,w);const style=Number.isFinite(w)?dailyIntensityStyle('WIND',w):'';return `<td class="heatmap-data-cell" ${style}>${Number.isFinite(w)?fmt(w)+' km/h':'—'} ${arrow?`<span class="wind-arrow" style="transform:rotate(${arrow.deg}deg)">${arrow.char}</span>`:''}${Number.isFinite(dir)?`<span class="cell-sub">${formatWindDirection(dir)}${Number.isFinite(g)?` · R ${fmt(g)}`:''}</span>`:''}${renderInlineBias(modelBias?.WIND_SPEED,'WIND_SPEED',' km/h')}</td>`;
}

function temperatureNormalClass(value,normal){if(!Number.isFinite(value)||!Number.isFinite(normal))return 'temp-normal';const d=value-normal;return d>2?'temp-above':d<-2?'temp-below':'temp-normal';}

function renderInlineBias(b,variable,unit){if(!b?.ready)return '';const sig=biasSignificance(b,variable);if(sig==='LOW')return '';return `<span class="cell-sub confidence ${sig==='HIGH'?'low':'medium'}">biais ${b.meanBias>0?'+':''}${fmt(b.meanBias,1)}${unit}</span>`;}

function renderHourlyTable(f,tab,biases){
  const ids=visibleModelIds(f),nowLocal=(new Date()); const today=cityToday(f.city.timezone);const all=[...new Set(ids.flatMap(id=>f.seriesByModel[id].hourly.timestamps))].filter(ts=>ts.slice(0,10)>=today).sort();
  const rows=all.slice(0,48); const hourNow=new Intl.DateTimeFormat('en-GB',{timeZone:f.city.timezone||'UTC',hour:'2-digit',hourCycle:'h23'}).format(nowLocal).slice(0,2);const nowKey=`${today}T${hourNow}:00`;const nowMs=Date.parse(nowKey+'Z');
  const targetHour=rows.reduce((best,ts)=>Math.abs(Date.parse(ts+'Z')-nowMs)<Math.abs(Date.parse((best||ts)+'Z')-nowMs)?ts:best,rows[0]);
  return `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>Heure</th>${ids.map(id=>{const m=getModel(id);return `<th><span class="model-header">${esc(m?.name||id)}</span><span class="cell-sub">${m?.resolutionKm||'?'} km</span></th>`;}).join('')}</tr></thead><tbody>${rows.map(ts=>`<tr class="${ts===targetHour?'current':''}"><td><strong>${esc(ts.slice(5,10))}</strong><span class="cell-sub">${esc(timeLabel(ts))}${ts===targetHour?' · maintenant':''}</span></td>${ids.map(id=>renderHourlyCell(f.seriesByModel[id],ts,tab)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderHourlyCell(s,ts,tab){
  const i=seriesIndexes(s).hourly.get(ts)??-1;if(i<0)return '<td class="no-data">—</td>';
  if(tab==='CONDITIONS'){const c=fromWmoCode(s.hourly.weatherCode[i])||null,ci=localizedConditionInfo(c);const pp=s.hourly.precipitationProbability[i],cl=s.hourly.cloudCover[i];return `<td>${c?conditionMarkup(c,'small'):'—'}${c?`<span class="condition-label">${esc(ci.label)}</span>`:''}${Number.isFinite(pp)?`<span class="cell-sub">☂ ${pp}%</span>`:Number.isFinite(cl)?`<span class="cell-sub">☁ ${cl}%</span>`:''}</td>`;}
  if(tab==='TEMPERATURE'){const v=s.hourly.temperature2m[i];return `<td class="heatmap-data-cell" ${Number.isFinite(v)?heatStyle('TEMPERATURE',v):''}>${Number.isFinite(v)?fmt(v,1)+' °C':'—'}</td>`;}
  if(tab==='PRECIPITATION'){const v=s.hourly.precipitation[i],pp=s.hourly.precipitationProbability[i];return `<td class="heatmap-data-cell" ${Number.isFinite(v)?heatStyle('PRECIPITATION',v):''}>${Number.isFinite(v)?fmt(v,1)+' mm':'—'}${Number.isFinite(pp)?`<span class="cell-sub">${pp}%</span>`:''}</td>`;}
  const w=s.hourly.windSpeed10m[i],g=s.hourly.windGusts10m[i],dir=s.hourly.windDirection10m[i],arrow=windArrow(dir,w);return `<td class="heatmap-data-cell" ${Number.isFinite(w)?heatStyle('WIND',w):''}>${Number.isFinite(w)?fmt(w)+' km/h':'—'} ${arrow?`<span class="wind-arrow" style="transform:rotate(${arrow.deg}deg)">${arrow.char}</span>`:''}${Number.isFinite(g)?`<span class="cell-sub">R ${fmt(g)} km/h</span>`:''}</td>`;
}

function renderSettings(){
  const {t}=i18n();const sort=state.settings.modelSort||'ZONE';const groups=modelGroups(sort);const refresh=REFRESH_INTERVALS.find(x=>x.id===state.settings.refreshInterval)||REFRESH_INTERVALS[2];
  return `<main class="page"><section class="page-header"><div class="page-header-copy"><div class="eyebrow">Configuration</div><h1>${esc(t('settings'))}</h1><p>Personnalisez l’affichage, les modèles comparés et la stratégie de mise à jour de MeteoCompare.</p></div></section><div class="settings-list">
    <section class="settings-section"><h2>${esc(t('theme'))}</h2><div class="option-row">${[['SYSTEM',t('system')],['LIGHT',t('light')],['DARK',t('dark')]].map(([id,l])=>`<button class="chip ${state.settings.theme===id?'active':''}" aria-pressed="${state.settings.theme===id}" data-theme="${id}">${esc(l)}</button>`).join('')}</div></section>
    <section class="settings-section"><h2>${esc(t('language'))}</h2><div class="option-row">${[['SYSTEM','Système'],['FRENCH','Français'],['ENGLISH','English'],['SPANISH','Español'],['GERMAN','Deutsch'],['ITALIAN','Italiano']].map(([id,l])=>`<button class="chip ${state.settings.language===id?'active':''}" aria-pressed="${state.settings.language===id}" data-language="${id}">${esc(l)}</button>`).join('')}</div></section>
    <section class="settings-section"><h2>${esc(t('refreshInterval'))}</h2><p>${esc(t('webRefreshDesc'))}</p><div class="option-row">${REFRESH_INTERVALS.map(x=>`<button class="chip ${refresh.id===x.id?'active':''}" aria-pressed="${refresh.id===x.id}" data-refresh-interval="${x.id}">${esc(x.label)}</button>`).join('')}</div></section>
    <section class="settings-section"><h2>${esc(t('reliability'))}</h2><p>${esc(t('biasDesc'))}</p><button class="btn tonal" data-action="refresh-bias-all" ${state.biasRefresh.size?'disabled':''}>↻ ${esc(t('biasRefresh'))}</button></section>
    <section class="settings-section settings-wide"><h2>${esc(t('weatherModels'))}</h2><p>${esc(t('settings_models_desc'))}</p><div class="segmented">${[['ZONE',t('sortZone')],['FAMILLE',t('sortFamily')],['FINESSE',t('sortResolution')]].map(([id,l])=>`<button class="seg-btn ${sort===id?'active':''}" data-model-sort="${id}">${esc(l)}</button>`).join('')}</div>${groups.map(g=>`${g.label?`<div class="model-group-title">${esc(g.label)}</div>`:''}${g.models.map(renderModelRow).join('')}`).join('')}</section>
    <section class="settings-section"><h2>${esc(t('about'))}</h2><p>${esc(t('webAboutBody'))}</p><div class="banner info">🌐 ${esc(t('noWidgets'))}</div><p>${esc(t('source'))}</p><button class="btn tonal" data-action="donate">♡ ${esc(t('support'))}</button></section>
    <section class="settings-section"><h2>${esc(t('privacy'))}</h2><p>${esc(t('webPrivacyBody'))}</p><button class="btn danger" data-action="clear-data">${esc(t('clearLocalData'))}</button></section>
  </div></main>`;
}

function modelGroups(sort){let models=[...WEATHER_MODELS];if(sort==='FINESSE')return [{label:'',models:models.sort((a,b)=>a.resolutionKm-b.resolutionKm)}];if(sort==='FAMILLE'){const order=[...new Set(models.map(m=>m.family))];return order.map(f=>({label:f,models:models.filter(m=>m.family===f).sort((a,b)=>a.resolutionKm-b.resolutionKm)}));}const order=['FRANCE','EUROPE','UNITED_STATES','GLOBAL'];return order.map(z=>({label:COVERAGE_LABELS[z],models:models.filter(m=>m.coverage===z).sort((a,b)=>a.resolutionKm-b.resolutionKm)})).filter(g=>g.models.length);}
function renderModelRow(m){const on=state.settings.enabledModelIds.includes(m.id);return `<div class="model-row"><div><div class="model-title">${esc(m.name)}</div><div class="model-meta">${esc(m.family)} · ${m.resolutionKm} km · horizon ~${m.horizonHours} h</div></div><button class="switch ${on?'on':''}" role="switch" aria-checked="${on}" data-model-toggle="${m.id}" aria-label="${esc(m.name)}"></button></div>`;}

function renderModal(){
  const {t}=i18n(); if(!state.modal)return '';
  if(state.modal.type==='addCity')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(t('searchCity'))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><input id="city-search" class="search-input" value="${attr(state.modal.query||'')}" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off" autofocus><div id="city-search-status" role="status" aria-live="polite">${renderSearchStatus()}</div><div class="search-results" id="city-search-results">${renderSearchResults()}</div></div></div></div>`;
  if(state.modal.type==='cityMenu'){const c=state.cities.find(x=>x.id===state.modal.cityId);return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(c?.name||'Ville')}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><div class="modal-actions"><button class="btn tonal" data-refresh-city="${attr(c?.id)}">↻ ${esc(t('refresh'))}</button><button class="btn danger" data-remove-city="${attr(c?.id)}">🗑 ${esc(t('remove'))}</button></div></div></div></div>`;}
  if(state.modal.type==='confidence')return `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${esc(t('whyAgreement'))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${esc(t('close'))}">×</button></div><div class="modal-content"><p>L’indice d’accord part de la dispersion des valeurs prévues par les modèles disponibles à une même échéance.</p><div class="banner info"><b>Ce n’est pas une probabilité de justesse.</b>&nbsp; Un accord élevé signifie seulement que les modèles convergent.</div><p><b>Température :</b> accord maximal lorsque σ ≤ 0,5 °C, divergence forte à partir de 3 °C.</p><p><b>Vent :</b> accord maximal lorsque σ ≤ 2 km/h, divergence forte à partir de 12 km/h.</p><p><b>Pluie :</b> la vue journalière distingue d’abord sec/pluie. Si tous annoncent de la pluie, la dispersion des cumuls utilise des seuils 1–8 mm. La bande horaire reste continue.</p><p>Le nombre de modèles peut diminuer avec l’horizon lorsque les modèles régionaux arrivent à leur fin de prévision. Les données brutes restent visibles dans le tableau détaillé.</p></div></div></div>`;
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
  const target=e.target.closest?.('[data-action],[data-city-open],[data-city-menu],[data-refresh-city],[data-remove-city],[data-add-city-id],[data-confidence-metric],[data-chart-horizon],[data-detail-mode],[data-detail-tab],[data-timeline-mode],[data-theme],[data-language],[data-refresh-interval],[data-model-sort],[data-model-toggle],[data-bias-refresh-city],[data-scroll-section]');
  if(!target||!app.contains(target))return;
  if(target.dataset.action){handleAction({currentTarget:target,target:e.target});return;}
  if(target.dataset.cityMenu){e.stopPropagation();lastFocusedBeforeModal=document.activeElement;state.modal={type:'cityMenu',cityId:target.dataset.cityMenu};render();return;}
  if(target.dataset.refreshCity){e.stopPropagation();state.modal=null;refreshCity(target.dataset.refreshCity,true);return;}
  if(target.dataset.removeCity){removeCity(target.dataset.removeCity);return;}
  if(target.dataset.addCityId){addCityFromSearch(target.dataset.addCityId);return;}
  if(target.dataset.confidenceMetric){state.settings.confidenceMetric=target.dataset.confidenceMetric;persistSettings();render();return;}
  if(target.dataset.chartHorizon){state.settings.chartHorizon=Number(target.dataset.chartHorizon);persistSettings();render();return;}
  if(target.dataset.detailMode){state.settings.detailViewMode=target.dataset.detailMode;persistSettings();render();return;}
  if(target.dataset.detailTab){state.settings.detailTab=target.dataset.detailTab;persistSettings();render();return;}
  if(target.dataset.timelineMode){state.settings.timelineMode=target.dataset.timelineMode;persistSettings();render();return;}
  if(target.dataset.theme){state.settings.theme=target.dataset.theme;persistSettings();applyTheme();render();return;}
  if(target.dataset.language){state.settings.language=target.dataset.language;i18nCacheKey=null;persistSettings();render();return;}
  if(target.dataset.refreshInterval){state.settings.refreshInterval=target.dataset.refreshInterval;persistSettings();render();refreshDueCities();return;}
  if(target.dataset.modelSort){state.settings.modelSort=target.dataset.modelSort;persistSettings();render();return;}
  if(target.dataset.modelToggle){toggleModel(target.dataset.modelToggle);return;}
  if(target.dataset.biasRefreshCity){refreshBiasForCity(target.dataset.biasRefreshCity);return;}
  if(target.dataset.scrollSection){document.getElementById?.(target.dataset.scrollSection)?.scrollIntoView?.({behavior:'smooth',block:'start'});return;}
  if(target.dataset.cityOpen){if(e.target.closest('button'))return;go(`#/city/${encodeURIComponent(target.dataset.cityOpen)}`);}
}

function handleAction(e){
  const action=e.currentTarget.dataset.action;
  if(action==='back')history.length>1?history.back():go('#/');
  else if(action==='home')go('#/');
  else if(action==='settings')go('#/settings');
  else if(action==='refresh-all')refreshAll(true);
  else if(action==='open-add-city'){lastFocusedBeforeModal=document.activeElement;cancelCitySearch();state.modal={type:'addCity',query:'',results:[],searching:false,pending:false};render();}
  else if(action==='close-modal'){closeModal();}
  else if(action==='modal-backdrop'&&e.target===e.currentTarget){closeModal();}
  else if(action==='why-confidence'){lastFocusedBeforeModal=document.activeElement;state.modal={type:'confidence'};render();}
  else if(action==='donate'){lastFocusedBeforeModal=document.activeElement;state.modal={type:'donate'};render();}
  else if(action==='refresh-bias-all')refreshBiasAll();
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

function onRouteSettled(){if(state.route.name==='city'){const id=state.route.id;if(!state.forecasts[id])refreshCity(id,false);else scheduleIdle(()=>ensureNormals(id));}}
function scheduleIdle(fn){if('requestIdleCallback' in window)requestIdleCallback(()=>fn(),{timeout:1200});else setTimeout(fn,80);}
async function ensureNormals(cityId){
  const city=state.cities.find(c=>c.id===cityId);if(!city||!state.online)return;const cached=state.normals[cityId]||loadNormals(cityId);if(cached&&Date.now()-(cached.computedAt||0)<180*24*3600e3){state.normals[cityId]=cached;return;}
  if(state.normals[cityId]?.loading)return;state.normals[cityId]={...(cached||{}),loading:true};
  const today=cityToday(city.timezone);const lastYear=+today.slice(0,4)-1;const start=`${lastYear-9}-01-01`,end=`${lastYear}-12-31`;
  try{const raw=await fetchClimateNormals(city,start,end);const agg=aggregateNormals(raw,start,end);if(!agg.complete)throw new Error('Archive ERA5 incomplète : cache non remplacé.');const payload={computedAt:Date.now(),startDate:start,endDate:end,normals:agg.normals};state.normals[cityId]=payload;saveNormals(cityId,payload);if(state.route.name==='city'&&state.route.id===cityId)render();}
  catch(err){state.normals[cityId]=cached||null;console.warn('Climate normals:',err);}
}

async function refreshBiasAll(){for(const c of state.cities)await refreshBiasForCity(c.id);}
async function refreshBiasForCity(cityId){
  const city=state.cities.find(c=>c.id===cityId);if(!city||state.biasRefresh.has(cityId))return;if(!state.online){toast('Connexion requise pour actualiser le biais.');return;}state.biasRefresh.add(cityId);render();
  try{
    const models=selectedModels(state.settings.enabledModelIds);const today=cityToday(city.timezone);const end=addDays(today,-1),start=addDays(end,-20);
    const [prev,archive]=await Promise.all([fetchPreviousRuns(city,models,start,end),fetchBiasArchive(city,start,end)]);
    const forecasts=normalizePreviousRuns(prev,city,models,start,end),observations=normalizeBiasObservations(archive,start,end);const old=state.bias[cityId]||{forecasts:[],observations:[],updatedAt:null};
    const mergedForecasts=dedupe([...old.forecasts,...forecasts],x=>`${x.modelId}|${x.variable}|${x.targetDate}`);const mergedObs=dedupe([...old.observations,...observations],x=>`${x.variable}|${x.targetDate}`);const cutoff=addDays(today,-45);
    const nextBias={forecasts:mergedForecasts.filter(x=>x.targetDate>=cutoff),observations:mergedObs.filter(x=>x.targetDate>=cutoff),updatedAt:Date.now()};state.bias[cityId]=nextBias;saveBias(cityId,nextBias);toast(`${city.name} : historique J+1 actualisé (${forecasts.length} prévisions, ${observations.length} références).`);
  }catch(err){toast(`Biais ${city.name} : ${humanError(err)}`);}finally{state.biasRefresh.delete(cityId);render();}
}
function dedupe(list,key){const m=new Map();for(const x of list)m.set(key(x),x);return [...m.values()];}
