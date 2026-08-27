importScripts('./app-version.js','./cache-version.js');

const APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION;
if(!APP_VERSION) throw new Error('Missing MeteoCompare application version');
const CACHE_VERSION = globalThis.METEOCOMPARE_CACHE_VERSION;
if(!CACHE_VERSION) throw new Error('Missing MeteoCompare cache version');
const CACHE_PREFIX = 'meteocompare-web-';
const CACHE = `${CACHE_PREFIX}${APP_VERSION}-shell-${CACHE_VERSION}`;
const SHELL = [
  './', './index.html', './styles.css', './app-version.js', './cache-version.js', './manifest.webmanifest', './manifest.fr.webmanifest', './manifest.en.webmanifest', './manifest.es.webmanifest', './manifest.de.webmanifest', './manifest.it.webmanifest',
  './assets/icon.png', './assets/icon-512.png',
  './js/version.js', './js/network-config.js', './js/network.js', './js/seo-cities.mjs', './js/models.js', './js/consensus.js', './js/forecast-engines.js', './js/storage.js', './js/data/contracts.js', './js/data/forecast-normalizer.js', './js/api-budget.js', './js/api.js', './js/domain.js', './js/i18n.js', './js/errors.js', './js/analytics-config.js', './js/plausible-bootstrap.js', './js/analytics.js', './js/core/app-state.js', './js/core/cache-registry.js', './js/core/feature-registry.js', './js/core/local-analysis-store.js', './js/core/application-kernel.js', './js/ui/weather-icons.js', './js/app.js',
  './js/locales/fr.js', './js/locales/en.js', './js/locales/es.js', './js/locales/de.js', './js/locales/it.js',
  './js/features/bias.js', './js/features/evolution.js', './js/features/diagnostics.js', './js/features/comparison.js', './js/features/marine.js', './js/features/model-health.js', './js/features/radar.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function unavailableAsset(){return new Response('Asset unavailable while offline',{status:503,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});}
async function cachedOrUnavailable(request){return (await caches.match(request))||unavailableAsset();}
function legacyAssetPath(pathname){
  const scopePath=new URL(self.registration.scope).pathname.replace(/\/?$/,'/'),prefix=`${scopePath}meteo/`,value=String(pathname||'');
  if(!value.startsWith(prefix))return null;
  const rest=value.slice(prefix.length);
  return /^(?:js\/[^?#]+|assets\/[^?#]+|styles\.css|app-version\.js|cache-version\.js|manifest(?:\.[a-z]{2})?\.webmanifest)$/i.test(rest)?`${scopePath}${rest}`:null;
}

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  // Recover legacy shared-view pages that used to resolve root assets below /meteo/.
  // This also lets an already-installed legacy service worker self-heal after deployment.
  if(url.origin===self.location.origin){
    const recovered=legacyAssetPath(url.pathname);
    if(recovered){
      const target=new URL(recovered,url.origin).href;
      event.respondWith(fetch(target,{cache:'no-cache'}).then(response=>{
        if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(target,copy));}
        return response;
      }).catch(()=>caches.match(target).then(cached=>cached||unavailableAsset())));
      return;
    }
  }

  // Dynamic data endpoints own their freshness rules and must never be stored in
  // the PWA shell cache. This includes first-party Worker proxies and direct
  // Open-Meteo data APIs.
  if(url.origin===self.location.origin&&url.pathname.startsWith('/_mcx/'))return;
  if(/(^|\.)open-meteo\.com$/i.test(url.hostname))return;
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request)
        .then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})
        .catch(()=>caches.match(request).then(cached=>cached||caches.match('./index.html')).then(response=>response||unavailableAsset()))
    );
    return;
  }

  const isCode=['script','style','manifest','worker'].includes(request.destination);
  if(isCode){
    event.respondWith(
      fetch(request).then(response=>{
        if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>cachedOrUnavailable(request))
    );
    return;
  }

  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(()=>unavailableAsset())));
});
