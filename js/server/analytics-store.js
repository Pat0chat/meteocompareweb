const RETENTION_DAYS=180;
function rows(cursor){return Array.from(cursor||[]);}
function clampDays(days){return Math.max(1,Math.min(180,Math.round(Number(days)||30)));}
function startOfUtcDay(daysAgo=0){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-Math.max(0,daysAgo));return Math.floor(d.getTime()/1000);}
function num(value){return Number(value||0);}
function nullableNum(value){return value==null?null:Number(value);}
function dateKey(date){return date.toISOString().slice(0,10);}
function fillDailyWindow(input,days,endOffsetDays=0){
  const map=new Map((input||[]).map(row=>[row.day,row])),out=[];
  for(let offset=endOffsetDays+days-1;offset>=endOffsetDays;offset--){
    const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-offset);const day=dateKey(d),row=map.get(day)||{};
    out.push({day,pageviews:num(row.pageviews),visitors:num(row.visitors),events:num(row.events)});
  }
  return out;
}
function fillHourly(input,hours=24,endOffsetHours=0){
  const map=new Map((input||[]).map(row=>[Number(row.hour),row])),out=[],nowHour=Math.floor(Date.now()/3600000)*3600;
  for(let offset=endOffsetHours+hours-1;offset>=endOffsetHours;offset--){const hour=nowHour-offset*3600,row=map.get(hour)||{};out.push({hour,timestamp:new Date(hour*1000).toISOString(),pageviews:num(row.pageviews),visitors:num(row.visitors),events:num(row.events)});}return out;
}
function fillWorkerDaily(input,days,endOffsetDays=0){
  const base=fillDailyWindow((input||[]).map(row=>({day:row.day,pageviews:row.requests,visitors:row.successful,events:row.failed})),days,endOffsetDays),source=new Map((input||[]).map(row=>[row.day,row]));
  return base.map(row=>{const raw=source.get(row.day)||{};return {day:row.day,requests:row.pageviews,successful:row.visitors,failed:row.events,cacheHits:num(raw.cacheHits),upstreamCalls:num(raw.upstreamCalls),avgUpstreamMs:nullableNum(raw.avgUpstreamMs)};});
}
function fillServiceDaily(input,days,endOffsetDays=0){
  const map=new Map((input||[]).map(row=>[row.day,row])),out=[];
  for(let offset=endOffsetDays+days-1;offset>=endOffsetDays;offset--){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-offset);const day=dateKey(d),row=map.get(day)||{},checks=num(row.checks),successful=num(row.successful);out.push({day,checks,successful,availability:checks?successful/checks*100:null,avgLatencyMs:nullableNum(row.avgLatencyMs)});}return out;
}
function summaryRow(row={}){return {pageviews:num(row.pageviews),visitors:num(row.visitors),events:num(row.events),activeDays:num(row.activeDays),pages:num(row.pages),countries:num(row.countries),directPageviews:num(row.directPageviews),mobilePageviews:num(row.mobilePageviews)};}
function workerSummaryRow(row={}){return {total:num(row.total),successful:num(row.successful),failed:num(row.failed),cacheHits:num(row.cacheHits),upstreamCalls:num(row.upstreamCalls),avgUpstreamMs:nullableNum(row.avgUpstreamMs),latestCacheAgeSeconds:nullableNum(row.latestCacheAgeSeconds)};}
function serviceSummaryRows(input){return (input||[]).map(row=>({service:String(row.service||''),checks:num(row.checks),successful:num(row.successful),availability:num(row.checks)?num(row.successful)/num(row.checks)*100:null,avgLatencyMs:nullableNum(row.avgLatencyMs),maxLatencyMs:nullableNum(row.maxLatencyMs),lastFailureTs:nullableNum(row.lastFailureTs)}));}
function serviceProbeState(row={}){const explicit=String(row.state||'').toLowerCase();if(['ok','down','unknown'].includes(explicit))return explicit;if(Boolean(row.ok))return 'ok';return row.status==null?'unknown':'down';}
function listLatestServiceChecks(sql){
  const newestTs=num(rows(sql.exec('SELECT MAX(ts) AS ts FROM service_checks'))[0]?.ts),latest=newestTs?rows(sql.exec(`SELECT service,ts,ok,status,latency_ms AS latencyMs,detail,state FROM service_checks WHERE ts=? ORDER BY service`,newestTs)):[];
  return {generatedAt:newestTs?new Date(newestTs*1000).toISOString():null,services:latest.map(row=>({name:String(row.service||''),ok:Boolean(row.ok),state:serviceProbeState(row),status:row.status==null?null:Number(row.status),latencyMs:row.latencyMs==null?null:Number(row.latencyMs),detail:row.detail==null?null:String(row.detail)}))};
}
export class AnalyticsStore{
  constructor(ctx){
    this.ctx=ctx;this.sql=ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, visitor TEXT, referrer TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, country TEXT, device TEXT, browser TEXT, language TEXT, display_mode TEXT, app_version TEXT, props TEXT, os TEXT, navigation TEXT, theme TEXT, density TEXT);`);
    const existing=new Set(rows(this.sql.exec('PRAGMA table_info(events)')).map(row=>String(row.name||'')));
    for(const [name,type] of [['os','TEXT'],['navigation','TEXT'],['theme','TEXT'],['density','TEXT']])if(!existing.has(name))this.sql.exec(`ALTER TABLE events ADD COLUMN ${name} ${type}`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts); CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name,ts); CREATE INDEX IF NOT EXISTS idx_events_path_ts ON events(path,ts); CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS worker_requests(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, service TEXT NOT NULL, client TEXT NOT NULL, cache_status TEXT, ok INTEGER NOT NULL, status INTEGER, upstream_ms INTEGER, cache_age_seconds INTEGER);`);
    const workerColumns=new Set(rows(this.sql.exec('PRAGMA table_info(worker_requests)')).map(row=>String(row.name||'')));
    for(const [name,type] of [['upstream_ms','INTEGER'],['cache_age_seconds','INTEGER']])if(!workerColumns.has(name))this.sql.exec(`ALTER TABLE worker_requests ADD COLUMN ${name} ${type}`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_worker_requests_ts ON worker_requests(ts); CREATE INDEX IF NOT EXISTS idx_worker_requests_service_ts ON worker_requests(service,ts);`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS service_checks(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, service TEXT NOT NULL, ok INTEGER NOT NULL, status INTEGER, latency_ms INTEGER, detail TEXT, state TEXT);`);
    const serviceColumns=new Set(rows(this.sql.exec('PRAGMA table_info(service_checks)')).map(row=>String(row.name||'')));if(!serviceColumns.has('state'))this.sql.exec(`ALTER TABLE service_checks ADD COLUMN state TEXT`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_service_checks_ts ON service_checks(ts); CREATE INDEX IF NOT EXISTS idx_service_checks_service_ts ON service_checks(service,ts); CREATE INDEX IF NOT EXISTS idx_service_checks_day ON service_checks(day);`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS maintenance(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  maintainRetention(){
    const today=dateKey(new Date()),last=rows(this.sql.exec(`SELECT value FROM maintenance WHERE key='retention_cleanup'`))[0]?.value;if(last===today)return;
    const cutoff=Math.floor(Date.now()/1000)-RETENTION_DAYS*86400;
    this.sql.exec('DELETE FROM events WHERE ts < ?',cutoff);this.sql.exec('DELETE FROM worker_requests WHERE ts < ?',cutoff);this.sql.exec('DELETE FROM service_checks WHERE ts < ?',cutoff);
    this.sql.exec(`INSERT INTO maintenance(key,value) VALUES('retention_cleanup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,today);
  }
  async fetch(request){
    this.maintainRetention();const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/event'){
      const e=await request.json();this.sql.exec(`INSERT INTO events(ts,day,name,path,visitor,referrer,utm_source,utm_medium,utm_campaign,country,device,browser,language,display_mode,app_version,props,os,navigation,theme,density) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,e.ts,e.day,e.name,e.path,e.visitor||null,e.referrer||null,e.utm_source||null,e.utm_medium||null,e.utm_campaign||null,e.country||null,e.device||null,e.browser||null,e.language||null,e.display_mode||null,e.app_version||null,e.props||null,e.os||null,e.navigation||null,e.theme||null,e.density||null);return Response.json({ok:true});
    }
    if(request.method==='POST'&&url.pathname==='/worker-request'){
      const e=await request.json(),client=['web','android','unknown'].includes(String(e.client))?String(e.client):'unknown',cacheStatus=['hit','miss','none','error'].includes(String(e.cache_status))?String(e.cache_status):'none';
      this.sql.exec(`INSERT INTO worker_requests(ts,day,service,client,cache_status,ok,status,upstream_ms,cache_age_seconds) VALUES(?,?,?,?,?,?,?,?,?)`,e.ts,e.day,String(e.service||'unknown').slice(0,40),client,cacheStatus,e.ok?1:0,e.status!=null&&Number.isFinite(Number(e.status))?Number(e.status):null,e.upstream_ms!=null&&Number.isFinite(Number(e.upstream_ms))?Math.max(0,Math.round(Number(e.upstream_ms))):null,e.cache_age_seconds!=null&&Number.isFinite(Number(e.cache_age_seconds))?Math.max(0,Math.round(Number(e.cache_age_seconds))):null);return Response.json({ok:true});
    }
    if(request.method==='POST'&&url.pathname==='/service-checks'){
      const body=await request.json(),checks=Array.isArray(body?.checks)?body.checks:[],minimumIntervalSeconds=Math.max(0,Math.min(3600,Number(body?.minimumIntervalSeconds)||0)),now=Math.floor(Date.now()/1000),day=new Date(now*1000).toISOString().slice(0,10);let inserted=0;
      for(const item of checks.slice(0,30)){
        const service=String(item?.name||item?.service||'').trim().slice(0,80);if(!service)continue;
        if(minimumIntervalSeconds){const last=num(rows(this.sql.exec('SELECT MAX(ts) AS ts FROM service_checks WHERE service=?',service))[0]?.ts);if(last&&now-last<minimumIntervalSeconds)continue;}
        const latency=Number(item?.latencyMs),status=Number(item?.status),detail=item?.detail==null?null:String(item.detail).replace(/[\r\n]+/g,' ').slice(0,160),rawState=String(item?.state||'').toLowerCase(),state=['ok','down','unknown'].includes(rawState)?rawState:(item?.ok?'ok':item?.status==null?'unknown':'down');
        this.sql.exec(`INSERT INTO service_checks(ts,day,service,ok,status,latency_ms,detail,state) VALUES(?,?,?,?,?,?,?,?)`,now,day,service,state==='ok'?1:0,item?.status!=null&&Number.isFinite(status)?status:null,item?.latencyMs!=null&&Number.isFinite(latency)?Math.max(0,Math.round(latency)):null,detail,state);inserted++;
      }
      return Response.json({ok:true,inserted});
    }
    if(request.method==='GET'&&url.pathname==='/latest-service-checks'){const latest=listLatestServiceChecks(this.sql);return Response.json({generatedAt:latest.generatedAt,services:latest.services});}
    if(request.method==='GET'&&url.pathname==='/health'){const count=num(rows(this.sql.exec('SELECT COUNT(*) AS n FROM events'))[0]?.n),workerCount=num(rows(this.sql.exec('SELECT COUNT(*) AS n FROM worker_requests'))[0]?.n),serviceChecks=num(rows(this.sql.exec('SELECT COUNT(*) AS n FROM service_checks'))[0]?.n);return Response.json({ok:true,events:count,workerRequests:workerCount,serviceChecks,retentionDays:RETENTION_DAYS});}
    if(request.method==='GET'&&url.pathname==='/summary')return Response.json(this.summary(Number(url.searchParams.get('days'))||30));
    return new Response('Not Found',{status:404});
  }
  summary(days){
    days=clampDays(days);const since=startOfUtcDay(days-1),until=Math.floor(Date.now()/1000)+1,previousSince=startOfUtcDay(days*2-1),previousUntil=since;
    const one=(q,...args)=>rows(this.sql.exec(q,...args))[0]||{},list=(q,...args)=>rows(this.sql.exec(q,...args));
    const totalsQuery=`SELECT SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews, COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN day||':'||visitor END) AS visitors, SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events, COUNT(DISTINCT CASE WHEN name='pageview' THEN day END) AS activeDays, COUNT(DISTINCT CASE WHEN name='pageview' THEN path END) AS pages, COUNT(DISTINCT CASE WHEN name='pageview' AND country IS NOT NULL THEN country END) AS countries, SUM(CASE WHEN name='pageview' AND referrer IS NULL THEN 1 ELSE 0 END) AS directPageviews, SUM(CASE WHEN name='pageview' AND device='mobile' THEN 1 ELSE 0 END) AS mobilePageviews FROM events WHERE ts>=? AND ts<?`;
    const summary=summaryRow(one(totalsQuery,since,until)),previousSummary=summaryRow(one(totalsQuery,previousSince,previousUntil));
    const dailyQuery=`SELECT day, SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews, COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN visitor END) AS visitors, SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events FROM events WHERE ts>=? AND ts<? GROUP BY day ORDER BY day`;
    const trend=fillDailyWindow(list(dailyQuery,since,until),days),previousTrend=fillDailyWindow(list(dailyQuery,previousSince,previousUntil),days,days);
    const hourlyQuery=`SELECT CAST(ts/3600 AS INTEGER)*3600 AS hour, SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews, COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN visitor END) AS visitors, SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events FROM events WHERE ts>=? AND ts<? GROUP BY CAST(ts/3600 AS INTEGER) ORDER BY hour`;
    const now=Math.floor(Date.now()/1000),hourly24=fillHourly(list(hourlyQuery,now-24*3600,now+1),24),previousHourly24=fillHourly(list(hourlyQuery,now-48*3600,now-24*3600),24,24);
    const dimension=(column,limit=10)=>list(`SELECT COALESCE(${column},'—') AS label, COUNT(*) AS value, COUNT(DISTINCT CASE WHEN visitor IS NOT NULL THEN day||':'||visitor END) AS visitors FROM events WHERE ts>=? AND ts<? AND name='pageview' GROUP BY COALESCE(${column},'—') ORDER BY value DESC LIMIT ${limit}`,since,until);
    const workerSummaryQuery=`SELECT COUNT(*) AS total, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS successful, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN cache_status='hit' THEN 1 ELSE 0 END) AS cacheHits, SUM(CASE WHEN cache_status='miss' THEN 1 ELSE 0 END) AS upstreamCalls, AVG(CASE WHEN upstream_ms IS NOT NULL THEN upstream_ms END) AS avgUpstreamMs FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance'`;
    const currentWorker=workerSummaryRow(one(workerSummaryQuery,since,until)),previousWorker=workerSummaryRow(one(workerSummaryQuery,previousSince,previousUntil)),latestCache=one(`SELECT cache_age_seconds AS age FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' AND cache_age_seconds IS NOT NULL ORDER BY ts DESC LIMIT 1`,since,until);currentWorker.latestCacheAgeSeconds=nullableNum(latestCache.age);
    const workerDailyQuery=`SELECT day, COUNT(*) AS requests, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS successful, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN cache_status='hit' THEN 1 ELSE 0 END) AS cacheHits, SUM(CASE WHEN cache_status='miss' THEN 1 ELSE 0 END) AS upstreamCalls, AVG(CASE WHEN upstream_ms IS NOT NULL THEN upstream_ms END) AS avgUpstreamMs FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' GROUP BY day ORDER BY day`;
    const workerVigilance={...currentWorker,trend:fillWorkerDaily(list(workerDailyQuery,since,until),days),previousTrend:fillWorkerDaily(list(workerDailyQuery,previousSince,previousUntil),days,days),previous:previousWorker,clients:list(`SELECT client AS label, COUNT(*) AS value FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' GROUP BY client ORDER BY value DESC`,since,until),cache:list(`SELECT COALESCE(cache_status,'none') AS label, COUNT(*) AS value FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' GROUP BY COALESCE(cache_status,'none') ORDER BY value DESC`,since,until)};
    const serviceAggregateQuery=`SELECT service, SUM(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' THEN 1 ELSE 0 END) AS checks, SUM(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)='ok' THEN 1 ELSE 0 END) AS successful, AVG(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' AND latency_ms IS NOT NULL THEN latency_ms END) AS avgLatencyMs, MAX(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' THEN latency_ms END) AS maxLatencyMs, MAX(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)='down' THEN ts END) AS lastFailureTs FROM service_checks WHERE ts>=? AND ts<? GROUP BY service ORDER BY service`;
    const serviceDailyQuery=`SELECT day, SUM(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' THEN 1 ELSE 0 END) AS checks, SUM(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)='ok' THEN 1 ELSE 0 END) AS successful, AVG(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' AND latency_ms IS NOT NULL THEN latency_ms END) AS avgLatencyMs FROM service_checks WHERE ts>=? AND ts<? GROUP BY day ORDER BY day`;
    const servicePerDay=list(`SELECT day,service,SUM(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' THEN 1 ELSE 0 END) AS checks,SUM(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)='ok' THEN 1 ELSE 0 END) AS successful,AVG(CASE WHEN COALESCE(state,CASE WHEN ok=1 THEN 'ok' WHEN status IS NULL THEN 'unknown' ELSE 'down' END)<>'unknown' AND latency_ms IS NOT NULL THEN latency_ms END) AS avgLatencyMs FROM service_checks WHERE ts>=? AND ts<? GROUP BY day,service ORDER BY day`,since,until),perServiceMap=new Map();
    for(const row of servicePerDay){if(!perServiceMap.has(row.service))perServiceMap.set(row.service,[]);perServiceMap.get(row.service).push({day:row.day,checks:num(row.checks),successful:num(row.successful),availability:num(row.checks)?num(row.successful)/num(row.checks)*100:null,avgLatencyMs:nullableNum(row.avgLatencyMs)});}
    const serviceHistory={summary:serviceSummaryRows(list(serviceAggregateQuery,since,until)),previousSummary:serviceSummaryRows(list(serviceAggregateQuery,previousSince,previousUntil)),daily:fillServiceDaily(list(serviceDailyQuery,since,until),days),previousDaily:fillServiceDaily(list(serviceDailyQuery,previousSince,previousUntil),days,days),byService:[...perServiceMap.entries()].map(([service,daily])=>({service,daily}))};
    return {days,generatedAt:new Date().toISOString(),period:{from:new Date(since*1000).toISOString(),to:new Date(until*1000).toISOString()},previousPeriod:{from:new Date(previousSince*1000).toISOString(),to:new Date(previousUntil*1000).toISOString()},summary,previousSummary,trend,previousTrend,hourly24,previousHourly24,
      topPages:list(`SELECT path AS label, COUNT(*) AS value, COUNT(DISTINCT CASE WHEN visitor IS NOT NULL THEN day||':'||visitor END) AS visitors FROM events WHERE ts>=? AND ts<? AND name='pageview' GROUP BY path ORDER BY value DESC LIMIT 12`,since,until),
      referrers:dimension('referrer',12),countries:dimension('country',12),devices:dimension('device',8),browsers:dimension('browser',10),operatingSystems:dimension('os',10),languages:dimension('language',10),displayModes:dimension('display_mode',8),appVersions:dimension('app_version',10),navigationModes:dimension('navigation',8),themes:dimension('theme',8),densities:dimension('density',8),
      events:list(`SELECT name AS label, COUNT(*) AS value, COUNT(DISTINCT CASE WHEN visitor IS NOT NULL THEN day||':'||visitor END) AS visitors FROM events WHERE ts>=? AND ts<? AND name<>'pageview' GROUP BY name ORDER BY value DESC LIMIT 100`,since,until),
      campaignSources:list(`SELECT utm_source AS label, COUNT(*) AS value FROM events WHERE ts>=? AND ts<? AND name='pageview' AND utm_source IS NOT NULL GROUP BY utm_source ORDER BY value DESC LIMIT 10`,since,until),campaignMediums:list(`SELECT utm_medium AS label, COUNT(*) AS value FROM events WHERE ts>=? AND ts<? AND name='pageview' AND utm_medium IS NOT NULL GROUP BY utm_medium ORDER BY value DESC LIMIT 10`,since,until),campaigns:list(`SELECT utm_campaign AS label, COUNT(*) AS value FROM events WHERE ts>=? AND ts<? AND name='pageview' AND utm_campaign IS NOT NULL GROUP BY utm_campaign ORDER BY value DESC LIMIT 10`,since,until),workerVigilance,serviceHistory};
  }
}
