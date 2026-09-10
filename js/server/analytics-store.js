const RETENTION_DAYS=180;
function rows(cursor){return Array.from(cursor||[]);}
function clampDays(days){return Math.max(1,Math.min(180,Math.round(Number(days)||30)));}
function startOfUtcDay(daysAgo=0){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-Math.max(0,daysAgo));return Math.floor(d.getTime()/1000);}
function num(value){return Number(value||0);}
function dateKey(date){return date.toISOString().slice(0,10);}
function fillDaily(input,days){const map=new Map((input||[]).map(row=>[row.day,row])),out=[];for(let offset=days-1;offset>=0;offset--){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-offset);const day=dateKey(d),row=map.get(day)||{};out.push({day,pageviews:num(row.pageviews),visitors:num(row.visitors),events:num(row.events)});}return out;}
function fillHourly(input,hours=24){const map=new Map((input||[]).map(row=>[Number(row.hour),row])),out=[],nowHour=Math.floor(Date.now()/3600000)*3600;for(let offset=hours-1;offset>=0;offset--){const hour=nowHour-offset*3600,row=map.get(hour)||{};out.push({hour,timestamp:new Date(hour*1000).toISOString(),pageviews:num(row.pageviews),visitors:num(row.visitors),events:num(row.events)});}return out;}
function summaryRow(row={}){return {pageviews:num(row.pageviews),visitors:num(row.visitors),events:num(row.events),activeDays:num(row.activeDays),pages:num(row.pages),countries:num(row.countries),directPageviews:num(row.directPageviews),mobilePageviews:num(row.mobilePageviews)};}
export class AnalyticsStore{
  constructor(ctx){
    this.ctx=ctx;this.sql=ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, visitor TEXT, referrer TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, country TEXT, device TEXT, browser TEXT, language TEXT, display_mode TEXT, app_version TEXT, props TEXT, os TEXT, navigation TEXT, theme TEXT, density TEXT);`);
    const existing=new Set(rows(this.sql.exec('PRAGMA table_info(events)')).map(row=>String(row.name||'')));
    for(const [name,type] of [['os','TEXT'],['navigation','TEXT'],['theme','TEXT'],['density','TEXT']])if(!existing.has(name))this.sql.exec(`ALTER TABLE events ADD COLUMN ${name} ${type}`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts); CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name,ts); CREATE INDEX IF NOT EXISTS idx_events_path_ts ON events(path,ts); CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS worker_requests(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, service TEXT NOT NULL, client TEXT NOT NULL, cache_status TEXT, ok INTEGER NOT NULL, status INTEGER);`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_worker_requests_ts ON worker_requests(ts); CREATE INDEX IF NOT EXISTS idx_worker_requests_service_ts ON worker_requests(service,ts);`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS maintenance(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  maintainRetention(){
    const today=dateKey(new Date()),last=rows(this.sql.exec(`SELECT value FROM maintenance WHERE key='retention_cleanup'`))[0]?.value;
    if(last===today)return;
    const cutoff=Math.floor(Date.now()/1000)-RETENTION_DAYS*86400;
    this.sql.exec('DELETE FROM events WHERE ts < ?',cutoff);
    this.sql.exec('DELETE FROM worker_requests WHERE ts < ?',cutoff);
    this.sql.exec(`INSERT INTO maintenance(key,value) VALUES('retention_cleanup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,today);
  }
  async fetch(request){
    this.maintainRetention();
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/event'){
      const e=await request.json();
      this.sql.exec(`INSERT INTO events(ts,day,name,path,visitor,referrer,utm_source,utm_medium,utm_campaign,country,device,browser,language,display_mode,app_version,props,os,navigation,theme,density) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,e.ts,e.day,e.name,e.path,e.visitor||null,e.referrer||null,e.utm_source||null,e.utm_medium||null,e.utm_campaign||null,e.country||null,e.device||null,e.browser||null,e.language||null,e.display_mode||null,e.app_version||null,e.props||null,e.os||null,e.navigation||null,e.theme||null,e.density||null);
      return Response.json({ok:true});
    }
    if(request.method==='POST'&&url.pathname==='/worker-request'){
      const e=await request.json();
      const client=['web','android','unknown'].includes(String(e.client))?String(e.client):'unknown',cacheStatus=['hit','miss','none','error'].includes(String(e.cache_status))?String(e.cache_status):'none';
      this.sql.exec(`INSERT INTO worker_requests(ts,day,service,client,cache_status,ok,status) VALUES(?,?,?,?,?,?,?)`,e.ts,e.day,String(e.service||'unknown').slice(0,40),client,cacheStatus,e.ok?1:0,Number.isFinite(Number(e.status))?Number(e.status):null);
      return Response.json({ok:true});
    }
    if(request.method==='GET'&&url.pathname==='/health'){const count=rows(this.sql.exec('SELECT COUNT(*) AS n FROM events'))[0]?.n||0,workerCount=rows(this.sql.exec('SELECT COUNT(*) AS n FROM worker_requests'))[0]?.n||0;return Response.json({ok:true,events:Number(count),workerRequests:Number(workerCount),retentionDays:RETENTION_DAYS});}
    if(request.method==='GET'&&url.pathname==='/summary')return Response.json(this.summary(Number(url.searchParams.get('days'))||30));
    return new Response('Not Found',{status:404});
  }
  summary(days){
    days=clampDays(days);
    const since=startOfUtcDay(days-1),until=Math.floor(Date.now()/1000)+1,previousSince=startOfUtcDay(days*2-1),previousUntil=since;
    const one=(q,...args)=>rows(this.sql.exec(q,...args))[0]||{};
    const list=(q,...args)=>rows(this.sql.exec(q,...args));
    const totalsQuery=`SELECT
      SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews,
      COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN day||':'||visitor END) AS visitors,
      SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events,
      COUNT(DISTINCT CASE WHEN name='pageview' THEN day END) AS activeDays,
      COUNT(DISTINCT CASE WHEN name='pageview' THEN path END) AS pages,
      COUNT(DISTINCT CASE WHEN name='pageview' AND country IS NOT NULL THEN country END) AS countries,
      SUM(CASE WHEN name='pageview' AND referrer IS NULL THEN 1 ELSE 0 END) AS directPageviews,
      SUM(CASE WHEN name='pageview' AND device='mobile' THEN 1 ELSE 0 END) AS mobilePageviews
      FROM events WHERE ts>=? AND ts<?`;
    const summary=summaryRow(one(totalsQuery,since,until)),previousSummary=summaryRow(one(totalsQuery,previousSince,previousUntil));
    const trend=fillDaily(list(`SELECT day,
      SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews,
      COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN visitor END) AS visitors,
      SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events
      FROM events WHERE ts>=? AND ts<? GROUP BY day ORDER BY day`,since,until),days);
    const hourly24=fillHourly(list(`SELECT CAST(ts/3600 AS INTEGER)*3600 AS hour,
      SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews,
      COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN visitor END) AS visitors,
      SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events
      FROM events WHERE ts>=? GROUP BY CAST(ts/3600 AS INTEGER) ORDER BY hour`,Math.floor(Date.now()/1000)-24*3600),24);
    const dimension=(column,limit=10)=>list(`SELECT COALESCE(${column},'—') AS label, COUNT(*) AS value, COUNT(DISTINCT CASE WHEN visitor IS NOT NULL THEN day||':'||visitor END) AS visitors FROM events WHERE ts>=? AND ts<? AND name='pageview' GROUP BY COALESCE(${column},'—') ORDER BY value DESC LIMIT ${limit}`,since,until);
    const workerVigilanceSummary=one(`SELECT COUNT(*) AS total, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS successful, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance'`,since,until);
    const workerVigilanceTrend=fillDaily(list(`SELECT day, COUNT(*) AS pageviews, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS visitors, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS events FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' GROUP BY day ORDER BY day`,since,until),days).map(row=>({day:row.day,requests:row.pageviews,successful:row.visitors,failed:row.events}));
    const workerVigilance={
      total:num(workerVigilanceSummary.total),successful:num(workerVigilanceSummary.successful),failed:num(workerVigilanceSummary.failed),
      trend:workerVigilanceTrend,
      clients:list(`SELECT client AS label, COUNT(*) AS value FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' GROUP BY client ORDER BY value DESC`,since,until),
      cache:list(`SELECT COALESCE(cache_status,'none') AS label, COUNT(*) AS value FROM worker_requests WHERE ts>=? AND ts<? AND service='vigilance' GROUP BY COALESCE(cache_status,'none') ORDER BY value DESC`,since,until),
    };
    return {
      days,generatedAt:new Date().toISOString(),period:{from:new Date(since*1000).toISOString(),to:new Date(until*1000).toISOString()},summary,previousSummary,trend,hourly24,
      topPages:list(`SELECT path AS label, COUNT(*) AS value, COUNT(DISTINCT CASE WHEN visitor IS NOT NULL THEN day||':'||visitor END) AS visitors FROM events WHERE ts>=? AND ts<? AND name='pageview' GROUP BY path ORDER BY value DESC LIMIT 12`,since,until),
      referrers:dimension('referrer',12),countries:dimension('country',12),devices:dimension('device',8),browsers:dimension('browser',10),operatingSystems:dimension('os',10),languages:dimension('language',10),displayModes:dimension('display_mode',8),appVersions:dimension('app_version',10),navigationModes:dimension('navigation',8),themes:dimension('theme',8),densities:dimension('density',8),
      events:list(`SELECT name AS label, COUNT(*) AS value, COUNT(DISTINCT CASE WHEN visitor IS NOT NULL THEN day||':'||visitor END) AS visitors FROM events WHERE ts>=? AND ts<? AND name<>'pageview' GROUP BY name ORDER BY value DESC LIMIT 16`,since,until),
      campaignSources:list(`SELECT utm_source AS label, COUNT(*) AS value FROM events WHERE ts>=? AND ts<? AND name='pageview' AND utm_source IS NOT NULL GROUP BY utm_source ORDER BY value DESC LIMIT 10`,since,until),
      campaignMediums:list(`SELECT utm_medium AS label, COUNT(*) AS value FROM events WHERE ts>=? AND ts<? AND name='pageview' AND utm_medium IS NOT NULL GROUP BY utm_medium ORDER BY value DESC LIMIT 10`,since,until),
      campaigns:list(`SELECT utm_campaign AS label, COUNT(*) AS value FROM events WHERE ts>=? AND ts<? AND name='pageview' AND utm_campaign IS NOT NULL GROUP BY utm_campaign ORDER BY value DESC LIMIT 10`,since,until),
      workerVigilance,
    };
  }
}
