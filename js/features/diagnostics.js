function coverage(meta,key){const row=meta?.coverageByVariable?.[key]||{};return {count:Number(row.count)||0,firstTimestamp:row.firstTimestamp||null,lastTimestamp:row.lastTimestamp||null};}
export function buildCityDiagnostics(forecast, models, enabledIds=[]){
  const enabled=new Set(enabledIds||[]),rows=[];
  for(const model of models){
    const active=enabled.has(model.id),series=forecast?.seriesByModel?.[model.id]||null,meta=forecast?.modelMeta?.[model.id]||null,error=forecast?.errors?.[model.id]||null;
    const vars={temperature:coverage(meta,'temperature'),precipitation:coverage(meta,'precipitation'),wind:coverage(meta,'wind'),conditions:coverage(meta,'conditions')};
    let status='DISABLED';
    if(active){
      if(!series) status=(model.coverage&&model.coverage!=='GLOBAL')?'OUT_OF_DOMAIN_OR_UNAVAILABLE':'UNAVAILABLE';
      else if(!vars.temperature.count||!vars.precipitation.count||!vars.wind.count)status='VARIABLE_MISSING';
      else if(meta?.dataWarning==='PARTIAL_HOURLY_SERIES')status='PARTIAL';
      else if(meta?.recoveredFromBatch)status='RECOVERED';
      else status='OK';
    }
    rows.push({modelId:model.id,name:model.name,family:model.family,coverage:model.coverage,resolutionKm:model.resolutionKm,active,status,error,timezone:forecast?.city?.timezone||forecast?.timezone||null,loadedAt:meta?.loadedAt||forecast?.fetchedAt||null,runTimestamp:meta?.runTimestamp||null,recoveryAttempted:Boolean(meta?.recoveryAttempted),recoveredFromBatch:Boolean(meta?.recoveredFromBatch),nativeStepMinutes:meta?.nativeStepMinutes||model.nativeStepMinutes||null,variables:vars,health:meta?.hourlyHealth||null});
  }
  const activeRows=rows.filter(r=>r.active),summary={ok:activeRows.filter(r=>r.status==='OK').length,recovered:activeRows.filter(r=>r.status==='RECOVERED').length,partial:activeRows.filter(r=>['PARTIAL','VARIABLE_MISSING'].includes(r.status)).length,unavailable:activeRows.filter(r=>['UNAVAILABLE','OUT_OF_DOMAIN_OR_UNAVAILABLE'].includes(r.status)).length,total:activeRows.length};
  return {generatedAt:Date.now(),timezone:forecast?.city?.timezone||forecast?.timezone||null,rows,summary};
}
