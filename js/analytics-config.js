// Privacy-first audience measurement for the public MeteoCompare web site.
//
// Plausible's official site-specific tracker is exposed through the MeteoCompare
// first-party Cloudflare Worker proxy and loaded by index.html, but
// automatic pageviews and optional auto-tracking are disabled. MeteoCompare
// sends only its own allow-listed, redacted pageviews/events through the
// global plausible() queue. See PRIVACY.md and tests/minimal-analytics.mjs.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,
  provider: 'plausible',
  domain: 'meteocompare.app',
  allowedHosts: ['meteocompare.app', 'www.meteocompare.app'],
  scriptSrc: '/_mcx/p.js',
  endpoint: '/_mcx/e',
  upstreamScriptSrc: 'https://plausible.io/js/pa-m_Vcr9SLuhB7IFuIgpvGB.js',
  upstreamEndpoint: 'https://plausible.io/api/event',
});
