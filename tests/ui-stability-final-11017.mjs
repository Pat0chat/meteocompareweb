import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const version=read('VERSION').trim(),app=read('js/app.js'),css=read('styles.css'),comparison=read('js/features/comparison.js'),sw=read('sw.js');
assert.ok(version.localeCompare('1.10.17',undefined,{numeric:true,sensitivity:'base'})>=0);
assert.match(sw,/APP_VERSION = '\d+\.\d+\.\d+'/);

// Folding is a city-detail interaction only; Settings/Data/About cards stay static.
const enhance=app.slice(app.indexOf('function enhanceCollapsibleCards'),app.indexOf('function pwaInstallGuidance'));
assert.match(enhance,/state\.route\.name==='city'/);
assert.doesNotMatch(enhance,/state\.route\.name==='settings'/);
assert.doesNotMatch(enhance,/state\.route\.name==='data'/);
assert.doesNotMatch(enhance,/state\.route\.name==='about'/);

// Settings controls fill equal-height grid tracks without fake content spacers.
assert.match(css,/\.settings-control-grid\s*\{[^}]*align-items:stretch/s);
assert.match(css,/\.settings-control-grid\s*>\s*\.setting-control\s*\{[^}]*align-self:stretch/s);
assert.doesNotMatch(css,/\.setting-control[^}]*height:\s*100%/);

// Home watch signals are real actions and open the relevant city.
assert.match(app,/data-action="open-watch-city" data-city-id=/);
assert.match(app,/action==='open-watch-city'/);
assert.match(app,/action==='open-watch-city'[\s\S]*goCity\(id\)/);

// Home model-spread wording stays explicit in all supported languages.
const expected={fr:['Dispersion de la température par modèle','Prévision {value}°'],en:['Temperature spread by model','Forecast {value}°'],es:['Dispersión de temperatura por modelo','Previsión {value}°'],de:['Temperaturstreuung nach Modell','Prognose {value}°'],it:['Dispersione temperatura per modello','Previsione {value}°']};
for(const [lang,[title,central]] of Object.entries(expected)){
  const locale=read(`js/locales/${lang}.js`);
  assert.ok(locale.includes(`"homeConsensusTitleShort":"${title}"`),`${lang}: dispersion wording`);
  assert.ok(locale.includes(`"homeConsensusCentralShort":"${central}"`),`${lang}: forecast wording`);
}

// Back actions never overlap the topbar. City back is below/sibling of nav; other pages use page-level back.
assert.doesNotMatch(app,/class="topbar-back"/);
assert.match(app,/function renderPageBack\(\)/);
assert.match(app,/<\/nav><\/div><button class="detail-back-button detail-sidebar-back"/);
assert.match(css,/\.page-back-shell\s*\{/);
assert.match(css,/\.detail-sidebar\s*>\s*\.detail-sidebar-back\s*\{/);

// Targeted model comparison is no longer a nested native details element.
assert.doesNotMatch(comparison,/<details class="target-compare"/);
assert.match(comparison,/data-action="toggle-target-compare"/);
assert.match(comparison,/data-open="\$\{isOpen\?'true':'false'\}"/);
assert.match(app,/action==='toggle-target-compare'/);
const compareHandler=app.slice(app.indexOf('if(target.dataset.compareModel)'),app.indexOf('if(target.dataset.exportFormat)'));
assert.match(compareHandler,/rerenderTargetedComparisonPanel\(\)/);
assert.doesNotMatch(compareHandler,/rerenderCitySectionOrPage\('details'\)|render\(/);

console.log('MeteoCompare Web 1.10.17 final UI stability: OK');
