import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const version=read('VERSION').trim();
const versionJs=read('js/version.js');
const sw=read('sw.js');
const app=read('js/app.js');
const css=read('styles.css');

assert.ok(/^1\.10\.(?:1[2-9]|[2-9]\d+)$/.test(version));
assert.ok(versionJs.includes(`APP_VERSION = '${version}'`));
assert.ok(sw.includes(`APP_VERSION = '${version}'`));
assert.match(sw,/CACHE_VERSION = 'v\d+[-a-z0-9]+'/);

// Settings must use intrinsic flow: no fake spacer tracks or auto-pushed actions.
assert.match(css,/\.settings-control-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)[^}]*width:100%/);
assert.match(css,/\.settings-control-grid\s*\{[^}]*align-items:stretch/s,'settings controls on one row must share height');
assert.match(css,/\.setting-control\{[\s\S]*display:grid;[\s\S]*gap:10px;[\s\S]*align-content:start;/);
assert.doesNotMatch(css,/\.setting-control[^}]*height:\s*100%/);
assert.doesNotMatch(css,/\.setting-control\s*>\s*\.option-row[^}]*margin-top:\s*auto/);
assert.doesNotMatch(css,/\.setting-control\s*>\s*p[^}]*min-height:\s*3\.05em/);
const weighting=app.match(/<div class="setting-control"><h3>\$\{esc\(t\('localWeightedConsensus'\)\)\}[\s\S]*?<\/div><\/div><\/section>/)?.[0]||'';
assert.ok(weighting.indexOf('class="option-row"')>=0 && weighting.indexOf('<small>')>weighting.indexOf('class="option-row"'),'local weighting note must follow the actions');

// The merged city context bar must leave no dead runtime/CSS machinery.
assert.doesNotMatch(app,/querySelector\?\.\('\.city-context-bar'\)/);
assert.doesNotMatch(css,/--city-context-height|\.city-context-bar\s*\{/);
assert.match(css,/\.detail-sidebar\s*\{[\s\S]*top:\s*calc\(var\(--topbar-height\) \+ var\(--sticky-context-gap\)\)/);

// Known dead helpers removed during the release clean.
for(const token of ['deleteMarine','cityNowLocal','nearestIndex','dailyMatrix','reliabilityRanking','formatWindDirection','weightedMean','RELEASE_CHANNEL','analyticsOptOutKey','COVERAGE_LABELS','loadedLanguages']){
  const runtime=['js/app.js','js/storage.js','js/domain.js','js/consensus.js','js/models.js','js/i18n.js','js/analytics.js','js/version.js'].map(read).join('\n');
  assert.doesNotMatch(runtime,new RegExp(`\\b${token}\\b`),`dead runtime symbol remains: ${token}`);
}

// Runtime source contains no debug leftovers and every relative module import resolves.
const runtimeFiles=[];
for(const dir of ['js','js/features','js/locales']){
  for(const name of fs.readdirSync(path.join(root,dir))) if(name.endsWith('.js')) runtimeFiles.push(path.join(dir,name));
}
for(const rel of runtimeFiles){
  const src=read(rel);
  assert.doesNotMatch(src,/\b(?:TODO|FIXME|HACK|debugger)\b|console\.(?:log|debug)\s*\(/,`${rel}: debug marker left in runtime`);
  for(const match of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){
    const target=path.resolve(path.dirname(path.join(root,rel)),match[1]);
    assert.ok(fs.existsSync(target),`${rel}: unresolved import ${match[1]}`);
  }
}

// Every service-worker shell asset must exist locally (except './', which aliases index.html).
const shell=sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1]||'';
for(const m of shell.matchAll(/'\.\/([^']*)'/g)){
  const rel=m[1]||'index.html';
  assert.ok(fs.existsSync(path.join(root,rel)),`missing PWA shell asset ${rel}`);
}

console.log('MeteoCompare Web release clean 1.10.12: OK');
