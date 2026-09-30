const MESSAGE_TYPES = new Set(['info','success','warning','critical']);
const PRIORITY = Object.freeze({critical:4,warning:3,info:2,success:1});
const MAX_MESSAGES = 50;

function json(payload,status=200,headers={}){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}
function methodNotAllowed(allow){return new Response('Method Not Allowed',{status:405,headers:{allow,'cache-control':'no-store'}});}
function text(value,max){return String(value??'').trim().slice(0,max);}
function iso(value){
  if(value==null||value==='')return null;
  const time=Date.parse(String(value));
  if(!Number.isFinite(time))throw new Error('INVALID_DATE');
  return new Date(time).toISOString();
}
function safeLink(input){
  if(!input||(!input.label&&!input.url))return null;
  const label=text(input.label,80),raw=text(input.url,500);
  if(!label||!raw)return null;
  let url;try{url=new URL(raw);}catch{throw new Error('INVALID_LINK');}
  if(!['https:','http:'].includes(url.protocol))throw new Error('INVALID_LINK');
  return {label,url:url.href};
}
function makeId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}
export function sanitizeUserMessage(input,{existing=null,now=Date.now()}={}){
  const source=input&&typeof input==='object'?input:{};
  const type=MESSAGE_TYPES.has(String(source.type||'').toLowerCase())?String(source.type).toLowerCase():'info';
  const title=text(source.title,120),message=text(source.message,1200);
  if(!title)throw new Error('TITLE_REQUIRED');
  if(!message)throw new Error('MESSAGE_REQUIRED');
  const startAt=iso(source.startAt),endAt=iso(source.endAt);
  if(startAt&&endAt&&Date.parse(endAt)<=Date.parse(startAt))throw new Error('INVALID_PERIOD');
  const stamp=new Date(now).toISOString();
  return {
    id:existing?.id||makeId(),
    revision:Math.max(1,Number(existing?.revision)||0)+(existing?1:0),
    type,title,message,startAt,endAt,
    dismissible:source.dismissible!==false,
    enabled:source.enabled!==false,
    link:safeLink(source.link),
    createdAt:existing?.createdAt||stamp,
    updatedAt:stamp,
  };
}
export function isActiveUserMessage(message,now=Date.now()){
  if(!message?.enabled)return false;
  const current=Number(now);
  const start=message.startAt?Date.parse(message.startAt):-Infinity;
  const end=message.endAt?Date.parse(message.endAt):Infinity;
  return current>=start&&current<end;
}
export function sortUserMessages(messages=[]){
  return [...messages].sort((a,b)=>{
    const priority=(PRIORITY[b?.type]||0)-(PRIORITY[a?.type]||0);if(priority)return priority;
    const aStart=Date.parse(a?.startAt||a?.createdAt||0)||0,bStart=Date.parse(b?.startAt||b?.createdAt||0)||0;if(aStart!==bStart)return bStart-aStart;
    return String(a?.id||'').localeCompare(String(b?.id||''));
  });
}

export class UserMessageStore{
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async read(){const rows=await this.ctx.storage.get('messages');return Array.isArray(rows)?rows:[];}
  async write(rows){await this.ctx.storage.put('messages',rows.slice(0,MAX_MESSAGES));}
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(path==='/public'){
      if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');
      const messages=sortUserMessages((await this.read()).filter(row=>isActiveUserMessage(row)));
      const response=json({generatedAt:new Date().toISOString(),messages},200,{'cache-control':'public, max-age=60'});
      return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
    }
    if(path==='/messages'){
      if(request.method==='GET')return json({messages:sortUserMessages(await this.read())});
      if(request.method==='POST'){
        let body;try{body=await request.json();}catch{return json({error:'INVALID_JSON'},400);}
        try{
          const row=sanitizeUserMessage(body),rows=await this.read();rows.unshift(row);await this.write(rows);return json({message:row},201);
        }catch(error){return json({error:error?.message||'INVALID_MESSAGE'},400);}
      }
      return methodNotAllowed('GET, POST');
    }
    const match=path.match(/^\/messages\/([^/]+)$/);
    if(match){
      const id=decodeURIComponent(match[1]),rows=await this.read(),index=rows.findIndex(row=>String(row.id)===id);
      if(index<0)return json({error:'MESSAGE_NOT_FOUND'},404);
      if(request.method==='PUT'){
        let body;try{body=await request.json();}catch{return json({error:'INVALID_JSON'},400);}
        try{const row=sanitizeUserMessage(body,{existing:rows[index]});rows[index]=row;await this.write(rows);return json({message:row});}
        catch(error){return json({error:error?.message||'INVALID_MESSAGE'},400);}
      }
      if(request.method==='DELETE'){const [removed]=rows.splice(index,1);await this.write(rows);return json({ok:true,message:removed});}
      return methodNotAllowed('PUT, DELETE');
    }
    return json({error:'NOT_FOUND'},404);
  }
}
