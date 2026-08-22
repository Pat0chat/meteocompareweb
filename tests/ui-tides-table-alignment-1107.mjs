import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../VERSION',import.meta.url),'utf8').trim();
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

assert.ok(version.localeCompare('1.10.11',undefined,{numeric:true,sensitivity:'base'})>=0,`unexpected release version ${version}`);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.ok(app.includes('const w=960,h=360,pad={l:58,r:26,t:30,b:50}'),'tide SVG uses the expanded 8:3 plotting canvas');
assert.ok(css.includes('.marine-tide-layout {\n  grid-template-columns: minmax(0,1fr);'),'tide chart occupies the full workspace width');
assert.ok(css.includes('aspect-ratio: 8 / 3;'),'tide chart gets a stable full-width/full-height ratio');
assert.ok(css.includes('grid-template-columns: minmax(190px,.75fr) minmax(240px,.9fr) minmax(320px,1.35fr);'),'tide summary is moved below the chart');

for(const cls of ['model-header-slot','model-description-slot','model-run-slot','model-warning-slot','model-bias-slot'])
  assert.ok(app.includes(`class=\"${cls}`),`${cls} must be rendered as an explicit alignment slot`);
assert.ok(app.includes('data-has-bias=\"true\"'),'bias-enabled headers declare the fifth reserved row');
assert.ok(css.includes('.model-header-stack[data-has-bias="true"]'),'bias headers use the shared five-row geometry');
assert.ok(css.includes('grid-template-rows: 1.9rem 2.05rem 2.65rem 1.45rem 1.95rem;'),'name, metadata, horizon, warning and bias tracks are fixed across columns');
assert.ok(css.includes('-webkit-line-clamp: 2;'),'long model names/metadata cannot push lower slots down');
assert.ok(css.includes('-webkit-line-clamp: 3;'),'long run/horizon coverage cannot push bias pills down');

console.log('MeteoCompare Web 1.10.8 tide + table alignment regression: OK');
