/**
 * Mutable application state with a stable, documented shape.
 * Keeping the shape in one class prevents view code from silently inventing new global state.
 */
export class AppState {
  constructor({settings,cities,route,online}) {
    this.settings=settings;
    this.cities=cities;
    this.forecasts={};
    this.loading=new Set();
    this.errors={};
    this.modal=null;
    this.route=route;
    this.normals={};
    this.evolution={};
    this.bias={};
    this.biasRefresh=new Set();
    this.online=Boolean(online);
    this.compareModelIds=[];
    this.comparePanelOpen={};
    this.scenarioModeByCity={};
    this.graphicAgreementVisible=false;
    this.evolutionVariable='temperature';
    this.reliabilityVariable='TEMPERATURE';
    this.localDataStats=null;
    this.localDataLoading=false;
    this.localDataError=null;
    this.integrityReport=null;
    this.integrityLoading=false;
    this.errorCenter=null;
    this.marine={};
    this.marineLoading=new Set();
    this.backupOptions={forecasts:false,normals:true,bias:true,evolution:true,marine:true};
    this.localDataUi={advancedOpen:false,privacyOpen:false,cacheOpen:false};
  }
}

/** Refresh decisions are local, synchronous and never trigger any network work. */
export const MANUAL_REFRESH_COOLDOWN_MS = 5 * 60_000;

export function forecastAgeMs(forecast, now = Date.now()) {
  const fetched = Date.parse(forecast?.fetchedAt || '');
  const age = now - fetched;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

export function forecastMatchesModels(forecast, enabledModelIds = []) {
  if (!forecast) return false;
  const requested = Array.isArray(forecast.requestedModelIds) && forecast.requestedModelIds.length
    ? forecast.requestedModelIds
    : [...new Set([...Object.keys(forecast.seriesByModel || {}), ...Object.keys(forecast.errors || {})])];
  const selected = Array.isArray(enabledModelIds) ? enabledModelIds : [];
  return requested.length === selected.length && new Set(requested).size === selected.length &&
    selected.every(id => requested.includes(id));
}

export function forecastFreshForInterval(forecast, enabledModelIds, intervalMinutes, now = Date.now()) {
  const age = forecastAgeMs(forecast, now);
  return age !== null && forecastMatchesModels(forecast, enabledModelIds) &&
    (intervalMinutes === 0 || age < intervalMinutes * 60_000);
}

/** Keep the displayed status consistent with the automatic refresh deadline.
 * In manual mode there is no automatic deadline; retain a 3-hour age indicator
 * purely for display, without scheduling any fetch.
 */
export function forecastCurrentForDisplay(forecast, enabledModelIds, intervalMinutes, now = Date.now()) {
  const displayMinutes = intervalMinutes > 0 ? intervalMinutes : 180;
  return forecastFreshForInterval(forecast, enabledModelIds, displayMinutes, now);
}

export function forecastRecentlyUpdated(forecast, enabledModelIds, now = Date.now(), cooldownMs = MANUAL_REFRESH_COOLDOWN_MS) {
  const age = forecastAgeMs(forecast, now);
  return age !== null && age < cooldownMs && forecastMatchesModels(forecast, enabledModelIds);
}

/** Only acknowledge a network refresh if its resulting forecast is usable,
 * covers the requested model selection, and was fetched during this attempt.
 * An old or wrongly keyed payload must not overwrite the last known-good cache
 * or trigger a misleading "updated" toast. This function never performs I/O.
 */
export function forecastRefreshVerified(forecast, enabledModelIds, startedAt, now = Date.now()) {
  const fetchedAt = Date.parse(forecast?.fetchedAt || '');
  return Number.isFinite(fetchedAt) && Number.isFinite(startedAt) &&
    fetchedAt >= startedAt - 5_000 && fetchedAt <= now + 60_000 &&
    forecastMatchesModels(forecast, enabledModelIds) &&
    Object.keys(forecast?.seriesByModel || {}).length > 0;
}

/** Prevent an asynchronous IndexedDB hydration from replacing a newer network result. */
export function shouldApplyHydratedForecast(current, hydrated) {
  if (!hydrated) return false;
  if (!current) return true;
  const hydratedAt = Date.parse(hydrated.fetchedAt || '');
  const currentAt = Date.parse(current.fetchedAt || '');
  return Number.isFinite(hydratedAt) && (!Number.isFinite(currentAt) || hydratedAt > currentAt);
}
