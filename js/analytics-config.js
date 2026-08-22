// Privacy-first audience measurement for the public MeteoCompare web site.
//
// The direct Events API integration avoids loading a third-party analytics
// script. City names/ids, coordinates, search queries and weather values are
// never sent. See PRIVACY.md and tests/minimal-analytics.mjs.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,
  provider: 'plausible',
  domain: 'meteocompare.app',
  allowedHosts: ['meteocompare.app', 'www.meteocompare.app'],
  endpoint: 'https://plausible.io/api/event',
});
