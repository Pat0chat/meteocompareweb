// Minimal audience measurement configuration.
//
// MeteoCompare ships with analytics DISABLED until the site owner explicitly
// configures a Plausible site. This avoids sending any analytics request from
// forks, local previews or deployments that have not opted into measurement.
//
// Activation:
//   1. Create a site in Plausible Analytics.
//   2. Set `enabled` to true.
//   3. Set `domain` to the exact Plausible site identifier/domain.
//
// A self-hosted Plausible-compatible endpoint can be used by changing endpoint.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: false,
  provider: 'plausible',
  domain: '',
  endpoint: 'https://plausible.io/api/event',
});
