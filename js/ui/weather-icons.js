const SVG_ATTR='viewBox="0 0 48 48" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"';

/*
 * MeteoCompare weather glyphs are deliberately presentation-only.
 * Domain modules expose semantic weather conditions; this renderer owns every
 * visual decision (geometry, detail level, animation hooks and metric glyphs).
 */
const SUN=`<g class="wx-sun">
  <circle cx="18" cy="16" r="10.5" class="wx-sun-halo"/>
  <g class="wx-rays"><path d="M18 2.8v4.1M18 25.1v4.1M4.8 16h4.1M27.1 16h4.1M8.7 6.7l2.9 2.9M24.4 22.4l2.9 2.9M27.3 6.7l-2.9 2.9M11.6 22.4l-2.9 2.9"/></g>
  <circle cx="18" cy="16" r="7" class="wx-sun-core"/>
  <path class="wx-sun-shine" d="M14.2 12.3c1.2-1.3 2.7-2 4.5-2.1"/>
</g>`;

const CLOUD=`<g class="wx-cloud wx-cloud-main">
  <path class="wx-cloud-shadow" d="M12.9 36.4h22.7c5 0 8.8-3.5 8.8-8.1 0-4.4-3.3-7.7-7.6-8.1C35.4 14.8 30.7 11 25 11c-6.1 0-11.1 4.4-12.2 10.1C8.2 21.7 5 24.9 5 29c0 4.2 3.4 7.4 7.9 7.4Z"/>
  <path class="wx-cloud-body" d="M12.9 34.9h22.7c4.3 0 7.5-2.9 7.5-6.7 0-3.9-3.2-6.7-7.2-6.7h-1.3C33.7 16.2 29.7 12.7 25 12.7c-5.5 0-9.9 4.2-10.3 9.6a8 8 0 0 0-2.1-.3c-3.7 0-6.6 2.8-6.6 6.4 0 3.7 2.9 6.5 6.9 6.5Z"/>
  <path class="wx-cloud-highlight" d="M13 25.5c1.1-1.1 2.5-1.7 4-1.7.6-4.2 3.7-7.1 7.7-7.4"/>
</g>`;

const SMALL_CLOUD=`<g class="wx-cloud wx-cloud-small">
  <path class="wx-cloud-shadow" d="M18 35.7h16.4c3.9 0 6.8-2.7 6.8-6.3 0-3.4-2.6-6-6-6.2-1-3.9-4.4-6.6-8.5-6.6-4.5 0-8.2 3.2-8.9 7.5-3.3.4-5.6 2.8-5.6 5.9 0 3.2 2.5 5.7 5.8 5.7Z"/>
  <path class="wx-cloud-body" d="M18.2 34.3h16.2c3.1 0 5.4-2.1 5.4-4.9 0-2.9-2.3-4.9-5.2-4.9h-1c-.7-3.7-3.5-6.2-6.9-6.2-4 0-7.2 3-7.5 7a5.8 5.8 0 0 0-1.5-.2c-2.7 0-4.8 2-4.8 4.6 0 2.6 2.1 4.6 5.3 4.6Z"/>
  <path class="wx-cloud-highlight" d="M18.8 27.3c.8-.8 1.7-1.1 2.8-1.1.5-3 2.6-5.1 5.4-5.4"/>
</g>`;

const RAIN=`<g class="wx-rain">
  <path class="wx-drop wx-drop-1" d="M14.8 38.2l-1.9 4.1"/>
  <path class="wx-drop wx-drop-2" d="M23.4 38.2l-2.1 4.6"/>
  <path class="wx-drop wx-drop-3" d="M32.1 38.2l-1.9 4.1"/>
  <path class="wx-drop wx-drop-4" d="M39 37.5l-1.3 2.8"/>
</g>`;
const DRIZZLE=`<g class="wx-rain wx-drizzle">
  <path class="wx-drop wx-drop-1" d="M17.3 38.6l-1 2.1"/>
  <path class="wx-drop wx-drop-2" d="M25.7 38.6l-1 2.1"/>
  <path class="wx-drop wx-drop-3" d="M34 38.6l-1 2.1"/>
</g>`;
const SNOW=`<g class="wx-snow">
  <g class="wx-flake wx-flake-1"><path d="M15.5 37.9v5M13.3 39.2l4.4 2.5M17.7 39.2l-4.4 2.5"/></g>
  <g class="wx-flake wx-flake-2"><path d="M25 38.7v5M22.8 40l4.4 2.5M27.2 40l-4.4 2.5"/></g>
  <g class="wx-flake wx-flake-3"><path d="M34.4 37.9v5M32.2 39.2l4.4 2.5M36.6 39.2l-4.4 2.5"/></g>
</g>`;
const BOLT='<path class="wx-bolt" d="M27.5 31.5h-5.8l2.5-6.4h-4.4l8.7-10.9-1.9 8.1h5.1l-4.2 9.2Z"/>';
const FOG=`<g class="wx-fog">
  <path class="wx-fog-line wx-fog-1" d="M7.5 29.7h30"/>
  <path class="wx-fog-line wx-fog-2" d="M11 35.6h27.5"/>
  <path class="wx-fog-line wx-fog-3" d="M8.5 41.3h22"/>
</g>`;
const ICE=`<g class="wx-ice">
  <path d="M15.5 40.5h17M24 35.5v10M18 36.8l12 7.4M30 36.8l-12 7.4"/>
  <circle cx="24" cy="40.5" r="2.1" class="wx-ice-core"/>
</g>`;
const QUESTION='<g class="wx-question"><circle cx="24" cy="24" r="15"/><path d="M19.5 19a5 5 0 1 1 7 4.6c-1.7.9-2.5 1.7-2.5 3.4M24 33h.01"/></g>';


/*
 * Each condition is optically centred in the common 48×48 viewBox. Several
 * composite glyphs intentionally reuse a sun drawn in the upper-left corner
 * so that a cloud can overlap it; using that same raw geometry for CLEAR made
 * the standalone sun look visibly off-centre. Keeping the offsets here makes
 * centring a renderer concern instead of scattering per-screen CSS nudges.
 */
const OPTICAL_OFFSETS={
  CLEAR:[6,8],
  MAINLY_CLEAR:[1,4],
  PARTLY_CLOUDY:[-.5,4.4],
  OVERCAST:[-.7,.3],
  FOG:[-.7,-2.1],
  DRIZZLE:[-.7,-1.8],
  RAIN:[-.7,-2.9],
  RAIN_SHOWERS:[-.5,1.2],
  SNOW:[-.7,-3.3],
  SNOW_SHOWERS:[-.5,.8],
  FREEZING_RAIN:[-.7,-4.3],
  THUNDERSTORM:[-.7,-2.9],
  UNKNOWN:[0,0]
};

const METRICS={
  temperature:'<path class="wx-metric-stroke" d="M27 28.2V10a7 7 0 0 0-14 0v18.2a10 10 0 1 0 14 0Z"/><path class="wx-metric-soft" d="M20 8.5v24"/><circle class="wx-metric-fill" cx="20" cy="34.5" r="4.8"/><path class="wx-metric-highlight" d="M17.2 9.4c0-1.9 1.1-3.2 2.8-3.2"/>',
  precipitation:'<path class="wx-metric-stroke" d="M24 4.5S12.5 17.1 12.5 27.1a11.5 11.5 0 0 0 23 0C35.5 17.1 24 4.5 24 4.5Z"/><path class="wx-metric-highlight" d="M17.7 27.7c.8 3 2.9 4.7 6 5.2"/>',
  rain:'<g class="wx-cloud wx-metric-cloud-shape"><path class="wx-cloud-body" d="M11.5 28.8h23.2a6.9 6.9 0 0 0 .5-13.8 10.8 10.8 0 0 0-20.4-1.7 8.1 8.1 0 0 0-3.3 15.5Z"/><path class="wx-cloud-highlight" d="M14.3 20.2c1-1.1 2.3-1.6 3.7-1.6.8-3.3 3.1-5.5 6.4-5.9"/></g><g class="wx-rain"><path d="M16.5 34l-2.1 5.2M25 34l-2.1 5.2M33.4 34l-2.1 5.2"/></g>',
  cloud:'<g class="wx-cloud wx-metric-cloud-shape"><path class="wx-cloud-body" d="M9.5 33h26.3a8 8 0 0 0 .6-16A12 12 0 0 0 14 15a9 9 0 0 0-4.5 18Z"/><path class="wx-cloud-highlight" d="M13.2 23c1.2-1.2 2.8-1.8 4.5-1.8.8-4.2 3.9-7 8-7.4"/></g>',
  wind:'<g class="wx-metric-stroke wx-wind-lines"><path d="M6.5 15.5h23.2a5.3 5.3 0 1 0-4.6-8"/><path d="M6.5 24h31.2a5.4 5.4 0 1 1-4.7 8.1"/><path d="M6.5 32.5h14.8"/></g>',
  sunrise:'<g class="wx-metric-stroke"><path d="M6.5 35.5h35"/><path d="M12.8 29.5a11.2 11.2 0 0 1 22.4 0"/><path d="M24 6.5v7.2M9.8 17.8l5.2 3M38.2 17.8l-5.2 3"/></g><path class="wx-metric-highlight" d="M19.4 24.4a6.6 6.6 0 0 1 9.2 0"/>',
  sunset:'<g class="wx-metric-stroke"><path d="M6.5 35.5h35"/><path d="M12.8 29.5a11.2 11.2 0 0 1 22.4 0"/><path d="M24 6.5v7.2M9.8 17.8l5.2 3M38.2 17.8l-5.2 3"/></g><path class="wx-metric-stroke" d="M24 18v8m-4-4 4 4 4-4"/>'
};

function body(condition){
  switch(condition){
    case 'CLEAR': return SUN;
    case 'MAINLY_CLEAR': return SUN+SMALL_CLOUD;
    case 'PARTLY_CLOUDY': return SUN+CLOUD;
    case 'OVERCAST': return CLOUD;
    case 'FOG': return CLOUD+FOG;
    case 'DRIZZLE': return CLOUD+DRIZZLE;
    case 'RAIN': return CLOUD+RAIN;
    case 'RAIN_SHOWERS': return SUN+CLOUD+RAIN;
    case 'SNOW': return CLOUD+SNOW;
    case 'SNOW_SHOWERS': return SUN+CLOUD+SNOW;
    case 'FREEZING_RAIN': return CLOUD+RAIN+ICE;
    case 'THUNDERSTORM': return CLOUD+BOLT+RAIN;
    default: return QUESTION;
  }
}

function cssToken(condition){return String(condition||'UNKNOWN').toLowerCase().replaceAll('_','-');}
function artwork(condition){
  const key=Object.hasOwn(OPTICAL_OFFSETS,condition)?condition:'UNKNOWN';
  const [x,y]=OPTICAL_OFFSETS[key];
  const transform=(x||y)?` transform="translate(${x} ${y})"`:'';
  return `<g class="wx-artwork wx-artwork-${cssToken(key)}" data-center="optical"${transform}>${body(key)}</g>`;
}

export class WeatherIconRenderer {
  render(condition,{size='normal',animated=false,className=''}={}){
    const key=Object.hasOwn(OPTICAL_OFFSETS,condition)?condition:'UNKNOWN';
    const classes=['wx-icon',`wx-${cssToken(key)}`,`wx-size-${size}`,animated?'wx-animated':'',className].filter(Boolean).join(' ');
    return `<svg class="${classes}" ${SVG_ATTR}>${artwork(key)}</svg>`;
  }

  renderMetric(kind,{size='small',className=''}={}){
    const metricBody=METRICS[kind]||METRICS.cloud;
    const classes=['wx-icon','wx-metric-icon',`wx-metric-${kind}`,`wx-size-${size}`,className].filter(Boolean).join(' ');
    return `<svg class="${classes}" ${SVG_ATTR}>${metricBody}</svg>`;
  }

  renderScenario(kind,options={}){
    const condition={CLEAR:'CLEAR',VARIABLE_SKY:'PARTLY_CLOUDY',OVERCAST:'OVERCAST',DRY_UNSPECIFIED:'MAINLY_CLEAR',SHOWERS:'RAIN_SHOWERS',RAIN:'RAIN',SNOW:'SNOW',FREEZING_RAIN:'FREEZING_RAIN',THUNDERSTORM:'THUNDERSTORM'}[kind]||'UNKNOWN';
    return this.render(condition,{...options,size:options.size||'small'});
  }
}

export const weatherIcons=new WeatherIconRenderer();
