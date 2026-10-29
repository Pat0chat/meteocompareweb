import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
const home=app.slice(app.indexOf('function renderCityCard(city){'),app.indexOf('function renderCityComparisonLazy('));
assert.match(app,/function cityLocationLine\(city\)[\s\S]*?citySearchLocationLabel\(localize\(city\),state\.cities\.map\(localize\)\)/,'use the search hierarchy for favorite locations, disambiguated against the saved cities');
assert.match(app,/country:localizedCountryName\(c\)/,'display country based on active language');
assert.equal((home.match(/esc\(homeCityPlaceLine\(city\)\)/g)||[]).length,2,'both loaded and unloaded home cards display a safe detailed location');
assert.match(app,/function placeLine\(c\)\{return cityLocationLine\(c\);\}/,'detail pages use the same formatter as home');
for(const fragment of [
  'function graphicForecastHeader(', 'function renderCityDetail('
]) { // Detail and graphic views must both continue to route through placeLine.
  const index=app.indexOf(fragment);
  assert.ok(index>=0,`${fragment} exists`);
}
assert.ok((app.match(/esc\(placeLine\(city\)\)/g)||[]).length>=3,'detail, loading and chart headers escape the location text');
assert.match(css,/\.home-city-head > div:first-child \{ min-width:0; flex:1 1 auto; \}/,'card text does not overlap menu');
assert.match(css,/\.home-city-head p \{[^}]*overflow-wrap:anywhere;/,'long location labels can wrap on mobile cards');
assert.match(css,/\.detail-title > p \{[^}]*overflow-wrap: anywhere;/,'details wrap long administrative names');
assert.match(css,/\.graphic-header-city p \{[^}]*-webkit-line-clamp:2;/,'graphic header accommodates detailed labels');
console.log('Home/detail/chart location hierarchy and small-screen wrapping: OK');
