import assert from 'node:assert/strict';
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  forecastAgeMs, forecastMatchesModels, forecastFreshForInterval, forecastCurrentForDisplay,
  forecastRecentlyUpdated, shouldApplyHydratedForecast
} from '../../../js/core/app-state.js';

const now=Date.parse('2026-10-23T10:00:00.000Z');
const forecast=(elapsed,ids=['GFS','ECMWF'])=>({fetchedAt:new Date(now-elapsed).toISOString(),requestedModelIds:ids});
const ids=['GFS','ECMWF'];
assert.equal(MANUAL_REFRESH_COOLDOWN_MS,300_000);
assert.equal(forecastAgeMs(forecast(110*60_000),now),110*60_000);
assert.equal(forecastAgeMs(forecast(-60_000),now),null,'future timestamps cannot suppress refreshes');
assert.equal(forecastAgeMs({fetchedAt:'invalid'},now),null);
assert.equal(forecastMatchesModels(forecast(0),ids),true);
assert.equal(forecastMatchesModels(forecast(0),['ECMWF','GFS']),true,'order is irrelevant');
assert.equal(forecastMatchesModels(forecast(0),['GFS']),false);
assert.equal(forecastMatchesModels(forecast(0),['GFS','ECMWF','AROME_FRANCE_HD']),false);
assert.equal(forecastMatchesModels({seriesByModel:{GFS:{},ECMWF:{}}},ids),true,'old caches without requested ids are supported');
assert.equal(forecastMatchesModels({requestedModelIds:['GFS','GFS']},ids),false,'duplicate selection must not be fresh');
assert.equal(forecastRecentlyUpdated(forecast(0),ids,now),true);
assert.equal(forecastRecentlyUpdated(forecast(299_999),ids,now),true);
assert.equal(forecastRecentlyUpdated(forecast(300_000),ids,now),false,'boundary allows the next refresh');
assert.equal(forecastRecentlyUpdated(forecast(110*60_000),ids,now),false,'stale 1h50 data must be refreshed');
assert.equal(forecastRecentlyUpdated(forecast(-60_000),ids,now),false);
assert.equal(forecastRecentlyUpdated(forecast(1000),['GFS'],now),false,'changing the model set bypasses the cooldown');
assert.equal(forecastFreshForInterval(forecast(59*60_000),ids,60,now),true);
assert.equal(forecastFreshForInterval(forecast(60*60_000),ids,60,now),false);
assert.equal(forecastFreshForInterval(forecast(110*60_000),ids,0,now),true,'manual auto-mode remains disabled');
assert.equal(forecastFreshForInterval(forecast(0),['GFS'],0,now),false,'model change still requires refresh in manual mode');

// The Home and Details status must use the same age deadline as auto refresh.
assert.equal(forecastCurrentForDisplay(forecast(59*60_000),ids,60,now),true);
assert.equal(forecastCurrentForDisplay(forecast(60*60_000),ids,60,now),false,'a due forecast cannot be labelled up to date');
assert.equal(forecastCurrentForDisplay(forecast(131*60_000),ids,60,now),false,'2h11 is overdue at a 1h cadence');
assert.equal(forecastCurrentForDisplay(forecast(131*60_000),ids,180,now),true,'3h cadence stays valid');
assert.equal(forecastCurrentForDisplay(forecast(359*60_000),ids,360,now),true,'6h cadence remains respected');
assert.equal(forecastCurrentForDisplay(forecast(360*60_000),ids,360,now),false);
assert.equal(forecastCurrentForDisplay(forecast(179*60_000),ids,0,now),true,'manual mode uses a 3h display convention');
assert.equal(forecastCurrentForDisplay(forecast(180*60_000),ids,0,now),false,'manual mode does not falsely imply eternal freshness');
assert.equal(forecastCurrentForDisplay(forecast(1000),['GFS'],60,now),false,'mismatched models should not be described as current');
assert.equal(forecastCurrentForDisplay(forecast(-1000),ids,60,now),false,'future fetch timestamps are not current');

assert.equal(shouldApplyHydratedForecast(null,forecast(110*60_000)),true);
assert.equal(shouldApplyHydratedForecast(forecast(1000),forecast(110*60_000)),false,'slow IndexedDB must not overwrite fresh network data');
assert.equal(shouldApplyHydratedForecast(forecast(110*60_000),forecast(1000)),true,'a more recent persisted value can restore state');
assert.equal(shouldApplyHydratedForecast(forecast(1000),forecast(1000)),false,'duplicate hydration should not rerender');
assert.equal(shouldApplyHydratedForecast(forecast(1000),null),false);
console.log('Forecast freshness/cooldown/model selection/hydration guards: OK');
