export const WEATHER_MODELS = [
  // Forecast metadata below follows the individual Open-Meteo provider pages.
  // horizonHours is the nominal deterministic horizon used for health checks.
  // recoveryRequestHours may be longer when a provider exposes extended cycles
  // (HRRR: 18 h normally, 48 h on 00/06/12/18Z runs).
  { id:'AROME_FRANCE_HD', openDataKey:'meteofrance_arome_france_hd', apiKey:'meteofrance_arome_france_hd', aliases:[], name:'AROME HD', resolutionKm:1.5, maxForecastDays:2, horizonHours:48, recoveryRequestHours:48, nativeStepMinutes:60, updateMinutes:180, supportsDay1Bias:true, coverage:'FRANCE', family:'Météo-France' },
  { id:'AROME_FRANCE', openDataKey:'meteofrance_arome_france0025', apiKey:'meteofrance_arome_france', aliases:[], name:'AROME', resolutionKm:2.5, maxForecastDays:2, horizonHours:48, recoveryRequestHours:48, nativeStepMinutes:60, updateMinutes:180, supportsDay1Bias:true, coverage:'FRANCE', family:'Météo-France' },
  { id:'ARPEGE_EUROPE', openDataKey:'meteofrance_arpege_europe', apiKey:'meteofrance_arpege_europe', aliases:[], name:'ARPEGE EU', resolutionKm:11, maxForecastDays:4, horizonHours:96, recoveryRequestHours:96, nativeStepMinutes:60, updateMinutes:360, supportsDay1Bias:true, coverage:'EUROPE', family:'Météo-France' },
  { id:'ARPEGE_WORLD', openDataKey:'meteofrance_arpege_world025', apiKey:'meteofrance_arpege_world', aliases:[], name:'ARPEGE', resolutionKm:25, maxForecastDays:4, horizonHours:96, recoveryRequestHours:96, nativeStepMinutes:60, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'Météo-France' },
  { id:'ICON_EU', openDataKey:'dwd_icon_eu', apiKey:'icon_eu', aliases:[], name:'ICON-EU', resolutionKm:7, maxForecastDays:5, horizonHours:120, recoveryRequestHours:120, nativeStepMinutes:60, updateMinutes:180, supportsDay1Bias:true, coverage:'EUROPE', family:'DWD' },
  { id:'ICON_GLOBAL', openDataKey:'dwd_icon', apiKey:'icon_global', aliases:['icon_seamless'], name:'ICON', resolutionKm:11, maxForecastDays:8, horizonHours:180, recoveryRequestHours:180, nativeStepMinutes:60, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'DWD' },
  { id:'GFS', openDataKey:'ncep_gfs013', apiKey:'ncep_gfs_seamless', aliases:['gfs_seamless'], name:'GFS', resolutionKm:13, maxForecastDays:16, horizonHours:384, recoveryRequestHours:384, nativeStepMinutes:60, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'NOAA' },
  { id:'ECMWF', openDataKey:'ecmwf_ifs025', apiKey:'ecmwf_ifs025', aliases:[], name:'ECMWF', resolutionKm:25, maxForecastDays:15, horizonHours:360, recoveryRequestHours:360, nativeStepMinutes:180, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'ECMWF' },
  { id:'UKMO_GLOBAL', openDataKey:'ukmo_global_deterministic_10km', apiKey:'ukmo_global_deterministic_10km', aliases:[], name:'UKMO', resolutionKm:10, maxForecastDays:7, horizonHours:168, recoveryRequestHours:168, nativeStepMinutes:60, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'UK Met Office' },
  { id:'ECMWF_AIFS', openDataKey:'ecmwf_aifs025_single', apiKey:'ecmwf_aifs025_single', aliases:[], name:'AIFS', resolutionKm:28, maxForecastDays:15, horizonHours:360, recoveryRequestHours:360, nativeStepMinutes:360, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'ECMWF' },
  { id:'GEM_GLOBAL', openDataKey:'cmc_gem_gdps', apiKey:'cmc_gem_gdps', aliases:['gem_global'], name:'GEM', resolutionKm:15, maxForecastDays:10, horizonHours:240, recoveryRequestHours:240, nativeStepMinutes:180, updateMinutes:720, supportsDay1Bias:true, coverage:'GLOBAL', family:'ECCC' },
  { id:'ICON_D2', openDataKey:'dwd_icon_d2', apiKey:'icon_d2', aliases:[], name:'ICON-D2', resolutionKm:2, maxForecastDays:2, horizonHours:48, recoveryRequestHours:48, nativeStepMinutes:60, updateMinutes:180, supportsDay1Bias:true, coverage:'EUROPE', family:'DWD' },
  { id:'HRRR_CONUS', openDataKey:'ncep_hrrr_conus', apiKey:'ncep_hrrr_conus', aliases:[], name:'HRRR', resolutionKm:3, maxForecastDays:2, horizonHours:18, recoveryRequestHours:48, nativeStepMinutes:60, updateMinutes:60, supportsDay1Bias:false, coverage:'UNITED_STATES', family:'NOAA' },
  { id:'METNO_NORDIC', openDataKey:'metno_nordic_pp', apiKey:'metno_nordic', aliases:[], name:'MET Nordic', resolutionKm:1, maxForecastDays:3, horizonHours:60, recoveryRequestHours:60, nativeStepMinutes:60, updateMinutes:60, supportsDay1Bias:true, coverage:'EUROPE', family:'MET Norway' },
  { id:'KNMI_HARMONIE_EU', openDataKey:'knmi_harmonie_arome_europe', apiKey:'knmi_harmonie_arome_europe', aliases:[], name:'HARMONIE', resolutionKm:5.5, maxForecastDays:3, horizonHours:60, recoveryRequestHours:60, nativeStepMinutes:60, updateMinutes:60, supportsDay1Bias:true, coverage:'EUROPE', family:'KNMI' },
  { id:'BOM_ACCESS', openDataKey:'bom_access_global', apiKey:'bom_access_global', aliases:[], name:'BOM', resolutionKm:15, maxForecastDays:10, horizonHours:240, recoveryRequestHours:240, nativeStepMinutes:60, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'BOM' },
  { id:'CMA_GRAPES', openDataKey:'cma_grapes_global', apiKey:'cma_grapes_global', aliases:[], name:'CMA', resolutionKm:15, maxForecastDays:10, horizonHours:240, recoveryRequestHours:240, nativeStepMinutes:180, updateMinutes:360, supportsDay1Bias:true, coverage:'GLOBAL', family:'CMA' },
];

export const DEFAULT_MODEL_IDS = ['AROME_FRANCE_HD','ARPEGE_EUROPE','ICON_EU','GFS','ECMWF','UKMO_GLOBAL','ECMWF_AIFS'];
export const COVERAGE_LABELS = { FRANCE:'France', EUROPE:'Europe', UNITED_STATES:'États-Unis', GLOBAL:'Monde' };
export const REFRESH_INTERVALS = [
  { id:'MINUTES_15', minutes:15, label:'15 min' },
  { id:'MINUTES_30', minutes:30, label:'30 min' },
  { id:'HOUR_1', minutes:60, label:'1 h' },
  { id:'HOURS_3', minutes:180, label:'3 h' },
  { id:'HOURS_6', minutes:360, label:'6 h' },
  { id:'MANUAL', minutes:0, label:'Manuel' },
];

export const CONDITION = Object.freeze({
  CLEAR:'CLEAR', MAINLY_CLEAR:'MAINLY_CLEAR', PARTLY_CLOUDY:'PARTLY_CLOUDY', OVERCAST:'OVERCAST', FOG:'FOG',
  DRIZZLE:'DRIZZLE', RAIN:'RAIN', FREEZING_RAIN:'FREEZING_RAIN', SNOW:'SNOW', RAIN_SHOWERS:'RAIN_SHOWERS',
  SNOW_SHOWERS:'SNOW_SHOWERS', THUNDERSTORM:'THUNDERSTORM', UNKNOWN:'UNKNOWN'
});

export const CONDITION_INFO = {
  CLEAR:{ icon:'☀️', label:'Clair', severity:0, accent:'#f5a623' },
  MAINLY_CLEAR:{ icon:'🌤️', label:'Peu nuageux', severity:1, accent:'#e9a23b' },
  PARTLY_CLOUDY:{ icon:'⛅', label:'Partiellement nuageux', severity:2, accent:'#78909c' },
  OVERCAST:{ icon:'☁️', label:'Couvert', severity:3, accent:'#607d8b' },
  FOG:{ icon:'🌫️', label:'Brouillard', severity:4, accent:'#78909c' },
  DRIZZLE:{ icon:'🌦️', label:'Bruine', severity:5, accent:'#5c8fc9' },
  RAIN_SHOWERS:{ icon:'🌦️', label:'Averses', severity:6, accent:'#3d7cc9' },
  RAIN:{ icon:'🌧️', label:'Pluie', severity:7, accent:'#3569ad' },
  SNOW_SHOWERS:{ icon:'🌨️', label:'Averses de neige', severity:8, accent:'#6b8da8' },
  SNOW:{ icon:'❄️', label:'Neige', severity:9, accent:'#7aa6c2' },
  FREEZING_RAIN:{ icon:'🧊', label:'Pluie verglaçante', severity:10, accent:'#647bd1' },
  THUNDERSTORM:{ icon:'⛈️', label:'Orage', severity:11, accent:'#7558a6' },
  UNKNOWN:{ icon:'❔', label:'Indéterminé', severity:-1, accent:'#8a929b' },
};

export function getModel(idOrKey) {
  return WEATHER_MODELS.find(m => m.id === idOrKey || m.apiKey === idOrKey || m.aliases.includes(idOrKey));
}


// Models sharing a numerical lineage are deliberately grouped for consensus calculations.
// A group receives at most one unit of voting mass, so activating several siblings does not
// give one modelling system multiple independent votes. Future ensemble members should reuse
// the deterministic parent's group instead of creating one group per member.
export const CONSENSUS_GROUPS = Object.freeze({
  AROME_FRANCE_HD:'MF_AROME', AROME_FRANCE:'MF_AROME',
  ARPEGE_EUROPE:'MF_ARPEGE', ARPEGE_WORLD:'MF_ARPEGE',
  ICON_D2:'DWD_ICON', ICON_EU:'DWD_ICON', ICON_GLOBAL:'DWD_ICON',
  ECMWF:'ECMWF_GLOBAL', ECMWF_AIFS:'ECMWF_GLOBAL',
  GFS:'NOAA_GFS', HRRR_CONUS:'NOAA_HRRR',
  METNO_NORDIC:'METNO_NORDIC', KNMI_HARMONIE_EU:'KNMI_HARMONIE',
  UKMO_GLOBAL:'UKMO_GLOBAL', GEM_GLOBAL:'ECCC_GEM', BOM_ACCESS:'BOM_ACCESS', CMA_GRAPES:'CMA_GRAPES'
});

export function consensusGroupFor(idOrKey) {
  const model=getModel(idOrKey);
  return CONSENSUS_GROUPS[model?.id] || model?.id || String(idOrKey||'UNKNOWN');
}

export function selectedModels(ids) {
  const set = new Set(ids);
  return WEATHER_MODELS.filter(m => set.has(m.id));
}
