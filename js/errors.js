const DEFAULTS={
  OFFLINE_NO_CACHE:{severity:'error',titleKey:'errorOfflineTitle',messageKey:'offlineNoCache',actions:['retry']},
  OPEN_METEO_UNAVAILABLE:{severity:'error',titleKey:'errorWeatherServiceTitle',messageKey:'openMeteoUnreachable',actions:['retry','use-cache']},
  HTTP_ERROR:{severity:'error',titleKey:'errorWeatherServiceTitle',messageKey:'openMeteoHttpError',actions:['retry','use-cache']},
  OPEN_METEO_ERROR:{severity:'error',titleKey:'errorWeatherServiceTitle',messageKey:'openMeteoRejected',actions:['retry','use-cache']},
  NO_USABLE_MODELS:{severity:'error',titleKey:'errorNoModelsTitle',messageKey:'noUsableModels',actions:['retry','diagnostics']},
  NO_MODELS_ENABLED:{severity:'warning',titleKey:'errorNoModelsTitle',messageKey:'noModelsEnabled',actions:['settings']},
  STALE_CACHE:{severity:'warning',titleKey:'errorStaleCacheTitle',messageKey:'errorStaleCacheBody',actions:['retry','use-cache']},
  PARTIAL_MODELS:{severity:'warning',titleKey:'errorPartialModelsTitle',messageKey:'errorPartialModelsBody',actions:['diagnostics','retry']},
  INDEXEDDB_UNAVAILABLE:{severity:'warning',titleKey:'errorStorageTitle',messageKey:'errorIndexedDbUnavailable',actions:['local-data']},
  INDEXEDDB_BLOCKED:{severity:'warning',titleKey:'errorStorageTitle',messageKey:'errorIndexedDbBlocked',actions:['local-data']},
  INDEXEDDB_WRITE_FAILED:{severity:'warning',titleKey:'errorStorageTitle',messageKey:'errorIndexedDbWrite',actions:['local-data']},
  LOCAL_STORAGE_UNAVAILABLE:{severity:'warning',titleKey:'errorStorageTitle',messageKey:'errorLocalStorageUnavailable',actions:['local-data']},
  STORAGE_QUOTA:{severity:'error',titleKey:'errorStorageQuotaTitle',messageKey:'errorStorageQuotaBody',actions:['local-data','clear-old-data']},
  CORRUPT_LOCAL_RECORD:{severity:'warning',titleKey:'errorIntegrityTitle',messageKey:'errorIntegrityBody',actions:['local-data']},
  CORRUPT_IDB_RECORD:{severity:'warning',titleKey:'errorIntegrityTitle',messageKey:'errorIntegrityBody',actions:['local-data']},
  HISTORY_INSUFFICIENT:{severity:'info',titleKey:'errorHistoryTitle',messageKey:'errorHistoryInsufficient',actions:['settings']},
  UNKNOWN:{severity:'error',titleKey:'errorUnknownTitle',messageKey:'unknownError',actions:['retry']},
};

export function classifyError(err,{hasCache=false}={}){
  const message=String(err?.message||err||'');let code=err?.code||null;
  if(err?.name==='AbortError')code='OPEN_METEO_UNAVAILABLE';
  if(!code&&/Failed to fetch|NetworkError|Load failed/i.test(message))code='OPEN_METEO_UNAVAILABLE';
  if(!code)code='UNKNOWN';
  const base=DEFAULTS[code]||DEFAULTS.UNKNOWN;
  const actions=base.actions.filter(a=>a!=='use-cache'||hasCache);
  return {code,...base,actions,status:err?.status||null,technical:message};
}

export function storageIssueDescriptor(issue){
  const code=issue?.code||'UNKNOWN',base=DEFAULTS[code]||DEFAULTS.UNKNOWN;
  return {code,...base,actions:base.actions.filter(a=>a!=='retry'),technical:issue?.detail?.message||'',detail:issue?.detail||{}};
}

export class ErrorCenter {
  constructor(){this.items=new Map();}
  report(scope,descriptor){if(!scope||!descriptor)return;this.items.set(scope,{...descriptor,scope,at:Date.now(),dismissed:false});}
  resolve(scope){this.items.delete(scope);}
  dismiss(scope){const item=this.items.get(scope);if(item)this.items.set(scope,{...item,dismissed:true});}
  get(scope){const item=this.items.get(scope);return item&&!item.dismissed?item:null;}
  list(prefix=''){return [...this.items.values()].filter(x=>!x.dismissed&&(!prefix||x.scope.startsWith(prefix))).sort((a,b)=>b.at-a.at);}
  clear(){this.items.clear();}
}

export const ERROR_ACTIONS=Object.freeze({
  retry:'errorActionRetry',
  'use-cache':'errorActionUseCache',
  diagnostics:'errorActionDiagnostics',
  settings:'settings',
  'local-data':'localDataTitle',
  'clear-old-data':'errorActionManageStorage',
  dismiss:'close',
});
