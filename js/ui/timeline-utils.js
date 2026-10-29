import { isWetPrecipitation } from '../consensus.js';
import { convertUnitValue, unitDigits } from '../units.js';

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

// Axis bounds are computed from the actual displayed series, never from a
// fixed meteorological "typical" range. All inputs are in canonical units;
// callers apply the current unit system when formatting tick labels.

function niceStep(span,targetTicks){
  const rough=Math.max(Number.EPSILON,span/Math.max(1,targetTicks));
  const magnitude=10**Math.floor(Math.log10(rough));
  const normalized=rough/magnitude;
  const factor=normalized<=1?1:normalized<=2?2:normalized<=2.5?2.5:normalized<=5?5:10;
  return factor*magnitude;
}
function roundTick(value){return Number(value.toFixed(8));}
function ticksBetween(min,max,step){
  const ticks=[];
  for(let index=0;index<=200;index++){
    const value=roundTick(min+index*step);
    if(value>max+step*.01)break;
    ticks.push(value);
  }
  return ticks;
}
export function graphicNiceAxis(maxValue,{minimum=1,targetTicks=3}={}){
  const safeMax=Math.max(minimum,Number.isFinite(maxValue)?maxValue:0);
  const step=niceStep(safeMax,targetTicks),max=Math.max(step,Math.ceil(safeMax/step)*step);
  return {min:0,max:roundTick(max),step,ticks:ticksBetween(0,max,step)};
}
export function graphicNiceRange(values,{minimumSpan=8,targetTicks=4,paddingSteps=.35}={}){
  const finite=(values||[]).filter(Number.isFinite);
  if(!finite.length)return {min:1000,max:1020,step:5,ticks:[1000,1005,1010,1015,1020]};
  const rawMin=Math.min(...finite),rawMax=Math.max(...finite),center=(rawMin+rawMax)/2;
  const safeSpan=Math.max(minimumSpan,rawMax-rawMin),step=niceStep(safeSpan,targetTicks);
  const min=roundTick(Math.floor((Math.min(rawMin,center-safeSpan/2)-step*paddingSteps)/step)*step);
  const max=roundTick(Math.ceil((Math.max(rawMax,center+safeSpan/2)+step*paddingSteps)/step)*step);
  return {min,max,step,ticks:ticksBetween(min,max,step)};
}
export function graphicBoundedRange(values,{minimumSpan=8,targetTicks=4,minBound=-Infinity,maxBound=Infinity,fallback=[0,100]}={}){
  const finite=(values||[]).filter(value=>Number.isFinite(value)&&value>=minBound&&value<=maxBound);
  const base=graphicNiceRange(finite.length?finite:fallback,{minimumSpan,targetTicks});
  const min=roundTick(Math.max(minBound,base.min)),max=roundTick(Math.min(maxBound,base.max));
  // Recompute a pleasing tick interval after clipping the meteorological
  // bounds (notably the 0–100% humidity range), preventing extra-dense labels.
  const step=niceStep(max-min,targetTicks),ticks=[];
  for(let index=0;index<=200;index++){
    const value=roundTick(Math.ceil((min-1e-8)/step)*step+index*step);
    if(value>max+step*.01)break;
    ticks.push(value);
  }
  return {min,max,step,ticks};
}
export function graphicAxisDigits(kind,step,unitSystem){
  const displayed=Math.abs(convertUnitValue(kind,step,unitSystem)-convertUnitValue(kind,0,unitSystem));
  const extra=Number.isFinite(displayed)&&displayed>0?Math.max(0,Math.ceil(-Math.log10(displayed))):0;
  return Math.min(5,Math.max(unitDigits(kind,unitSystem),extra));
}

// Smaller plots do not have enough vertical space for five 20px labels.
// Preserve both endpoints (and a representative midpoint) without changing
// the numeric scale used by the lines.
export function graphicReadableTicks(ticks,maxTicks=3){
  if(!Array.isArray(ticks)||ticks.length<=maxTicks)return ticks||[];
  return Array.from({length:maxTicks},(_,index)=>ticks[Math.round(index*(ticks.length-1)/(maxTicks-1))]);
}
