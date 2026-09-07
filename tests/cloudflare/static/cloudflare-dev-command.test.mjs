import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../../../package.json',import.meta.url),'utf8'));
const tool=fs.readFileSync(new URL('../../../tools/cloudflare-dev.mjs',import.meta.url),'utf8');
const audit=fs.readFileSync(new URL('../../../tools/release-audit.mjs',import.meta.url),'utf8');
const gitignore=fs.readFileSync(new URL('../../../.gitignore',import.meta.url),'utf8');

assert.match(pkg.scripts.cloudflare,/^node tools\/cloudflare-dev\.mjs && npx --yes wrangler@latest dev/);
assert.match(tool,/build-site\.mjs/,'cloudflare command must build dist before starting Wrangler');
assert.match(pkg.scripts.cloudflare,/wrangler@latest/,'cloudflare command must run Wrangler through npm shell');
assert.match(pkg.scripts.cloudflare,/--local/,'cloudflare command must force local Workers mode');
assert.match(pkg.scripts.cloudflare,/--port 8787/,'cloudflare command must pin the analytics-aware local port');
assert.match(pkg.scripts.cloudflare,/--persist-to \.wrangler\/state/,'Durable Object data should survive local restarts');
assert.doesNotMatch(pkg.scripts.cloudflare,/infer-origin-from-routes/,'cloudflare command must not depend on Wrangler flags that are not portable across current releases');
assert.match(tool,/\.dev\.vars/,'local admin secrets must be provisioned through .dev.vars');
assert.match(gitignore,/^\.dev\.vars\*$/m,'all local Wrangler dev-var variants must be ignored by Git');
assert.match(audit,/\.dev\.vars/,'release audit must explicitly handle local Cloudflare dev secrets');
assert.match(audit,/Local secrets leaked into production build/,'release audit must reject local secrets if they leak into dist');
