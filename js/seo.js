export function slugifyCityName(value=''){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[’']/g,'-')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-{2,}/g,'-') || 'ville';
}

export function citySeoPath(city){
  return `/meteo/${encodeURIComponent(slugifyCityName(city?.name||city?.id||'ville'))}`;
}

export function seoCityTitle(cityName,lang='fr'){
  const city=String(cityName||'').trim()||'Ville';
  const titles={
    fr:`Météo ${city} : prévisions multi-modèles | MeteoCompare`,
    en:`${city} weather: multi-model forecast | MeteoCompare`,
    es:`Tiempo en ${city}: previsión multimodelo | MeteoCompare`,
    de:`Wetter ${city}: Multi-Modell-Vorhersage | MeteoCompare`,
    it:`Meteo ${city}: previsioni multi-modello | MeteoCompare`,
  };
  return titles[lang]||titles.fr;
}

export function seoCityDescription(city,lang='fr'){
  const name=String(city?.name||'').trim()||'cette ville';
  const place=[city?.admin1,city?.country].filter(Boolean).join(', ');
  const where=place?` (${place})`:'';
  const descriptions={
    fr:`Prévisions météo pour ${name}${where} : températures, pluie, vent, nuages et comparaison de plusieurs modèles météo avec leur niveau d’accord.`,
    en:`Weather forecast for ${name}${where}: temperature, rain, wind, cloud cover and comparison of several weather models with their agreement level.`,
    es:`Previsión del tiempo para ${name}${where}: temperatura, lluvia, viento, nubosidad y comparación de varios modelos con su nivel de acuerdo.`,
    de:`Wettervorhersage für ${name}${where}: Temperatur, Regen, Wind, Bewölkung und Vergleich mehrerer Wettermodelle samt Übereinstimmung.`,
    it:`Previsioni meteo per ${name}${where}: temperature, pioggia, vento, nuvolosità e confronto tra più modelli con il loro livello di accordo.`,
  };
  return descriptions[lang]||descriptions.fr;
}

export function seoCityH1(cityName,lang='fr'){
  const city=String(cityName||'').trim()||'Ville';
  const headings={fr:`Météo à ${city}`,en:`Weather in ${city}`,es:`Tiempo en ${city}`,de:`Wetter in ${city}`,it:`Meteo a ${city}`};
  return headings[lang]||headings.fr;
}

function metaContent(name,doc){return doc?.querySelector?.(`meta[name="${name}"]`)?.getAttribute?.('content')||'';}

export function readSeoBootstrapCity(doc=globalThis.document){
  if(!doc?.querySelector)return null;
  const id=metaContent('meteocompare:city-id',doc),name=metaContent('meteocompare:city-name',doc),latitude=Number(metaContent('meteocompare:city-latitude',doc)),longitude=Number(metaContent('meteocompare:city-longitude',doc));
  if(!id||!name||!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
  return {
    id,name,
    admin1:metaContent('meteocompare:city-admin1',doc),
    country:metaContent('meteocompare:city-country',doc),
    latitude,longitude,
    timezone:metaContent('meteocompare:city-timezone',doc)||null,
    _seoTransient:true,
  };
}
