import assert from 'node:assert/strict';
import { normalizeBatchedForecast } from '../js/api.js';
import { dayConfidence, aggregateNormals } from '../js/domain.js';
import { normalizePreviousRuns } from '../js/features/bias.js';
import { getModel } from '../js/models.js';

const city={id:'1',name:'Paris',country:'France',admin1:'Île-de-France',latitude:48.85,longitude:2.35,timezone:'Europe/Paris'};
const arome=getModel('AROME_FRANCE_HD'), gfs=getModel('GFS');
const raw={
  latitude:48.85,longitude:2.35,timezone:'Europe/Paris',
  meteofrance_arome_france_hd_run_time:'2026-08-17T00:00:00Z',
  hourly:{
    time:['2026-08-17T00:00','', '2026-08-17T02:00'],
    temperature_2m_meteofrance_arome_france_hd:[20,999,22],
    precipitation_meteofrance_arome_france_hd:[0,999,0.3],
    cloud_cover_low_meteofrance_arome_france_hd:[20,99,30],
    cloud_cover_mid_meteofrance_arome_france_hd:[40,99,50],
    cloud_cover_high_meteofrance_arome_france_hd:[10,99,70],
    wind_speed_10m_meteofrance_arome_france_hd:[5,999,7],
    weather_code_meteofrance_arome_france_hd:[1,99,2],
    temperature_2m_ncep_gfs_seamless:[19,999,21],
    precipitation_ncep_gfs_seamless:[0,999,0],
    cloud_cover_ncep_gfs_seamless:[10,99,20],
    wind_speed_10m_ncep_gfs_seamless:[6,999,8],
    weather_code_ncep_gfs_seamless:[0,99,1],
  },
  daily:{
    time:['2026-08-17','2026-08-18'],
    temperature_2m_max_meteofrance_arome_france_hd:[25,26],temperature_2m_min_meteofrance_arome_france_hd:[15,16],precipitation_sum_meteofrance_arome_france_hd:[0,2],wind_speed_10m_max_meteofrance_arome_france_hd:[10,11],weather_code_meteofrance_arome_france_hd:[1,61],
    temperature_2m_max_ncep_gfs_seamless:[24,28],temperature_2m_min_ncep_gfs_seamless:[14,17],precipitation_sum_ncep_gfs_seamless:[0,0],wind_speed_10m_max_ncep_gfs_seamless:[12,15],weather_code_ncep_gfs_seamless:[0,1],
    sunrise:['2026-08-17T06:35','2026-08-18T06:36'],sunset:['2026-08-17T21:02','2026-08-18T21:00']
  }
};
const f=normalizeBatchedForecast(raw,city,[arome,gfs]);
assert.equal(f.seriesByModel.AROME_FRANCE_HD.hourly.timestamps.length,2,'invalid timestamp must be removed');
assert.deepEqual(f.seriesByModel.AROME_FRANCE_HD.hourly.temperature2m,[20,22],'value alignment must follow retained timestamp indices');
assert.deepEqual(f.seriesByModel.AROME_FRANCE_HD.hourly.cloudCover,[40,70],'AROME HD cloud fallback must use max low/mid/high layer');
assert.deepEqual(f.seriesByModel.AROME_FRANCE_HD.daily.sunrise,['2026-08-17T06:35','2026-08-18T06:36'],'shared sunrise should be accepted');
assert.equal(f.modelMeta.AROME_FRANCE_HD.runTimestamp,'2026-08-17T00:00:00.000Z','run metadata should be retained when the API exposes it');
assert.equal(f.modelMeta.AROME_FRANCE_HD.lastTimestamp,'2026-08-17T02:00','per-model temporal coverage should be retained');
assert.deepEqual(f.requestedModelIds,['AROME_FRANCE_HD','GFS'],'forecast cache must remember the exact requested model cohort');
const conf=dayConfidence(f,'2026-08-18');
assert.equal(conf.precipitation.kind,'DIVIDED');
assert.equal(conf.precipitation.modelsForRain,1);
assert.equal(conf.precipitation.modelsAgainstRain,1);

// Bias bootstrap: a civil day with only 18 timestamps must be rejected; a complete 24h day must be accepted.
const times=[];for(let h=0;h<18;h++)times.push(`2026-08-01T${String(h).padStart(2,'0')}:00`);for(let h=0;h<24;h++)times.push(`2026-08-02T${String(h).padStart(2,'0')}:00`);
const vals=times.map((_,i)=>20+i/10), precip=times.map(()=>0.1), wind=times.map(()=>15);
const prevRaw={timezone:'Europe/Paris',hourly:{time:times,temperature_2m_previous_day1_ncep_gfs_seamless:vals,precipitation_previous_day1_ncep_gfs_seamless:precip,wind_speed_10m_previous_day1_ncep_gfs_seamless:wind}};
const records=normalizePreviousRuns(prevRaw,city,[gfs],'2026-08-01','2026-08-02');
assert.equal(records.some(r=>r.targetDate==='2026-08-01'),false,'18h partial day must never bootstrap bias');
assert.equal(records.filter(r=>r.targetDate==='2026-08-02').length,3,'complete 24h day should produce all three variables');

// ERA5 completeness + aggregation.
const normalTimes=[],tmax=[],tmin=[];for(let y=2016;y<=2025;y++){normalTimes.push(`${y}-01-01`);tmax.push(10+(y-2016));tmin.push(0+(y-2016));}
const normals=aggregateNormals({daily:{time:normalTimes,temperature_2m_max:tmax,temperature_2m_min:tmin}},'2016-01-01','2025-12-31');
assert.equal(normals.complete,false,'sparse 10-year archive must be rejected by 95% coverage guard');
assert.equal(normals.normals['01-01'].count,10);

console.log('MeteoCompare Web smoke tests: OK');
