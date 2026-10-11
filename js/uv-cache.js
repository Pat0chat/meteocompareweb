import { normalizeUvForecast } from './uv.js';

// UV comes from Open-Meteo best-match independently of the selected weather models.
// A normal weather refresh (often every 15 minutes) should not refetch UV.
export const UV_REFRESH_TTL_MS = 3 * 60 * 60_000;
export const UV_ERROR_RETRY_MS = 15 * 60_000;
const successful = new Map();
const inFlight = new Map();
const retryAfter = new Map();

export function uvLocationKey(city) {
  // A city ID or a selected weather model must not affect the UV request.
  return `${Number(city.latitude)}|${Number(city.longitude)}|${city.timezone || 'auto'}`;
}

function localDate(epochMs, timezone) {
  try {
    const date = new Date(epochMs);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone && timezone !== 'auto' ? timezone : 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return new Date(epochMs).toISOString().slice(0, 10); }
}

export function freshUvEntry(entry, city, days, now = Date.now()) {
  if (!entry || entry.uvRequestKey !== uvLocationKey(city) ||
      !Number.isInteger(entry.uvForecastDays) || entry.uvForecastDays < days ||
      !entry.uv) return false;
  const fetchedAt = Date.parse(entry.uvFetchedAt || '');
  return Number.isFinite(fetchedAt) && now >= fetchedAt && now - fetchedAt < UV_REFRESH_TTL_MS &&
    localDate(fetchedAt, city.timezone) === localDate(now, city.timezone);
}

// The caller provides the request callback, so this cache is testable without
// involving the weather API, storage, or the browser's network primitives.
export async function getUvForecastCached(city, days, previousForecast, requestUv, now = () => Date.now()) {
  const key = uvLocationKey(city), timestamp = now();
  const previous = freshUvEntry(previousForecast, city, days, timestamp) ? previousForecast : null;
  const memory = successful.get(key);
  const reusable = [previous, freshUvEntry(memory, city, days, timestamp) ? memory : null]
    .filter(Boolean).sort((a, b) => Date.parse(b.uvFetchedAt) - Date.parse(a.uvFetchedAt))[0];
  if (reusable) {
    // A persisted result also seeds memory for other city cards at these coordinates.
    if (!memory || !freshUvEntry(memory, city, days, timestamp) ||
        (reusable.uvForecastDays >= memory.uvForecastDays &&
         Date.parse(reusable.uvFetchedAt) > Date.parse(memory.uvFetchedAt))) successful.set(key, reusable);
    return reusable;
  }

  // Share one pending request for an identical location and a sufficient horizon.
  const pending = inFlight.get(key);
  if (pending && pending.days >= days) return pending.promise;
  const failureKey = `${key}|${days}`;
  if (timestamp < (retryAfter.get(failureKey) || 0)) return null;

  const promise = (async () => {
    try {
      const uv = normalizeUvForecast(await requestUv(city, days));
      if (!uv) { retryAfter.set(failureKey, now() + UV_ERROR_RETRY_MS); return null; }
      const entry = { uv, uvFetchedAt: new Date(now()).toISOString(), uvRequestKey: key, uvForecastDays: days };
      // Do not downgrade the horizon due to a shorter concurrent request.
      const cached = successful.get(key);
      if (!cached || cached.uvForecastDays <= days || !freshUvEntry(cached, city, cached.uvForecastDays, now())) successful.set(key, entry);
      retryAfter.delete(failureKey);
      return entry;
    } catch {
      // An unavailable UV feed must never fail or repeatedly hammer forecast refreshes.
      retryAfter.set(failureKey, now() + UV_ERROR_RETRY_MS);
      return null;
    }
  })();
  inFlight.set(key, { days, promise });
  try { return await promise; }
  finally { if (inFlight.get(key)?.promise === promise) inFlight.delete(key); }
}
