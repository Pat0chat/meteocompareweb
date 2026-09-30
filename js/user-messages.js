import { NETWORK_ENDPOINTS } from './network-config.js';

const CACHE_KEY='meteocompare.user-messages.cache.v1';
const DISMISSED_KEY='meteocompare.user-messages.dismissed.v1';
const TYPES=new Set(['info','success','warning','critical']);
const PRIORITY={critical:4,warning:3,info:2,success:1};

function storage(){try{return globalThis.localStorage||null;}catch{return null;}}
function readJson(key,fallback){try{const raw=storage()?.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function writeJson(key,value){try{storage()?.setItem(key,JSON.stringify(value));}catch{}}
function safeMessage(row){
  if(!row||typeof row!=='object'||!row.id||!row.title||!row.message)return null;
  const type=TYPES.has(row.type)?row.type:'info';
  let link=null;if(row.link&&typeof row.link==='object'&&row.link.label&&row.link.url){try{const parsed=new URL(String(row.link.url));if(['https:','http:'].includes(parsed.protocol))link={label:String(row.link.label),url:parsed.href};}catch{}}
  return {id:String(row.id),revision:Math.max(1,Number(row.revision)||1),type,title:String(row.title),message:String(row.message),startAt:row.startAt||null,endAt:row.endAt||null,dismissible:row.dismissible!==false,enabled:row.enabled!==false,link};
}
export function activeUserMessages(rows=[],now=Date.now()){
  return rows.map(safeMessage).filter(Boolean).filter(row=>{
    if(!row.enabled)return false;
    const start=row.startAt?Date.parse(row.startAt):-Infinity,end=row.endAt?Date.parse(row.endAt):Infinity;
    return now>=start&&now<end;
  }).sort((a,b)=>(PRIORITY[b.type]||0)-(PRIORITY[a.type]||0)||(Date.parse(b.startAt||0)||0)-(Date.parse(a.startAt||0)||0));
}
export function loadCachedUserMessages(){const payload=readJson(CACHE_KEY,{messages:[]});return Array.isArray(payload?.messages)?payload.messages.map(safeMessage).filter(Boolean):[];}
export function visibleUserMessages(rows=[],now=Date.now()){
  const dismissed=readJson(DISMISSED_KEY,{});
  return activeUserMessages(rows,now).filter(row=>!row.dismissible||Number(dismissed?.[row.id])!==row.revision);
}
export function dismissUserMessage(id,revision){const dismissed=readJson(DISMISSED_KEY,{});dismissed[String(id)]=Math.max(1,Number(revision)||1);writeJson(DISMISSED_KEY,dismissed);}
export function userMessagesVisibilityKey(rows=[],now=Date.now()){return visibleUserMessages(rows,now).map(row=>`${row.id}:${row.revision}`).join('|');}
export async function fetchUserMessages({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')return loadCachedUserMessages();
  const response=await fetchImpl(NETWORK_ENDPOINTS.firstParty.messages,{headers:{Accept:'application/json','X-MeteoCompare-Client':'web'}});
  if(!response.ok)throw new Error(`USER_MESSAGES_HTTP_${response.status}`);
  const payload=await response.json(),messages=Array.isArray(payload?.messages)?payload.messages.map(safeMessage).filter(Boolean):[];
  writeJson(CACHE_KEY,{savedAt:Date.now(),messages});return messages;
}
