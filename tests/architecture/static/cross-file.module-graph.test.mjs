import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../../js/version.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const legacyCatalog=path.join(root,'js/android_strings.js');
assert.ok(!fs.existsSync(legacyCatalog),'legacy monolithic translation catalog must not remain in runtime JS; delete js/android_strings.js');
const jsFiles=walk(path.join(root,'js')).filter(file=>file.endsWith('.js'));
const rel=file=>path.relative(root,file).replaceAll(path.sep,'/');
const browserJsFiles=jsFiles.filter(file=>!rel(file).startsWith('js/server/'));
const serverJsFiles=jsFiles.filter(file=>rel(file).startsWith('js/server/'));
const graph=new Map();
const importRe=/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
for(const file of jsFiles){
  const source=fs.readFileSync(file,'utf8'),edges=[];let match;
  while((match=importRe.exec(source))){
    const spec=match[1];if(!spec.startsWith('.'))continue;
    const target=path.resolve(path.dirname(file),spec);assert.ok(fs.existsSync(target),`${rel(file)} imports missing ${spec}`);
    if(target.startsWith(path.join(root,'js')))edges.push(target);
  }
  graph.set(file,edges);
}
// Runtime modules are intentionally acyclic: dependency direction stays data/core -> domain/features -> app.
const visiting=new Set(),visited=new Set();
function visit(file,stack=[]){if(visiting.has(file))assert.fail(`cyclic runtime import: ${[...stack,rel(file)].join(' -> ')}`);if(visited.has(file))return;visiting.add(file);for(const next of graph.get(file)||[])visit(next,[...stack,rel(file)]);visiting.delete(file);visited.add(file);}
for(const file of jsFiles)visit(file);

const sw=read('sw.js'),shellBlock=sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1]||'';
const shell=[...shellBlock.matchAll(/['"](\.\/[^'"]+)['"]/g)].map(m=>m[1]);
assert.ok(shell.length>20,'PWA shell must enumerate runtime assets');
for(const item of shell){if(item==='./')continue;assert.ok(fs.existsSync(path.join(root,item.slice(2))),`service-worker shell asset missing: ${item}`);}
for(const file of browserJsFiles){const item='./'+rel(file);assert.ok(shell.includes(item),`browser runtime JS omitted from offline shell: ${item}`);}
for(const file of serverJsFiles){const item='./'+rel(file);assert.ok(!shell.includes(item),`server-only JS must not be exposed in the offline shell: ${item}`);}

const html=read('index.html'),scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length,2,'only the Plausible bootstrap + MeteoCompare app scripts are expected');
assert.ok(scripts.every(([_,attrs,body])=>attrs.includes('src=')&&!body.trim()),'all static scripts must be external modules with no inline body');
const plausibleScript=scripts.find(([_,attrs])=>/src="\/?js\/plausible-bootstrap\.js"/.test(attrs));
assert.ok(plausibleScript,'external Plausible bootstrap must be present');
const plausibleBootstrap=read('js/plausible-bootstrap.js');assert.match(plausibleBootstrap,/autoCapturePageviews:\s*false/);assert.match(plausibleBootstrap,/ANALYTICS_CONFIG\.scriptSrc/);assert.match(plausibleBootstrap,/allowedHosts\.includes\(host\)/);
const appScript=scripts.find(([_,attrs])=>/src="\/?js\/app\.js"/.test(attrs));
assert.ok(appScript,'application module script must be present');assert.match(appScript[1],/type="module"/);assert.equal(appScript[2].trim(),'','no application inline script expected');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'static HTML IDs must be unique');
const csp=html.match(/Content-Security-Policy" content="([^"]+)/)?.[1]||'';assert.match(csp,/default-src 'self'/);assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/base-uri 'self'/);

for(const file of walk(root).filter(f=>/manifest(?:\.[a-z]{2})?\.webmanifest$/.test(f))){const value=JSON.parse(fs.readFileSync(file,'utf8'));assert.ok(value.name);assert.match(value.start_url||'',/^\.\//);}

const css=read('styles.css');
assert.doesNotMatch(css,/expression\s*\(|javascript\s*:/i,'CSS must not contain executable legacy expressions');
// Lightweight lexer: comments/quoted strings are ignored before checking brace balance.
const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');let depth=0;for(const char of stripped){if(char==='{')depth++;if(char==='}')depth--;assert.ok(depth>=0,'CSS closes a block before it opens');}assert.equal(depth,0,'CSS block braces must balance');

for(const file of jsFiles){const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/\b(?:TODO|FIXME|HACK|debugger)\b|console\.(?:log|debug)\s*\(/,`${rel(file)} contains a debug/debt marker`);}

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
console.log(`MeteoCompare Web ${APP_VERSION} source audit: OK (${browserJsFiles.length} browser JS modules, ${serverJsFiles.length} server JS modules, ${shell.length} shell assets)`);
