export function onRequestGet(context){
  const origin=new URL(context.request.url).origin;
  const body=`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(body,{headers:{'content-type':'text/plain; charset=UTF-8','cache-control':'public, max-age=3600, s-maxage=21600'}});
}
