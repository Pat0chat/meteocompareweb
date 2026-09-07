import { NETWORK_ENDPOINTS } from './network-config.js';

// First-party, privacy-preserving audience measurement. No third-party tracker,
// cookie or persistent visitor identifier is used.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,
  provider: 'meteocompare',
  domain: 'meteocompare.app',
  allowedHosts: ['meteocompare.app', 'www.meteocompare.app'],
  localDevelopment: Object.freeze({ hosts: ['localhost', '127.0.0.1'], port: '8787' }),
  optOutStorageKey: 'meteocompare.web.analytics.optout.v1',
  endpoint: NETWORK_ENDPOINTS.firstParty.analyticsEvent,
});
