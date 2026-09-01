import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePreviewHtml } from '../../../tools/preview-html.mjs';

const html=fs.readFileSync(new URL('../../../index.html',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../../../js/mcx-events.js',import.meta.url),'utf8');
assert.doesNotMatch(html,/<script[^>]+src=["']\/?_mcx\/p\.js/,'no proxied Plausible tracker script should be loaded');
assert.match(bootstrap,/allowedHosts\.includes\(host\)/,'analytics transport must be production-host gated');
assert.match(bootstrap,/globalThis\.fetch\(ANALYTICS_CONFIG\.endpoint/,'production host sends through the configured first-party event endpoint');
assert.doesNotMatch(bootstrap,/createElement\(['"]script['"]\)/,'preview/bootstrap must not inject a remote tracker script');
const preview=preparePreviewHtml(html);
assert.equal(preview,html,'preview no longer needs to rewrite production HTML');
console.log('MeteoCompare local preview Plausible isolation: OK');
