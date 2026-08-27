// Single source of truth for runtime network destinations and transport policy.
// Keep user-initiated navigation links (Play Store, Bluesky, donations, legal links)
// outside this file: they are not application data-plane requests.
export const NETWORK_ENDPOINTS = Object.freeze({
  firstParty: Object.freeze({
    modelMetadata: '/_mcx/model-metadata',
    analyticsScript: '/_mcx/p.js',
    analyticsEvent: '/_mcx/e',
  }),
  openMeteo: Object.freeze({
    forecast: 'https://api.open-meteo.com/v1/forecast',
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
    archive: 'https://archive-api.open-meteo.com/v1/archive',
    previousRuns: 'https://previous-runs-api.open-meteo.com/v1/forecast',
    marine: 'https://marine-api.open-meteo.com/v1/marine',
    modelMetadataUpstream: 'https://openmeteo-data-spatial.b-cdn.net',
  }),
  radar: Object.freeze({
    metadata: 'https://api.rainviewer.com/public/weather-maps.json',
    osmTileTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  }),
  analytics: Object.freeze({
    upstreamScript: 'https://plausible.io/js/pa-m_Vcr9SLuhB7IFuIgpvGB.js',
    upstreamEvent: 'https://plausible.io/api/event',
  }),
});

export const NETWORK_TIMEOUTS_MS = Object.freeze({
  defaultJson: 30_000,
  openMeteoArchive: 45_000,
  modelMetadata: 10_000,
  radarMetadata: 12_000,
  radarImage: 15_000,
  workerUpstream: 12_000,
  analyticsEvent: 8_000,
});

export const NETWORK_POLICY = Object.freeze({
  // Open-Meteo forecast/data APIs stay direct: this avoids centralising high-volume
  // public API traffic behind the MeteoCompare Worker and preserves provider-side
  // client distribution/rate limiting.
  openMeteoTransport: 'browser-direct',
  // Small metadata and analytics flows are first-party to improve proxy/privacy
  // compatibility and to keep third-party endpoints out of the browser CSP.
  modelMetadataTransport: 'first-party-worker',
  analyticsTransport: 'first-party-worker',
  // Radar imagery and OSM tiles remain CDN-direct because they are bandwidth-heavy,
  // user-triggered visual assets. Failures must degrade the radar only, not weather.
  radarTransport: 'browser-direct-optional',
});
