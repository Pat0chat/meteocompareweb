import assert from 'node:assert/strict';
import fs from 'node:fs';

// This test intentionally avoids requiring a real repository name: all site URLs must be relative
// so the same artifact works at https://user.github.io/repository/ and on a custom domain.
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const html=read('index.html'), manifest=JSON.parse(read('manifest.webmanifest')), app=read('js/app.js'), sw=read('sw.js');
const workflowText=read('.github/workflows/pages.yml');

assert.doesNotMatch(html,/\b(?:src|href)="\//,'HTML assets must not assume domain-root hosting');
assert.equal(manifest.start_url,'./#/');
assert.equal(manifest.scope,'./');
assert.equal(manifest.id,'./');
assert.match(app,/serviceWorker\.register\('\.\/sw\.js'\)/,'service worker registration must stay relative to the repository subpath');
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
