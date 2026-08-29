import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(css,/@media\(max-width:560px\)\{[\s\S]*?\.global-agreement-head\{display:flex;flex-direction:column;align-items:flex-start;/,'mobile model convergence header must stack vertically');
assert.match(css,/\.global-agreement-card \.weighted-consensus\{display:flex;flex-direction:column;align-items:flex-start;/,'historical reliability must stack below convergence on mobile');
assert.match(css,/\.global-agreement-card \.global-agreement-value\{[^}]*text-align:left;/,'mobile convergence value must not be squeezed into a right-hand column');
console.log('Mobile global convergence card: OK');
