// UV index is a location-specific forecast from Open-Meteo's best-match model.
// It is not a multi-model consensus or an inter-model confidence score.
export const UV_MAX_VALID = 25;

function uvNumber(value) {
  return Number.isFinite(value) && value >= 0 && value <= UV_MAX_VALID ? value : null;
}

function normalizeAxis(timestamps, values, expression) {
  if (!Array.isArray(timestamps) || !Array.isArray(values) || timestamps.length !== values.length) return null;
  const selected = timestamps.map((timestamp, index) => expression.test(timestamp) ? index : -1).filter(index => index !== -1);
  return { timestamps: selected.map(index => timestamps[index]), values: selected.map(index => uvNumber(values[index])) };
}

export function normalizeUvForecast(raw) {
  // Accept the raw API shape or a forecast already persisted in the app.
  const hourly = normalizeAxis(raw?.hourly?.time || raw?.hourly?.timestamps, raw?.hourly?.uv_index || raw?.hourly?.uvIndex, /^\d{4}-\d\d-\d\dT\d\d:\d\d/);
  const daily = normalizeAxis(raw?.daily?.time || raw?.daily?.dates, raw?.daily?.uv_index_max || raw?.daily?.uvIndexMax, /^\d{4}-\d\d-\d\d$/);
  if (!hourly?.values.some(Number.isFinite) && !daily?.values.some(Number.isFinite)) return null;
  return {
    source: 'OPEN_METEO_BEST_MATCH',
    hourly: hourly ? {timestamps:hourly.timestamps, uvIndex:hourly.values} : {timestamps:[],uvIndex:[]},
    daily: daily ? {dates:daily.timestamps, uvIndexMax:daily.values} : {dates:[],uvIndexMax:[]},
  };
}

export function uvForTimestamp(forecast, timestamp) {
  if (typeof timestamp !== 'string') return null;
  const hourly = forecast?.uv?.hourly;
  const index = hourly?.timestamps?.indexOf(timestamp) ?? -1;
  return index >= 0 ? uvNumber(hourly.uvIndex?.[index]) : null;
}

export function uvMaxForDate(forecast, date) {
  if (typeof date !== 'string') return null;
  const daily = forecast?.uv?.daily;
  const index = daily?.dates?.indexOf(date) ?? -1;
  if (index >= 0 && uvNumber(daily.uvIndexMax?.[index]) != null) return uvNumber(daily.uvIndexMax[index]);
  // Permit partial, hourly-only UV responses without guessing missing values.
  const hourly = forecast?.uv?.hourly;
  const available = (hourly?.timestamps || []).flatMap((timestamp, i) =>
    timestamp.slice(0,10) === date && uvNumber(hourly.uvIndex?.[i]) != null ? [hourly.uvIndex[i]] : []);
  return available.length ? Math.max(...available) : null;
}

export function uvLevel(value) {
  if (!Number.isFinite(value)) return 'unavailable';
  if (value < 3) return 'low';
  if (value < 6) return 'moderate';
  if (value < 8) return 'high';
  if (value < 11) return 'very-high';
  return 'extreme';
}
