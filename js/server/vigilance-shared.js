export const VIGILANCE_DEPARTMENT_PATTERN = /^(?:0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/i;

export function normalizeMeteoFranceApiKey(value) {
  return String(value || '')
    .trim()
    .replace(/^(?:Bearer\s+|apikey\s*:\s*)/i, '')
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
}

export function meteoFranceUpstreamError(status) {
  const error = new Error(`METEOFRANCE_VIGILANCE_HTTP_${status}`);
  error.status = status;
  if (status === 401) {
    error.code = 'METEOFRANCE_AUTH_FAILED';
    error.diagnostic = 'INVALID_CREDENTIAL';
  } else if (status === 403) {
    error.code = 'METEOFRANCE_AUTH_FAILED';
    error.diagnostic = 'FORBIDDEN';
  } else {
    error.code = 'METEOFRANCE_VIGILANCE_UPSTREAM';
  }
  return error;
}

export function vigilanceUnavailablePayload(error, { configured = true } = {}) {
  const payload = {
    source: 'Météo-France',
    configured,
    unavailable: true,
    error: error?.code || error || 'METEOFRANCE_UNAVAILABLE',
    periods: []
  };
  if (Number.isFinite(error?.status)) payload.upstreamStatus = error.status;
  if (error?.diagnostic) payload.diagnostic = error.diagnostic;
  if (configured) payload.authMode = 'api_key_header';
  return payload;
}

export function extractVigilancePeriod(period, department, includeCoast = false) {
  const domains = Array.isArray(period?.timelaps?.domain_ids) ? period.timelaps.domain_ids : [];
  const selected = domains.filter(domain => {
    const id = String(domain?.domain_id || '').toUpperCase();
    return id === department || (includeCoast && id !== department && id.startsWith(department));
  });
  const byPhenomenon = new Map();
  let maxColorId = 1;
  let departmentMaxColorId = 1;
  let coastMaxColorId = 1;

  for (const domain of selected) {
    const domainId = String(domain?.domain_id || '').toUpperCase();
    const scope = domainId === department ? 'department' : 'coast';
    const domainMax = Number(domain?.max_color_id) || 1;
    maxColorId = Math.max(maxColorId, domainMax);
    if (scope === 'department') departmentMaxColorId = Math.max(departmentMaxColorId, domainMax);
    else coastMaxColorId = Math.max(coastMaxColorId, domainMax);

    for (const item of Array.isArray(domain?.phenomenon_items) ? domain.phenomenon_items : []) {
      const id = String(item?.phenomenon_id || '');
      const current = byPhenomenon.get(id) || { id, maxColorId: 1, intervals: [] };
      const itemMax = Number(item?.phenomenon_max_color_id) || 1;
      const intervals = Array.isArray(item?.timelaps_items) ? item.timelaps_items : [];
      current.maxColorId = Math.max(current.maxColorId, itemMax);
      for (const interval of intervals) {
        current.intervals.push({
          beginTime: interval?.begin_time || null,
          endTime: interval?.end_time || null,
          colorId: Number(interval?.color_id) || 1,
          scope,
          timingApproximate: false
        });
      }
      if (!intervals.length && itemMax >= 2 && period?.begin_validity_time && period?.end_validity_time) {
        current.intervals.push({
          beginTime: period.begin_validity_time,
          endTime: period.end_validity_time,
          colorId: itemMax,
          scope,
          timingApproximate: true
        });
      }
      byPhenomenon.set(id, current);
    }
  }

  return {
    term: String(period?.echeance || ''),
    beginTime: period?.begin_validity_time || null,
    endTime: period?.end_validity_time || null,
    maxColorId,
    departmentMaxColorId,
    coastMaxColorId,
    phenomena: [...byPhenomenon.values()]
  };
}

export function vigilanceDepartmentPayload(raw, department, includeCoast = false) {
  const product = raw?.product || raw;
  const periods = (Array.isArray(product?.periods) ? product.periods : [])
    .map(period => extractVigilancePeriod(period, department, includeCoast));
  return {
    source: 'Météo-France',
    configured: true,
    unavailable: false,
    department,
    includeCoast,
    updateTime: product?.update_time || null,
    productDatetime: product?.meta?.product_datetime || raw?.meta?.product_datetime || null,
    generationTimestamp: product?.meta?.generation_timestamp || raw?.meta?.generation_timestamp || null,
    periods
  };
}
