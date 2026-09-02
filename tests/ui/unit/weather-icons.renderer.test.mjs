import assert from 'node:assert/strict';
import { WeatherIconRenderer, weatherIcons } from '../../../js/ui/weather-icons.js';

assert.ok(weatherIcons instanceof WeatherIconRenderer);
const renderer=new WeatherIconRenderer();
const clear=renderer.render('CLEAR',{size:'large',animated:true,className:'custom'});
assert.match(clear,/class="wx-icon wx-clear wx-size-large wx-animated custom"/);
assert.match(clear,/aria-hidden="true"/);
assert.match(clear,/focusable="false"/);
assert.match(clear,/data-center="optical"/);
assert.match(clear,/transform="translate\(6 8\)"/,'standalone sun must retain its optical centering correction');

const unknown=renderer.render('NOT_A_CONDITION');
assert.match(unknown,/wx-unknown/);
assert.match(unknown,/wx-question/);
const wind=renderer.renderMetric('wind',{size:'micro'});
assert.match(wind,/wx-metric-wind/);
assert.match(wind,/wx-size-micro/);
const probability=renderer.renderMetric('precipitation-probability',{size:'micro'});
const amount=renderer.renderMetric('precipitation-amount',{size:'micro'});
const gust=renderer.renderMetric('gust',{size:'micro'});
assert.match(probability,/wx-metric-percent/,'rain probability must use a percent-in-drop glyph');
assert.match(amount,/wx-metric-rain-gauge/,'probabilistic accumulation must use a graduated rain gauge');
assert.match(gust,/wx-gust-lines/,'gusts must use directional speed lines');
assert.notEqual(probability,amount,'rain probability and accumulation glyphs must remain distinct');
assert.notEqual(wind,gust,'wind and gust glyphs must remain distinct');
const fallbackMetric=renderer.renderMetric('does-not-exist');
assert.match(fallbackMetric,/wx-metric-does-not-exist/);
assert.match(fallbackMetric,/wx-metric-cloud-shape/,'unknown metric artwork must gracefully fall back to a cloud glyph');
const showers=renderer.renderScenario('SHOWERS');
assert.match(showers,/wx-rain-showers/);
const unknownScenario=renderer.renderScenario('ALIEN');
assert.match(unknownScenario,/wx-unknown/);

console.log('Weather icon renderer fallbacks and semantics: OK');
