import { ANALYTICS_CONFIG } from './analytics-config.js';

const host = String(globalThis.location?.hostname || '').toLowerCase();
const allowedHost = ANALYTICS_CONFIG.allowedHosts.includes(host);
const dnt = String(globalThis.navigator?.doNotTrack || globalThis.doNotTrack || '').toLowerCase();
const privacySignal = globalThis.navigator?.globalPrivacyControl === true || dnt === '1' || dnt === 'yes';
let optedOut = false;

try {
  optedOut = globalThis.localStorage?.getItem(ANALYTICS_CONFIG.optOutStorageKey) === '1';
} catch {}

globalThis.plausible = globalThis.plausible || function plausibleQueue(){
  (globalThis.plausible.q = globalThis.plausible.q || []).push(arguments);
};
globalThis.plausible.init = globalThis.plausible.init || function plausibleInit(options){
  globalThis.plausible.o = options || {};
};

globalThis.plausible.init({
  endpoint: ANALYTICS_CONFIG.endpoint,
  autoCapturePageviews: false,
  captureOnLocalhost: false,
  outboundLinks: false,
  fileDownloads: false,
  formSubmissions: false,
  transformRequest(payload) {
    if (!payload?.r) return payload;
    try {
      const referrer = new URL(payload.r);
      payload.r =
        (referrer.protocol === 'http:' || referrer.protocol === 'https:') &&
        referrer.origin !== globalThis.location.origin
          ? `${referrer.origin}/`
          : null;
    } catch {
      payload.r = null;
    }
    return payload;
  },
});

if (allowedHost && !privacySignal && !optedOut) {
  const script = document.createElement('script');
  script.async = true;
  script.src = ANALYTICS_CONFIG.scriptSrc;
  document.head.appendChild(script);
}
