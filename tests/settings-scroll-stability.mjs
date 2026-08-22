import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const css=read('styles.css'),app=read('js/app.js'),version=APP_VERSION,sw=read('sw.js');
assert.match(version,/^\d+\.\d+\.\d+$/);
assert.doesNotMatch(css,/\.settings-section[^}]*content-visibility:\s*auto/s,'interactive Settings cards must not be virtualized');
assert.match(css,/\.settings-list[^}]*overflow-anchor:\s*none/s,'native scroll anchoring must be disabled within Settings');
assert.match(css,/\.home-city-card\s*\{[^}]*content-visibility:\s*auto/s,'home card optimization must remain scoped to modern home city cards');
for(const key of ['localWeighting','theme','refreshInterval','density']){
  const re=new RegExp(`if\\(target\\.dataset\\.${key}\\)\\{[^}]*stabilizeLocalScroll\\(interactionScrollContext\\)`);
  assert.match(app,re,`${key} must restore the clicked control viewport position after its mutation`);
}
assert.match(app,/target\.dataset\.modelSort[^\n]+render\(\{scroll:interactionScrollContext,immediate:true\}\)/,'model sort rerender must preserve the clicked control');
assert.match(app,/changeLanguage\(nextLanguage,directive\)/,'language rerender must carry its captured scroll directive');
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
console.log('MeteoCompare Web settings scroll stability tests: OK');
