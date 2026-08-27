import { NETWORK_ENDPOINTS } from './network-config.js';
// Privacy-first audience measurement for the public MeteoCompare web site.
//
// Plausible's official site-specific tracker is exposed through the MeteoCompare
// first-party Cloudflare Worker proxy and loaded by index.html, but
// automatic pageviews and optional auto-tracking are disabled. MeteoCompare
// sends only its own allow-listed, redacted pageviews/events through the
// global plausible() queue. See PRIVACY.md and tests/analytics/integration/analytics.privacy.test.mjs.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,
  provider: 'plausible',
  domain: 'meteocompare.app',
  allowedHosts: ['meteocompare.app', 'www.meteocompare.app'],
  optOutStorageKey: 'meteocompare.web.analytics.optout.v1',
  scriptSrc: NETWORK_ENDPOINTS.firstParty.analyticsScript,
  endpoint: NETWORK_ENDPOINTS.firstParty.analyticsEvent,
  upstreamScriptSrc: NETWORK_ENDPOINTS.analytics.upstreamScript,
  upstreamEndpoint: NETWORK_ENDPOINTS.analytics.upstreamEvent,
});
