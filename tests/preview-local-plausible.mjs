import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePreviewHtml } from '../tools/preview-html.mjs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.doesNotMatch(html,/<script[^>]+src=["']\/?_mcx\/p\.js/,'Plausible proxy must not be loaded statically on every host');
assert.match(html,/host==='meteocompare\.app'/,'tracker loading must be production-host gated');
assert.match(html,/script\.src='\.\/_mcx\/p\.js'/,'production host dynamically loads the first-party proxy');
const preview=preparePreviewHtml(html);
assert.equal(preview,html,'preview no longer needs to rewrite production HTML');
console.log('MeteoCompare local preview Plausible isolation: OK');
