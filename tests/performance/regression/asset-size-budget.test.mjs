import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel));
const gzipSize=rel=>zlib.gzipSync(read(rel),{level:9}).byteLength;
const kib=bytes=>bytes/1024;

const budgets={
  'js/app.js':120*1024,
  'styles.css':75*1024,
  'js/locales/fr.js':40*1024,
  'js/locales/en.js':40*1024,
  'js/locales/es.js':40*1024,
  'js/locales/de.js':40*1024,
  'js/locales/it.js':40*1024,
};
for(const [file,budget] of Object.entries(budgets)){
  const size=gzipSize(file);
  assert.ok(size<=budget,`${file} gzip budget exceeded: ${kib(size).toFixed(1)} KiB > ${kib(budget).toFixed(1)} KiB`);
}

const sw=read('sw.js').toString('utf8');
const shellBlock=sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1]||'';
const shell=[...shellBlock.matchAll(/['"](\.\/[^'"]+)['"]/g)].map(m=>m[1]);
const coreBytes=shell.reduce((sum,item)=>{
  const rel=item==='./'?'index.html':item.slice(2);
  return fs.existsSync(path.join(root,rel))?sum+gzipSize(rel):sum;
},0);
assert.ok(coreBytes<=400*1024,`core PWA shell gzip budget exceeded: ${kib(coreBytes).toFixed(1)} KiB > 400 KiB`);
assert.ok(shell.length<=50,`core PWA shell request budget exceeded: ${shell.length} > 50 assets`);

console.log('Production asset-size budgets: OK',{
  app:`${kib(gzipSize('js/app.js')).toFixed(1)} KiB gzip`,
  css:`${kib(gzipSize('styles.css')).toFixed(1)} KiB gzip`,
  coreShell:`${kib(coreBytes).toFixed(1)} KiB gzip`,
  coreRequests:shell.length,
});
