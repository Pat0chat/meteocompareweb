export const UNIT_SYSTEMS = Object.freeze(['METRIC','IMPERIAL']);
export const DEFAULT_UNIT_SYSTEM = 'METRIC';

const IMPERIAL = 'IMPERIAL';
const KM_TO_MI = 0.621371192237334;
const M_TO_FT = 3.28083989501312;
const MM_TO_IN = 1 / 25.4;
const HPA_TO_INHG = 0.029529983071445;

export function normalizeUnitSystem(value){
  const normalized=typeof value==='string'?value.trim().toUpperCase():'';
  return UNIT_SYSTEMS.includes(normalized)?normalized:DEFAULT_UNIT_SYSTEM;
}
export function isImperial(unitSystem){return normalizeUnitSystem(unitSystem)===IMPERIAL;}

export function convertTemperature(value,unitSystem,{delta=false}={}){
  if(!Number.isFinite(value))return null;
  if(!isImperial(unitSystem))return value;
  return delta ? value*9/5 : value*9/5+32;
}
export function convertWind(value,unitSystem){return Number.isFinite(value)?(isImperial(unitSystem)?value*KM_TO_MI:value):null;}
export function convertPrecipitation(value,unitSystem){return Number.isFinite(value)?(isImperial(unitSystem)?value*MM_TO_IN:value):null;}
export function convertDistance(value,unitSystem){return Number.isFinite(value)?(isImperial(unitSystem)?value*KM_TO_MI:value):null;}
export function convertLength(value,unitSystem){return Number.isFinite(value)?(isImperial(unitSystem)?value*M_TO_FT:value):null;}
export function convertPressure(value,unitSystem){return Number.isFinite(value)?(isImperial(unitSystem)?value*HPA_TO_INHG:value):null;}

export function unitSymbol(kind,unitSystem){
  const imperial=isImperial(unitSystem);
  if(kind==='temperature'||kind==='temperatureDelta')return imperial?'°F':'°C';
  if(kind==='wind')return imperial?'mph':'km/h';
  if(kind==='precipitation')return imperial?'in':'mm';
  if(kind==='precipitationRate')return imperial?'in/h':'mm/h';
  if(kind==='distance')return imperial?'mi':'km';
  if(kind==='length')return imperial?'ft':'m';
  if(kind==='pressure')return imperial?'inHg':'hPa';
  return '';
}

export function unitDigits(kind,unitSystem,{compact=false}={}){
  const imperial=isImperial(unitSystem);
  if(kind==='temperature'||kind==='temperatureDelta')return compact?0:1;
  if(kind==='wind')return 0;
  if(kind==='precipitation')return imperial?2:1;
  if(kind==='precipitationRate')return imperial?3:1;
  if(kind==='distance')return compact?0:1;
  if(kind==='length')return compact?1:2;
  if(kind==='pressure')return imperial?2:0;
  return 0;
}

export function convertUnitValue(kind,value,unitSystem,options={}){
  if(kind==='temperature')return convertTemperature(value,unitSystem);
  if(kind==='temperatureDelta')return convertTemperature(value,unitSystem,{delta:true});
  if(kind==='wind')return convertWind(value,unitSystem);
  if(kind==='precipitation'||kind==='precipitationRate')return convertPrecipitation(value,unitSystem);
  if(kind==='distance')return convertDistance(value,unitSystem);
  if(kind==='length')return convertLength(value,unitSystem);
  if(kind==='pressure')return convertPressure(value,unitSystem);
  return Number.isFinite(value)?value:null;
}

export function chartMetricKind(metric){
  if(metric==='TEMPERATURE')return 'temperature';
  if(metric==='PRECIPITATION')return 'precipitation';
  if(metric==='WIND'||metric==='GUST')return 'wind';
  return null;
}
export function convertChartMetric(metric,value,unitSystem){
  const kind=chartMetricKind(metric);return kind?convertUnitValue(kind,value,unitSystem):value;
}
export function chartMetricUnitFor(metric,unitSystem){
  const kind=chartMetricKind(metric);return kind?unitSymbol(kind,unitSystem):'%';
}
export function chartMetricDigitsFor(metric,unitSystem){
  const kind=chartMetricKind(metric);return kind?unitDigits(kind,unitSystem,{compact:true}):0;
}
