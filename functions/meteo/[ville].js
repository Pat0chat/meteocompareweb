import { resolveCityFromSlug, fetchSeoForecast, injectSeoHtml, notFoundHtml } from '../_lib/seo-render.js';

async function baseHtml(context){
  const url=new URL(context.request.url);url.pathname='/';url.search='';url.hash='';
  const response=await context.env.ASSETS.fetch(url);
  if(!response.ok)throw new Error(`ASSET_${response.status}`);
  return response.text();
}

export async function onRequestGet(context){
  const requestUrl=new URL(context.request.url),origin=requestUrl.origin,slug=String(context.params.ville||''),edgeCache=globalThis.caches?.default||null,cacheKey=new Request(`${origin}${requestUrl.pathname}`,{method:'GET'});
  if(edgeCache){const hit=await edgeCache.match(cacheKey);if(hit)return hit;}
  const shell=await baseHtml(context);
  let city=null,forecast=null;
  try{city=await resolveCityFromSlug(slug);}catch{}
  if(!city)return new Response(notFoundHtml(shell,origin,slug),{status:404,headers:{'content-type':'text/html; charset=UTF-8','cache-control':'public, max-age=60, s-maxage=300'}});
  if(city.slug!==slug){const target=new URL(`/meteo/${encodeURIComponent(city.slug)}`,origin);target.search=requestUrl.search;return Response.redirect(target.toString(),301);}
  try{forecast=await fetchSeoForecast(city);}catch{}
  const html=injectSeoHtml(shell,{city,forecast,origin}),response=new Response(html,{status:200,headers:{'content-type':'text/html; charset=UTF-8','cache-control':'public, max-age=300, s-maxage=900, stale-while-revalidate=3600','x-robots-tag':'index, follow'}});
  if(edgeCache)context.waitUntil?.(edgeCache.put(cacheKey,response.clone()));
  return response;
}

export async function onRequestHead(context){const response=await onRequestGet(context);return new Response(null,{status:response.status,headers:response.headers});}
