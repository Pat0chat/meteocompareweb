import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SEO_CITIES, cityPublicPath, nearbySeoCities } from '../js/seo-cities.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');
const version=read('VERSION').trim();
const app=read('js/app.js');
const index=read('index.html');
const build=read('tools/build-site.mjs');
const sw=read('sw.js');
const wrangler=read('wrangler.jsonc');

assert.equal(version,'1.14.0','SEO foundation must not change the application version');
assert.equal(SEO_CITIES.length,80,'initial SEO catalog should stay intentionally controlled');
assert.equal(new Set(SEO_CITIES.map(city=>city.slug)).size,SEO_CITIES.length,'SEO city slugs must be unique');
assert.equal(new Set(SEO_CITIES.map(city=>city.id)).size,SEO_CITIES.length,'SEO city ids must be unique');
assert.equal(cityPublicPath(SEO_CITIES.find(city=>city.slug==='toulouse')),'/meteo/toulouse');
assert.equal(nearbySeoCities(SEO_CITIES.find(city=>city.slug==='toulouse'),6).length,6);

assert.match(index,/name="robots" content="index,follow,max-image-preview:large"/);
assert.match(index,/rel="canonical" href="https:\/\/meteocompare\.app\/"/);
assert.match(app,/cleanCityRoute\(pathname,query\)/,'runtime must parse clean city paths');
assert.match(app,/\^\\\/meteo\\\/\(\[\^\/\]\+\)/,'clean /meteo/{slug} route must remain explicit');
assert.match(app,/legacyCity=requested\.match/,'legacy hash city links must remain compatible');
assert.match(app,/renderSeoCityDirectory\(\)/,'home must expose crawlable city links');
assert.match(app,/data-seo-city-link/,'SEO city links must remain crawlable while supporting in-app routing');
assert.match(app,/openSeoCityLink\(link\)/,'SEO city links must be intercepted by the application router');
assert.match(app,/renderSeoCityContext\(city\)/,'indexed city content must remain present after JavaScript hydration');
assert.match(app,/renderSeoNearby\(city\)/,'city details must expose nearby internal links');
assert.match(app,/seoTransient/,'direct SEO routes must not silently become favorites');
assert.match(app,/seoCity\|\|state\.route\.name==='home'\?'index,follow,max-image-preview:large':'noindex,follow'/,'only catalogued city routes should be indexable at runtime');
assert.match(build,/GOOGLE_SITE_VERIFICATION/,'build must support Search Console URL-prefix verification when configured');
assert.match(build,/sitemap\.xml/);
assert.match(build,/robots\.txt/);
assert.match(build,/_redirects/);
assert.match(wrangler,/"directory"\s*:\s*"\.\/dist"/);
assert.match(sw,/CACHE_VERSION = 'v71-seo-release-1140'/);
assert.match(sw,/cache\.put\(request,copy\)/,'navigation cache must preserve each clean URL independently');

execFileSync(process.execPath,['tools/build-site.mjs'],{cwd:root,stdio:'pipe'});
const cityDir=resolve(root,'dist/meteo');
const cityPages=fs.readdirSync(cityDir).filter(name=>name.endsWith('.html'));
assert.equal(cityPages.length,SEO_CITIES.length,'build must emit one HTML file per indexed city');

const toulouse=read('dist/meteo/toulouse.html');
assert.match(toulouse,/<base href="\/" \/>/,'nested city pages must resolve runtime assets from the site root');
assert.match(toulouse,/<title>Météo Toulouse : comparaison des modèles météo \| MeteoCompare<\/title>/);
assert.match(toulouse,/rel="canonical" href="https:\/\/meteocompare\.app\/meteo\/toulouse"/);
assert.match(toulouse,/<h1>Météo Toulouse : comparaison des modèles météo<\/h1>/);
assert.match(toulouse,/Convergence et dispersion des modèles à Toulouse/);
assert.match(toulouse,/href="\/meteo\/montauban"/,'pre-rendered city page must include nearby internal links');

const sitemap=read('dist/sitemap.xml');
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
assert.equal(urls.length,SEO_CITIES.length+1,'sitemap must contain home plus every indexed city');
assert.ok(urls.includes('https://meteocompare.app/meteo/toulouse'));
assert.equal(new Set(urls).size,urls.length,'sitemap URLs must be unique');
assert.equal(read('dist/robots.txt'),'User-agent: *\nAllow: /\n\nSitemap: https://meteocompare.app/sitemap.xml\n');
assert.match(read('dist/_redirects'),/\/meteo\/:slug\/ \/meteo\/:slug 301/);

console.log('MeteoCompare Web SEO P0-P6 foundation 1.14.0: OK');
