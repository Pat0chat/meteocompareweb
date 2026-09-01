import { injectBaseHref } from '../js/server/html-shell.js';
function nestedRouteBase(pathname){
  return /^\/meteo\/[^/]+\/?$/i.test(String(pathname||''))?'/':null;
}

export function preparePreviewHtml(html,{pathname='/'}={}){
  // Analytics delivery is host-gated by the bootstrap, so localhost never sends audience events.
  // A SPA fallback served at /meteo/:slug must resolve the relative application shell from site root.
  const base=nestedRouteBase(pathname),source=String(html);
  return base?injectBaseHref(source,base):source;
}
