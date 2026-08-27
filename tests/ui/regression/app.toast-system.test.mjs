import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../../index.html',import.meta.url),'utf8');

assert.match(html,/id="toast-root"[^>]*aria-live="polite"[^>]*aria-atomic="false"/,'toast stack must expose a polite non-atomic live region');
assert.match(app,/const toastTimers=new Map\(\)/,'toast lifecycle must manage timers');
assert.match(app,/function dismissToast\(id\)/,'toasts must be dismissible');
assert.match(app,/\['success','warning','error','loading','info'\]/,'toast variants must include status and progress states');
assert.match(app,/options\.id\|\|`toast-/,'toast calls must support stable IDs so long operations update one notification');
assert.match(app,/historyRefreshProgress[\s\S]*id:toastId,type:'loading'/,'archive refresh must update its loading toast during progress');
assert.match(app,/connectionRestored[\s\S]*network-status[\s\S]*connectionLost/,'network state changes must surface through the toast system');
assert.match(app,/refreshCityWithToast/,'manual weather refresh must have lifecycle feedback');
assert.match(css,/\.toast-success\s*\{/);
assert.match(css,/\.toast-warning\s*\{/);
assert.match(css,/\.toast-error\s*\{/);
assert.match(css,/\.toast-loading/);
assert.match(css,/@media \(prefers-reduced-motion: reduce\)/,'toast animations must respect reduced-motion preferences');

console.log('Toast notification system lifecycle and accessibility: OK');
