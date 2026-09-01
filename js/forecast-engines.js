import {
  familyBalancedEntries,
  familyBalancedWeights,
  scoreFromDispersion,
  weightedMedian,
  weightedStats,
  RAIN_THRESHOLD_MM,
  isWetPrecipitation,
  precipitationConsensus,
} from './consensus.js';
import { evidenceLevelForFamilies } from './data/forecast-quality.js';

export const FORECAST_ENGINES = Object.freeze([
  'MULTI_CONSENSUS',
  'CALIBRATION',
  'SCENARIOS',
  'ADAPTIVE',
]);
export const DEFAULT_FORECAST_ENGINE = 'MULTI_CONSENSUS';

const EPS = 1e-9;
const MIN_CALIBRATION_SAMPLES = 14;
const FULL_CALIBRATION_SAMPLES = 30;
const MIN_CALIBRATION_COVERAGE = 0.34;
const MIN_CALIBRATED_FAMILIES = 2;
const MIN_DOMINANT_SCENARIO_SHARE = 0.55;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => Number.isFinite(value);
const finiteOr = (value, fallback) => finite(Number(value)) ? Number(value) : fallback;

function validWeightedRows(entries, qualityMin = null, qualityMax = null) {
  return (entries || [])
    .filter(row => finite(row?.value) && finite(row?.weight) && row.weight > 0
      && (qualityMin == null || row.value >= qualityMin)
      && (qualityMax == null || row.value <= qualityMax))
    .map(row => ({ ...row }))
    .sort((a, b) => a.value - b.value || String(a.modelId || '').localeCompare(String(b.modelId || '')));
}

function weightedQuantile(entries, quantile) {
  const rows = validWeightedRows(entries).sort((a, b) => a.value - b.value);
  if (!rows.length) return null;

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const target = clamp(quantile, 0, 1) * totalWeight;
  let cumulative = 0;

  for (const row of rows) {
    cumulative += row.weight;
    if (cumulative + EPS >= target) return row.value;
  }
  return rows.at(-1).value;
}

function weightedMean(entries) {
  const rows = validWeightedRows(entries);
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!totalWeight) return null;
  return rows.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight;
}

function weightedMad(entries, center) {
  return weightedQuantile(
    validWeightedRows(entries).map(row => ({ ...row, value: Math.abs(row.value - center) })),
    0.5,
  );
}

/**
 * Descriptive spread interval, not a calibrated probability interval.
 * It combines weighted P10/P90 with a dispersion envelope so isolated values
 * remain visible without claiming probabilistic coverage that we cannot verify.
 */
function spreadInterval(entries, center, stdDev, extraSigma = 0) {
  if (!finite(center)) return { low: null, high: null };

  const q10 = weightedQuantile(entries, 0.1);
  const q90 = weightedQuantile(entries, 0.9);
  const sigma = Math.sqrt(
    Math.max(0, (finite(stdDev) ? stdDev : 0) ** 2 + (finite(extraSigma) ? extraSigma : 0) ** 2),
  );
  const normalLow = center - 1.2816 * sigma;
  const normalHigh = center + 1.2816 * sigma;

  return {
    low: finite(q10) ? Math.min(q10, normalLow) : normalLow,
    high: finite(q90) ? Math.max(q90, normalHigh) : normalHigh,
  };
}

function robustFromBalanced(balanced, tight = 0.5, wide = 3) {
  const rows = balanced.entries || [];
  if (!rows.length) return null;

  const median = weightedMedian(rows);
  const mad = weightedMad(rows, median);
  const robustScale = Math.max(tight * 0.35, (finite(mad) ? mad : 0) * 1.4826, EPS);
  const huberLimit = 1.5 * robustScale;
  const robustRows = rows.map(row => {
    const distance = Math.abs(row.value - median);
    const robustFactor = distance <= huberLimit ? 1 : huberLimit / Math.max(distance, EPS);
    return { ...row, weight: row.weight * robustFactor, robustFactor };
  });

  const central = weightedMean(robustRows);
  const stats = weightedStats(robustRows);
  const interval = spreadInterval(robustRows, central, stats?.stdDev || 0);

  const interModelSigma=finite(stats?.stdDev)?stats.stdDev:0;
  return {
    central,
    stats,
    interval,
    allSourceInterval: interval,
    mad,
    rows: robustRows,
    convergencePercent:
      balanced.familyCount >= 2 ? scoreFromDispersion(stats?.stdDev, tight, wide) : null,
    count: balanced.modelCount,
    familyCount: balanced.familyCount,
    evidenceLevel:evidenceLevelForFamilies(balanced.familyCount),
    uncertainty:{interModelSigma,calibrationResidualSigma:0,totalSigma:interModelSigma,evidenceLevel:evidenceLevelForFamilies(balanced.familyCount)},
  };
}

function multiConsensus(entries, { localWeights = {}, tight = 0.5, wide = 3, min = null, max = null } = {}) {
  const balanced = familyBalancedEntries(entries, localWeights);
  const result = robustFromBalanced(balanced, tight, wide);
  if (!result) return emptyResult('MULTI_CONSENSUS');

  return {
    ...result,
    central: bound(result.central, min, max),
    interval: {
      low: bound(result.interval.low, min, max),
      high: bound(result.interval.high, min, max),
    },
    allSourceInterval:{
      low:bound(result.allSourceInterval?.low,min,max),
      high:bound(result.allSourceInterval?.high,min,max),
    },
    engine: 'MULTI_CONSENSUS',
    effectiveEngine: 'MULTI_CONSENSUS',
    fallback: false,
    calibrationCoverage: 0,
    calibratedFamilyCount: 0,
    calibrationStrength: 0,
    scenarioCount: 1,
    dominantShare: 1,
    explanation: 'ROBUST_FAMILY_BALANCED',
  };
}

function calibrationProfileFor(calibration, modelId, leadDay = null) {
  const root = calibration?.[modelId];
  if (!root) return null;
  const exactLead = Number.isInteger(leadDay) && leadDay >= 0
    ? root.byLeadDay?.[leadDay] ?? root.byLeadDay?.[String(leadDay)] ?? null
    : null;
  // Legacy profiles without an explicit horizon remain usable only when the caller
  // does not request a lead day. This prevents a D+1 bias from leaking into D+2..D+7.
  const profile = Number.isInteger(leadDay) && leadDay >= 0 ? exactLead : root;
  return profile && finite(profile.bias) && Number(profile.sampleSize) >= MIN_CALIBRATION_SAMPLES
    ? profile
    : null;
}

function calibrationStrength(profile) {
  const sampleSize = Math.max(0, Number(profile?.sampleSize) || 0);
  if (sampleSize < MIN_CALIBRATION_SAMPLES) return 0;
  return clamp(sampleSize / FULL_CALIBRATION_SAMPLES, 0.45, 1);
}

function calibrationConsensus(
  entries,
  { localWeights = {}, calibration = {}, leadDay = null, tight = 0.5, wide = 3, min = null, max = null } = {},
) {
  const usable = (entries || []).filter(row => row?.modelId && finite(row?.value)).slice().sort((a,b)=>String(a.modelId).localeCompare(String(b.modelId)));
  if (!usable.length) return emptyResult('CALIBRATION');

  const familyBalance = familyBalancedWeights(usable.map(row => row.modelId), localWeights);
  const totalMass = Object.values(familyBalance.weights).reduce((sum, weight) => sum + weight, 0) || 1;
  const calibratedIds = [];
  let calibratedMass = 0;
  let weightedScore = 0;
  let weightedScoreMass = 0;
  let noiseSum = 0;
  let noiseMass = 0;
  let strengthSum = 0;

  const corrected = usable.map(row => {
    const profile = calibrationProfileFor(calibration, row.modelId, leadDay);
    if (!profile) return { ...row };

    const strength = calibrationStrength(profile);
    const score = clamp(finiteOr(profile.score, 50), 0, 100);
    const skill = 0.85 + 0.3 * (score / 100);
    const familyWeight = familyBalance.weights[row.modelId] || 0;
    const standardDeviation = Number(profile.standardDeviation);
    const meanAbsoluteError = Number(profile.meanAbsoluteError);
    const noise = Math.max(
      0,
      finite(standardDeviation) ? standardDeviation : finite(meanAbsoluteError) ? meanAbsoluteError : 0,
    );

    calibratedIds.push(row.modelId);
    calibratedMass += familyWeight;
    weightedScore += score * familyWeight;
    weightedScoreMass += familyWeight;
    noiseSum += noise * familyWeight;
    noiseMass += familyWeight;
    strengthSum += strength * familyWeight;

    const calibrated = {
      ...row,
      value: bound(row.value - profile.bias * strength, min, max),
      calibrationSkill: skill,
      calibrationStrength: strength,
    };
    return calibrated;
  });

  const calibrationCoverage = clamp(calibratedMass / totalMass, 0, 1);
  const calibratedFamilyCount = familyBalancedWeights(calibratedIds, localWeights).familyCount;

  if (
    calibratedFamilyCount < MIN_CALIBRATED_FAMILIES ||
    calibrationCoverage < MIN_CALIBRATION_COVERAGE
  ) {
    const fallback = multiConsensus(entries, { localWeights, tight, wide, min, max });
    return {
      ...fallback,
      engine: 'CALIBRATION',
      fallback: true,
      fallbackReason: 'INSUFFICIENT_CALIBRATION',
      calibrationCoverage,
      calibratedFamilyCount,
      calibrationStrength: calibratedMass ? strengthSum / calibratedMass : 0,
    };
  }

  const skillWeights = { ...localWeights };
  for (const row of corrected) {
    if (row.calibrationSkill) {
      skillWeights[row.modelId] = (Number(skillWeights[row.modelId]) || 1) * row.calibrationSkill;
    }
  }

  const balanced = familyBalancedEntries(corrected, skillWeights);
  const result = robustFromBalanced(balanced, tight, wide);
  if (!result) return emptyResult('CALIBRATION');

  const residualNoise = noiseMass ? noiseSum / noiseMass : 0;
  const averageStrength = calibratedMass ? strengthSum / calibratedMass : 0;
  const extraSigma = residualNoise * (0.2 + (1 - averageStrength) * 0.25);
  const interModelSigma=finite(result.stats?.stdDev)?result.stats.stdDev:0;
  const totalSigma=Math.sqrt(interModelSigma**2+extraSigma**2);
  const interval = spreadInterval(result.rows, result.central, interModelSigma, extraSigma);

  return {
    ...result,
    central: bound(result.central, min, max),
    interval: {
      low: bound(interval.low, min, max),
      high: bound(interval.high, min, max),
    },
    allSourceInterval:{
      low:bound(result.allSourceInterval?.low,min,max),
      high:bound(result.allSourceInterval?.high,min,max),
    },
    engine: 'CALIBRATION',
    effectiveEngine: 'CALIBRATION',
    fallback: false,
    calibrationCoverage,
    calibratedFamilyCount,
    calibrationStrength: averageStrength,
    historicalScore: weightedScoreMass ? weightedScore / weightedScoreMass : null,
    residualSigma:extraSigma,
    uncertainty:{interModelSigma,calibrationResidualSigma:extraSigma,totalSigma,evidenceLevel:evidenceLevelForFamilies(result.familyCount)},
    scenarioCount: 1,
    dominantShare: 1,
    explanation: 'BIAS_CORRECTED_SKILL_WEIGHTED',
  };
}

function scenarioSplit(entries, tight) {
  const rows = validWeightedRows(entries).sort((a, b) => a.value - b.value);
  if (rows.length < 4) return null;

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const center = weightedMedian(rows);
  const mad = weightedMad(rows, center) || 0;
  const minimumGap = Math.max(tight * 0.9, mad * 1.25);
  let best = null;
  let leftWeight = 0;

  for (let index = 0; index < rows.length - 1; index++) {
    leftWeight += rows[index].weight;
    const rightWeight = totalWeight - leftWeight;
    const gap = rows[index + 1].value - rows[index].value;
    const minorityShare = Math.min(leftWeight, rightWeight) / totalWeight;
    if (minorityShare < 0.18 || gap < minimumGap) continue;

    const score = gap * (0.5 + minorityShare);
    if (!best || score > best.score) {
      best = { index, gap, score, leftWeight, rightWeight };
    }
  }

  return best
    ? { left: rows.slice(0, best.index + 1), right: rows.slice(best.index + 1), gap: best.gap }
    : null;
}

function scenarioConsensus(
  entries,
  { localWeights = {}, tight = 0.5, wide = 3, min = null, max = null } = {},
) {
  const balanced = familyBalancedEntries(entries, localWeights);
  const base = robustFromBalanced(balanced, tight, wide);
  if (!base) return emptyResult('SCENARIOS');

  const split = scenarioSplit(balanced.entries, tight);
  if (!split) {
    const fallback = multiConsensus(entries, { localWeights, tight, wide, min, max });
    return {
      ...fallback,
      engine: 'SCENARIOS',
      effectiveEngine: 'MULTI_CONSENSUS',
      fallback: true,
      fallbackReason: 'SINGLE_SCENARIO',
      scenarioCount: 1,
      dominantShare: 1,
      explanation: 'SINGLE_SCENARIO',
    };
  }

  const totalWeight = [...split.left, ...split.right].reduce((sum, row) => sum + row.weight, 0);
  const clusters = [split.left, split.right]
    .map(rows => {
      const weight = rows.reduce((sum, row) => sum + row.weight, 0);
      const central = weightedMedian(rows);
      const stats = weightedStats(rows);
      return {
        rows,
        weight,
        share: weight / totalWeight,
        central,
        low: weightedQuantile(rows, 0.1),
        high: weightedQuantile(rows, 0.9),
        stdDev: stats?.stdDev || 0,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const dominant = clusters[0];
  const allStats=weightedStats(balanced.entries);
  const allCenter=weightedMedian(balanced.entries);
  const allSourceInterval=spreadInterval(balanced.entries,allCenter,allStats?.stdDev||0);
  if (dominant.share < MIN_DOMINANT_SCENARIO_SHARE) {
    const fallback = multiConsensus(entries, { localWeights, tight, wide, min, max });
    return {
      ...fallback,
      engine: 'SCENARIOS',
      effectiveEngine: 'MULTI_CONSENSUS',
      fallback: true,
      fallbackReason: 'NO_DOMINANT_SCENARIO',
      scenarioCount: 2,
      dominantShare: dominant.share,
      scenarioGap: split.gap,
      scenarios: clusters.map(cluster => ({
        share: cluster.share,
        central: bound(cluster.central, min, max),
        low: bound(cluster.low, min, max),
        high: bound(cluster.high, min, max),
      })),
      allSourceInterval:{low:bound(allSourceInterval.low,min,max),high:bound(allSourceInterval.high,min,max)},
      scenarioInterval:null,
      evidenceLevel:evidenceLevelForFamilies(balanced.familyCount),
      explanation: 'AMBIGUOUS_SCENARIOS',
    };
  }
  const interval = spreadInterval(dominant.rows, dominant.central, dominant.stdDev);

  return {
    central: bound(dominant.central, min, max),
    stats: weightedStats(dominant.rows),
    interval: {
      low: bound(interval.low, min, max),
      high: bound(interval.high, min, max),
    },
    scenarioInterval:{low:bound(interval.low,min,max),high:bound(interval.high,min,max)},
    allSourceInterval:{low:bound(allSourceInterval.low,min,max),high:bound(allSourceInterval.high,min,max)},
    rows: dominant.rows,
    convergencePercent: Math.round(clamp(dominant.share * 100, 0, 100)),
    count: balanced.modelCount,
    familyCount: balanced.familyCount,
    evidenceLevel:evidenceLevelForFamilies(balanced.familyCount),
    uncertainty:{interModelSigma:dominant.stdDev,calibrationResidualSigma:0,totalSigma:dominant.stdDev,evidenceLevel:evidenceLevelForFamilies(balanced.familyCount)},
    engine: 'SCENARIOS',
    effectiveEngine: 'SCENARIOS',
    fallback: false,
    calibrationCoverage: 0,
    calibratedFamilyCount: 0,
    calibrationStrength: 0,
    scenarioCount: 2,
    dominantShare: dominant.share,
    scenarioGap: split.gap,
    scenarios: clusters.map(cluster => ({
      share: cluster.share,
      central: bound(cluster.central, min, max),
      low: bound(cluster.low, min, max),
      high: bound(cluster.high, min, max),
    })),
    explanation: 'DOMINANT_SCENARIO',
  };
}

function adaptiveConsensus(entries, options = {}) {
  const multi = multiConsensus(entries, options);
  const calibration = calibrationConsensus(entries, options);
  const scenarios = scenarioConsensus(entries, options);

  const strongScenario =
    scenarios.scenarioCount > 1 &&
    scenarios.dominantShare >= MIN_DOMINANT_SCENARIO_SHARE &&
    scenarios.dominantShare <= 0.82 &&
    finite(scenarios.scenarioGap) &&
    scenarios.scenarioGap >= Math.max((options.tight || 0.5) * 1.1, (multi.stats?.stdDev || 0) * 0.5);

  if (strongScenario) {
    return {
      ...scenarios,
      engine: 'ADAPTIVE',
      effectiveEngine: 'SCENARIOS',
      adaptiveComponents: {
        multi: multi.central,
        calibration: calibration.central,
        scenarios: scenarios.central,
      },
      explanation: 'ADAPTIVE_SCENARIO',
    };
  }

  const calibrationReady =
    !calibration.fallback &&
    calibration.calibrationCoverage >= 0.5 &&
    calibration.calibratedFamilyCount >= MIN_CALIBRATED_FAMILIES &&
    (calibration.historicalScore == null || calibration.historicalScore >= 45);

  if (calibrationReady) {
    const trust = clamp(
      0.35 +
        calibration.calibrationCoverage * 0.25 +
        calibration.calibrationStrength * 0.2 +
        ((finite(calibration.historicalScore) ? calibration.historicalScore : 50) / 100) * 0.15,
      0.5,
      0.85,
    );
    const central = bound(
      calibration.central * trust + multi.central * (1 - trust),
      options.min,
      options.max,
    );
    const interModelSigma = Math.max(calibration.stats?.stdDev || 0, multi.stats?.stdDev || 0);
    const calibrationResidualSigma=(calibration.uncertainty?.calibrationResidualSigma||0)*trust;
    const totalSigma=Math.sqrt(interModelSigma**2+calibrationResidualSigma**2);
    const interval = spreadInterval(calibration.rows || multi.rows, central, interModelSigma, calibrationResidualSigma);

    return {
      ...calibration,
      central,
      interval: {
        low: bound(interval.low, options.min, options.max),
        high: bound(interval.high, options.min, options.max),
      },
      engine: 'ADAPTIVE',
      effectiveEngine: 'CALIBRATION',
      adaptiveTrust: trust,
      residualSigma:calibrationResidualSigma,
      uncertainty:{interModelSigma,calibrationResidualSigma,totalSigma,evidenceLevel:evidenceLevelForFamilies(calibration.familyCount)},
      allSourceInterval:multi.allSourceInterval||multi.interval,
      adaptiveComponents: {
        multi: multi.central,
        calibration: calibration.central,
        scenarios: scenarios.central,
      },
      explanation: 'ADAPTIVE_CALIBRATION_BLEND',
    };
  }

  return {
    ...multi,
    engine: 'ADAPTIVE',
    effectiveEngine: 'MULTI_CONSENSUS',
    adaptiveComponents: {
      multi: multi.central,
      calibration: calibration.central,
      scenarios: scenarios.central,
    },
    explanation: 'ADAPTIVE_ROBUST_FALLBACK',
  };
}

function bound(value, min, max) {
  if (!finite(value)) return value;
  if (min != null && max != null) return clamp(value, min, max);
  if (min != null) return Math.max(min, value);
  if (max != null) return Math.min(max, value);
  return value;
}

function emptyResult(engine) {
  return {
    central: null,
    stats: null,
    interval: { low: null, high: null },
    rows: [],
    convergencePercent: null,
    count: 0,
    familyCount: 0,
    engine,
    effectiveEngine: engine,
    fallback: false,
    calibrationCoverage: 0,
    calibratedFamilyCount: 0,
    calibrationStrength: 0,
    scenarioCount: 0,
    dominantShare: null,
    evidenceLevel:'NONE',
    allSourceInterval:{low:null,high:null},
    scenarioInterval:null,
    uncertainty:{interModelSigma:null,calibrationResidualSigma:null,totalSigma:null,evidenceLevel:'NONE'},
  };
}

export function forecastEngineContinuous(entries, options = {}) {
  const engine = FORECAST_ENGINES.includes(options.engine)
    ? options.engine
    : DEFAULT_FORECAST_ENGINE;
  const sanitized=(entries||[]).filter(row=>finite(row?.value)
    && (options.qualityMin==null||row.value>=options.qualityMin)
    && (options.qualityMax==null||row.value<=options.qualityMax));

  if (engine === 'CALIBRATION') return calibrationConsensus(sanitized, options);
  if (engine === 'SCENARIOS') return scenarioConsensus(sanitized, options);
  if (engine === 'ADAPTIVE') return adaptiveConsensus(sanitized, options);
  return multiConsensus(sanitized, options);
}

function occurrenceAdjustment(calibration = {}, modelIds = [], localWeights = {}, leadDay = null) {
  const ids = [...new Set((modelIds || []).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
  if (!ids.length) return { delta: 0, coverage: 0, familyCount: 0 };

  const balance = familyBalancedWeights(ids, localWeights);
  const totalMass = Object.values(balance.weights).reduce((sum, weight) => sum + weight, 0) || 1;
  let adjustment = 0;
  let adjustmentMass = 0;
  let scoreSum=0;
  let scoreMass=0;
  const calibratedIds = [];

  for (const modelId of ids) {
    const profile = calibrationProfileFor(calibration, modelId, leadDay);
    if (!profile?.precipitation) continue;

    const n = Math.max(1, Number(profile.sampleSize) || 1);
    const observed = (profile.precipitation.observedWetDays || 0) / n;
    const forecast = (profile.precipitation.forecastWetDays || 0) / n;
    const quality = clamp(finiteOr(profile.score, 50) / 100, 0.25, 1);
    const strength = calibrationStrength(profile);
    const familyWeight = balance.weights[modelId] || 0;
    const weight = familyWeight * quality * strength;
    if (weight <= 0) continue;

    calibratedIds.push(modelId);
    adjustment += (observed - forecast) * weight;
    adjustmentMass += weight;
    scoreSum+=finiteOr(profile.score,50)*familyWeight;
    scoreMass+=familyWeight;
  }

  const calibratedMass = calibratedIds.reduce(
    (sum, modelId) => sum + (balance.weights[modelId] || 0),
    0,
  );

  return {
    delta: adjustmentMass ? clamp(adjustment / adjustmentMass, -0.2, 0.2) : 0,
    coverage: clamp(calibratedMass / totalMass, 0, 1),
    familyCount: familyBalancedWeights(calibratedIds, localWeights).familyCount,
    historicalScore:scoreMass?scoreSum/scoreMass:null,
  };
}


function precipitationAmountCalibration(calibration = {}, leadDay = null) {
  const out = {};
  for (const [modelId, root] of Object.entries(calibration || {})) {
    const profile = Number.isInteger(leadDay) && leadDay >= 0
      ? root?.byLeadDay?.[leadDay] ?? root?.byLeadDay?.[String(leadDay)] ?? null
      : root;
    const amount = profile?.precipitation?.conditionalAmount;
    if (!amount || !finite(amount.bias) || Number(amount.sampleSize) < MIN_CALIBRATION_SAMPLES) continue;
    out[modelId] = {
      bias: amount.bias,
      score: finiteOr(amount.score, profile?.score ?? 50),
      standardDeviation: amount.standardDeviation,
      meanAbsoluteError: amount.meanAbsoluteError,
      sampleSize: amount.sampleSize,
    };
  }
  return out;
}

export function forecastEnginePrecipitation(
  rows,
  {
    engine = DEFAULT_FORECAST_ENGINE,
    threshold = RAIN_THRESHOLD_MM,
    localWeights = {},
    calibration = {},
    leadDay = null,
    amountTight = 1,
    amountWide = 8,
    amountMax = 1000,
  } = {},
) {
  const requested = FORECAST_ENGINES.includes(engine) ? engine : DEFAULT_FORECAST_ENGINE;
  const safeAmountMax=finite(amountMax)&&amountMax>threshold?amountMax:1000;
  const usable = (rows || []).map(row=>{
    if(!row?.modelId)return null;
    const amount=finite(row.amount)&&row.amount>=0&&row.amount<=safeAmountMax?row.amount:null;
    const probability=finite(row.probability)&&row.probability>=0&&row.probability<=100?row.probability:null;
    return finite(amount)||finite(probability)?{...row,amount,probability}:null;
  }).filter(Boolean).slice().sort((a,b)=>String(a.modelId).localeCompare(String(b.modelId)));

  if (!usable.length) {
    return {
      engine: requested,
      effectiveEngine: requested,
      probabilityPercent: null,
      conditionalAmountMm: null,
      centralAmountMm: null,
      expectedAmountMm: null,
      convergencePercent: null,
      count: 0,
      familyCount: 0,
      wetModelCount: 0,
      scenarioCount: 0,
    };
  }

  const rawAgreement = precipitationConsensus(usable, {
    threshold,
    localWeights,
    amountTight,
    amountWide,
  });
  const occurrence = familyBalancedWeights(usable.map(row => row.modelId), localWeights);
  const occurrenceCalibration = occurrenceAdjustment(
    calibration,
    usable.map(row => row.modelId),
    localWeights,
    leadDay,
  );
  const canCalibrateOccurrence =
    (requested === 'CALIBRATION' || requested === 'ADAPTIVE') &&
    occurrenceCalibration.coverage >= MIN_CALIBRATION_COVERAGE &&
    occurrenceCalibration.familyCount >= MIN_CALIBRATED_FAMILIES;

  let probabilitySum = 0;
  let totalWeight = 0;

  for (const row of usable) {
    const weight = occurrence.weights[row.modelId] || 0;
    if (weight <= 0) continue;

    let probability;
    if (finite(row.probability)) {
      probability = clamp(row.probability / 100, 0, 1);
    } else {
      probability = isWetPrecipitation(row.amount, threshold) ? 1 : 0;
    }

    if (canCalibrateOccurrence) {
      probability = clamp(probability + occurrenceCalibration.delta * 0.65, 0, 1);
    }

    probabilitySum += weight * probability;
    totalWeight += weight;
  }

  const probability = totalWeight ? probabilitySum / totalWeight : null;
  const wetRows = usable.filter(row => isWetPrecipitation(row.amount, threshold));
  const amountEntries = wetRows.map(row => ({ modelId: row.modelId, value: row.amount }));
  const amountCalibration = precipitationAmountCalibration(calibration, leadDay);
  const amountResult = forecastEngineContinuous(amountEntries, {
    engine: requested,
    localWeights,
    calibration: amountCalibration,
    leadDay: null,
    tight: amountTight,
    wide: amountWide,
    // A conditional wet-event amount must remain strictly above the wet threshold.
    min: threshold + EPS,
  });
  const conditionalAmount = amountResult.central;

  const occurrenceConvergence = rawAgreement.occurrenceConvergencePercent ?? null;
  const amountConvergence = rawAgreement.amountConvergencePercent ?? null;
  const convergence = rawAgreement.convergencePercent;

  const amounts = usable.map(row => row.amount).filter(finite);
  const hasAmount = amounts.length > 0;
  const expectedAmount = finite(probability) && finite(conditionalAmount)
    ? probability * conditionalAmount
    : hasAmount && probability === 0 ? 0 : null;
  const probabilitySigma = finite(rawAgreement.probabilityStdDevPercent)
    ? rawAgreement.probabilityStdDevPercent / 100
    : 0;
  const conditionalSigma = finite(amountResult.uncertainty?.totalSigma)
    ? amountResult.uncertainty.totalSigma
    : finite(amountResult.stats?.stdDev) ? amountResult.stats.stdDev : 0;
  const expectedSigma = finite(expectedAmount) && finite(conditionalAmount) && finite(probability)
    ? Math.sqrt((conditionalAmount * probabilitySigma) ** 2 + (probability * conditionalSigma) ** 2)
    : null;
  const expectedIntervalFor = interval => {
    if (!finite(expectedAmount)) return { low: null, high: null };
    const scaledLow = finite(interval?.low) && finite(probability) ? probability * interval.low : expectedAmount;
    const scaledHigh = finite(interval?.high) && finite(probability) ? probability * interval.high : expectedAmount;
    const envelope = finite(expectedSigma) ? 1.2816 * expectedSigma : 0;
    return {
      low: bound(Math.min(scaledLow, expectedAmount - envelope), 0, safeAmountMax),
      high: bound(Math.max(scaledHigh, expectedAmount + envelope), 0, safeAmountMax),
    };
  };
  const expectedInterval=expectedIntervalFor(amountResult.interval);
  const expectedScenarioInterval=amountResult.scenarioInterval?expectedIntervalFor(amountResult.scenarioInterval):null;
  const expectedAllSourceInterval=expectedIntervalFor(amountResult.allSourceInterval||amountResult.interval);
  const expectedScenarios=(amountResult.scenarios||[]).map(scenario=>({
    ...scenario,
    conditionalCentral:scenario.central,conditionalLow:scenario.low,conditionalHigh:scenario.high,
    central:finite(probability)&&finite(scenario.central)?probability*scenario.central:null,
    low:finite(probability)&&finite(scenario.low)?probability*scenario.low:null,
    high:finite(probability)&&finite(scenario.high)?probability*scenario.high:null,
  }));
  return {
    engine: requested,
    effectiveEngine: amountResult.effectiveEngine,
    probabilityPercent: finite(probability) ? Math.round(probability * 100) : null,
    conditionalAmountMm: finite(conditionalAmount) ? conditionalAmount : wetRows.length ? 0 : null,
    centralAmountMm:expectedAmount,
    expectedAmountMm:expectedAmount,
    conditionAmountMm:
      !hasAmount ? null : finite(probability) && probability >= 0.5 ? (finite(conditionalAmount) ? conditionalAmount : null) : 0,
    convergencePercent: convergence,
    occurrenceConvergencePercent: occurrenceConvergence,
    amountConvergencePercent: amountConvergence,
    count: usable.length,
    familyCount: occurrence.familyCount,
    wetModelCount: wetRows.length,
    wetFamilyCount: amountResult.familyCount,
    source: rawAgreement.source,
    minMm: amounts.length ? Math.min(...amounts) : null,
    maxMm: amounts.length ? Math.max(...amounts) : null,
    conditionalStdDev: amountResult.stats?.stdDev ?? null,
    interval:expectedInterval,
    conditionalInterval:amountResult.interval||null,
    scenarioCount: amountResult.scenarioCount,
    scenarios: expectedScenarios.length?expectedScenarios:null,
    calibrationCoverage: amountResult.calibrationCoverage || 0,
    calibratedFamilyCount: amountResult.calibratedFamilyCount || 0,
    calibrationStrength: amountResult.calibrationStrength || 0,
    occurrenceCalibrationCoverage: occurrenceCalibration.coverage,
    historicalReliabilityPercent:[occurrenceCalibration.historicalScore,amountResult.historicalScore].filter(finite).length?[occurrenceCalibration.historicalScore,amountResult.historicalScore].filter(finite).reduce((a,b)=>a+b,0)/[occurrenceCalibration.historicalScore,amountResult.historicalScore].filter(finite).length:null,
    agreement:{overallPercent:convergence,occurrencePercent:occurrenceConvergence,amountPercent:amountConvergence},
    dispersion:{probabilityStdDevPercent:rawAgreement.probabilityStdDevPercent??null,amountStdDevMm:amountResult.stats?.stdDev??null,rawAmountRangeMm:amounts.length?Math.max(...amounts)-Math.min(...amounts):null},
    evidenceLevel:evidenceLevelForFamilies(occurrence.familyCount),
    uncertainty:finite(expectedSigma)?{interModelSigma:finite(probability)?probability*(amountResult.uncertainty?.interModelSigma||0):null,calibrationResidualSigma:finite(probability)?probability*(amountResult.uncertainty?.calibrationResidualSigma||0):null,probabilitySigma,conditionalAmountSigma:conditionalSigma,totalSigma:expectedSigma,evidenceLevel:evidenceLevelForFamilies(occurrence.familyCount)}:null,
    conditionalUncertainty:amountResult.uncertainty||null,
    allSourceInterval:expectedAllSourceInterval,
    scenarioInterval:expectedScenarioInterval,
    fallback: amountResult.fallback || false,
    fallbackReason: amountResult.fallbackReason || null,
    explanation: amountResult.explanation,
  };
}

export function forecastEngineSummary(result) {
  if (!result) {
    return {
      effectiveEngine: DEFAULT_FORECAST_ENGINE,
      fallback: false,
      scenarioCount: 0,
      calibrationCoverage: 0,
      calibratedFamilyCount: 0,
      calibrationStrength: 0,
    };
  }

  return {
    effectiveEngine: result.effectiveEngine || result.engine || DEFAULT_FORECAST_ENGINE,
    fallback: Boolean(result.fallback),
    fallbackReason: result.fallbackReason || null,
    scenarioCount: Number(result.scenarioCount) || 0,
    dominantShare: finite(result.dominantShare) ? result.dominantShare : null,
    calibrationCoverage: finite(result.calibrationCoverage) ? result.calibrationCoverage : 0,
    calibratedFamilyCount: Number(result.calibratedFamilyCount) || 0,
    calibrationStrength: finite(result.calibrationStrength) ? result.calibrationStrength : 0,
    historicalScore: finite(result.historicalScore) ? result.historicalScore : null,
    interval: result.interval || null,
    conditionalInterval:result.conditionalInterval||null,
    scenarioInterval:result.scenarioInterval||null,
    allSourceInterval:result.allSourceInterval||result.interval||null,
    uncertainty:result.uncertainty||null,
    conditionalUncertainty:result.conditionalUncertainty||null,
    evidenceLevel:result.evidenceLevel||result.uncertainty?.evidenceLevel||null,
    historicalReliabilityPercent:finite(result.historicalReliabilityPercent)?result.historicalReliabilityPercent:null,
    agreement:result.agreement||null,
    dispersion:result.dispersion||null,
    explanation: result.explanation || null,
  };
}
