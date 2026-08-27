function nestedRouteBase(pathname){
  return /^\/meteo\/[^/]+\/?$/i.test(String(pathname||''))?'/':null;
}

export function preparePreviewHtml(html,{pathname='/'}={}){
  // Analytics loading is host-gated in index.html, so localhost never creates the Plausible script.
  // A SPA fallback served at /meteo/:slug must resolve the relative application shell from site root.
  const base=nestedRouteBase(pathname),source=String(html);
  if(!base||/<base\s/i.test(source))return source;
  return source.replace(/(<meta charset="utf-8" \/>)/i,`$1\n  <base href="${base}" />`);
}
