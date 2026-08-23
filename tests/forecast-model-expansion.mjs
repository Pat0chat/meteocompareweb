import assert from 'node:assert/strict';
import { WEATHER_MODELS, consensusGroupFor, getModel, DEFAULT_MODEL_IDS } from '../js/models.js';

const dmi=getModel('DMI_HARMONIE_EU');
const swiss=getModel('METEOSWISS_ICON_CH2');
assert.ok(dmi,'DMI HARMONIE Europe must be available');
assert.equal(dmi.apiKey,'dmi_harmonie_arome_europe');
assert.equal(dmi.resolutionKm,2);
assert.equal(dmi.horizonHours,60);
assert.ok(swiss,'MeteoSwiss ICON-CH2 must be available');
assert.equal(swiss.apiKey,'meteoswiss_icon_ch2');
assert.equal(swiss.resolutionKm,2);
assert.equal(swiss.horizonHours,120);
assert.equal(consensusGroupFor('DMI_HARMONIE_EU'),consensusGroupFor('KNMI_HARMONIE_EU'),'UWC HARMONIE siblings must not receive independent voting mass');
assert.equal(consensusGroupFor('METEOSWISS_ICON_CH2'),consensusGroupFor('ICON_EU'),'ICON-CH2 must share the ICON numerical-lineage voting group');
assert.ok(!DEFAULT_MODEL_IDS.includes('DMI_HARMONIE_EU')&&!DEFAULT_MODEL_IDS.includes('METEOSWISS_ICON_CH2'),'new regional models should remain opt-in to avoid extra requests outside their domains');
assert.equal(new Set(WEATHER_MODELS.map(m=>m.id)).size,WEATHER_MODELS.length,'weather model IDs must stay unique');
console.log('Forecast model expansion: OK');
