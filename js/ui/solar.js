/* Local solar times already present in each weather forecast. No additional API calls. */
const LOCAL_HOUR=/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/;

export function solarTimesForDate(source,date){
  const series=source?.seriesByModel?Object.values(source.seriesByModel):Array.isArray(source)?source:[source];
  for(const model of series){
    const index=model?.daily?.dates?.indexOf(date)??-1;
    if(index<0)continue;
    const sunrise=model.daily.sunrise?.[index],sunset=model.daily.sunset?.[index];
    if(typeof sunrise==='string'&&typeof sunset==='string'&&sunrise.startsWith(`${date}T`)&&sunset.startsWith(`${date}T`)&&LOCAL_HOUR.test(sunrise)&&LOCAL_HOUR.test(sunset)&&sunset>sunrise){
      return {sunrise,sunset};
    }
  }
  return null;
}

// All hourly timestamps (including API solar data) are city-local ISO values.
// When solar data are unavailable, the graph's existing 07:00–19:00 visual
// fallback is used; daily aggregate icons must not be marked as nighttime.
export function isNightAt(source,timestamp){
  if(typeof timestamp!=='string'||!LOCAL_HOUR.test(timestamp))return false;
  const solar=solarTimesForDate(source,timestamp.slice(0,10));
  if(solar)return timestamp<solar.sunrise||timestamp>=solar.sunset;
  const hour=Number(timestamp.slice(11,13));
  return hour<7||hour>=19;
}

export function localNowTimestamp(timezone,now=new Date()){
  try{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
  }catch{return null;}
}

// The clock preference is deliberately independent of the selected UI language.
// Forecast timestamps are already in the *city's local wall time*, without an offset.
// Never parse them as an instant: doing so would shift hours on devices in other zones.
export const TIME_FORMATS = Object.freeze(['H24','H12']);
export function normalizeTimeFormat(value){return TIME_FORMATS.includes(value)?value:'H24';}

const clockFormatters=new Map();
function clockFormatter(format,timezone){
  const choice=normalizeTimeFormat(format),zone=timezone||'UTC',key=`${choice}|${zone}`;
  let formatter=clockFormatters.get(key);
  if(!formatter){
    formatter=new Intl.DateTimeFormat(choice==='H12'?'en-US':'en-GB',{
      timeZone:zone,hour:choice==='H12'?'numeric':'2-digit',minute:'2-digit',
      hourCycle:choice==='H12'?'h12':'h23',
    });
    clockFormatters.set(key,formatter);
  }
  return formatter;
}

export function formatLocalClock(timestamp,format='H24'){
  if(typeof timestamp!=='string')return '—';
  const match=/T(\d{2}):(\d{2})/.exec(timestamp);
  if(!match)return '—';
  const hours=Number(match[1]),minutes=Number(match[2]);
  if(hours>23||minutes>59)return '—';
  if(normalizeTimeFormat(format)==='H24')return `${match[1]}:${match[2]}`;
  // Use UTC solely as a stable container for the wall-clock hour. No timezone conversion.
  return clockFormatter('H12','UTC').format(new Date(Date.UTC(2020,0,1,hours,minutes)));
}

// Real instant, e.g. a radar frame, displayed in the target city's timezone.
export function formatInstantClock(instant,timezone='UTC',format='H24'){
  const date=instant instanceof Date?instant:new Date(instant);
  if(!Number.isFinite(date.getTime()))return '—';
  try{return clockFormatter(format,timezone).format(date);}
  catch{return clockFormatter(format,'UTC').format(date);}
}

// For mixed date + time labels, keep the date in the chosen language while
// making the clock cycle explicit instead of falling back to locale defaults.
export function withClockPreference(options={},format='H24'){
  const displaysTime=options.timeStyle!=null||options.hour!=null||options.minute!=null;
  if(!displaysTime)return options;
  return {...options,hour12:normalizeTimeFormat(format)==='H12',hourCycle:normalizeTimeFormat(format)==='H12'?'h12':'h23'};
}
