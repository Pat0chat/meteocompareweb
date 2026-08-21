import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js'),app=read('js/app.js'),css=read('styles.css');

assert.equal(version,'1.14.0');
assert.ok(versionJs.includes("APP_VERSION = '1.14.0'"));
assert.match(sw,/APP_VERSION = '1\.14\.0'/);
assert.ok(Number(sw.match(/CACHE_VERSION = 'v(\d+)/)?.[1]||0)>=67,'1.14.0 cache generation must not regress below v67');

assert.match(app,/home-empty-logo[^>]+src="\$\{attr\(appAssetUrl\('assets\/icon\.png'\)\)\}"/,'empty home must use the MeteoCompare application icon');
assert.match(css,/\.home-empty \.home-empty-logo-wrap\s*\{[^}]*place-items:center/s,'empty home icon host must be centered');
assert.doesNotMatch(app,/home-empty[^`]+weatherIcons\.render\('RAIN_SHOWERS'/s,'empty home must no longer render a weather glyph');

assert.doesNotMatch(app,/overview-primary">\$\{renderTodaySummary\([^}]+\)\}\$\{renderInsights/s,'À retenir must be outside overview-primary');
assert.doesNotMatch(app,/overview-secondary">[^<]*\$\{renderInsights/s,'À retenir must be outside overview-secondary');
assert.match(app,/overview-layout[^`]+renderTodaySummary[^`]+overview-secondary[^`]+renderGlobalAgreementCard[^`]+renderScenarios[^`]+<\/div><\/div>\$\{renderInsights\(f,evolution,consensusWeights\)\}/s,'À retenir must render immediately after overview-layout');
assert.match(app,/class="section insights-section insights-section-wide" id="insights"/);
assert.match(css,/\.insights-section-wide\s*\{[^}]*width:100%/s,'À retenir section must use the full detail-main width');

assert.match(app,/class="insight-item \$\{x===lead\?'lead':''\} \$\{x\.kind\} tone-\$\{x\.tone\}"/,'insight cards must expose priority/tone styling');
assert.match(app,/class="insight-facts"/,'insights must include factual metric blocks');
assert.match(app,/insightsMetricConvergence/,'convergence must enrich insight evidence');
assert.match(app,/insightsMetricProbability/,'rain probability must enrich insight evidence');
assert.match(app,/insightsMetricGusts/,'gust information must enrich wind insight evidence');
assert.match(app,/insightsMetricAmplitude/,'forecast revisions must expose their amplitude');
assert.match(css,/\.insight-item\.lead\s*\{[^}]*grid-column:1 \/ -1/s,'lead takeaway spans the internal card width');
assert.match(css,/\.insight-item\.lead \.insight-facts\s*\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s,'lead takeaway uses the available full width for evidence');

for(const locale of ['fr','en','es','de','it']){
  const text=read(`js/locales/${locale}.js`);
  for(const key of ['insightsKicker','insightsSummaryMeta','insightsPriorityLead','insightsMetricConvergence','insightsMetricProbability','insightsMetricAmplitude']){
    assert.ok(text.includes(`"${key}"`),`${locale} missing ${key}`);
  }
}

console.log('MeteoCompare Web 1.14.0 full-width enriched insights: OK');
