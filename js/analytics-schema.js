const ROUTE_PATHS=new Set(['/','/city','/bias','/compare','/data','/settings','/about','/pwa','/404','/other']);
const LANGUAGES=new Set(['fr','en','es','de','it','other']);
const DISPLAY_MODES=new Set(['browser','standalone']);
const NAVIGATION_MODES=new Set(['seo','spa','direct']);

const enumRule=values=>Object.freeze({type:'enum',values:new Set(values)});
const countRule=max=>Object.freeze({type:'count',max});
const booleanRule=Object.freeze({type:'boolean'});
const tokenRule=Object.freeze({type:'token'});
const versionRule=Object.freeze({type:'version'});

export const ANALYTICS_COMMON_EVENT_SCHEMA=Object.freeze({
  app_version:versionRule,
  language:enumRule(LANGUAGES),
  display_mode:enumRule(DISPLAY_MODES),
  navigation:enumRule(NAVIGATION_MODES),
});

export const ANALYTICS_PAGEVIEW_SCHEMA=Object.freeze({
  page_group:enumRule(ROUTE_PATHS),
  app_version:versionRule,
  language:enumRule(LANGUAGES),
  display_mode:enumRule(DISPLAY_MODES),
  navigation:enumRule(NAVIGATION_MODES),
  effective_theme:enumRule(['light','dark']),
  density:enumRule(['comfortable','compact']),
  detail_tab:enumRule(['conditions','temperature','precipitation','wind']),
  detail_mode:enumRule(['daily','hourly']),
  agreement_metric:enumRule(['temperature','precipitation','wind']),
  horizon_hours:enumRule(['24','72','168']),
  timeline:enumRule(['hourly','daily']),
  compared_models:countRule(4),
  variable:tokenRule,
  model:tokenRule,
  compared_cities:countRule(3),
});

const event=(props={},interactive=true)=>Object.freeze({props:Object.freeze(props),interactive});
export const ANALYTICS_EVENT_DEFINITIONS=Object.freeze({
  'PWA Install Click':event(),
  'PWA Installed':event({},false),
  'PWA Install Prompt Result':event({outcome:enumRule(['accepted','dismissed'])}),
  'Install Option Selected':event({source:enumRule(['play_store','pwa'])}),
  'City Search Opened':event(),
  'City Added':event({source:enumRule(['search'])}),
  'SEO City Favorite Added':event(),
  'City Removed':event(),
  'Forecast Refreshed':event({scope:enumRule(['city','all'])}),
  'Forecast View Changed':event({control:enumRule(['metric','horizon','mode','tab','timeline','evolution','reliability']),value:tokenRule}),
  'Model Comparison Changed':event({model_count:countRule(4)}),
  'Model Selection Changed':event({model_count:countRule(20),family_count:countRule(20)}),
  'City Comparison Started':event({city_count:countRule(3)}),
  'Marine Activated':event(),
  'Model Health Refreshed':event(),
  'Vigilance Refreshed':event(),
  'Forecast Engine Comparison Opened':event(),
  'Confidence Explanation Opened':event(),
  'Diagnostics Opened':event(),
  'Data Exported':event({format:enumRule(['json','csv'])}),
  'Local Backup Exported':event(),
  'Local Backup Imported':event(),
  'Share Link Copied':event({method:enumRule(['clipboard'])}),
  'Share Link Fallback Opened':event({reason:enumRule(['clipboard_unavailable','clipboard_error'])}),
  'Local Weighting Changed':event({enabled:booleanRule}),
  'Forecast Engine Changed':event({engine:enumRule(['multi_consensus','calibration','scenarios','adaptive'])}),
  'Rain Radar Opened':event(),
  'Rain Radar Range Changed':event({range:enumRule(['near','regional','wide'])}),
  'Rain Radar Mode Changed':event({mode:enumRule(['observation','projection'])}),
  'Rain Radar Horizon Changed':event({horizon:enumRule(['15','30','45','60'])}),
  'Rain Radar Fullscreen Changed':event({fullscreen:booleanRule}),
  'Rain Radar Projection Recalculated':event({success:booleanRule}),
  'System Monitor Opened':event(),
  'System Monitor Refreshed':event(),
  'Support Opened':event(),
  'External Link Opened':event({destination:enumRule(['bluesky','meteofrance_vigilance','liberapay','kofi'])}),
});

function sanitizeRule(value,rule){
  if(value==null||!rule)return null;
  if(rule.type==='enum'){const text=String(value).toLowerCase();return rule.values.has(text)?text:null;}
  if(rule.type==='count'){const n=Math.round(Number(value));return Number.isFinite(n)?String(Math.min(rule.max,Math.max(0,n))):null;}
  if(rule.type==='boolean')return value===true||value==='true'||value==='on'?'true':value===false||value==='false'||value==='off'?'false':null;
  if(rule.type==='token'){const text=String(value).trim().toLowerCase();return /^[a-z0-9_-]{1,40}$/.test(text)?text:null;}
  if(rule.type==='version'){const text=String(value).trim();return /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:[-+][a-z0-9.-]{1,30})?$/i.test(text)?text:null;}
  return null;
}

export function sanitizeAnalyticsProperties(input={},schema={}){
  const output={};
  for(const [key,rule] of Object.entries(schema)){const safe=sanitizeRule(input?.[key],rule);if(safe!=null)output[key]=safe;}
  return output;
}

export function sanitizeAnalyticsPageProps(props={}){return sanitizeAnalyticsProperties(props,ANALYTICS_PAGEVIEW_SCHEMA);}
export function sanitizeAnalyticsEventProps(name,props={}){
  const definition=ANALYTICS_EVENT_DEFINITIONS[name];if(!definition)return null;
  return sanitizeAnalyticsProperties(props,{...ANALYTICS_COMMON_EVENT_SCHEMA,...definition.props});
}
export function analyticsEventInteractive(name){return ANALYTICS_EVENT_DEFINITIONS[name]?.interactive!==false;}
export function isAllowedAnalyticsEvent(name){return name==='pageview'||Object.hasOwn(ANALYTICS_EVENT_DEFINITIONS,name);}

function canonicalAnalyticsPath(url){
  const pathname=url.pathname.replace(/\/{2,}/g,'/'),hash=String(url.hash||'');
  if((pathname==='/'||pathname==='/index.html')&&hash.startsWith('#/')){
    const first=hash.slice(2).split(/[/?]/,1)[0].toLowerCase();
    if(!first)return '/';
    if(first==='city')return '/city';
    if(first==='compare')return '/compare';
    if(first==='settings')return '/settings';
    if(first==='data')return '/data';
    if(first==='about')return '/about';
  }
  if(ROUTE_PATHS.has(pathname))return pathname;
  if(pathname==='/index.html')return '/';
  if(/^\/meteo\/?$/i.test(pathname))return '/';
  if(/^\/meteo\/[^/]+\/?$/i.test(pathname))return '/city';
  return null;
}
function sanitizeCampaignUrl(raw,allowedHosts){
  let url;try{url=new URL(String(raw||''));}catch{return null;}
  if(url.protocol!=='https:'||!allowedHosts.includes(url.hostname.toLowerCase()))return null;
  const canonicalPath=canonicalAnalyticsPath(url);if(!canonicalPath)return null;
  url.pathname=canonicalPath;
  const query=new URLSearchParams();
  for(const key of ['utm_source','utm_medium','utm_campaign']){
    const value=url.searchParams.get(key);if(value==null)continue;
    const cleaned=String(value).trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120);if(cleaned)query.set(key,cleaned);
  }
  url.search=query.toString();url.hash='';return url.toString();
}
function sanitizePayloadReferrer(raw,allowedHosts){
  if(raw==null||raw==='')return null;
  let url;try{url=new URL(String(raw));}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||allowedHosts.includes(url.hostname.toLowerCase()))return null;
  return `${url.protocol}//${url.host}/`;
}

export function sanitizePlausibleProxyPayload(payload,{domain,allowedHosts=[]}={}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return {ok:false,error:'INVALID_PAYLOAD'};
  const name=String(payload.n||'');if(!isAllowedAnalyticsEvent(name))return {ok:false,error:'EVENT_NOT_ALLOWED'};
  const hosts=[...new Set((allowedHosts||[]).map(x=>String(x).toLowerCase()).filter(Boolean))];
  const url=sanitizeCampaignUrl(payload.u,hosts);if(!url)return {ok:false,error:'URL_NOT_ALLOWED'};
  // Site-specific Plausible trackers may omit or vary `d` across browser/PWA
  // contexts. The Worker already owns the canonical site domain, so never trust
  // or require the client value: validate the first-party URL, then impose it.
  const props=name==='pageview'?sanitizeAnalyticsPageProps(payload.p||{}):sanitizeAnalyticsEventProps(name,payload.p||{});
  if(props==null)return {ok:false,error:'EVENT_NOT_ALLOWED'};
  const output={n:name,u:url,d:String(domain)};
  const referrer=sanitizePayloadReferrer(payload.r,hosts);if(referrer)output.r=referrer;
  if(Object.keys(props).length)output.p=props;
  if(name!=='pageview')output.i=analyticsEventInteractive(name);
  return {ok:true,payload:output};
}
