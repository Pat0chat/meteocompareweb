import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

assert.match(app,/rawMin=Number\.isFinite\(range\?\.\[0\]\)[\s\S]*?min=Number\.isFinite\(central\)&&Number\.isFinite\(rawMin\)\?Math\.min\(rawMin,central\):rawMin/,'the dispersion axis must include a finite central value such as 0 mm even when every model amount is above zero');
assert.match(app,/summary-dispersion-center" style="--center:\$\{pos\(central\)\}%/,'the black dispersion marker must use the central-value position');
assert.match(app,/summary-dispersion-scale" style="--center:\$\{pos\(central\)\}%/,'the displayed central value must receive the exact same position as the black marker');
assert.match(css,/\.summary-dispersion-scale strong \{[\s\S]*?left:var\(--center,50%\);[\s\S]*?transform:translateX\(-50%\)/,'the central value label must be anchored below the black marker instead of centered in the card');
assert.match(css,/\.summary-dispersion-scale span:first-child \{ left:0; \}/,'minimum label must stay attached to the left edge');
assert.match(css,/\.summary-dispersion-scale span:last-child \{ right:0; text-align:right; \}/,'maximum label must stay attached to the right edge');

console.log('Today summary dispersion central value follows its marker: OK');
