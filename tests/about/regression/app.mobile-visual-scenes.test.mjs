import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(css,/\.about-visual-step\{[^}]*min-width:0[^}]*max-width:100%[^}]*overflow:hidden/s,'About steps must be shrinkable inside the mobile viewport');
assert.match(css,/\.about-visual-step-scene\{[^}]*width:100%[^}]*max-width:100%[^}]*overflow:hidden/s,'About scenes must remain inside each step card');
assert.match(css,/@media\(max-width:640px\)[\s\S]*?\.about-method-flow\.about-visual-steps > \.about-visual-step\{\s*display:flex;\s*flex-direction:column;/,'mobile About steps must override the legacy two-column about-method-flow layout');
assert.match(css,/@media\(max-width:640px\)[\s\S]*?\.about-visual-radar-frames\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);\s*overflow:visible;/,'mobile radar explainer must reflow instead of overflowing horizontally');
console.log('mobile About visual scenes regression test passed');
