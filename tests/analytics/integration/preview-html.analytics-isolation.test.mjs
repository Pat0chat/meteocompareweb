import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePreviewHtml } from '../../../tools/preview-html.mjs';

const html=fs.readFileSync(new URL('../../../index.html',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../../../js/plausible-bootstrap.js',import.meta.url),'utf8');
assert.doesNotMatch(html,/<script[^>]+src=["']\/?_mcx\/p\.js/,'Plausible proxy must not be loaded statically on every host');
assert.match(bootstrap,/allowedHosts\.includes\(host\)/,'tracker loading must be production-host gated');
assert.match(bootstrap,/ANALYTICS_CONFIG\.scriptSrc/,'production host dynamically loads the configured first-party proxy');
const preview=preparePreviewHtml(html);
assert.equal(preview,html,'preview no longer needs to rewrite production HTML');
console.log('MeteoCompare local preview Plausible isolation: OK');
