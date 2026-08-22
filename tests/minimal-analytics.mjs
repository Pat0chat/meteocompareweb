import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAnalyticsClient, analyticsRoutePath, sanitizedAnalyticsUrl, sanitizedReferrer, analyticsPageProps } from '../js/analytics.js';
import { ANALYTICS_CONFIG } from '../js/analytics-config.js';

assert.equal(ANALYTICS_CONFIG.enabled,true,'production analytics should be enabled for meteocompare.app');
assert.equal(ANALYTICS_CONFIG.domain,'meteocompare.app');
assert.deepEqual(ANALYTICS_CONFIG.allowedHosts,['meteocompare.app','www.meteocompare.app']);
assert.equal(analyticsRoutePath({name:'city',id:'paris-secret'}),'/city');
assert.equal(analyticsRoutePath({name:'bias',id:'paris-secret',modelId:'icon_d2',variable:'temperature'}),'/bias');
assert.equal(analyticsRoutePath({name:'notfound',slug:'private-slug'}),'/404');

// Legacy/GitHub Pages base path remains supported.
assert.equal(
  sanitizedAnalyticsUrl({name:'city',id:'paris-secret'},{origin:'https://pat0chat.github.io',pathname:'/meteocompare/',search:'',protocol:'https:'}),
  'https://pat0chat.github.io/meteocompare/city'
);
// Clean SEO routes must collapse to /city and never leak the slug or view params.
assert.equal(
  sanitizedAnalyticsUrl(
    {name:'city',id:'private-id',slug:'toulouse'},
    {origin:'https://meteocompare.app',pathname:'/meteo/toulouse',search:'?tab=WIND&id=private-id&utm_source=google&utm_medium=organic&utm_campaign=seo-city',protocol:'https:'}
  ),
  'https://meteocompare.app/city?utm_source=google&utm_medium=organic&utm_campaign=seo-city'
);
assert.equal(
  sanitizedAnalyticsUrl(
    {name:'settings'},
    {origin:'https://meteocompare.app',pathname:'/meteo/toulouse',search:'?id=private-id',hash:'#/settings',protocol:'https:'}
  ),
  'https://meteocompare.app/settings'
);

const calls=[];
const storage=new Map();
const env={
  location:{origin:'https://meteocompare.app',hostname:'meteocompare.app',pathname:'/meteo/toulouse',search:'?utm_source=google&utm_medium=organic&utm_campaign=seo-city&tab=WIND&id=private-id',hash:'',protocol:'https:'},
  document:{referrer:'https://www.google.com/search?q=toulouse+meteo&secret=1',documentElement:{lang:'fr-FR'}},
  navigator:{doNotTrack:'0',globalPrivacyControl:false,standalone:false},
  matchMedia:()=>({matches:false}),
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
};
assert.equal(sanitizedReferrer(env),'https://www.google.com/');
assert.equal(sanitizedReferrer({...env,document:{...env.document,referrer:'https://meteocompare.app/meteo/paris?x=1'}}),null);

const fetchImpl=async (url,options)=>{calls.push({url,options});return {ok:true,headers:{get:()=>null}};};
const client=createAnalyticsClient({config:ANALYTICS_CONFIG,env,fetchImpl});
assert.equal(client.status().active,true);
assert.equal(client.status().hostAllowed,true);

const route={name:'city',id:'private-city-id',slug:'toulouse',view:{tab:'WIND',mode:'HOURLY',metric:'TEMPERATURE',horizon:72,timeline:'HOURLY',compareModels:['a','b']}};
const props=analyticsPageProps(route,env);
assert.deepEqual(props,{
  page_group:'/city',app_version:'1.14.0',language:'fr',display_mode:'browser',navigation:'seo',
  detail_tab:'wind',detail_mode:'hourly',agreement_metric:'temperature',horizon_hours:'72',timeline:'hourly',compared_models:'2'
});

await client.pageview(route);
await client.event('City Search Opened',{name:'home'});
await client.event('City Added',{name:'home'},{city_id:'MUST-NOT-LEAK'});
await client.event('Forecast View Changed',route,{control:'tab',value:'WIND',city_id:'MUST-NOT-LEAK'});
await client.event('Model Comparison Changed',route,{model_count:3,models:'icon_d2,ecmwf'});
await client.event('City Comparison Started',{name:'home'},{city_count:3,city_ids:'MUST-NOT-LEAK'});
await client.event('Data Exported',route,{format:'csv',filename:'MUST-NOT-LEAK.csv'});
await client.event('PWA Install Click',{name:'about'});
await client.event('PWA Installed',{name:'city',id:'private-city-id'});
assert.equal(calls.length,9);

for(const call of calls){
  assert.equal(call.url,'https://plausible.io/api/event');
  assert.equal(call.options.credentials,'omit');
  assert.equal(call.options.referrerPolicy,'no-referrer');
  assert.equal(call.options.headers['Content-Type'],'text/plain');
  const body=JSON.parse(call.options.body);
  assert.equal(body.domain,'meteocompare.app');
  const serialized=JSON.stringify(body);
  assert.ok(!serialized.includes('private-city-id'));
  assert.ok(!serialized.includes('private-id'));
  assert.ok(!serialized.includes('MUST-NOT-LEAK'));
  assert.ok(!serialized.includes('toulouse'));
  assert.ok(!serialized.includes('q=toulouse'));
  assert.equal(body.referrer,'https://www.google.com/');
}

const pageBody=JSON.parse(calls[0].options.body);
assert.equal(pageBody.name,'pageview');
assert.equal(pageBody.url,'https://meteocompare.app/city?utm_source=google&utm_medium=organic&utm_campaign=seo-city');
assert.equal(pageBody.props.page_group,'/city');
assert.equal(pageBody.props.navigation,'seo');
assert.equal(pageBody.props.compared_models,'2');

const viewBody=JSON.parse(calls[3].options.body);
assert.deepEqual(viewBody.props,{control:'tab',value:'wind'});
const modelBody=JSON.parse(calls[4].options.body);
assert.deepEqual(modelBody.props,{model_count:'3'});
const compareBody=JSON.parse(calls[5].options.body);
assert.deepEqual(compareBody.props,{city_count:'3'});
const exportBody=JSON.parse(calls[6].options.body);
assert.deepEqual(exportBody.props,{format:'csv'});

const beforeUnknown=calls.length;
await client.event('Arbitrary Private Event',{name:'home'},{secret:'x'});
assert.equal(calls.length,beforeUnknown,'unknown events must be rejected');

client.setOptOut(true); assert.equal(client.status().active,false); await client.pageview({name:'home'}); assert.equal(calls.length,beforeUnknown);
client.setOptOut(false); assert.equal(client.status().active,true);
env.navigator.globalPrivacyControl=true; assert.equal(client.status().active,false); await client.pageview({name:'home'}); assert.equal(calls.length,beforeUnknown);
env.navigator.globalPrivacyControl=false; env.navigator.doNotTrack='1'; assert.equal(client.status().active,false);
env.navigator.doNotTrack='0'; env.location.hostname='preview.pages.dev'; assert.equal(client.status().hostAllowed,false); assert.equal(client.status().active,false);

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
for(const event of ['PWA Install Click','PWA Installed','City Search Opened','City Added','SEO City Favorite Added','Forecast Refreshed','Forecast View Changed','Model Comparison Changed','City Comparison Started','Marine Activated','Data Exported','Share Link Copied','Local Weighting Changed']){
  assert.ok(app.includes(`trackAnalyticsEvent('${event}'`),`app should track ${event}`);
}
assert.match(app,/trackPageView\(state\.route\)/);
assert.match(app,/data-action="toggle-analytics"/);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/connect-src[^\"]*https:\/\/plausible\.io/);
const privacy=fs.readFileSync(new URL('../PRIVACY.md',import.meta.url),'utf8');
assert.match(privacy,/\/city.*\/meteo\/<ville>/);
assert.match(privacy,/utm_source/);
assert.match(privacy,/referrer externe/);
assert.match(privacy,/recherche de ville/);
assert.match(privacy,/liste blanche/);
const frLocale=fs.readFileSync(new URL('../js/locales/fr.js',import.meta.url),'utf8');
assert.match(frLocale,/"analyticsPurposeTitle":"Finalité limitée"/);
assert.match(frLocale,/UTM source\/medium\/campaign/);
assert.match(frLocale,/\/meteo\/toulouse devient \/city/);
assert.match(app,/analytics-purpose-note/);
assert.match(app,/analytics-cnil-note/);
assert.match(app,/cookies-solutions-pour-les-outils-de-mesure-daudience/);
assert.match(privacy,/dimensionnement de l’hébergement/);
assert.match(privacy,/statistiques agrégées/);
assert.match(privacy,/configuration effective du fournisseur/);

const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.match(sw,/CACHE_VERSION = 'v74-plausible-seo-analytics'/);
console.log('MeteoCompare privacy-first Plausible analytics tests: OK');
