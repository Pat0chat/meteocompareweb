import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePreviewHtml } from '../tools/preview-html.mjs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/https:\/\/plausible\.io\/js\/pa-m_Vcr9SLuhB7IFuIgpvGB\.js/,'production HTML must keep the official Plausible tracker');
const preview=preparePreviewHtml(html);
assert.doesNotMatch(preview,/src=["']https:\/\/plausible\.io\/js\/pa-m_Vcr9SLuhB7IFuIgpvGB\.js/,'local preview must not request the remote Plausible tracker');
assert.match(preview,/plausible\.init\(/,'local preview keeps the harmless bootstrap/init so application analytics code remains structurally identical');
console.log('MeteoCompare local preview Plausible isolation: OK');
