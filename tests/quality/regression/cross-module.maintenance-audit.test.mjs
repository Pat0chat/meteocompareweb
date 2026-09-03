import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../../../js/version.js';
import { forecastEngineContinuous, forecastEnginePrecipitation } from '../../../js/forecast-engines.js';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const marine=read('js/features/marine.js');
const app=read('js/app.js');
const storage=read('js/storage.js');
const budget=read('js/api-budget.js');
const css=read('styles.css');
const html=read('index.html');

// Marine: capability detection and actual activation must use the same reliable
// explicit wave sources whenever best_match cannot provide a usable coastal grid.
assert.match(marine,/CAPABILITY_MODELS=\['meteofrance_wave','ncep_gfswave025'\]/);
assert.match(marine,/async function fetchExplicitWaveForCity[\s\S]*waveUrlFor\(city,model\)[\s\S]*if\(availability\.available===true\)return normalized/);
assert.match(marine,/probeMarineAvailability[\s\S]*if\(result\.available===false\)[\s\S]*continue/,'a distant first model must not prevent probing the fallback model');
assert.match(marine,/fetchMarineForCity[\s\S]*if\(primary\.coastal&&primary\.usablePoints>=6\)return primary;[\s\S]*fetchExplicitWaveForCity[\s\S]*mergeWaveFallback/,'full marine activation must share the reliable explicit-wave fallback');
assert.match(app,/marineCacheFresh\(cached\)[\s\S]*!\(activate&&cached\.coastal!==true\)[\s\S]*!\(city\.marineAvailable===true&&cached\.coastal!==true\)/,'a stale negative marine cache must not override a positive capability probe');

// Local persistence: startup reads must be guarded, not only writes.
assert.match(storage,/function safeGet\(key\)[\s\S]*localStorage\.getItem\(key\)[\s\S]*LOCAL_STORAGE_UNAVAILABLE/);
assert.match(storage,/function readLocalRecord[\s\S]*safeParse\(safeGet\(key\),null\)/);
const directStorageReads=[...storage.matchAll(/localStorage\.getItem\(/g)].length;
assert.equal(directStorageReads,1,'all storage.js localStorage reads must go through safeGet');

// API budget: only the four active time buckets are retained, preventing an
// ever-growing minute/hour history in localStorage.
assert.match(budget,/active=new Set\(\[k\.minute,k\.hour,k\.day,k\.month\]\)/);
assert.match(budget,/if\(!active\.has\(key\)\)delete buckets\[key\]/);

// HTML/CSP and CSS cleanup invariants.
assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i,'production HTML must not reintroduce inline JavaScript');
assert.equal((css.match(/\.professional-hero::before/g)||[]).length,1,'dead historical hero pseudo-element layers must stay removed');
assert.equal((css.match(/\.professional-hero::after/g)||[]).length,1,'dead historical hero pseudo-element layers must stay removed');
assert.doesNotMatch(css,/\.detail-hero-actions \.detail-refresh-action\s*\{[^}]*width:\s*100%/s,'desktop refresh action must not regress to the historical full-width rule');

// Deterministic engine smoke/fuzz: ordering must not affect values, all outputs
// must remain finite/bounded, and caller-owned input rows must stay untouched.
let seed=0x1161;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
const engines=['MULTI_CONSENSUS','CALIBRATION','SCENARIOS','ADAPTIVE'];
const modelIds=['ARPEGE_EUROPE','ICON_EU','GFS','ECMWF','UKMO_GLOBAL','GEM_GLOBAL'];
for(let iteration=0;iteration<64;iteration++){
  const rows=modelIds.map((modelId,index)=>({modelId,value:-15+rand()*55+(index===5&&iteration%9===0?18:0)}));
  const snapshot=structuredClone(rows);
  for(const engine of engines){
    const forward=forecastEngineContinuous(rows,{engine,tight:.5,wide:3});
    const reverse=forecastEngineContinuous([...rows].reverse(),{engine,tight:.5,wide:3});
    assert.ok(Number.isFinite(forward.central),`${engine}: central must be finite`);
    assert.ok(Number.isFinite(forward.interval?.low)&&Number.isFinite(forward.interval?.high),`${engine}: interval must be finite`);
    assert.ok(forward.interval.low<=forward.central&&forward.central<=forward.interval.high,`${engine}: interval must contain central`);
    assert.equal(forward.central,reverse.central,`${engine}: result must be order invariant`);
  }
  assert.deepEqual(rows,snapshot,'forecast engines must not mutate source rows');

  const precipitation=modelIds.map(modelId=>({modelId,amount:rand()*25,probability:rand()*100}));
  const precipitationSnapshot=structuredClone(precipitation);
  for(const engine of engines){
    const result=forecastEnginePrecipitation(precipitation,{engine});
    const reversed=forecastEnginePrecipitation([...precipitation].reverse(),{engine});
    assert.ok(Number.isFinite(result.centralAmountMm)&&result.centralAmountMm>=0,`${engine}: rain amount must stay non-negative`);
    assert.ok(Number.isFinite(result.probabilityPercent)&&result.probabilityPercent>=0&&result.probabilityPercent<=100,`${engine}: rain probability must stay bounded`);
    assert.ok(result.interval.low<=result.centralAmountMm&&result.centralAmountMm<=result.interval.high,`${engine}: rain interval must contain the central amount`);
    assert.equal(result.centralAmountMm,reversed.centralAmountMm,`${engine}: rain result must be order invariant`);
    assert.equal(result.probabilityPercent,reversed.probabilityPercent,`${engine}: rain probability must be order invariant`);
  }
  assert.deepEqual(precipitation,precipitationSnapshot,'precipitation engines must not mutate source rows');
}

console.log(`MeteoCompare Web ${APP_VERSION} full maintenance audit: OK`);
