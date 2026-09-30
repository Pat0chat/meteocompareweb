import assert from 'node:assert/strict';
import { UserMessageStore, sanitizeUserMessage, isActiveUserMessage } from '../../../js/server/user-message-store.js';

const saved=new Map();
globalThis.localStorage={getItem:key=>saved.has(key)?saved.get(key):null,setItem:(key,value)=>saved.set(key,String(value)),removeItem:key=>saved.delete(key)};
const client=await import('../../../js/user-messages.js');

const now=Date.parse('2026-09-30T12:00:00Z');
const row=sanitizeUserMessage({type:'warning',title:'Maintenance',message:'Intervention planifiée',startAt:'2026-09-30T11:00:00Z',endAt:'2026-09-30T13:00:00Z',dismissible:true,enabled:true,link:{label:'Détails',url:'https://meteocompare.app/status'}},{now});
assert.equal(row.revision,1);
assert.equal(row.type,'warning');
assert.equal(isActiveUserMessage(row,now),true);
assert.throws(()=>sanitizeUserMessage({title:'x',message:'y',link:{label:'bad',url:'javascript:alert(1)'}},{now}),/INVALID_LINK/);
assert.throws(()=>sanitizeUserMessage({title:'x',message:'y',startAt:'2026-10-02',endAt:'2026-10-01'},{now}),/INVALID_PERIOD/);

const storage=new Map();
const ctx={storage:{async get(key){return storage.get(key);},async put(key,value){storage.set(key,value);}}};
const store=new UserMessageStore(ctx,{});
let response=await store.fetch(new Request('https://messages.internal/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'critical',title:'Incident',message:'Service dégradé',enabled:true,dismissible:true,startAt:'2020-01-01T00:00:00Z'})}));
assert.equal(response.status,201);
const created=(await response.json()).message;
response=await store.fetch(new Request('https://messages.internal/messages'));
assert.equal((await response.json()).messages.length,1);
response=await store.fetch(new Request(`https://messages.internal/messages/${created.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...created,message:'Service rétabli',type:'success'})}));
const updated=(await response.json()).message;
assert.equal(updated.revision,2);
assert.equal(updated.type,'success');
response=await store.fetch(new Request('https://messages.internal/public'));
assert.equal((await response.json()).messages[0].revision,2);

const rows=[
 {id:'info',revision:1,type:'info',title:'Info',message:'A',enabled:true,dismissible:true,startAt:'2026-09-30T10:00:00Z'},
 {id:'critical',revision:1,type:'critical',title:'Critical',message:'B',enabled:true,dismissible:true,startAt:'2026-09-30T10:00:00Z'},
];
assert.deepEqual(client.activeUserMessages(rows,now).map(x=>x.id),['critical','info']);
client.dismissUserMessage('critical',1);
assert.deepEqual(client.visibleUserMessages(rows,now).map(x=>x.id),['info']);
const revised=rows.map(x=>x.id==='critical'?{...x,revision:2}:x);
assert.deepEqual(client.visibleUserMessages(revised,now).map(x=>x.id),['critical','info']);
console.log('user messages scheduling, storage, priority and dismissal: OK');
