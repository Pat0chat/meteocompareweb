/**
 * Lazy local-analysis hydration behind a single object. The views only ask for a data family;
 * persistence details remain outside rendering code.
 */
export class LocalAnalysisStore {
  constructor({state,loaders}){
    this.state=state;
    this.loaders={...loaders};
    this.loaded=Object.fromEntries(Object.keys(loaders).map(name=>[name,new Set()]));
  }

  has(type,cityId){ return Boolean(this.loaded[type]?.has(cityId)); }
  mark(type,cityId){ this.loaded[type]?.add(cityId); }
  forget(cityId){ for(const set of Object.values(this.loaded))set.delete(cityId); }

  get(type,cityId){
    if(!this.loaded[type])throw new Error(`UNKNOWN_ANALYSIS:${type}`);
    if(!this.loaded[type].has(cityId)){
      const value=this.loaders[type]?.(cityId);
      if(type==='health')this.state.modelHealthHistory[cityId]=value||[];
      else if(type==='normals'){ if(value)this.state.normals[cityId]=value; }
      else this.state[type][cityId]=value;
      this.loaded[type].add(cityId);
    }
    if(type==='health')return this.state.modelHealthHistory[cityId]||[];
    if(type==='normals')return this.state.normals[cityId]||null;
    return this.state[type][cityId]||null;
  }
}
