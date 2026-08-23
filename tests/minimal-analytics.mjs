import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAnalyticsClient, analyticsRoutePath, sanitizedAnalyticsUrl, sanitizedReferrer, analyticsPageProps } from '../js/analytics.js';
import { ANALYTICS_CONFIG } from '../js/analytics-config.js';
import { APP_VERSION } from '../js/version.js';

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

const plausibleImpl=(name,options={})=>{calls.push({name,options});};
const client=createAnalyticsClient({config:ANALYTICS_CONFIG,env,plausibleImpl});
assert.equal(client.status().active,true);
assert.equal(client.status().hostAllowed,true);

const route={name:'city',id:'private-city-id',slug:'toulouse',view:{tab:'WIND',mode:'HOURLY',metric:'TEMPERATURE',horizon:72,timeline:'HOURLY',compareModels:['a','b']}};
const props=analyticsPageProps(route,env);
assert.deepEqual(props,{
  page_group:'/city',app_version:APP_VERSION,language:'fr',display_mode:'browser',navigation:'seo',
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
  const serialized=JSON.stringify(call);
  assert.ok(!serialized.includes('private-city-id'));
  assert.ok(!serialized.includes('private-id'));
  assert.ok(!serialized.includes('MUST-NOT-LEAK'));
  assert.ok(!serialized.includes('toulouse'));
  assert.ok(!serialized.includes('q=toulouse'));
}

const pageCall=calls[0];
assert.equal(pageCall.name,'pageview');
assert.equal(pageCall.options.url,'https://meteocompare.app/city?utm_source=google&utm_medium=organic&utm_campaign=seo-city');
assert.equal(pageCall.options.props.page_group,'/city');
assert.equal(pageCall.options.props.navigation,'seo');
assert.equal(pageCall.options.props.compared_models,'2');
assert.equal('interactive' in pageCall.options,false);

const viewCall=calls[3];
assert.deepEqual(viewCall.options.props,{control:'tab',value:'wind'});
assert.equal(viewCall.options.interactive,true);
const modelCall=calls[4];
assert.deepEqual(modelCall.options.props,{model_count:'3'});
const compareCall=calls[5];
assert.deepEqual(compareCall.options.props,{city_count:'3'});
const exportCall=calls[6];
assert.deepEqual(exportCall.options.props,{format:'csv'});

const beforeUnknown=calls.length;
await client.event('Arbitrary Private Event',{name:'home'},{secret:'x'});
assert.equal(calls.length,beforeUnknown,'unknown events must be rejected');

client.setOptOut(true); assert.equal(client.status().active,false); await client.pageview({name:'home'}); assert.equal(calls.length,beforeUnknown);
client.setOptOut(false); assert.equal(client.status().active,true);
env.navigator.globalPrivacyControl=true; assert.equal(client.status().active,false); await client.pageview({name:'home'}); assert.equal(calls.length,beforeUnknown);
env.navigator.globalPrivacyControl=false; env.navigator.doNotTrack='1'; assert.equal(client.status().active,false);
env.navigator.doNotTrack='0'; env.location.hostname='preview.pages.dev'; assert.equal(client.status().hostAllowed,false); assert.equal(client.status().active,false);

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
for(const event of ['PWA Install Click','PWA Installed','City Search Opened','City Added','SEO City Favorite Added','Forecast Refreshed','Forecast View Changed','Model Comparison Changed','City Comparison Started','Marine Activated','Data Exported','Share Link Copied','Local Weighting Changed','Rain Radar Opened','Rain Radar Range Changed']){
  assert.ok(app.includes(`trackAnalyticsEvent('${event}'`),`app should track ${event}`);
}
assert.match(app,/trackPageView\(state\.route\)/);
assert.match(app,/data-action="toggle-analytics"/);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const plausibleBootstrap=fs.readFileSync(new URL('../js/plausible-bootstrap.js',import.meta.url),'utf8');
assert.doesNotMatch(html,/connect-src[^\"]*https:\/\/plausible\.io/,'browser CSP should not connect directly to plausible.io');
assert.doesNotMatch(html,/script-src[^\"]*https:\/\/plausible\.io/,'browser CSP should not load Plausible as a third-party script');
assert.match(html,/src="js\/plausible-bootstrap\.js"/,'HTML should load the external privacy bootstrap');
assert.doesNotMatch(html,/<script\b(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/i,'HTML should contain no inline executable script');
assert.match(plausibleBootstrap,/ANALYTICS_CONFIG\.scriptSrc/);
assert.match(plausibleBootstrap,/ANALYTICS_CONFIG\.endpoint/);
assert.match(plausibleBootstrap,/allowedHosts\.includes\(host\)/);
assert.match(plausibleBootstrap,/globalThis\.navigator\?\.globalPrivacyControl/);
assert.match(plausibleBootstrap,/ANALYTICS_CONFIG\.optOutStorageKey/);
assert.match(plausibleBootstrap,/plausible\.init\(\{[\s\S]*autoCapturePageviews:\s*false/);
assert.match(plausibleBootstrap,/outboundLinks:\s*false/);
assert.match(plausibleBootstrap,/fileDownloads:\s*false/);
assert.match(plausibleBootstrap,/formSubmissions:\s*false/);
assert.match(plausibleBootstrap,/payload\.r\s*=[\s\S]*referrer\.origin/);
assert.match(plausibleBootstrap,/referrer\.origin\s*!==\s*globalThis\.location\.origin/);
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
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(fs.readFileSync(new URL('../cache-version.js',import.meta.url),'utf8'),/METEOCOMPARE_CACHE_VERSION = 'v\d+[-a-z0-9]+'/);
console.log('MeteoCompare privacy-first Plausible analytics tests: OK');
