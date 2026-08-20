import { SEO_CITY_SLUGS } from './_lib/seo-cities.js';
import { xmlEscape } from './_lib/seo-render.js';

export function onRequestGet(context){
  const origin=new URL(context.request.url).origin,lastmod=new Date().toISOString().slice(0,10);
  const urls=[`${origin}/`,...SEO_CITY_SLUGS.map(slug=>`${origin}/meteo/${slug}`)];
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc=>`  <url><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body,{headers:{'content-type':'application/xml; charset=UTF-8','cache-control':'public, max-age=3600, s-maxage=21600'}});
}
