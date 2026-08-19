import { ANALYTICS_CONFIG } from './analytics-config.js';

const OPT_OUT_KEY='meteocompare.web.analytics.optout.v1';
const ALLOWED_EVENTS=new Set(['PWA Install Click','PWA Installed']);

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
    default: return '/other';
  }
}

function projectBasePath(pathname='/'){
  const path=String(pathname||'/');
  if(path.endsWith('/'))return path;
  const tail=path.slice(path.lastIndexOf('/')+1);
  return tail.includes('.')?path.slice(0,path.lastIndexOf('/')+1):`${path}/`;
}

export function sanitizedAnalyticsUrl(route,locationLike=globalThis.location){
  const origin=locationLike?.origin&&locationLike.origin!=='null'?locationLike.origin:'https://meteocompare.invalid';
  const base=projectBasePath(locationLike?.pathname||'/');
  const routePath=analyticsRoutePath(route).replace(/^\//,'');
  return `${origin}${base}${routePath}`.replace(/([^:]\/)\/+?/g,'$1');
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

export function createAnalyticsClient({config=ANALYTICS_CONFIG,env=globalThis,fetchImpl=null}={}){
  const fetcher=fetchImpl||env.fetch?.bind(env);
  const status=()=>{
    const configured=Boolean(config?.enabled&&config?.domain&&config?.endpoint);
    const signal=privacySignal(env),optedOut=storageOptOut(env);
    const active=configured&&!signal&&!optedOut&&productionProtocol(env)&&typeof fetcher==='function';
    return {active,configured,optedOut,privacySignal:signal,provider:config?.provider||'plausible'};
  };
  const send=(name,route)=>{
    const current=status();
    if(!current.active)return Promise.resolve(false);
    if(name!=='pageview'&&!ALLOWED_EVENTS.has(name))return Promise.resolve(false);
    const body={name,domain:config.domain,url:sanitizedAnalyticsUrl(name==='pageview'?route:{name:'pwa'},env.location)};
    if(name!=='pageview')body.interactive=true;
    return Promise.resolve(fetcher(config.endpoint,{
      method:'POST',
      headers:{'Content-Type':'text/plain'},
      body:JSON.stringify(body),
      credentials:'omit',
      keepalive:true,
      mode:'cors',
      cache:'no-store',
      referrerPolicy:'no-referrer',
    })).then(response=>Boolean(response?.ok)).catch(()=>false);
  };
  return {
    status,
    pageview:route=>send('pageview',route),
    event:(name,route)=>send(name,route),
    setOptOut(disabled){
      try{if(disabled)env.localStorage?.setItem(OPT_OUT_KEY,'1');else env.localStorage?.removeItem(OPT_OUT_KEY);}catch{}
      return status();
    },
  };
}

const client=createAnalyticsClient();
export const analyticsStatus=()=>client.status();
export const trackPageView=route=>client.pageview(route);
export const trackAnalyticsEvent=(name,route)=>client.event(name,route);
export const setAnalyticsOptOut=disabled=>client.setOptOut(disabled);
