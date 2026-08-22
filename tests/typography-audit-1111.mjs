import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../js/version.js';

const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const version=APP_VERSION;
const versionJs=fs.readFileSync(new URL('../js/version.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

assert.ok(version.localeCompare('1.10.11',undefined,{numeric:true,sensitivity:'base'})>=0,`unexpected release version ${version}`);
assert.ok(versionJs.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.ok(sw.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(css,/v1\.10\.11 — typography audit/);
assert.match(css,/--type-micro:\s*\.7rem/);
assert.match(css,/--type-section:\s*1\.08rem/);

const canonical=new Set([0.70,0.74,0.76,0.80,0.84,0.88,0.92,0.96,1.00,1.08,1.20,1.30,1.40]);
for(const match of css.matchAll(/font-size\s*:\s*([0-9]*\.?[0-9]+)rem/g)){
  const value=Number(match[1]);
  assert.ok(value>=0.70,`explicit UI font-size below readability floor: ${value}rem`);
  if(value<=1.40) assert.ok(canonical.has(Number(value.toFixed(2))),`non-canonical compact font-size: ${value}rem`);
}
for(const match of css.matchAll(/font-size\s*:\s*([0-9]*\.?[0-9]+)px/g)){
  const value=Number(match[1]);
  assert.ok(value>=10,`chart/UI font-size below 10px: ${value}px`);
}

assert.match(css,/\.chart-axis,.compare-label,.bias-chart-axis,.chart-axis-unit \{ font-size: 10\.5px; \}/);
assert.match(css,/\.chart-axis\.secondary,.evolution-track-label \{ font-size: 10px; \}/);

console.log('MeteoCompare Web typography audit 1.10.11: OK');
