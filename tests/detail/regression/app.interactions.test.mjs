import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../../../js/version.js';

const app=fs.readFileSync('js/app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const version=APP_VERSION;


// The basic TodaySummary must always remain visible and must not expose the generic card fold control.
const specs=app.slice(app.indexOf('function collapsibleCitySpecs'),app.indexOf('function decorateCollapsibleCard'));
assert.doesNotMatch(specs,/\['today-summary'/,'TodaySummary is core weather information and must not be foldable');

// Detailed forecasts may fold as a card, but their targeted-model disclosure keeps an independent state.
assert.match(specs,/\['details'/,'Detailed forecasts must be foldable at card level');
assert.match(app,/renderTargetedModelComparison\(f,tab,mode\)/,'Detailed forecasts must keep the targeted model comparison');
assert.match(app,/\[data-target-compare\]/,'Targeted model comparison must keep its dedicated disclosure state');
assert.match(app,/toggle-target-compare/,'Comparison disclosure must use an explicit controlled accordion');
assert.match(app,/state\.comparePanelOpen\[key\]=next/,'Comparison disclosure state must be tracked independently');
assert.match(css,/\.detailed-card\[data-collapsed=\"true\"\] \.detailed-export-actions \.btn/,'Detailed export buttons should hide with the folded card while keeping the collapse control available');
assert.match(css,/\.timeline-card\[data-collapsed=\"true\"\] \.timeline-mode/,'Timeline 24h/7d controls must hide when folded');

// Model health has one disclosure mechanism only: its explicit diagnostic action.
assert.doesNotMatch(specs,/\['diagnostics'/,'Model health must not have a redundant generic fold button');
assert.match(app,/data-action="toggle-diagnostics"/,'Model health must keep the explicit open/close diagnostic action');
assert.match(app,/state\.diagnosticsOpen/,'Model health detailed state must remain explicit');

console.log('tests/detail/regression/app.interactions.test.mjs: OK');
