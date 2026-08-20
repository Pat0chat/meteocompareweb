import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('js/app.js','utf8');
const version=fs.readFileSync('VERSION','utf8').trim();

assert.ok(version.localeCompare('1.10.17',undefined,{numeric:true,sensitivity:'base'})>=0);

// The basic TodaySummary must always remain visible and must not expose the generic card fold control.
const specs=app.slice(app.indexOf('function collapsibleCitySpecs'),app.indexOf('function decorateCollapsibleCard'));
assert.doesNotMatch(specs,/\['today-summary'/,'TodaySummary is core weather information and must not be foldable');

// Detailed forecasts contain their own targeted-model accordion: do not nest a second card accordion around it.
assert.doesNotMatch(specs,/\['details'/,'Detailed forecasts must not be wrapped in the generic collapsible-card system');
assert.match(app,/renderTargetedModelComparison\(f,tab,mode\)/,'Detailed forecasts must keep the targeted model comparison');
assert.match(app,/details\[data-target-compare\]/,'Targeted model comparison must keep its dedicated disclosure state');
assert.match(app,/state\.comparePanelOpen\[key\]=compareDetails\.open/,'Comparison disclosure state must be tracked independently');

// Model health has one disclosure mechanism only: its explicit diagnostic action.
assert.doesNotMatch(specs,/\['diagnostics'/,'Model health must not have a redundant generic fold button');
assert.match(app,/data-action="toggle-diagnostics"/,'Model health must keep the explicit open/close diagnostic action');
assert.match(app,/state\.diagnosticsOpen/,'Model health detailed state must remain explicit');

console.log('MeteoCompare Web detail interactions 1.10.17: OK');
