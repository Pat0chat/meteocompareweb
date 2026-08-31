import assert from 'node:assert/strict';
import { isRainRadarPixel, refineRainMask, extractRainCells } from '../../../js/features/radar.js';

assert.equal(isRainRadarPixel(120,120,120,255),false,'neutral grey artefacts must not be classified as rain');
assert.equal(isRainRadarPixel(180,180,180,255),false,'light grey map or anti-aliased pixels must not be treated as precipitation');
assert.equal(isRainRadarPixel(55,145,255,255),true,'blue precipitation colours must be retained');
assert.equal(isRainRadarPixel(245,210,35,255),true,'yellow/orange precipitation colours must be retained');
assert.equal(isRainRadarPixel(235,60,45,255),true,'red precipitation colours must be retained');
assert.equal(isRainRadarPixel(40,120,60,22),false,'very transparent pixels must not create false rain cells');

const noisy=new Uint8Array(25);noisy[2*5+2]=1;noisy[2*5+3]=1;noisy[3*5+2]=1;noisy[0]=1;
const refined=refineRainMask(noisy,5,5,{minNeighbors:2});
assert.equal(refined[0],0,'isolated radar speckles must be removed before cell segmentation');
assert.equal(refined[2*5+2],1,'supported precipitation pixels must be retained');

const diagonal=new Uint8Array(36);for(const [x,y] of [[1,1],[1,2],[2,1],[3,3],[3,4],[4,3]])diagonal[y*6+x]=1;
assert.equal(extractRainCells(diagonal,6,6,{minPixels:1}).length,2,'diagonally touching precipitation areas must not be merged into one oversized zone');

console.log('Radar rain-colour mask filtering and conservative segmentation: OK');
