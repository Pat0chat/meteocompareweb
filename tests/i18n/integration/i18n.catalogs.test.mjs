import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeI18n, webTranslationAudit, hasTranslation } from '../../../js/i18n.js';
import { ANDROID_STRINGS } from '../../fixtures/android_strings.js';
import { hourlyConfidenceBand, roundedHourLocal } from '../../../js/domain.js';
import { buildEvolution } from '../../../js/features/evolution.js';
import { WEATHER_MODELS, DEFAULT_MODEL_IDS } from '../../../js/models.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),api=read('js/api.js'),apiBudget=read('js/api-budget.js'),network=read('js/network.js'),css=read('styles.css'),sw=read('sw.js');

// 1. Every web key and every inherited Android key exists in all five supported languages.
const webAudit=webTranslationAudit();
for(const lang of ['fr','en','es','de','it']) assert.deepEqual(webAudit[lang],[],`missing web translations for ${lang}`);
const androidBase=Object.keys(ANDROID_STRINGS.fr||{});
for(const lang of ['en','es','de','it']){
  const missing=androidBase.filter(k=>typeof ANDROID_STRINGS[lang]?.[k]!=='string'||!ANDROID_STRINGS[lang][k].trim());
  assert.deepEqual(missing,[],`missing Android-derived translations for ${lang}`);
}

// 1b. The web model catalogue keeps the audited provider metadata and may extend beyond the historical Android catalogue with useful web-only regional models.
const expectedModels=[
  ['AROME_FRANCE_HD','meteofrance_arome_france_hd',1.5,2,48],['AROME_FRANCE','meteofrance_arome_france',2.5,2,48],['ARPEGE_EUROPE','meteofrance_arpege_europe',11,4,96],['ARPEGE_WORLD','meteofrance_arpege_world',25,4,96],
  ['ICON_EU','icon_eu',7,5,120],['ICON_GLOBAL','icon_global',11,8,180],['GFS','ncep_gfs_seamless',13,16,384],['ECMWF','ecmwf_ifs025',25,15,360],['UKMO_GLOBAL','ukmo_global_deterministic_10km',10,7,168],
  ['ECMWF_AIFS','ecmwf_aifs025_single',28,15,360],['GEM_GLOBAL','cmc_gem_gdps',15,10,240],['ICON_D2','icon_d2',2,2,48],['HRRR_CONUS','ncep_hrrr_conus',3,2,18],['METNO_NORDIC','metno_nordic',1,3,60],
  ['KNMI_HARMONIE_EU','knmi_harmonie_arome_europe',5.5,3,60],['DMI_HARMONIE_EU','dmi_harmonie_arome_europe',2,3,60],['METEOSWISS_ICON_CH2','meteoswiss_icon_ch2',2,5,120],['BOM_ACCESS','bom_access_global',15,10,240],['CMA_GRAPES','cma_grapes_global',15,10,240]
];
assert.equal(WEATHER_MODELS.length,expectedModels.length,'weather model catalogue should match the audited provider contract');
assert.deepEqual(WEATHER_MODELS.map(m=>[m.id,m.apiKey,m.resolutionKm,m.maxForecastDays,m.horizonHours]),expectedModels,'model API keys/resolution/provider request ceiling/native horizon must match the audited contract');
assert.deepEqual(DEFAULT_MODEL_IDS,['AROME_FRANCE_HD','ARPEGE_EUROPE','ICON_EU','GFS','ECMWF','UKMO_GLOBAL','ECMWF_AIFS'],'default model selection must remain conservative when the optional catalogue expands');

// 2. Every literal translation key used by app.js resolves instead of leaking the key name.
const literalKeys=new Set();
for(const re of [/\bt\(\s*['"]([^'"]+)['"]/g,/i18n\(\)\.t\(\s*['"]([^'"]+)['"]/g]){
  let m;while((m=re.exec(app)))literalKeys.add(m[1]);
}
const prefs={fr:'FRENCH',en:'ENGLISH',es:'SPANISH',de:'GERMAN',it:'ITALIAN'};
for(const [lang,pref] of Object.entries(prefs)){
  for(const key of literalKeys) assert.ok(hasTranslation(pref,key),`unresolved translation key ${key} in ${lang}`);
}

// 2b. Android positional/decimal formats and escaped percent signs must be fully resolved.
const formattedKeys=androidBase.filter(k=>/%(?:\d+\$)?(?:\.\d+)?[dfs]|%%/.test(ANDROID_STRINGS.fr[k]));
for(const pref of Object.values(prefs)){
  const tr=makeI18n(pref);
  for(const key of formattedKeys){
    const out=tr.t(key,1.25,2.5,3,4,5,6);
    assert.doesNotMatch(out,/%(?:\d+\$)?(?:\.\d+)?[dfs]|%%/,`unresolved Android formatter in ${tr.lang}:${key}`);
  }
}

// 2c. Dynamic translation branches (ternaries/maps) must resolve in every supported language too.
const dynamicKeys=[
  'weather_clear','weather_mainly_clear','weather_partly_cloudy','weather_overcast','weather_fog','weather_drizzle','weather_rain','weather_freezing_rain','weather_snow','weather_rain_showers','weather_snow_showers','weather_thunderstorm','weather_unknown',
  'modelSingular','models','archiveCallOne','archiveCallMany','offlineOldCache','offlineRecentCache','refreshing','refreshWeather','convergenceHigh','convergenceMedium','convergenceLow','insufficientData',
  'home_scenario_showers_early','home_scenario_showers_middle','home_scenario_showers_late','home_scenario_showers_throughout','home_scenario_rain_early','home_scenario_rain_middle','home_scenario_rain_late','home_scenario_rain_throughout',
  'increasing','decreasing','stable','volatile','comparisonMetricTemperature','comparisonMetricPrecipitation','comparisonMetricWind','reliabilityExcellent','reliabilityGood','reliabilityFair','reliabilityLimited','trendImproving','trendDeclining','trendStable','trendInsufficient','biasOverestimate','biasUnderestimate','updating','upToDate','complete','strongDisagreementDeadline','strongDisagreementDeadlines','openMeteoHttpError','openMeteoRejected','windDirN','windDirNE','windDirE','windDirSE','windDirS','windDirSW','windDirW','windDirNW'
];
for(const pref of Object.values(prefs))for(const key of dynamicKeys)assert.ok(hasTranslation(pref,key),`dynamic translation key ${key} missing in ${pref}`);

// 3. Critical dynamic UI paths really change language, not only the settings screen.
const critical=['weatherDashboard','forecastTimeline','confidenceBand','detailedComparison','localReliabilityIntro','runExactUnavailable','offlineNoCache','searchMinChars','targetedComparisonMax4','cityComparisonMax3','historyRefreshConfirm','biasPageEyebrow','clearDataConfirm'];
const fr=makeI18n('FRENCH');
for(const pref of ['ENGLISH','SPANISH','GERMAN','ITALIAN']){
  const tr=makeI18n(pref);
  for(const key of critical) assert.notEqual(tr.t(key),fr.t(key),`${key} must visibly change in ${tr.lang}`);
}

// 4. No known user-facing French fallbacks remain hard-coded in app.js.
const forbidden=[
  'Saisissez au moins 3 caractères','Recherche après une courte pause','Au moins un modèle doit rester activé',
  'Sélection des modèles mise à jour','Pas de réseau et aucun cache local','La requête météo a expiré',
  'Connexion requise pour actualiser','Aucun scénario disponible','La comparaison ciblée accepte au maximum',
  'Vous pouvez comparer au maximum','Lien de cette vue copié','Copiez ce lien','Sélectionnez au moins 2 villes',
  'Effacer tous les favoris','Seules les périodes manquantes seront demandées','historique déjà complet'
];
for(const phrase of forbidden) assert.ok(!app.includes(phrase),`hard-coded UI text remains: ${phrase}`);
assert.ok(!app.includes(' mm/j'),'precipitation bias display must match Android unit semantics (daily total in mm)');
assert.match(app,/localizedWindDirection\(dir\)/,'wind direction abbreviations must follow the selected language');

// 5. Language switching also changes document metadata / PWA manifest.
assert.match(app,/manifest\.\$\{i18n\(\)\.lang\}\.webmanifest/,'manifest must follow selected language');
for(const lang of ['fr','en','es','de','it']){
  const manifest=JSON.parse(read(`manifest.${lang}.webmanifest`));
  assert.equal(manifest.lang,lang,`manifest language mismatch for ${lang}`);
  assert.ok(manifest.description.length>20,`localized manifest description missing for ${lang}`);
  assert.match(sw,new RegExp(`manifest\\.${lang}\\.webmanifest`),`service worker must cache ${lang} manifest`);
}

// 6. Sticky geometry derives from the measured topbar; the removed context bar must leave no dead offset.
assert.match(app,/function syncStickyOffsets\(\)/,'sticky offset synchronizer must exist');
assert.match(app,/stickyResizeObserver=new ResizeObserver\(update\)/,'sticky offsets must react when the topbar wraps');
assert.doesNotMatch(app,/querySelector\?\.\('\.city-context-bar'\)/,'removed city context bar must not be measured');
assert.doesNotMatch(css,/--city-context-height/,'removed city context bar must leave no CSS offset variable');
assert.match(css,/top: calc\(var\(--topbar-height\) \+ var\(--sticky-context-gap\)\) !important/,'overview navigation must sit below the measured topbar');
assert.match(css,/scroll-margin-top: calc\(var\(--topbar-height\) \+ 24px\)/,'section anchors must account for the measured topbar');

// 7. Hourly agreement never starts on already elapsed hours.
const anchor=roundedHourLocal('UTC');
const anchorMs=Date.parse(anchor+'Z');
const stamps=Array.from({length:7},(_,i)=>new Date(anchorMs+(i-2)*3600e3).toISOString().slice(0,16));
const mkSeries=offset=>({hourly:{timestamps:stamps,temperature2m:stamps.map((_,i)=>10+i+offset),precipitation:stamps.map(()=>0),precipitationProbability:stamps.map(()=>10),windSpeed10m:stamps.map(()=>20+offset),windGusts10m:stamps.map(()=>30+offset),windDirection10m:stamps.map(()=>180),weatherCode:stamps.map(()=>1),cloudCover:stamps.map(()=>20)},daily:{dates:[],tempMax:[],tempMin:[],precipitationSum:[],precipitationProbabilityMax:[],windSpeedMax:[],windGustsMax:[],windDirection10mDominant:[],weatherCode:[],sunrise:[],sunset:[]}});
const forecast={city:{timezone:'UTC'},seriesByModel:{A:mkSeries(0),B:mkSeries(2)}};
const band=hourlyConfidenceBand(forecast,'TEMPERATURE',24);
assert.ok(band.length>0,'agreement band should be produced');
assert.equal(band[0].timestamp,anchor,'agreement band must start at current local hour');
assert.ok(band.every(x=>x.timestamp>=anchor),'agreement band must exclude elapsed hours');

// 8. Time-dependent view caches and exports use the same current-hour anchor.
assert.match(app,/cachedScenarios\(f,limit=null\).*roundedHourLocal\(f\.city\.timezone\)/,'scenario cache must roll over at the local hour');
assert.match(app,/cachedBand\(f,metric,horizon\).*roundedHourLocal\(f\.city\.timezone\)/,'agreement cache must roll over at the local hour');
assert.match(app,/cachedHeatmap\(f,hours\).*roundedHourLocal\(f\.city\.timezone\)/,'heatmap cache must roll over at the local hour');
assert.match(app,/indices=s\.hourly\.timestamps[\s\S]*epochMs:epochs\[i\][\s\S]*filter\(x=>Number\.isFinite\(x\.epochMs\)&&x\.epochMs>=anchorEpoch\)/,'hourly export must exclude elapsed hours using absolute instants');
assert.match(app,/lastViewTimeKey[\s\S]*setInterval/,'long-open pages must re-render on local-hour rollover');

// 9. The API-confirmed timezone is persisted back to the favorite.
assert.match(app,/resolvedTimezone=f\?\.city\?\.timezone[\s\S]*city\.timezone=resolvedTimezone[\s\S]*persistFavoriteCities\(\)/,'confirmed timezone must repair the stored favorite');

// 10. A cached forecast's evolution stays anchored to the forecast snapshot date, not wall-clock today.
const oldDates=['2020-01-02','2020-01-03'];
const oldDaily={dates:oldDates,tempMax:[10,11],tempMin:[2,3],precipitationSum:[1,0],precipitationProbabilityMax:[30,10],windSpeedMax:[20,22],windGustsMax:[30,31],windDirection10mDominant:[180,180],weatherCode:[1,1],sunrise:[],sunset:[]};
const oldForecast={city:{timezone:'UTC'},fetchedAt:'2020-01-02T12:00:00.000Z',seriesByModel:{A:{daily:oldDaily},B:{daily:{...oldDaily,tempMax:[12,13]}}}};
const oldSnapshot={capturedAt:Date.parse('2020-01-01T12:00:00.000Z'),daily:{'2020-01-02':{A:{temperature:9,precipitation:1,wind:19},B:{temperature:11,precipitation:1,wind:21}},'2020-01-03':{A:{temperature:10,precipitation:0,wind:21},B:{temperature:12,precipitation:0,wind:22}}}};
assert.ok(buildEvolution(oldForecast,[oldSnapshot]).days.length>0,'cached evolution must use the displayed forecast date rather than current wall-clock date');

// 11. Removing a favorite must purge every per-city cache, not only the forecast payload.
class MemoryStorage {
  constructor(){this.m=new Map();}
  getItem(k){return this.m.has(k)?this.m.get(k):null;}
  setItem(k,v){this.m.set(k,String(v));}
  removeItem(k){this.m.delete(k);}
  key(i){return [...this.m.keys()][i]??null;}
  get length(){return this.m.size;}
}
globalThis.localStorage=new MemoryStorage();
const storage=await import('../../../js/storage.js?stability-audit=1');
storage.saveEvolution('delete-me',[{capturedAt:1}]);
storage.saveNormals('delete-me',{computedAt:1});
storage.saveBias('delete-me',{forecasts:[{x:1}],observations:[],updatedAt:1});
await storage.saveForecast('delete-me',{city:{id:'delete-me'}});
storage.deleteCityData('delete-me');
assert.deepEqual(storage.loadEvolution('delete-me'),[],'removing city must delete evolution snapshots');
assert.equal(storage.loadNormals('delete-me'),null,'removing city must delete ERA5 normals');
assert.deepEqual(storage.loadBias('delete-me'),{forecasts:[],observations:[],updatedAt:null},'removing city must delete bias history');
assert.equal(storage.loadForecast('delete-me'),null,'removing city must delete forecast fallback cache');

// 12. Local reliability summary must rank with the same score/MAE logic as the model detail page.
assert.match(app,/function reliabilitySummaryRanking\(cityId,variable\)/,'local reliability summary ranking helper must exist');
assert.match(app,/b\.reliability\.score-a\.reliability\.score\|\|a\.reliability\.meanAbsoluteError-b\.reliability\.meanAbsoluteError/,'summary ranking must use local reliability score, then MAE');
assert.match(app,/delete state\.normals\[id\];[\s\S]{0,160}deleteCityData\(id\)/,'removing a city must purge all persisted per-city caches');
assert.match(app,/cityRefreshTokens\.get\(cityId\)!==token\|\|!state\.cities\.some\(c=>c\.id===cityId\)/,'stale weather responses must be ignored after city removal/config changes');
assert.match(app,/biasRefreshTokens\.get\(cityId\)===token/,'bias history writes must be guarded by a per-city generation token');
assert.match(app,/normalsRefreshTokens\.get\(cityId\)===token/,'ERA5 normal writes must be guarded against clear/delete races');
assert.match(app,/if\(!cityRefreshTokens\.get\(cityId\)\|\|!state\.cities\.some\(c=>c\.id===cityId\)\)deleteForecast\(cityId\)/,'stale weather cleanup must only remove the forecast cache, never unrelated bias/normals/evolution data');
assert.doesNotMatch(app,/await saveForecast\(cityId,f\);[^\n]*deleteCityData\(cityId\)/,'a superseded weather save must not purge unrelated per-city history');
assert.match(app,/availableIds\.filter\(id=>enabledIds\.has\(id\)\)/,'bias refresh planning must use the currently enabled model cohort');
assert.match(api+apiBudget+network,/(?:err|error)\.code='HTTP_ERROR'/,'HTTP failures must use structured error codes for localization');
assert.match(api+apiBudget,/err\.code='OPEN_METEO_ERROR'/,'provider-declared failures must use structured error codes for localization');
assert.match(app,/function invalidateWeatherRefreshes\(\)\{cityRefreshTokens\.clear\(\);state\.loading\.clear\(\);\}/,'model configuration changes must invalidate in-flight weather loads');
assert.match(app,/requestedModelIds[\s\S]*sameModels/,'forecast freshness must include the requested model cohort, not only age');

assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');
console.log('MeteoCompare Web stability + i18n audit tests: OK');
