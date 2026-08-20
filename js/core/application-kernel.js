import { AppState } from './app-state.js';
import { FeatureRegistry } from './feature-registry.js';
import { CacheRegistry, OperationRegistry } from './cache-registry.js';
import { LocalAnalysisStore } from './local-analysis-store.js';

/**
 * Composition root for MeteoCompare's runtime concerns.
 * Views keep simple aliases, while lifecycle/state/cache ownership stays explicit and testable.
 */
export class ApplicationKernel {
  constructor({settings,cities,route,online,featureLoaders,analysisLoaders}){
    this.state=new AppState({settings,cities,route,online});
    this.cache=new CacheRegistry();
    this.features=new FeatureRegistry(featureLoaders);
    this.analysis=new LocalAnalysisStore({state:this.state,loaders:analysisLoaders});
    this.operations={
      weather:new OperationRegistry(),
      bias:new OperationRegistry(),
      normals:new OperationRegistry(),
    };
  }

  forgetCity(cityId){
    Object.values(this.operations).forEach(registry=>registry.delete(cityId));
    this.analysis.forget(cityId);
  }

  resetOperations(){ Object.values(this.operations).forEach(registry=>registry.clear()); }
}
