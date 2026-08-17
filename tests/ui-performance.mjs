import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const sleep = ms => new Promise(r => setTimeout(r, ms));

class MemoryStorage {
  constructor(){ this.map=new Map(); }
  getItem(k){ return this.map.has(k)?this.map.get(k):null; }
  setItem(k,v){ this.map.set(String(k),String(v)); }
  removeItem(k){ this.map.delete(k); }
  key(i){ return [...this.map.keys()][i] ?? null; }
  get length(){ return this.map.size; }
}
const storage = new MemoryStorage();
globalThis.localStorage = new Proxy(storage, {
  ownKeys: target => [...target.map.keys()],
  getOwnPropertyDescriptor: () => ({enumerable:true,configurable:true}),
  get: (target,prop) => prop in target ? target[prop].bind?.(target) ?? target[prop] : undefined,
});

const appListeners = {};
let htmlWrites = 0;
const app = {
  _html:'',
  addEventListener(type, fn){ appListeners[type]=fn; },
  contains(){ return true; },
  set innerHTML(v){ this._html=v; htmlWrites++; },
  get innerHTML(){ return this._html; },
};
const statusEl={innerHTML:''}, resultsEl={innerHTML:''};
const inputEl={id:'city-search',value:'',focus(){},closest(){return this;},dataset:{}};
const toastRoot={appendChild(){}};

globalThis.document = {
  activeElement:null,
  documentElement:{dataset:{},lang:''},
  querySelector(sel){
    if(sel==='#app') return app;
    if(sel==='#city-search-status') return statusEl;
    if(sel==='#city-search-results') return resultsEl;
    if(sel==='#city-search') return app._html.includes('id="city-search"') ? inputEl : null;
    if(sel==='#toast-root') return toastRoot;
    return null;
  },
  createElement(){ return {className:'',textContent:'',remove(){}}; },
};

Object.defineProperty(globalThis,'navigator',{value:{onLine:true,language:'fr-FR'},configurable:true});
globalThis.location = { hash:'#/' };
globalThis.history = { length:1, back(){} };
globalThis.confirm = () => true;
globalThis.window = {
  addEventListener(){},
  matchMedia(){ return {matches:false,addEventListener(){}}; },
};
globalThis.requestAnimationFrame = cb => { cb(performance.now()); return 1; };
globalThis.queueMicrotask ||= cb => Promise.resolve().then(cb);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 1;

const fetchCalls=[];
globalThis.fetch = async (url,opts={}) => {
  fetchCalls.push({url:String(url), signal:opts.signal});
  return {
    ok:true,
    status:200,
    async json(){ return {results:[{id:2988507,name:'Paris',admin1:'Île-de-France',country:'France',latitude:48.85,longitude:2.35,timezone:'Europe/Paris'}]}; }
  };
};

await import(`../js/app.js?test=${Date.now()}`);
assert.equal(typeof appListeners.click,'function','delegated click handler installed');
assert.equal(typeof appListeners.input,'function','delegated input handler installed');

const addButton={dataset:{action:'open-add-city'},closest(){return this;}};
appListeners.click({target:addButton,stopPropagation(){}});
assert.match(app.innerHTML,/city-search/,'add-city modal rendered');

for (const value of ['P','Pa','Par','Pari','Paris']) {
  inputEl.value=value;
  appListeners.input({target:inputEl});
  await sleep(70);
}
assert.equal(fetchCalls.length,0,'typing must not trigger an immediate geocoding request');
assert.match(statusEl.innerHTML,/courte pause/i,'pending debounce hint shown');
await sleep(400);
assert.equal(fetchCalls.length,0,'request must still be delayed before 600 ms from last keystroke');
await sleep(260);
assert.equal(fetchCalls.length,1,'only one geocoding request is sent after the debounce');
assert.match(fetchCalls[0].url,/name=Paris/,'the request uses the final query only');
await sleep(0);
assert.match(resultsEl.innerHTML,/Paris/,'search results are rendered locally without a full-page render');

// The input path must not rewrite the whole application DOM on every keystroke.
// Initial render + opening the modal are expected; input updates should only touch status/results.
assert.ok(htmlWrites <= 2, `unexpected full renders during typing: ${htmlWrites}`);

globalThis.setInterval = realSetInterval;
console.log('MeteoCompare Web UI performance tests: OK');
