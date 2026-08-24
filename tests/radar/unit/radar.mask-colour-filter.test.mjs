import assert from 'node:assert/strict';
import { isRainRadarPixel } from '../../../js/features/radar.js';

assert.equal(isRainRadarPixel(120,120,120,255),false,'neutral grey artefacts must not be classified as rain');
assert.equal(isRainRadarPixel(180,180,180,255),false,'light grey map or anti-aliased pixels must not be treated as precipitation');
assert.equal(isRainRadarPixel(55,145,255,255),true,'blue precipitation colours must be retained');
assert.equal(isRainRadarPixel(245,210,35,255),true,'yellow/orange precipitation colours must be retained');
assert.equal(isRainRadarPixel(235,60,45,255),true,'red precipitation colours must be retained');
assert.equal(isRainRadarPixel(40,120,60,22),false,'very transparent pixels must not create false rain cells');

console.log('Radar rain-colour mask filtering: OK');
