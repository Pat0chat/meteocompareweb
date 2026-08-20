import fs from 'node:fs';
import assert from 'node:assert/strict';
import { slugifyCityName, citySeoPath, seoCityTitle, seoCityDescription, seoCityH1 } from '../js/seo.js';
import { resolveCityFromSlug, injectSeoHtml } from '../functions/_lib/seo-render.js';
import { onRequestGet as renderCityPage } from '../functions/meteo/[ville].js';
import { onRequestGet as renderSitemap } from '../functions/sitemap.xml.js';
import { onRequestGet as renderRobots } from '../functions/robots.txt.js';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js'),app=read('js/app.js'),index=read('index.html');
assert.equal(version,'1.14.0');
assert.ok(versionJs.includes("APP_VERSION = '1.14.0'"));
assert.ok(sw.includes("APP_VERSION = '1.14.0'"));
assert.match(sw,/CACHE_VERSION = 'v6[5-9][^']*'/);

// Priority 1 — canonical, accent-safe city URLs and backward-compatible SPA routing.
assert.equal(slugifyCityName('Saint-Étienne'),'saint-etienne');
assert.equal(slugifyCityName("L’Haÿ-les-Roses"),'l-hay-les-roses');
assert.equal(citySeoPath({name:'La Rochelle'}),'/meteo/la-rochelle');
assert.match(app,/parts\[0\]==='meteo'&&parts\[1\]/);
assert.match(app,/function goCity\(cityId\)[\s\S]*citySeoPath\(city\)/);
assert.match(app,/#\/city\//,'legacy hash city URLs must remain readable');
assert.match(app,/history\.pushState/);

// Priority 2 — deterministic per-city SEO metadata and an actual H1.
const paris={id:'2988507',name:'Paris',admin1:'Île-de-France',country:'France',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris',slug:'paris'};
assert.match(seoCityTitle('Paris','fr'),/^Météo Paris/);
assert.match(seoCityDescription(paris,'fr'),/températures, pluie, vent, nuages/);
assert.equal(seoCityH1('Paris','fr'),'Météo à Paris');
assert.match(app,/seoCityH1\(city\.name,i18n\(\)\.lang\)/);
assert.match(app,/syncDocumentMeta/);

// Priority 3 — the Cloudflare Function returns indexable HTML before JS executes.
const sampleForecast={
  current:{temperature_2m:22.4,apparent_temperature:22.1,precipitation:0,weather_code:1,cloud_cover:28,wind_speed_10m:12},
  daily:{time:['2026-08-20','2026-08-21'],weather_code:[1,2],temperature_2m_max:[25,24],temperature_2m_min:[15,14],precipitation_sum:[0,1],precipitation_probability_max:[10,35],wind_speed_10m_max:[19,22]}
};
const injected=injectSeoHtml(index,{city:paris,forecast:sampleForecast,origin:'https://meteo.example'});
assert.match(injected,/<base href="\/"/);
assert.match(injected,/<title>Météo Paris : prévisions multi-modèles \| MeteoCompare<\/title>/);
assert.match(injected,/<meta name="description" content="[^"]*Paris/);
assert.match(injected,/<link rel="canonical" href="https:\/\/meteo\.example\/meteo\/paris"/);
assert.match(injected,/<h1>Météo à Paris<\/h1>/);
assert.match(injected,/22,4 °C/);
assert.match(injected,/couverture nuageuse 28 %/);
assert.match(injected,/meteocompare:city-timezone/);
assert.equal((injected.match(/<meta property="og:title"/g)||[]).length,1,'OG title must not be duplicated');

const geocodeFetch=async url=>new Response(JSON.stringify({results:[
  {id:4717560,name:'Paris',admin1:'Texas',country:'United States',latitude:33.66,longitude:-95.55,timezone:'America/Chicago',population:24000},
  {id:2988507,name:'Paris',admin1:'Île-de-France',country:'France',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris',population:2100000}
]}),{status:200,headers:{'content-type':'application/json'}});
assert.equal((await resolveCityFromSlug('paris',geocodeFetch)).id,'2988507','exact duplicate names should prefer the largest matching city');

const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
  const url=input instanceof URL?input:new URL(typeof input==='string'?input:input.url);
  if(url.hostname==='geocoding-api.open-meteo.com')return geocodeFetch(url);
  if(url.hostname==='api.open-meteo.com')return new Response(JSON.stringify(sampleForecast),{status:200,headers:{'content-type':'application/json'}});
  throw new Error(`unexpected fetch ${url}`);
};
try{
  const response=await renderCityPage({
    request:new Request('https://meteo.example/meteo/paris'),params:{ville:'paris'},
    env:{ASSETS:{fetch:async()=>new Response(index,{status:200,headers:{'content-type':'text/html'}})}},
    waitUntil:()=>{}
  });
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.match(response.headers.get('x-robots-tag'),/index, follow/);
  const html=await response.text();
  assert.match(html,/<h1>Météo à Paris<\/h1>/);
  assert.match(html,/https:\/\/meteo\.example\/meteo\/paris/);
} finally { globalThis.fetch=originalFetch; }

const cityFunction=read('functions/meteo/[ville].js');
assert.match(cityFunction,/env\.ASSETS\.fetch/);
assert.match(cityFunction,/injectSeoHtml/);
assert.doesNotMatch(cityFunction,/user-agent|googlebot|bingbot/i,'prerendering must not be bot-specific');
assert.match(index,/<h1>Comparez les prévisions météo de plusieurs modèles<\/h1>/);
assert.match(index,/href="\/meteo\/paris"/);
assert.match(index,/<script type="module" src="js\/app\.js"><\/script>/);
assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i,'no inline executable script should be introduced');

// Priority 4 — crawl controls use the deployment origin, never a hard-coded host.
const sitemap=renderSitemap({request:new Request('https://meteo.example/sitemap.xml')});
assert.match(sitemap.headers.get('content-type'),/application\/xml/);
const sitemapXml=await sitemap.text();
assert.match(sitemapXml,/<loc>https:\/\/meteo\.example\/<\/loc>/);
assert.match(sitemapXml,/<loc>https:\/\/meteo\.example\/meteo\/paris<\/loc>/);
assert.match(sitemapXml,/<loc>https:\/\/meteo\.example\/meteo\/saint-etienne<\/loc>/);
const robots=renderRobots({request:new Request('https://meteo.example/robots.txt')});
const robotsTxt=await robots.text();
assert.match(robotsTxt,/User-agent: \*/);
assert.match(robotsTxt,/Allow: \//);
assert.match(robotsTxt,/Sitemap: https:\/\/meteo\.example\/sitemap\.xml/);

const routes=JSON.parse(read('_routes.json'));
assert.deepEqual(routes.include,['/meteo/*','/sitemap.xml','/robots.txt']);
const wrangler=JSON.parse(read('wrangler.jsonc'));
assert.equal(wrangler.pages_build_output_dir,'./dist');
assert.ok(fs.existsSync(new URL('../scripts/build-cloudflare.mjs',import.meta.url)));
assert.match(sw,/\.\/js\/seo\.js/);
assert.match(sw,/pathname\.startsWith\('\/meteo\/'\)/);

console.log('MeteoCompare Web 1.14.0 SEO release guard: OK');
