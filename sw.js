const CACHE = 'meteocompare-web-v1.8.0-shell-v9-action-polish';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './assets/icon.png', './assets/icon-512.png',
  './js/models.js', './js/storage.js', './js/api.js', './js/domain.js', './js/android_strings.js', './js/i18n.js', './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  // Weather responses have their own freshness/storage rules in the application.
  if(/(^|\.)open-meteo\.com$/i.test(url.hostname))return;
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    // Network-first avoids keeping an old application shell after a GitHub Pages deploy.
    event.respondWith(
      fetch(request)
        .then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}return response;})
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  const isCode=['script','style','manifest','worker'].includes(request.destination);
  if(isCode){
    // Code is network-first so a deployment never runs one page load with stale JS/CSS.
    event.respondWith(
      fetch(request).then(response=>{
        if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>caches.match(request))
    );
    return;
  }

  // Images and other immutable shell assets can be cache-first.
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
