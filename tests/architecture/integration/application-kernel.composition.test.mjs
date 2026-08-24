import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ApplicationKernel } from '../../../js/core/application-kernel.js';
import { FeatureRegistry } from '../../../js/core/feature-registry.js';
import { OperationRegistry } from '../../../js/core/cache-registry.js';
import { WeatherIconRenderer } from '../../../js/ui/weather-icons.js';
import { APP_VERSION } from '../../../js/version.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const version=APP_VERSION,versionJs=read('js/version.js'),app=read('js/app.js'),models=read('js/models.js'),css=read('styles.css'),sw=read('sw.js'),architecture=read('ARCHITECTURE.md');
const [major,minor]=version.split('.').map(Number);assert.ok(major>1||(major===1&&minor>=12),'1.12 object foundation must remain compatible in later releases');
assert.ok(versionJs.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.ok(sw.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');
for(const file of ['core/app-state.js','core/cache-registry.js','core/feature-registry.js','core/local-analysis-store.js','core/application-kernel.js','ui/weather-icons.js'])assert.ok(sw.includes(`./js/${file}`),`${file} missing from PWA shell`);

assert.match(app,/new ApplicationKernel\(/);
assert.match(app,/runtime\.operations/);
assert.match(app,/runtime\.features/);
assert.match(app,/runtime\.analysis/);
assert.match(architecture,/Composition runtime/);
assert.match(architecture,/domaine/i);assert.match(architecture,/persist/i);assert.match(architecture,/Présentation météo/);
assert.doesNotMatch(models,/icon:'(?:☀️|🌤️|⛅|☁️|🌫️|🌦️|🌧️|🌨️|❄️|🧊|⛈️|❔)'/,'weather presentation must not live in domain metadata');

const icons=new WeatherIconRenderer();
for(const condition of ['CLEAR','MAINLY_CLEAR','PARTLY_CLOUDY','OVERCAST','FOG','DRIZZLE','RAIN','FREEZING_RAIN','SNOW','RAIN_SHOWERS','SNOW_SHOWERS','THUNDERSTORM','UNKNOWN']){
  const svg=icons.render(condition);
  assert.match(svg,/^<svg class="wx-icon/);
  assert.ok(svg.includes('<path')||svg.includes('<circle'),`${condition} icon must contain vector geometry`);
}
assert.match(icons.render('RAIN',{animated:true}),/wx-animated/);
assert.doesNotMatch(icons.render('RAIN'),/wx-animated/);
assert.match(icons.renderMetric('wind'),/wx-metric-wind/);
assert.match(app,/conditionMarkup\(now\.condition\|\|day\.condition,'normal',[^\n]+,true\)/,'Home icon must request animation');
assert.match(app,/conditionMarkup\(now\.condition\|\|agg\.condition,'normal',[^\n]+,true\)/,'Today Summary icon must request animation');
assert.match(app,/weatherIcons\.render\(now\.condition\|\|agg\.condition,\{size:'large'\}\)/,'detail hero must use the shared vector icon system');
assert.match(css,/\.wx-icon\s*\{/);
assert.match(css,/\.wx-animated \.wx-rays/);
assert.match(css,/@keyframes wx-rain-fall/);
assert.match(css,/@media \(prefers-reduced-motion: reduce\)/,'reduced motion must remain supported');

const ops=new OperationRegistry(),token=ops.begin('city');
assert.equal(ops.isCurrent('city',token),true);ops.finish('city',token);assert.equal(ops.get('city'),undefined);
let loads=0;const registry=new FeatureRegistry({demo:async()=>{loads++;return {ok:true};}});const [a,b]=await Promise.all([registry.load('demo'),registry.load('demo')]);assert.equal(loads,1);assert.deepEqual(a,b);
const kernel=new ApplicationKernel({settings:{},cities:[],route:{name:'home'},online:true,featureLoaders:{},analysisLoaders:{bias:()=>null,evolution:()=>null,normals:()=>null,marine:()=>null,health:()=>[]}});
assert.equal(kernel.state.route.name,'home');assert.ok(kernel.cache.forecastViews instanceof WeakMap);assert.ok(kernel.operations.weather instanceof OperationRegistry);

console.log('Application kernel composition: OK');
