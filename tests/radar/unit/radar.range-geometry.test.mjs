import assert from 'node:assert/strict';
import { RADAR_RANGE_CONFIG } from '../../../js/features/radar.js';

assert.deepEqual(Object.keys(RADAR_RANGE_CONFIG),['near','regional','wide']);
for(const [range,config] of Object.entries(RADAR_RANGE_CONFIG)){
  assert.ok(Number.isInteger(config.mapZoom)&&Number.isInteger(config.radarZoom),`${range}: map/radar zooms must be integers`);
  assert.ok(config.radarScale>=1&&(config.radarScale&(config.radarScale-1))===0,`${range}: radar scale must be a power of two`);
  assert.equal(config.mapZoom,config.radarZoom+Math.log2(config.radarScale),`${range}: RainViewer and OSM geometry must represent the same displayed zoom`);
}
assert.ok(RADAR_RANGE_CONFIG.near.mapZoom>RADAR_RANGE_CONFIG.regional.mapZoom);
assert.ok(RADAR_RANGE_CONFIG.regional.mapZoom>RADAR_RANGE_CONFIG.wide.mapZoom);
console.log('Radar projection geometry aligned across near/regional/wide ranges: OK');
