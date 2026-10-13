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
