import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ApplicationKernel } from '../../../js/core/application-kernel.js';
import { FeatureRegistry } from '../../../js/core/feature-registry.js';
import { OperationRegistry } from '../../../js/core/cache-registry.js';
import { WeatherIconRenderer } from '../../../js/ui/weather-icons.js';
import { APP_VERSION } from '../../../js/version.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const version=APP_VERSION,versionJs=read('js/version.js'),app=read('js/app.js'),css=read('styles.css'),html=read('index.html'),sw=read('sw.js');
assert.ok(/^\d+\.\d+\.\d+$/.test(version));
assert.ok(versionJs.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.ok(sw.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');

const csp=html.match(/Content-Security-Policy" content="([^"]+)/)?.[1]||'';
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const inlineScripts=scripts.filter(match=>!match[1].includes('src='));
assert.equal(inlineScripts.length,0,'all executable JavaScript should live in external modules');
assert.ok(scripts.some(match=>/src="js\/plausible-bootstrap\.js"/.test(match[1])),'external Plausible bootstrap must be loaded');
assert.ok(csp.includes(`script-src 'self'`),'script-src must restrict scripts to same-origin modules');
assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/,'scripts must not use unsafe-inline');

const icons=new WeatherIconRenderer();
const clear=icons.render('CLEAR',{animated:true}),rain=icons.render('RAIN',{animated:true}),snow=icons.render('SNOW',{animated:true}),fog=icons.render('FOG',{animated:true});
assert.match(clear,/wx-sun-halo/);assert.match(clear,/wx-sun-shine/);
assert.match(rain,/wx-cloud-shadow/);assert.match(rain,/wx-cloud-highlight/);assert.match(rain,/wx-drop-4/);
assert.match(snow,/wx-flake-1/);assert.match(snow,/wx-flake-3/);
assert.match(fog,/wx-fog-1/);assert.match(fog,/wx-fog-3/);
assert.match(css,/\.wx-animated \.wx-rain \.wx-drop/);
assert.match(css,/@keyframes wx-sun-breathe/);
assert.match(css,/@keyframes wx-bolt-flash/);
assert.match(css,/\.home-weather-icon \.wx-icon \{ width:58px; height:58px; \}/);
assert.match(css,/\.summary-weather-icon \.wx-icon \{ width:62px; height:62px; \}/);
assert.match(css,/\.scenario-icon \.wx-icon \{ width:2\.15rem; height:2\.15rem; \}/);
assert.match(css,/\.timeline-condition \.condition-icon \.wx-icon \{ width:2\.15rem; height:2\.15rem; \}/);
assert.match(css,/\.forecast-table td \.condition-icon \.wx-icon \{ width:1\.95rem; height:1\.95rem; \}/);
assert.match(css,/\.home-mini-rain[\s\S]*margin-block:2px 3px/);
assert.match(app,/aggregateConditionMarkup\(now\.condition\?now:day,'normal',true\)/);
assert.match(app,/aggregateConditionMarkup\(now\.condition\?now:agg,'normal',true\)/);

// Architecture regression: patch release must retain the 1.12 composition and async safety contracts.
assert.match(app,/new ApplicationKernel\(/);
const ops=new OperationRegistry(),first=ops.begin('city'),second=ops.begin('city');
assert.equal(ops.isCurrent('city',first),false);assert.equal(ops.isCurrent('city',second),true);
let loads=0;const registry=new FeatureRegistry({demo:async()=>{loads++;return {ok:true};}});await Promise.all([registry.load('demo'),registry.load('demo')]);assert.equal(loads,1);
const kernel=new ApplicationKernel({settings:{},cities:[],route:{name:'home'},online:true,featureLoaders:{},analysisLoaders:{bias:()=>null,evolution:()=>null,normals:()=>null,marine:()=>null,health:()=>[]}});
assert.equal(kernel.state.route.name,'home');assert.ok(kernel.operations.weather instanceof OperationRegistry);assert.ok(kernel.cache.forecastViews instanceof WeakMap);

console.log('tests/architecture/regression/application-kernel.security-icons.test.mjs: OK');
