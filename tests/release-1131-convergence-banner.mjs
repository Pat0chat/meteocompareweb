import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../VERSION',import.meta.url),'utf8').trim();

assert.equal(version,'1.14.0','application version must stay unchanged');
assert.match(app,/banner info convergence-info-banner[^>]*><b>\$\{esc\(t\('agreementNotAccuracy'\)\)\}<\/b><span>\$\{esc\(t\('agreementNotAccuracyBody'\)\)\}<\/span>/,'top convergence info banner must stack its title and body');
assert.match(app,/banner info convergence-info-banner[^>]*><b>\$\{esc\(t\('reading'\)\)\} :<\/b><span>\$\{esc\(t\('disagreementReading'\)\)\}<\/span>/,'reading banner must stack its title and body');
assert.match(css,/\.convergence-info-banner\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-start;/s,'convergence banners must use a vertical flex layout');
assert.match(sw,/CACHE_VERSION = 'v74-plausible-seo-analytics'/,'PWA cache must refresh changed CSS/JS');
console.log('release-1131-convergence-banner: ok');
