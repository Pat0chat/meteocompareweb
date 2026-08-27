import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
assert.doesNotMatch(css,/(^|[;{\s])r:\s*\d+(?:\.\d+)?\s*;/m);
assert.doesNotMatch(css,/\btext-wrap\s*:/);
assert.match(css,/\.chart-point:hover\s*\{[^}]*r:\s*5\.8px;/s);
assert.match(css,/\.compare-point:hover\s*\{[^}]*r:\s*5\.6px;/s);
assert.match(css,/\.bias-point:hover\s*\{[^}]*r:\s*5\.8px;/s);
console.log('Reported CSS browser compatibility regressions: OK');
