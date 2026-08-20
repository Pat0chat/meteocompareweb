/**
 * Mutable application state with a stable, documented shape.
 * Keeping the shape in one class prevents view code from silently inventing new global state.
 */
export class AppState {
  constructor({settings,cities,route,online}) {
    this.settings=settings;
    this.cities=cities;
    this.forecasts={};
    this.loading=new Set();
    this.errors={};
    this.modal=null;
    this.route=route;
    this.normals={};
    this.evolution={};
    this.bias={};
    this.biasRefresh=new Set();
    this.online=Boolean(online);
    this.compareModelIds=[];
    this.comparePanelOpen={};
    this.evolutionVariable='temperature';
    this.reliabilityVariable='TEMPERATURE';
    this.localDataStats=null;
    this.localDataLoading=false;
    this.localDataError=null;
    this.integrityReport=null;
    this.integrityLoading=false;
    this.errorCenter=null;
    this.diagnosticsOpen=new Set();
    this.marine={};
    this.marineLoading=new Set();
    this.modelHealth={};
    this.modelHealthHistory={};
    this.modelHealthLoading=new Set();
    this.backupOptions={forecasts:false,normals:true,bias:true,evolution:true,marine:true,health:true};
    this.localDataUi={advancedOpen:false,privacyOpen:false,cacheOpen:false};
  }
}
