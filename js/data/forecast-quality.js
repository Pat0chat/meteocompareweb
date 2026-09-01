export const FORECAST_PHYSICAL_LIMITS = Object.freeze({
  temperatureC: Object.freeze({ min: -100, max: 65 }),
  precipitationHourlyMm: Object.freeze({ min: 0, max: 300 }),
  precipitationDailyMm: Object.freeze({ min: 0, max: 1000 }),
  precipitationProbabilityPercent: Object.freeze({ min: 0, max: 100 }),
  cloudPercent: Object.freeze({ min: 0, max: 100 }),
  windKmh: Object.freeze({ min: 0, max: 300 }),
  gustKmh: Object.freeze({ min: 0, max: 400 }),
  directionDeg: Object.freeze({ min: 0, max: 360 }),
  weatherCode: Object.freeze({ min: 0, max: 99 }),
});

export function isWithinPhysicalLimits(value, limits) {
  return Number.isFinite(value)
    && (!Number.isFinite(limits?.min) || value >= limits.min)
    && (!Number.isFinite(limits?.max) || value <= limits.max);
}

export function physicalOrNull(value, limits) {
  return isWithinPhysicalLimits(value, limits) ? value : null;
}

export function sanitizeNumericArray(value, limits, { integer = false } = {}) {
  if (!Array.isArray(value)) return { values: null, rejected: 0, finite: 0 };
  let rejected = 0;
  let finite = 0;
  const values = value.map(item => {
    if (!Number.isFinite(item)) return null;
    finite++;
    if ((integer && !Number.isInteger(item)) || !isWithinPhysicalLimits(item, limits)) {
      rejected++;
      return null;
    }
    return item;
  });
  return { values, rejected, finite };
}

export function sanitizeDailyTemperaturePair(maxValue, minValue) {
  if (!Number.isFinite(maxValue) || !Number.isFinite(minValue)) {
    return { max: Number.isFinite(maxValue) ? maxValue : null, min: Number.isFinite(minValue) ? minValue : null, rejected: false };
  }
  if (maxValue < minValue) return { max: null, min: null, rejected: true };
  return { max: maxValue, min: minValue, rejected: false };
}

export function evidenceLevelForFamilies(familyCount) {
  const count = Number(familyCount) || 0;
  if (count >= 3) return 'STANDARD';
  if (count === 2) return 'LIMITED';
  if (count === 1) return 'SINGLE_SOURCE';
  return 'NONE';
}
