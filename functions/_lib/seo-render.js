import { slugifyCityName, seoCityTitle, seoCityDescription, seoCityH1 } from '../../js/seo.js';

const GEOCODING='https://geocoding-api.open-meteo.com/v1/search';
const FORECAST='https://api.open-meteo.com/v1/forecast';

const WMO={0:'ciel dégagé',1:'ciel peu nuageux',2:'ciel partiellement nuageux',3:'ciel couvert',45:'brouillard',48:'brouillard givrant',51:'bruine faible',53:'bruine',55:'bruine forte',56:'bruine verglaçante',57:'bruine verglaçante forte',61:'pluie faible',63:'pluie',65:'fortes pluies',66:'pluie verglaçante',67:'forte pluie verglaçante',71:'neige faible',73:'neige',75:'fortes chutes de neige',77:'grains de neige',80:'averses faibles',81:'averses',82:'fortes averses',85:'averses de neige',86:'fortes averses de neige',95:'orage',96:'orage avec grêle',99:'orage violent avec grêle'};

export function htmlEscape(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function xmlEscape(value=''){return htmlEscape(value);}

export async function resolveCityFromSlug(slug,fetchImpl=fetch){
  const clean=slugifyCityName(decodeURIComponent(String(slug||'')));
  if(!clean)return null;
  const query=clean.replace(/-/g,' '),url=new URL(GEOCODING);
  url.searchParams.set('name',query);url.searchParams.set('count','10');url.searchParams.set('language','fr');url.searchParams.set('format','json');
  const response=await fetchImpl(url,{headers:{accept:'application/json'}});if(!response.ok)return null;
  const json=await response.json(),rows=(json.results||[]).filter(row=>Number.isFinite(row.latitude)&&Number.isFinite(row.longitude));
  if(!rows.length)return null;
  const exact=rows.filter(row=>slugifyCityName(row.name)===clean),pool=exact.length?exact:rows;
  pool.sort((a,b)=>(Number(b.population)||0)-(Number(a.population)||0));
  const row=pool[0];
  return {id:String(row.id),name:row.name,admin1:row.admin1||'',country:row.country||'',latitude:row.latitude,longitude:row.longitude,timezone:row.timezone||'auto',slug:slugifyCityName(row.name)};
}

export async function fetchSeoForecast(city,fetchImpl=fetch){
  const url=new URL(FORECAST);url.searchParams.set('latitude',String(city.latitude));url.searchParams.set('longitude',String(city.longitude));
  url.searchParams.set('current','temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m');
  url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');
  url.searchParams.set('timezone','auto');url.searchParams.set('forecast_days','4');url.searchParams.set('wind_speed_unit','kmh');
  const response=await fetchImpl(url,{headers:{accept:'application/json'}});if(!response.ok)return null;
  try{return await response.json();}catch{return null;}
}

function fmt(value,digits=0){return Number.isFinite(value)?new Intl.NumberFormat('fr-FR',{maximumFractionDigits:digits}).format(value):'—';}
function forecastRows(data){
  const d=data?.daily;if(!Array.isArray(d?.time))return '';
  return d.time.slice(0,4).map((date,i)=>{
    const day=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
    const label=WMO[d.weather_code?.[i]]||'conditions variables';
    return `<li><strong>${htmlEscape(day)}</strong><span>${htmlEscape(label)} · ${fmt(d.temperature_2m_min?.[i])}–${fmt(d.temperature_2m_max?.[i])} °C · pluie ${fmt(d.precipitation_probability_max?.[i])}% · vent max ${fmt(d.wind_speed_10m_max?.[i])} km/h</span></li>`;
  }).join('');
}

export function renderSeoSnapshot(city,data){
  const current=data?.current||{},condition=WMO[current.weather_code]||'conditions variables',place=[city.admin1,city.country].filter(Boolean).join(', ');
  return `<main class="seo-prerender" data-seo-prerender="true"><nav class="seo-prerender-nav"><a href="/">MeteoCompare</a></nav><article><p class="seo-prerender-kicker">Prévisions météo multi-modèles</p><h1>${htmlEscape(seoCityH1(city.name,'fr'))}</h1><p class="seo-prerender-place">${htmlEscape(place)}</p><p class="seo-prerender-lead">Prévisions pour ${htmlEscape(city.name)} : ${fmt(current.temperature_2m,1)} °C, ${htmlEscape(condition)}, couverture nuageuse ${fmt(current.cloud_cover)} %, vent ${fmt(current.wind_speed_10m)} km/h. MeteoCompare compare plusieurs modèles météo et met en évidence leur dispersion et leur niveau d’accord.</p><dl class="seo-prerender-now"><div><dt>Température</dt><dd>${fmt(current.temperature_2m,1)} °C</dd></div><div><dt>Ressenti</dt><dd>${fmt(current.apparent_temperature,1)} °C</dd></div><div><dt>Nuages</dt><dd>${fmt(current.cloud_cover)} %</dd></div><div><dt>Vent</dt><dd>${fmt(current.wind_speed_10m)} km/h</dd></div></dl><section><h2>Prévisions des prochains jours</h2><ul class="seo-prerender-days">${forecastRows(data)}</ul></section><p class="seo-prerender-note">Les données météo sont fournies par Open-Meteo. L’interface interactive MeteoCompare charge ensuite la comparaison détaillée des modèles disponibles pour cette ville.</p></article></main>`;
}

function replaceOrInsert(html,pattern,replacement,before='</head>'){
  if(pattern.test(html))return html.replace(pattern,replacement);
  return html.replace(before,`${replacement}\n${before}`);
}
export function injectSeoHtml(baseHtml,{city,forecast,origin}){
  const canonical=`${origin}/meteo/${encodeURIComponent(city.slug)}`,title=seoCityTitle(city.name,'fr'),description=seoCityDescription(city,'fr');
  let html=baseHtml;
  if(!/<base\s/i.test(html))html=html.replace('</head>','  <base href="/" />\n</head>');
  html=replaceOrInsert(html,/<title>[\s\S]*?<\/title>/i,`<title>${htmlEscape(title)}</title>`);
  html=replaceOrInsert(html,/<meta\s+name="description"[^>]*>/i,`<meta name="description" content="${htmlEscape(description)}" />`);
  html=replaceOrInsert(html,/<link\s+rel="canonical"[^>]*>/i,`<link rel="canonical" href="${htmlEscape(canonical)}" />`);
  html=replaceOrInsert(html,/<meta\s+property="og:type"[^>]*>/i,'<meta property="og:type" content="website" />');
  html=replaceOrInsert(html,/<meta\s+property="og:title"[^>]*>/i,`<meta property="og:title" content="${htmlEscape(title)}" />`);
  html=replaceOrInsert(html,/<meta\s+property="og:description"[^>]*>/i,`<meta property="og:description" content="${htmlEscape(description)}" />`);
  html=replaceOrInsert(html,/<meta\s+property="og:url"[^>]*>/i,`<meta property="og:url" content="${htmlEscape(canonical)}" />`);
  html=replaceOrInsert(html,/<meta\s+name="twitter:card"[^>]*>/i,'<meta name="twitter:card" content="summary" />');
  const social=`<meta name="twitter:title" content="${htmlEscape(title)}" />\n  <meta name="twitter:description" content="${htmlEscape(description)}" />\n  <meta name="meteocompare:city-id" content="${htmlEscape(city.id)}" />\n  <meta name="meteocompare:city-name" content="${htmlEscape(city.name)}" />\n  <meta name="meteocompare:city-admin1" content="${htmlEscape(city.admin1)}" />\n  <meta name="meteocompare:city-country" content="${htmlEscape(city.country)}" />\n  <meta name="meteocompare:city-latitude" content="${htmlEscape(city.latitude)}" />\n  <meta name="meteocompare:city-longitude" content="${htmlEscape(city.longitude)}" />\n  <meta name="meteocompare:city-timezone" content="${htmlEscape(city.timezone)}" />`;
  html=html.replace('</head>',`  ${social}\n</head>`);
  const snapshot=renderSeoSnapshot(city,forecast);
  html=html.replace(/<div id="app" class="app-shell">[\s\S]*?<\/div>\s*<div id="toast-root"/i,`<div id="app" class="app-shell">${snapshot}</div>\n  <div id="toast-root"`);
  return html;
}

export function notFoundHtml(baseHtml,origin,slug){
  const title='Ville introuvable | MeteoCompare',description='Cette ville n’a pas pu être identifiée pour afficher une prévision météo MeteoCompare.';
  let html=baseHtml;if(!/<base\s/i.test(html))html=html.replace('</head>','  <base href="/" />\n</head>');html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${title}</title>`).replace(/<meta\s+name="description"[^>]*>/i,`<meta name="description" content="${description}" />`);
  html=html.replace('</head>',`  <meta name="robots" content="noindex,follow" />\n  <link rel="canonical" href="${htmlEscape(origin)}/" />\n</head>`);
  html=html.replace(/<div id="app" class="app-shell">[\s\S]*?<\/div>\s*<div id="toast-root"/i,`<div id="app" class="app-shell"><main class="seo-prerender"><article><h1>Ville introuvable</h1><p>Impossible d’identifier « ${htmlEscape(slug)} ». Revenez à <a href="/">MeteoCompare</a> pour rechercher une ville.</p></article></main></div>\n  <div id="toast-root"`);
  return html;
}
