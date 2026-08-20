/** Runtime-only caches. They never own domain data and can be discarded at any time. */
export class CacheRegistry {
  constructor(){
    this.numberFormatters=new Map();
    this.forecastViews=new WeakMap();
    this.seriesIndexes=new WeakMap();
    this.chartHoverData=new WeakMap();
    this.routeScrollPositions=new Map();
  }
}

/**
 * Tracks the latest asynchronous operation per entity.
 * A result is current only while its token remains registered.
 */
export class OperationRegistry {
  constructor(){ this.tokens=new Map(); }
  begin(key){ const token=Symbol(String(key));this.tokens.set(key,token);return token; }
  isCurrent(key,token){ return this.tokens.get(key)===token; }
  finish(key,token){ if(this.isCurrent(key,token))this.tokens.delete(key); }
  delete(key){ this.tokens.delete(key); }
  clear(){ this.tokens.clear(); }
  get(key){ return this.tokens.get(key); }
  set(key,token){ this.tokens.set(key,token);return token; }
}
