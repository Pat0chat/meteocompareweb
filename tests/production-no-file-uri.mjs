import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=['index.html','styles.css',...fs.readdirSync(path.join(root,'js'),{recursive:true}).filter(name=>/\.(?:js|mjs)$/.test(name)).map(name=>path.join('js',name))];
for(const rel of files){
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  assert.doesNotMatch(source,/file:\/\//i,`${rel} must not expose a file:// URI to the production browser`);
}
console.log('MeteoCompare production browser sources contain no file:// URI: OK');
