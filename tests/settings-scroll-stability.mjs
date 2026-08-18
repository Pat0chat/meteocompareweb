import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const css=read('styles.css'),app=read('js/app.js'),version=read('VERSION').trim(),sw=read('sw.js');
assert.equal(version,'1.10.4');
assert.doesNotMatch(css,/\.settings-section[^}]*content-visibility:\s*auto/s,'interactive Settings cards must not be virtualized');
assert.match(css,/\.settings-list[^}]*overflow-anchor:\s*none/s,'native scroll anchoring must be disabled within Settings');
assert.match(css,/\.city-card\s*\{[^}]*content-visibility:\s*auto/s,'home card optimization must remain scoped to city cards');
for(const key of ['localWeighting','theme','refreshInterval','density']){
  const re=new RegExp(`if\\(target\\.dataset\\.${key}\\)\\{[^}]*stabilizeLocalScroll\\(interactionScrollContext\\)`);
  assert.match(app,re,`${key} must restore the clicked control viewport position after its mutation`);
}
assert.match(app,/target\.dataset\.modelSort[^\n]+render\(\{scroll:interactionScrollContext,immediate:true\}\)/,'model sort rerender must preserve the clicked control');
assert.match(app,/changeLanguage\(nextLanguage,directive\)/,'language rerender must carry its captured scroll directive');
assert.match(sw,/v34-marine-dashboard/);
console.log('MeteoCompare Web settings scroll stability tests: OK');
