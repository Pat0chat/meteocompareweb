import { ANALYTICS_CONFIG } from './analytics-config.js';
import { APP_VERSION } from './version.js';
import { sanitizeAnalyticsEventProps, sanitizeAnalyticsPageProps, analyticsEventInteractive, isAllowedAnalyticsEvent } from './analytics-schema.js';

const OPT_OUT_KEY=ANALYTICS_CONFIG.optOutStorageKey;
const CAMPAIGN_KEYS=['utm_source','utm_medium','utm_campaign'];
const LANGUAGES=new Set(['fr','en','es','de','it']);

export function analyticsRoutePath(route){
  switch(route?.name){
    case 'home': return '/';
    case 'city': return '/city';
    case 'bias': return '/bias';
    case 'compare': return '/compare';
    case 'data': return '/data';
    case 'settings': return '/settings';
    case 'about': return '/about';
    case 'pwa': return '/pwa';
    case 'notfound': return '/404';
    default: return '/other';
  }
}

function projectBasePath(pathname='/'){
  let path=String(pathname||'/').split(/[?#]/,1)[0]||'/';
  if(!path.startsWith('/'))path=`/${path}`;
  // Clean SEO city routes and the legacy /meteo[/] landing alias must
  // resolve to the application root rather than being treated as deployment
  // directories (e.g. /meteo/toulouse/city or /meteo/city).
  const meteoLanding=path.match(/^(.*)\/meteo\/?$/i);
  if(meteoLanding)return `${meteoLanding[1]||''}/`.replace(/\/+/g,'/')||'/';
  const seoCity=path.match(/^(.*)\/meteo\/[^/]+\/?$/i);
  if(seoCity)return `${seoCity[1]||''}/`.replace(/\/+/g,'/')||'/';
  if(path.endsWith('/'))return path;
  const tail=path.slice(path.lastIndexOf('/')+1);
  return tail.includes('.')?path.slice(0,path.lastIndexOf('/')+1):`${path}/`;
}

function safeCampaignValue(value){
  const cleaned=String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120);
  return cleaned||null;
}

function campaignQuery(locationLike){
  let input;
  try{input=new URLSearchParams(String(locationLike?.search||''));}catch{return '';}
  const output=new URLSearchParams();
  for(const key of CAMPAIGN_KEYS){const value=safeCampaignValue(input.get(key));if(value)output.set(key,value);}
  return output.toString();
}

export function sanitizedAnalyticsUrl(route,locationLike=globalThis.location){
  const origin=locationLike?.origin&&locationLike.origin!=='null'?locationLike.origin:'https://meteocompare.invalid';
  const base=projectBasePath(locationLike?.pathname||'/');
  const routePath=analyticsRoutePath(route).replace(/^\//,'');
  const path=`${origin}${base}${routePath}`.replace(/([^:]\/)\/+?/g,'$1');
  const campaign=campaignQuery(locationLike);
  return campaign?`${path}?${campaign}`:path;
}

export function sanitizedReferrer(env=globalThis){
  const raw=String(env.document?.referrer||'').trim();if(!raw)return null;
  try{
    const ref=new URL(raw),origin=env.location?.origin;
    if(!['http:','https:'].includes(ref.protocol)||ref.origin===origin)return null;
    // Keep only the external origin. This is enough for source attribution while
    // avoiding path/query fragments which can contain private information.
    return `${ref.protocol}//${ref.host}/`;
  }catch{return null;}
}

function privacySignal(env=globalThis){
  const nav=env.navigator||{};
  const dnt=nav.doNotTrack ?? env.doNotTrack;
  if(nav.globalPrivacyControl===true)return 'gpc';
  if(String(dnt)==='1'||String(dnt).toLowerCase()==='yes')return 'dnt';
  return null;
}

function storageOptOut(env=globalThis){
  try{return env.localStorage?.getItem(OPT_OUT_KEY)==='1';}catch{return false;}
}

function productionProtocol(env=globalThis){
  const protocol=env.location?.protocol;
  return protocol==='https:'||protocol==='http:';
}

function configuredHostAllowed(config,env=globalThis){
  let host=String(env.location?.hostname||'').toLowerCase();
  if(!host){try{host=new URL(String(env.location?.origin||'')).hostname.toLowerCase();}catch{}}
  const allowed=Array.isArray(config?.allowedHosts)&&config.allowedHosts.length?config.allowedHosts:[config?.domain,config?.domain?`www.${config.domain}`:null];
  return Boolean(host&&allowed.filter(Boolean).map(value=>String(value).toLowerCase()).includes(host));
}

function displayMode(env=globalThis){
  try{if(env.navigator?.standalone===true||env.matchMedia?.('(display-mode: standalone)')?.matches)return 'standalone';}catch{}
  return 'browser';
}

function pageNavigationMode(route,env=globalThis){
  const path=String(env.location?.pathname||'');
  if(route?.name==='city'&&/\/meteo\/[^/]+\/?$/i.test(path)&&!String(env.location?.hash||'').startsWith('#/'))return 'seo';
  return String(env.location?.hash||'').startsWith('#/')?'spa':'direct';
}

function safeLanguage(env=globalThis){
  const lang=String(env.document?.documentElement?.lang||'').toLowerCase().split('-')[0];
  return LANGUAGES.has(lang)?lang:'other';
}

function enumValue(value,allowed){const text=String(value??'').toUpperCase();return allowed.has(text)?text.toLowerCase():null;}
function boundedCount(value,max){const n=Math.round(Number(value));return Number.isFinite(n)?String(Math.min(max,Math.max(0,n))):null;}
function tokenValue(value){const text=String(value??'').trim().toLowerCase();return /^[a-z0-9_-]{1,40}$/.test(text)?text:null;}

export function analyticsPageProps(route,env=globalThis){
  const raw={page_group:analyticsRoutePath(route),app_version:APP_VERSION,language:safeLanguage(env),display_mode:displayMode(env),navigation:pageNavigationMode(route,env)};
  const theme=String(env.document?.documentElement?.dataset?.theme||'').toLowerCase();if(theme==='light'||theme==='dark')raw.effective_theme=theme;
  const density=String(env.document?.documentElement?.dataset?.density||'').toLowerCase();if(density==='compact'||density==='comfortable')raw.density=density;
  if(route?.name==='city'){
    const view=route.view||{};
    const tab=enumValue(view.tab,new Set(['CONDITIONS','TEMPERATURE','PRECIPITATION','WIND']));if(tab)raw.detail_tab=tab;
    const mode=enumValue(view.mode,new Set(['DAILY','HOURLY']));if(mode)raw.detail_mode=mode;
    const metric=enumValue(view.metric,new Set(['TEMPERATURE','PRECIPITATION','WIND']));if(metric)raw.agreement_metric=metric;
    if([24,72,168].includes(Number(view.horizon)))raw.horizon_hours=String(Number(view.horizon));
    const timeline=enumValue(view.timeline,new Set(['HOURLY','DAILY']));if(timeline)raw.timeline=timeline;
    raw.compared_models=boundedCount(view.compareModels?.length||0,4);
  }else if(route?.name==='bias'){
    const variable=tokenValue(route.variable);if(variable)raw.variable=variable;
    const model=tokenValue(route.modelId);if(model)raw.model=model;
  }else if(route?.name==='compare')raw.compared_cities=boundedCount(route.ids?.length||0,3);
  return sanitizeAnalyticsPageProps(raw);
}

function analyticsEventContext(route,env=globalThis){return {app_version:APP_VERSION,language:safeLanguage(env),display_mode:displayMode(env),navigation:pageNavigationMode(route,env)};}

export function createAnalyticsClient({config=ANALYTICS_CONFIG,env=globalThis,plausibleImpl=null}={}){
  const tracker=()=>plausibleImpl||env.plausible;
  const status=()=>{
    const configured=Boolean(config?.enabled&&config?.domain&&config?.endpoint);
    const signal=privacySignal(env),optedOut=storageOptOut(env);
    const hostAllowed=configuredHostAllowed(config,env);
    const active=configured&&hostAllowed&&!signal&&!optedOut&&productionProtocol(env)&&typeof tracker()==='function';
    return {active,configured,hostAllowed,optedOut,privacySignal:signal,provider:config?.provider||'plausible'};
  };
  const send=(name,route,props={})=>{
    const current=status();
    if(!current.active)return Promise.resolve(false);
    if(!isAllowedAnalyticsEvent(name))return Promise.resolve(false);
    const options={url:sanitizedAnalyticsUrl(name==='pageview'?route:route||{name:'other'},env.location)};
    if(name==='pageview')options.props=analyticsPageProps(route,env);
    else{
      const safeProps=sanitizeAnalyticsEventProps(name,{...analyticsEventContext(route,env),...props});if(safeProps&&Object.keys(safeProps).length)options.props=safeProps;
      options.interactive=analyticsEventInteractive(name);
    }
    try{
      // mcx-events.js exposes a tiny first-party transport with the
      // same plausible(name, options) surface used by this client.
      options.callback=result=>{try{env.__METEOCOMPARE_ANALYTICS_CONTROL__?.reportDelivery?.(result);}catch{}};
      tracker()(name,options);
      return Promise.resolve(true);
    }catch{return Promise.resolve(false);}
  };
  return {
    status,
    pageview:route=>send('pageview',route),
    event:(name,route,props)=>send(name,route,props),
    setOptOut(disabled){
      try{if(disabled)env.localStorage?.setItem(OPT_OUT_KEY,'1');else env.localStorage?.removeItem(OPT_OUT_KEY);}catch{}
      try{env.__METEOCOMPARE_ANALYTICS_CONTROL__?.reconcile?.();}catch{}
      return status();
    },
  };
}

const client=createAnalyticsClient();
export const analyticsStatus=()=>client.status();
export const trackPageView=route=>client.pageview(route);
export const trackAnalyticsEvent=(name,route,props)=>client.event(name,route,props);
export const setAnalyticsOptOut=disabled=>client.setOptOut(disabled);
