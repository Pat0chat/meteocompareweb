import { isWetPrecipitation } from '../consensus.js';

const TEMPERATURE_HEAT_STOPS = Object.freeze([
  [-15, [91, 111, 249]],
  [-2, [63, 142, 232]],
  [8, [53, 184, 200]],
  [16, [95, 198, 141]],
  [22, [230, 195, 79]],
  [28, [243, 154, 69]],
  [34, [235, 102, 93]],
  [42, [201, 74, 131]],
]);

export function temperatureHeatColor(value) {
  if (!Number.isFinite(value)) return 'rgb(148 163 184)';
  if (value <= TEMPERATURE_HEAT_STOPS[0][0]) return `rgb(${TEMPERATURE_HEAT_STOPS[0][1].join(' ')})`;
  if (value >= TEMPERATURE_HEAT_STOPS.at(-1)[0]) return `rgb(${TEMPERATURE_HEAT_STOPS.at(-1)[1].join(' ')})`;

  for (let index = 1; index < TEMPERATURE_HEAT_STOPS.length; index += 1) {
    if (value > TEMPERATURE_HEAT_STOPS[index][0]) continue;
    const [lowValue, lowColor] = TEMPERATURE_HEAT_STOPS[index - 1];
    const [highValue, highColor] = TEMPERATURE_HEAT_STOPS[index];
    const ratio = (value - lowValue) / (highValue - lowValue);
    const color = lowColor.map((channel, channelIndex) => Math.round(channel + (highColor[channelIndex] - channel) * ratio));
    return `rgb(${color.join(' ')})`;
  }

  return 'rgb(148 163 184)';
}

export function groupRainTimelineEvents(points, probabilityThreshold = 30) {
  const events = [];
  let active = null;
  const isWet = point =>
    (Number.isFinite(point?.precipitationPercent) && point.precipitationPercent >= probabilityThreshold) ||
    isWetPrecipitation(point?.precipitationConditionalMm);

  points.forEach((point, index) => {
    if (!isWet(point)) {
      if (active) events.push(active);
      active = null;
      return;
    }

    if (!active) active = { start: index, end: index, maxProbability: null, maxAmount: null };
    active.end = index;
    if (Number.isFinite(point.precipitationPercent)) {
      active.maxProbability = Math.max(active.maxProbability ?? 0, point.precipitationPercent);
    }
    if (Number.isFinite(point.precipitationConditionalMm)) {
      active.maxAmount = Math.max(active.maxAmount ?? 0, point.precipitationConditionalMm);
    }
  });

  if (active) events.push(active);
  return events;
}

export function svgPathFromPoints(points) {
  let path = '';
  let segmentOpen = false;
  for (const point of points) {
    if (!point) {
      segmentOpen = false;
      continue;
    }
    path += `${segmentOpen ? ' L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    segmentOpen = true;
  }
  return path;
}
