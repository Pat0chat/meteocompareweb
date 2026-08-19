const SUPPORTED = ['fr','en','es','de','it'];
const PREF_TO_LANG = { FRENCH:'fr', ENGLISH:'en', SPANISH:'es', GERMAN:'de', ITALIAN:'it' };
const LOCALES = { fr:'fr-FR', en:'en-GB', es:'es-ES', de:'de-DE', it:'it-IT' };
const catalogs = new Map();
let activeLang = null;

export function languageCode(pref) {
  if (PREF_TO_LANG[pref]) return PREF_TO_LANG[pref];
  const sys=(globalThis.navigator?.language||'fr').slice(0,2).toLowerCase();
  return SUPPORTED.includes(sys)?sys:'fr';
}

async function importCatalog(lang) {
  if(catalogs.has(lang)) return catalogs.get(lang);
  let mod;
  if(lang==='en') mod=await import('./locales/en.js');
  else if(lang==='es') mod=await import('./locales/es.js');
  else if(lang==='de') mod=await import('./locales/de.js');
  else if(lang==='it') mod=await import('./locales/it.js');
  else mod=await import('./locales/fr.js');
  const catalog=mod.catalog||mod.default||{};
  catalogs.set(lang,catalog);
  return catalog;
}

export async function ensureLanguage(pref) {
  const lang=languageCode(pref);
  try { await importCatalog(lang); activeLang=lang; return lang; }
  catch(err) {
    if(lang!=='fr') { await importCatalog('fr'); activeLang='fr'; return 'fr'; }
    throw err;
  }
}

function formatValue(template, vars={}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g,(_,k)=>vars[k] == null ? `{${k}}` : String(vars[k]));
}
function androidFormat(template,args,locale='en-US'){
  if(typeof template!=='string')return template;
  let auto=0;
  return template.replace(/%%|%(?:(\d+)\$)?(?:\.(\d+))?([dfs])/g,(match,index,precision,type)=>{
    if(match==='%%')return '%';
    const value=args[index?Number(index)-1:auto++];
    if(value==null)return '';
    if(type==='d')return String(Math.round(Number(value)));
    if(type==='f'){
      const number=Number(value);if(!Number.isFinite(number))return String(value);
      if(precision!=null){const digits=Number(precision);return new Intl.NumberFormat(locale,{useGrouping:false,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(number);}
      return new Intl.NumberFormat(locale,{useGrouping:false,maximumFractionDigits:6}).format(number);
    }
    return String(value);
  });
}

export function makeI18n(pref) {
  const requested=languageCode(pref),lang=catalogs.has(requested)?requested:(activeLang&&catalogs.has(activeLang)?activeLang:(catalogs.has('fr')?'fr':requested));
  const dict=catalogs.get(lang)||{};
  const locale=LOCALES[lang]||'fr-FR';
  const t=(key,varsOrArg={},...args)=>{
    const raw=dict[key] ?? key;
    if(varsOrArg && typeof varsOrArg==='object' && !Array.isArray(varsOrArg))return formatValue(raw,varsOrArg);
    return androidFormat(raw,[varsOrArg,...args],locale);
  };
  return {lang,locale,t};
}

export async function preloadLanguages(langs=SUPPORTED){await Promise.all(langs.map(importCatalog));if(!activeLang&&langs.length)activeLang=langs[0];}
export function hasTranslation(pref,key){const lang=languageCode(pref),dict=catalogs.get(lang);return typeof dict?.[key]==='string'&&Boolean(dict[key].trim());}
export function webTranslationAudit(){
  const fr=catalogs.get('fr')||{},base=Object.keys(fr);
  return Object.fromEntries(SUPPORTED.map(lang=>{const dict=catalogs.get(lang)||{};return [lang,base.filter(k=>typeof dict[k]!=='string'||!dict[k].trim())];}));
}

// Node-based regression tests intentionally preload every catalog. Browsers do not:
// only the active language is fetched by app.js and additional languages are loaded
// when the user selects them.
if(typeof window==='undefined') await preloadLanguages();
