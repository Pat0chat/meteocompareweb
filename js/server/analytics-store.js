const RETENTION_DAYS=180;
function rows(cursor){return Array.from(cursor||[]);}
function dayFloor(days){return Math.floor(Date.now()/1000)-Math.max(1,Math.min(180,Number(days)||30))*86400;}
export class AnalyticsStore{
  constructor(ctx){
    this.ctx=ctx;this.sql=ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, visitor TEXT, referrer TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, country TEXT, device TEXT, browser TEXT, language TEXT, display_mode TEXT, app_version TEXT, props TEXT);`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts); CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name,ts); CREATE INDEX IF NOT EXISTS idx_events_path_ts ON events(path,ts);`);
  }
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/event'){const e=await request.json();this.sql.exec(`INSERT INTO events(ts,day,name,path,visitor,referrer,utm_source,utm_medium,utm_campaign,country,device,browser,language,display_mode,app_version,props) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,e.ts,e.day,e.name,e.path,e.visitor||null,e.referrer||null,e.utm_source||null,e.utm_medium||null,e.utm_campaign||null,e.country||null,e.device||null,e.browser||null,e.language||null,e.display_mode||null,e.app_version||null,e.props||null);if(Math.random()<0.01)this.sql.exec('DELETE FROM events WHERE ts < ?',Math.floor(Date.now()/1000)-RETENTION_DAYS*86400);return Response.json({ok:true});}
    if(request.method==='GET'&&url.pathname==='/health'){const count=rows(this.sql.exec('SELECT COUNT(*) AS n FROM events'))[0]?.n||0;return Response.json({ok:true,events:Number(count)});}
    if(request.method==='GET'&&url.pathname==='/summary')return Response.json(this.summary(Number(url.searchParams.get('days'))||30));
    return new Response('Not Found',{status:404});
  }
  summary(days){
    days=Math.max(1,Math.min(180,Math.round(days||30)));const since=dayFloor(days);
    const one=(q,...args)=>rows(this.sql.exec(q,...args))[0]||{};
    const list=(q,...args)=>rows(this.sql.exec(q,...args));
    const summary=one(`SELECT SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews, COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN day||':'||visitor END) AS visitors, SUM(CASE WHEN name<>'pageview' THEN 1 ELSE 0 END) AS events FROM events WHERE ts>=?`,since);
    return {days,generatedAt:new Date().toISOString(),summary:{pageviews:Number(summary.pageviews||0),visitors:Number(summary.visitors||0),events:Number(summary.events||0)},trend:list(`SELECT day, SUM(CASE WHEN name='pageview' THEN 1 ELSE 0 END) AS pageviews, COUNT(DISTINCT CASE WHEN name='pageview' AND visitor IS NOT NULL THEN visitor END) AS visitors FROM events WHERE ts>=? GROUP BY day ORDER BY day`,since),topPages:list(`SELECT path AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name='pageview' GROUP BY path ORDER BY value DESC LIMIT 10`,since),referrers:list(`SELECT COALESCE(referrer,'Direct') AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name='pageview' GROUP BY COALESCE(referrer,'Direct') ORDER BY value DESC LIMIT 10`,since),countries:list(`SELECT COALESCE(country,'—') AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name='pageview' GROUP BY COALESCE(country,'—') ORDER BY value DESC LIMIT 10`,since),devices:list(`SELECT COALESCE(device,'other') AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name='pageview' GROUP BY COALESCE(device,'other') ORDER BY value DESC`,since),browsers:list(`SELECT COALESCE(browser,'other') AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name='pageview' GROUP BY COALESCE(browser,'other') ORDER BY value DESC LIMIT 8`,since),events:list(`SELECT name AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name<>'pageview' GROUP BY name ORDER BY value DESC LIMIT 12`,since),campaigns:list(`SELECT utm_source AS label, COUNT(*) AS value FROM events WHERE ts>=? AND name='pageview' AND utm_source IS NOT NULL GROUP BY utm_source ORDER BY value DESC LIMIT 10`,since)};
  }
}
