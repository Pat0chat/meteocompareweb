/** Lazy feature modules are registered here instead of being coupled to the main renderer. */
export class FeatureRegistry {
  constructor(loaders={}) {
    this.loaders={...loaders};
    this.modules=Object.fromEntries(Object.keys(loaders).map(name=>[name,null]));
    this.pending=new Map();
  }

  get(name){ return this.modules[name]||null; }
  has(name){ return Boolean(this.get(name)); }

  load(name){
    if(this.has(name))return Promise.resolve(this.get(name));
    if(this.pending.has(name))return this.pending.get(name);
    const loader=this.loaders[name];
    if(!loader)return Promise.reject(new Error(`UNKNOWN_FEATURE:${name}`));
    const promise=Promise.resolve().then(loader).then(module=>{
      this.modules[name]=module;
      return module;
    }).finally(()=>this.pending.delete(name));
    this.pending.set(name,promise);
    return promise;
  }
}
