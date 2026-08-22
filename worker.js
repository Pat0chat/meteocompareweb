import { ANALYTICS_CONFIG } from './js/analytics-config.js';

const SCRIPT_PATH = ANALYTICS_CONFIG.scriptSrc;
const EVENT_PATH = ANALYTICS_CONFIG.endpoint;

function cleanProxyHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('content-length');
  return headers;
}

async function proxyPlausibleScript(request, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) return request.method === 'HEAD' ? new Response(null, { status: cached.status, statusText: cached.statusText, headers: cached.headers }) : cached;

  const upstream = await fetch(ANALYTICS_CONFIG.upstreamScriptSrc, {
    method: 'GET',
    headers: cleanProxyHeaders(request),
    redirect: 'follow',
  });
  if (!upstream.ok) return new Response('Analytics script unavailable', { status: 502 });

  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  headers.set('content-type', 'application/javascript; charset=utf-8');
  headers.set('cache-control', 'public, max-age=300');
  headers.set('x-content-type-options', 'nosniff');
  const response = new Response(upstream.body, { status: upstream.status, headers });
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return request.method === 'HEAD' ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers }) : response;
}

async function proxyPlausibleEvent(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }
  const headers = cleanProxyHeaders(request);
  return fetch(ANALYTICS_CONFIG.upstreamEndpoint, {
    method: 'POST',
    headers,
    body: request.body,
    redirect: 'manual',
  });
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === SCRIPT_PATH) return proxyPlausibleScript(request, ctx);
    if (pathname === EVENT_PATH) return proxyPlausibleEvent(request);
    if (pathname.startsWith('/_mcx/')) return new Response('Not Found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
