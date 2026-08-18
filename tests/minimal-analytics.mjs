import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAnalyticsClient, analyticsRoutePath, sanitizedAnalyticsUrl } from '../js/analytics.js';
import { ANALYTICS_CONFIG } from '../js/analytics-config.js';

assert.equal(ANALYTICS_CONFIG.enabled,false,'analytics must ship disabled until the site owner configures a Plausible site');
assert.equal(analyticsRoutePath({name:'city',id:'paris-secret'}),'/city');
assert.equal(analyticsRoutePath({name:'bias',id:'paris-secret',modelId:'icon_d2',variable:'temperature'}),'/bias');
assert.equal(sanitizedAnalyticsUrl({name:'city',id:'paris-secret'},{origin:'https://pat0chat.github.io',pathname:'/meteocompare/',protocol:'https:'}),'https://pat0chat.github.io/meteocompare/city');

const calls=[];
const storage=new Map();
const env={
  location:{origin:'https://pat0chat.github.io',pathname:'/meteocompare/',protocol:'https:'},
  navigator:{doNotTrack:'0',globalPrivacyControl:false},
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
};
const fetchImpl=async (url,options)=>{calls.push({url,options});return {ok:true};};
const client=createAnalyticsClient({config:{enabled:true,provider:'plausible',domain:'pat0chat.github.io',endpoint:'https://plausible.io/api/event'},env,fetchImpl});
assert.equal(client.status().active,true);
await client.pageview({name:'city',id:'private-city-id'});
await client.event('PWA Install Click',{name:'about'});
await client.event('PWA Installed',{name:'city',id:'private-city-id'});
assert.equal(calls.length,3);
for(const call of calls){
  assert.equal(call.url,'https://plausible.io/api/event');
  assert.equal(call.options.credentials,'omit');
  assert.equal(call.options.referrerPolicy,'no-referrer');
  assert.equal(call.options.headers['Content-Type'],'text/plain');
  const body=JSON.parse(call.options.body);
  assert.equal(body.domain,'pat0chat.github.io');
  assert.ok(!JSON.stringify(body).includes('private-city-id'));
  assert.ok(!('props' in body));
  assert.ok(!('referrer' in body));
}
assert.equal(JSON.parse(calls[0].options.body).url,'https://pat0chat.github.io/meteocompare/city');
assert.equal(JSON.parse(calls[1].options.body).name,'PWA Install Click');
assert.equal(JSON.parse(calls[1].options.body).url,'https://pat0chat.github.io/meteocompare/pwa');
assert.equal(JSON.parse(calls[2].options.body).name,'PWA Installed');
assert.equal(JSON.parse(calls[2].options.body).url,'https://pat0chat.github.io/meteocompare/pwa');
const beforeUnknown=calls.length; await client.event('City Added',{name:'home'}); assert.equal(calls.length,beforeUnknown,'unknown events must be rejected');

client.setOptOut(true); assert.equal(client.status().active,false); await client.pageview({name:'home'}); assert.equal(calls.length,beforeUnknown);
client.setOptOut(false); assert.equal(client.status().active,true);
env.navigator.globalPrivacyControl=true; assert.equal(client.status().active,false); await client.pageview({name:'home'}); assert.equal(calls.length,beforeUnknown);
env.navigator.globalPrivacyControl=false; env.navigator.doNotTrack='1'; assert.equal(client.status().active,false);

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
assert.match(app,/trackAnalyticsEvent\('PWA Install Click'/);
assert.match(app,/trackAnalyticsEvent\('PWA Installed'/);
assert.match(app,/trackPageView\(state\.route\)/);
assert.match(app,/data-action="toggle-analytics"/);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/connect-src[^\"]*https:\/\/plausible\.io/);
const privacy=fs.readFileSync(new URL('../PRIVACY.md',import.meta.url),'utf8');
// This will be updated by the version patch; keep a regression guard against the old zero-analytics statement.
assert.ok(!privacy.includes('Aucun analytics, aucun\ntracking'));
const i18n=fs.readFileSync(new URL('../js/i18n.js',import.meta.url),'utf8');
assert.match(i18n,/analyticsPurposeTitle:'Finalité limitée'/);
assert.match(i18n,/fréquentation et la charge du site/);
assert.match(i18n,/analyticsCnilNote:'Cadre CNIL/);
assert.match(i18n,/statistiques anonymes/);
assert.match(app,/analytics-purpose-note/);
assert.match(app,/analytics-cnil-note/);
assert.match(app,/cookies-solutions-pour-les-outils-de-mesure-daudience/);
assert.match(privacy,/dimensionnement de l’hébergement/);
assert.match(privacy,/statistiques anonymes/);
assert.match(privacy,/configuration effective du fournisseur/);

console.log('MeteoCompare minimal privacy analytics tests: OK');
