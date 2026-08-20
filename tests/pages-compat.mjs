import assert from 'node:assert/strict';
import fs from 'node:fs';

// Runtime assets remain repository-relative for legacy GitHub Pages compatibility.
// SEO canonical/navigation URLs may intentionally be domain-root paths for Cloudflare Pages.
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const html=read('index.html'), manifest=JSON.parse(read('manifest.webmanifest')), app=read('js/app.js'), sw=read('sw.js');
const workflowText=read('.github/workflows/pages.yml');

assert.doesNotMatch(html,/\bsrc="\//,'HTML script/image assets must not assume domain-root hosting');
assert.match(html,/<link rel="stylesheet" href="styles\.css"/);
assert.match(html,/<link rel="manifest" href="manifest\.webmanifest"/);
assert.equal(manifest.start_url,'./#/');
assert.equal(manifest.scope,'./');
assert.equal(manifest.id,'./');
assert.match(app,/serviceWorker\.register\(appAssetUrl\('sw\.js'\)\)/,'service worker registration must resolve from the application module root');
assert.match(sw,/['"]\.\/index\.html['"]/,'service worker shell paths must be relative');
assert.ok(fs.existsSync(new URL('../.nojekyll',import.meta.url)),'branch-based Pages publishing should include .nojekyll');
assert.match(workflowText,/actions\/configure-pages@v6/);
assert.match(workflowText,/actions\/upload-pages-artifact@v5\.0\.0/);
assert.match(workflowText,/actions\/deploy-pages@v5\.0\.0/);

// Minimal YAML structure check without depending on GitHub itself.
// PyYAML is used by the project audit command; here, basic indentation/action checks are enough in Node.
assert.match(workflowText,/permissions:[\s\S]*pages:\s*write[\s\S]*id-token:\s*write/);
assert.match(workflowText,/environment:[\s\S]*name:\s*github-pages/);
console.log('MeteoCompare Web GitHub Pages compatibility tests: OK');
