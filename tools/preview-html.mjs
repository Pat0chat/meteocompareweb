import { injectBaseHref } from '../js/server/html-shell.js';
function nestedRouteBase(pathname){
  return /^\/meteo\/[^/]+\/?$/i.test(String(pathname||''))?'/':null;
}

export function preparePreviewHtml(html,{pathname='/'}={}){
  // Analytics loading is host-gated in index.html, so localhost never creates the Plausible script.
  // A SPA fallback served at /meteo/:slug must resolve the relative application shell from site root.
  const base=nestedRouteBase(pathname),source=String(html);
  return base?injectBaseHref(source,base):source;
}
