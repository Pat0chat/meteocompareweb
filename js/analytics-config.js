import { NETWORK_ENDPOINTS } from './network-config.js';
// Privacy-first audience measurement for the public MeteoCompare web site.
//
// MeteoCompare uses a tiny first-party browser transport rather than loading
// Plausible's tracker. Only allow-listed, redacted events are POSTed to the
// Cloudflare Worker, which validates them again before forwarding server-side.
// See PRIVACY.md and tests/analytics/integration/analytics.privacy.test.mjs.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,
  provider: 'plausible',
  domain: 'meteocompare.app',
  allowedHosts: ['meteocompare.app', 'www.meteocompare.app'],
  optOutStorageKey: 'meteocompare.web.analytics.optout.v1',
  endpoint: NETWORK_ENDPOINTS.firstParty.analyticsEvent,
});
