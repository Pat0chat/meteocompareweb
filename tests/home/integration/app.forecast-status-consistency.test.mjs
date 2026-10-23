import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { forecastCurrentForDisplay } from '../../../js/core/app-state.js';
import { hasTranslation } from '../../../js/i18n.js';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const slice=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));
const healthSource=slice('function forecastHealth(f){','\nfunction monitorItemStateLabel');
const homeSource=slice('function homeLatestSync(favorites){','\nfunction archiveCallLabel');
const now=Date.now();
const city={id:'city-1',name:'Paris'};
const forecast={fetchedAt:new Date(now-131*60_000).toISOString(),requestedModelIds:['GFS']};
const state={forecasts:{[city.id]:forecast},online:true,settings:{enabledModelIds:['GFS'],refreshInterval:'HOUR_1'}};
const translate=(key,args={})=>({onlineData:'Prévisions à jour',forecastRefreshDue:'Prévisions à actualiser',
  homeHeroLastSync:`Dernière synchro il y a ${args.age}`,homeHeroAutoCadence:`Auto : ${args.interval}`,
  manual:'Manuel',homeFamilyCount:'familles',modelSingular:'modèle',models:'modèles'})[key]||key;
const ctx={state,forecastCurrentForDisplay,
  refreshIntervalMinutes:()=>state.settings.refreshInterval==='HOUR_1'?60:0,
  selectedForecastModels:()=>[{id:'GFS',name:'GFS'}],
  selectedForecastFamilyCount:()=>1,
  refreshIntervalLabel:()=>state.settings.refreshInterval==='HOUR_1'?'1 h':'Manuel',
  modelCountLabel:()=> '1 modèle',
  i18n:()=>({t:translate}),
  formatExactAge:()=> '2 h 11 min',
  esc:String,attr:String,uiIcon:()=>'',
};
vm.runInNewContext(`${healthSource}\n${homeSource}\nthis.exports={forecastHealth,renderHomeForecastMeta};`,ctx);

assert.equal(ctx.exports.forecastHealth(forecast).class,'stale','Home card and Details header must flag 2h11 as due at the 1h interval');
assert.equal(ctx.exports.forecastHealth(forecast).label,'Prévisions à actualiser');
const hero=ctx.exports.renderHomeForecastMeta([city]);
assert.match(hero,/Dernière synchro il y a 2 h 11 min · Auto : 1 h/,'the 1h in the hero must be explicitly labelled as the automatic cadence');

state.settings.refreshInterval='MANUAL';
assert.equal(ctx.exports.forecastHealth(forecast).class,'live','manual mode should not adopt the 1h refresh cadence');
assert.match(ctx.exports.renderHomeForecastMeta([city]),/Dernière synchro il y a 2 h 11 min · Manuel/);
state.online=false;
assert.equal(ctx.exports.forecastHealth(forecast).class,'cached','offline does not misrepresent the state as synchronizing');

assert.match(app,/if\(target\.dataset\.refreshCity\)[^\n]*refreshCityWithToast\(target\.dataset\.refreshCity\)/,
  'Home city, detail, graphics and menu refresh buttons must share the per-city guard');
assert.match(app,/else if\(action==='refresh-all'\)[^\n]*refreshAll\(true,true,MANUAL_REFRESH_COOLDOWN_MS\)/,
  'Home global refresh shares the same five-minute guard');
assert.doesNotMatch(healthSource+homeSource,/\b(?:fetch|setTimeout|setInterval|requestAnimationFrame)\s*\(/,
  'display-only status/cadence changes must not cause requests, timers or animated redraws');
for(const lang of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['homeHeroAutoCadence','forecastRefreshDue'])assert.equal(hasTranslation(lang,key),true,`${lang}:${key}`);
}
console.log('Home & Details status/hero consistency, refresh entry points, zero new network work and translations: OK');
