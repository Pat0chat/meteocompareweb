import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const fr=fs.readFileSync(new URL('../../../js/locales/fr.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');

assert.match(app,/modelGaps=models\.map\(/,'reliability refresh plan must retain gaps per model');
assert.match(app,/observationMissingDays:/,'ERA5/reference gaps must be tracked separately');
assert.match(app,/lastRefreshReport=\{completedAt:/,'a successful archive attempt must be persisted independently from completeness');
assert.match(app,/biasRefreshReportMatchesPlan\(history\.lastRefreshReport,plan\)/,'Settings must distinguish an attempted incomplete archive from a never-requested gap');
assert.match(app,/historyRequestSucceeded/,'Settings must explicitly state when the archive request itself succeeded');
assert.match(app,/historyUnavailableDetails/,'remaining model/archive gaps must be explained to the user');
assert.match(app,/retryUnavailable/,'partial archive coverage must offer an explicit retry action');
assert.match(fr,/"historyArchiveGapExplanation":"[^"]+archives[^"]+données déjà récupérées[^\"]+"/i,'French copy must explain that archive gaps can remain after a successful request');
assert.match(css,/\.history-refresh-result\s*\{/,'partial-history explanation needs a dedicated visual treatment');

console.log('Reliability archive feedback and residual-gap semantics: OK');
