import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_CITIES, cityPublicPath, nearbySeoCities } from '../js/seo-cities.mjs';
import { readProjectVersion } from './project-version.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'dist');
const site='https://meteocompare.app';
const today=new Date().toISOString().slice(0,10);
const verification=String(process.env.GOOGLE_SITE_VERIFICATION||'').trim();
const appVersion=await readProjectVersion(root);

function html(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function xml(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}
function replaceMeta(document,{title,description,canonical,robots='index,follow,max-image-preview:large',base=false}){
  let page=document
    .replace(/<title>[\s\S]*?<\/title>/i,`<title>${html(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/i,`<meta name="description" content="${html(description)}" />`)
    .replace(/<meta name="robots" content="[^"]*" \/>/i,`<meta name="robots" content="${html(robots)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/i,`<link rel="canonical" href="${html(canonical)}" />`);
  if(base&&!/<base\s/i.test(page))page=page.replace(/(<meta charset="utf-8" \/>)/i,'$1\n  <base href="/" />');
  if(verification&&!/name="google-site-verification"/i.test(page))page=page.replace(/(<meta name="robots"[^>]*>)/i,`$1\n  <meta name="google-site-verification" content="${html(verification)}" />`);
  return page;
}
function injectApp(document,content){
  const marker='<div id="app" class="app-shell"></div>';
  if(!document.includes(marker))throw new Error('index.html: app shell marker not found');
  return document.replace(marker,`<div id="app" class="app-shell">${content}</div>`);
}
function cityLink(city){
  return `<a class="seo-city-link" data-seo-city-link="${html(city.slug)}" href="${html(cityPublicPath(city))}"><strong>${html(city.name)}</strong><span>${html(city.department || city.region)}</span><span aria-hidden="true">→</span></a>`;
}
function rootPrerender(){
  const links=SEO_CITIES.slice(0,40).map(cityLink).join('');
  return `<main class="page home-page seo-prerender"><section class="home-hero"><div class="home-hero-main"><div class="home-hero-copy"><span class="home-hero-kicker">Prévision multi-modèles</span><p>MeteoCompare rassemble plusieurs prévisions pour faire ressortir ce qui converge, ce qui diverge et ce qui mérite votre attention dans vos villes.</p><div class="home-hero-forecast-meta" aria-label="Configuration active des prévisions"><span class="home-hero-context-item home-hero-context-count"><span aria-hidden="true">◫</span><span>7 modèles · 6 familles indépendantes</span></span><span class="home-hero-context-separator" aria-hidden="true"></span><span class="home-hero-context-models" title="Principaux modèles · AROME HD · ARPEGE EU · ICON-EU · GFS · +3">AROME HD · ARPEGE EU · ICON-EU · GFS · +3</span><span class="home-hero-context-separator" aria-hidden="true"></span><span class="home-hero-context-item home-hero-context-sync"><span aria-hidden="true">↻</span><span>En attente de données · 1 h</span></span></div></div><aside class="forecast-expertise-disclaimer" role="note" aria-labelledby="seo-forecast-expertise-title"><span class="forecast-expertise-disclaimer-icon" aria-hidden="true">i</span><div><strong id="seo-forecast-expertise-title">Une aide à l’interprétation, jamais un substitut à l’expertise</strong><p>MeteoCompare met en évidence les convergences et divergences de prévisions multi-modèles pour mieux lire l’incertitude. Cette synthèse reste indicative et ne remplacera jamais l’expertise humaine d’un météorologue ou d’un professionnel compétent.</p></div></aside></div></section><section class="section-card seo-prerender-copy"><div class="section-head"><div><h2>Une prévision météo qui montre aussi l’incertitude</h2><p>Consultez la température, la pluie et le vent, puis comparez la dispersion entre modèles et leur convergence. Les prévisions actualisées se chargent dans votre navigateur.</p></div></div></section><section class="seo-directory"><div class="home-section-heading home-column-heading seo-directory-heading"><div><span class="home-section-kicker">Explorer</span><h2>Prévisions météo par ville</h2></div></div><div class="section-card seo-directory-card"><p class="seo-directory-intro">Accédez directement aux comparaisons multi-modèles des principales villes françaises.</p><div class="seo-link-grid">${links}</div></div></section></main>`;
}
function cityPrerender(city){
  const nearby=nearbySeoCities(city,6);
  const nearbyNames=nearby.slice(0,3).map(item=>item.name).join(', ');
  return `<main class="page detail-page seo-prerender"><section class="detail-hero professional-hero"><div class="detail-title"><div class="eyebrow">Prévision multi-modèles</div><h1>Météo ${html(city.name)} : comparaison des modèles météo</h1><p>${html(city.department)} · ${html(city.region)} · France</p></div></section><div class="detail-workspace seo-prerender-workspace"><div class="detail-main"><section class="section-card seo-prerender-copy"><div class="section-head"><div><h2>Prévisions météo pour ${html(city.name)}</h2><p>Cette page compare les prévisions disponibles pour ${html(city.name)}, dans le département ${html(city.department)} (${html(city.region)}). Les données actualisées de température, précipitations et vent se chargent automatiquement dans MeteoCompare.</p></div></div><p>MeteoCompare ne se limite pas à une valeur unique : l’application conserve les sorties brutes de plusieurs modèles et construit une synthèse permettant de voir quand leurs scénarios sont proches ou, au contraire, dispersés.</p></section><section class="section-card seo-prerender-copy"><div class="section-head"><div><h2>Convergence et dispersion des modèles à ${html(city.name)}</h2><p>La convergence décrit la proximité des prévisions entre familles de modèles. Une convergence élevée indique des scénarios proches ; une convergence plus faible signale davantage d’incertitude à surveiller.</p></div></div><p>Selon leur disponibilité géographique et leur horizon, MeteoCompare peut confronter notamment ECMWF, AIFS, GFS, ICON, AROME et ARPEGE. Les valeurs de chaque modèle restent accessibles afin de comprendre l’origine des écarts.</p></section><section class="section-card seo-prerender-copy"><div class="section-head"><div><h2>Comment lire la météo de ${html(city.name)} avec MeteoCompare ?</h2><p>Commencez par la synthèse du jour, puis observez la chronologie horaire, la bande d’accord, les scénarios et l’évolution des runs. La fiabilité historique locale est présentée séparément de la convergence instantanée.</p></div></div><p>Les pages météo sont conçues pour être consultées à nouveau : les contenus de prévision sont rafraîchis côté application, tandis que cette présentation géographique reste stable et indexable.</p></section><section class="section-card seo-nearby-section"><div class="section-head"><div><h2>Prévisions à proximité de ${html(city.name)}</h2><p>Comparez également les modèles pour ${html(nearbyNames)} et d’autres villes proches.</p></div></div><div class="seo-link-grid compact">${nearby.map(cityLink).join('')}</div></section></div></div></main>`;
}

await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const entry of ['index.html','styles.css','sw.js','app-version.js','cache-version.js','manifest.webmanifest','manifest.fr.webmanifest','manifest.en.webmanifest','manifest.es.webmanifest','manifest.de.webmanifest','manifest.it.webmanifest','.nojekyll']){
  await cp(join(root,entry),join(out,entry),{recursive:true});
}
for(const entry of ['assets','js'])await cp(join(root,entry),join(out,entry),{recursive:true});
await writeFile(join(out,'VERSION'),`${appVersion}\n`);

const template=await readFile(join(root,'index.html'),'utf8');
const rootHtml=injectApp(replaceMeta(template,{
  title:'MeteoCompare — comparaison multi-modèles météo',
  description:'Comparez plusieurs modèles météo, leur convergence, leur dispersion et leur évolution avec MeteoCompare.',
  canonical:`${site}/`
}),rootPrerender());
await writeFile(join(out,'index.html'),rootHtml);

await mkdir(join(out,'meteo'),{recursive:true});
for(const city of SEO_CITIES){
  const title=`Météo ${city.name} : comparaison des modèles météo | MeteoCompare`;
  const description=`Comparez les prévisions météo pour ${city.name} issues de plusieurs modèles : température, pluie, vent, convergence et dispersion des prévisions.`;
  let page=replaceMeta(template,{title,description,canonical:`${site}${cityPublicPath(city)}`,base:true});
  page=page.replace('<html lang="fr">',`<html lang="fr" data-seo-city="${html(city.slug)}">`);
  page=injectApp(page,cityPrerender(city));
  await writeFile(join(out,'meteo',`${city.slug}.html`),page);
}

const sitemap=[`${site}/`,...SEO_CITIES.map(city=>`${site}${cityPublicPath(city)}`)];
await writeFile(join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(url=>`  <url>\n    <loc>${xml(url)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join('\n')}\n</urlset>\n`);
await writeFile(join(out,'robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(join(out,'_redirects'),`/index.html / 301\n/meteo/:slug/ /meteo/:slug 301\n`);

console.log(`Built MeteoCompare ${SEO_CITIES.length} city pages + home into ${out}`);
console.log(`Search Console verification meta: ${verification?'enabled':'not configured (DNS verification recommended)'}`);
