const rows = [
  ['paris','Paris','Île-de-France','Paris',48.8566,2.3522],
  ['marseille','Marseille','Provence-Alpes-Côte d’Azur','Bouches-du-Rhône',43.2965,5.3698],
  ['lyon','Lyon','Auvergne-Rhône-Alpes','Rhône',45.7640,4.8357],
  ['toulouse','Toulouse','Occitanie','Haute-Garonne',43.6047,1.4442],
  ['nice','Nice','Provence-Alpes-Côte d’Azur','Alpes-Maritimes',43.7102,7.2620],
  ['nantes','Nantes','Pays de la Loire','Loire-Atlantique',47.2184,-1.5536],
  ['montpellier','Montpellier','Occitanie','Hérault',43.6108,3.8767],
  ['strasbourg','Strasbourg','Grand Est','Bas-Rhin',48.5734,7.7521],
  ['bordeaux','Bordeaux','Nouvelle-Aquitaine','Gironde',44.8378,-0.5792],
  ['lille','Lille','Hauts-de-France','Nord',50.6292,3.0573],
  ['rennes','Rennes','Bretagne','Ille-et-Vilaine',48.1173,-1.6778],
  ['reims','Reims','Grand Est','Marne',49.2583,4.0317],
  ['toulon','Toulon','Provence-Alpes-Côte d’Azur','Var',43.1242,5.9280],
  ['saint-etienne','Saint-Étienne','Auvergne-Rhône-Alpes','Loire',45.4397,4.3872],
  ['le-havre','Le Havre','Normandie','Seine-Maritime',49.4944,0.1079],
  ['dijon','Dijon','Bourgogne-Franche-Comté','Côte-d’Or',47.3220,5.0415],
  ['grenoble','Grenoble','Auvergne-Rhône-Alpes','Isère',45.1885,5.7245],
  ['angers','Angers','Pays de la Loire','Maine-et-Loire',47.4784,-0.5632],
  ['villeurbanne','Villeurbanne','Auvergne-Rhône-Alpes','Rhône',45.7719,4.8902],
  ['nimes','Nîmes','Occitanie','Gard',43.8367,4.3601],
  ['clermont-ferrand','Clermont-Ferrand','Auvergne-Rhône-Alpes','Puy-de-Dôme',45.7772,3.0870],
  ['aix-en-provence','Aix-en-Provence','Provence-Alpes-Côte d’Azur','Bouches-du-Rhône',43.5297,5.4474],
  ['le-mans','Le Mans','Pays de la Loire','Sarthe',48.0061,0.1996],
  ['brest','Brest','Bretagne','Finistère',48.3904,-4.4861],
  ['tours','Tours','Centre-Val de Loire','Indre-et-Loire',47.3941,0.6848],
  ['amiens','Amiens','Hauts-de-France','Somme',49.8941,2.2958],
  ['annecy','Annecy','Auvergne-Rhône-Alpes','Haute-Savoie',45.8992,6.1294],
  ['limoges','Limoges','Nouvelle-Aquitaine','Haute-Vienne',45.8336,1.2611],
  ['boulogne-billancourt','Boulogne-Billancourt','Île-de-France','Hauts-de-Seine',48.8397,2.2399],
  ['perpignan','Perpignan','Occitanie','Pyrénées-Orientales',42.6887,2.8948],
  ['metz','Metz','Grand Est','Moselle',49.1193,6.1757],
  ['besancon','Besançon','Bourgogne-Franche-Comté','Doubs',47.2378,6.0241],
  ['orleans','Orléans','Centre-Val de Loire','Loiret',47.9030,1.9093],
  ['rouen','Rouen','Normandie','Seine-Maritime',49.4431,1.0993],
  ['mulhouse','Mulhouse','Grand Est','Haut-Rhin',47.7508,7.3359],
  ['caen','Caen','Normandie','Calvados',49.1829,-0.3707],
  ['nancy','Nancy','Grand Est','Meurthe-et-Moselle',48.6921,6.1844],
  ['argenteuil','Argenteuil','Île-de-France','Val-d’Oise',48.9472,2.2467],
  ['montreuil','Montreuil','Île-de-France','Seine-Saint-Denis',48.8638,2.4485],
  ['roubaix','Roubaix','Hauts-de-France','Nord',50.6927,3.1746],
  ['tourcoing','Tourcoing','Hauts-de-France','Nord',50.7239,3.1612],
  ['nanterre','Nanterre','Île-de-France','Hauts-de-Seine',48.8924,2.2069],
  ['avignon','Avignon','Provence-Alpes-Côte d’Azur','Vaucluse',43.9493,4.8055],
  ['creteil','Créteil','Île-de-France','Val-de-Marne',48.7904,2.4556],
  ['poitiers','Poitiers','Nouvelle-Aquitaine','Vienne',46.5802,0.3404],
  ['versailles','Versailles','Île-de-France','Yvelines',48.8049,2.1204],
  ['dunkerque','Dunkerque','Hauts-de-France','Nord',51.0344,2.3768],
  ['la-rochelle','La Rochelle','Nouvelle-Aquitaine','Charente-Maritime',46.1603,-1.1511],
  ['pau','Pau','Nouvelle-Aquitaine','Pyrénées-Atlantiques',43.2951,-0.3708],
  ['cherbourg-en-cotentin','Cherbourg-en-Cotentin','Normandie','Manche',49.6337,-1.6221],
  ['calais','Calais','Hauts-de-France','Pas-de-Calais',50.9513,1.8587],
  ['cannes','Cannes','Provence-Alpes-Côte d’Azur','Alpes-Maritimes',43.5528,7.0174],
  ['antibes','Antibes','Provence-Alpes-Côte d’Azur','Alpes-Maritimes',43.5804,7.1251],
  ['ajaccio','Ajaccio','Corse','Corse-du-Sud',41.9192,8.7386],
  ['bourges','Bourges','Centre-Val de Loire','Cher',47.0810,2.3988],
  ['saint-nazaire','Saint-Nazaire','Pays de la Loire','Loire-Atlantique',47.2736,-2.2137],
  ['colmar','Colmar','Grand Est','Haut-Rhin',48.0793,7.3585],
  ['valence','Valence','Auvergne-Rhône-Alpes','Drôme',44.9334,4.8924],
  ['quimper','Quimper','Bretagne','Finistère',47.9975,-4.0979],
  ['troyes','Troyes','Grand Est','Aube',48.2973,4.0744],
  ['lorient','Lorient','Bretagne','Morbihan',47.7483,-3.3702],
  ['chambery','Chambéry','Auvergne-Rhône-Alpes','Savoie',45.5646,5.9178],
  ['niort','Niort','Nouvelle-Aquitaine','Deux-Sèvres',46.3237,-0.4648],
  ['vannes','Vannes','Bretagne','Morbihan',47.6582,-2.7608],
  ['beauvais','Beauvais','Hauts-de-France','Oise',49.4295,2.0807],
  ['la-roche-sur-yon','La Roche-sur-Yon','Pays de la Loire','Vendée',46.6705,-1.4260],
  ['narbonne','Narbonne','Occitanie','Aude',43.1843,3.0031],
  ['bayonne','Bayonne','Nouvelle-Aquitaine','Pyrénées-Atlantiques',43.4929,-1.4748],
  ['laval','Laval','Pays de la Loire','Mayenne',48.0700,-0.7700],
  ['albi','Albi','Occitanie','Tarn',43.9298,2.1480],
  ['tarbes','Tarbes','Occitanie','Hautes-Pyrénées',43.2329,0.0781],
  ['carcassonne','Carcassonne','Occitanie','Aude',43.2130,2.3491],
  ['bastia','Bastia','Corse','Haute-Corse',42.6973,9.4509],
  ['blois','Blois','Centre-Val de Loire','Loir-et-Cher',47.5861,1.3359],
  ['chateauroux','Châteauroux','Centre-Val de Loire','Indre',46.8103,1.6917],
  ['evreux','Évreux','Normandie','Eure',49.0270,1.1514],
  ['brive-la-gaillarde','Brive-la-Gaillarde','Nouvelle-Aquitaine','Corrèze',45.1596,1.5333],
  ['montauban','Montauban','Occitanie','Tarn-et-Garonne',44.0176,1.3549],
  ['beziers','Béziers','Occitanie','Hérault',43.3442,3.2158],
  ['sete','Sète','Occitanie','Hérault',43.4028,3.6977]
];

export const SEO_CITIES = Object.freeze(rows.map(([slug,name,region,department,latitude,longitude],index)=>Object.freeze({
  id:`seo:${slug}`, slug, name, region, department, admin1:region, country:'France', latitude, longitude,
  timezone:'Europe/Paris', marineEnabled:false, seoRank:index+1
})));

const bySlug=new Map(SEO_CITIES.map(city=>[city.slug,city]));
const byId=new Map(SEO_CITIES.map(city=>[city.id,city]));

export function slugifyCityName(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
}
export function seoCityBySlug(slug){return bySlug.get(slugifyCityName(slug))||null;}
export function seoCityById(id){return byId.get(String(id||''))||null;}
function distanceSq(a,b){const lat=(Number(a?.latitude)||0)-(Number(b?.latitude)||0),lon=(Number(a?.longitude)||0)-(Number(b?.longitude)||0);return lat*lat+lon*lon;}
export function matchSeoCity(city){
  if(!city)return null;
  const exact=seoCityById(city.id);if(exact)return exact;
  const slug=slugifyCityName(city.name),sameName=bySlug.get(slug);
  if(sameName&&distanceSq(city,sameName)<0.03*0.03)return sameName;
  let best=null,bestDistance=Infinity;
  for(const candidate of SEO_CITIES){
    if(slugifyCityName(candidate.name)!==slug)continue;
    const d=distanceSq(city,candidate);if(d<bestDistance){best=candidate;bestDistance=d;}
  }
  return bestDistance<0.05*0.05?best:null;
}
export function cityPublicPath(city){
  const matched=matchSeoCity(city),slug=matched?.slug||slugifyCityName(city?.name)||'ville';
  const params=new URLSearchParams();if(!matched&&city?.id!=null)params.set('id',String(city.id));
  return `/meteo/${encodeURIComponent(slug)}${params.size?`?${params.toString()}`:''}`;
}
export function nearbySeoCities(city,limit=6){
  if(!city)return [];
  const matched=matchSeoCity(city),source=matched||city;
  return SEO_CITIES.filter(candidate=>candidate.id!==matched?.id).map(candidate=>({city:candidate,distance:distanceSq(source,candidate)})).sort((a,b)=>a.distance-b.distance||a.city.seoRank-b.city.seoRank).slice(0,Math.max(0,limit)).map(row=>row.city);
}
