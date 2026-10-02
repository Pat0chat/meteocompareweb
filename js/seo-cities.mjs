const franceRows = [
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

// International SEO coverage follows Euromonitor International's 2025 Top 100
// City Destinations Index. Paris (#1) and Nice (#53) already exist in the
// historical French catalogue, so only the other 98 entries are listed here.
// Coordinates target the city centre; timezone values are IANA identifiers.
const globalRows = [
  [2,'madrid','Madrid','Spain','ES','Community of Madrid',40.4168,-3.7038,'Europe/Madrid'],
  [3,'tokyo','Tokyo','Japan','JP','Tokyo',35.6762,139.6503,'Asia/Tokyo'],
  [4,'rome','Rome','Italy','IT','Lazio',41.9028,12.4964,'Europe/Rome'],
  [5,'milan','Milan','Italy','IT','Lombardy',45.4642,9.1900,'Europe/Rome'],
  [6,'new-york','New York','United States','US','New York',40.7128,-74.0060,'America/New_York'],
  [7,'amsterdam','Amsterdam','Netherlands','NL','North Holland',52.3676,4.9041,'Europe/Amsterdam'],
  [8,'barcelona','Barcelona','Spain','ES','Catalonia',41.3874,2.1686,'Europe/Madrid'],
  [9,'singapore','Singapore','Singapore','SG','Singapore',1.3521,103.8198,'Asia/Singapore'],
  [10,'seoul','Seoul','South Korea','KR','Seoul',37.5665,126.9780,'Asia/Seoul'],
  [11,'osaka','Osaka','Japan','JP','Osaka',34.6937,135.5023,'Asia/Tokyo'],
  [12,'dubai','Dubai','United Arab Emirates','AE','Dubai',25.2048,55.2708,'Asia/Dubai'],
  [13,'los-angeles','Los Angeles','United States','US','California',34.0522,-118.2437,'America/Los_Angeles'],
  [14,'istanbul','Istanbul','Türkiye','TR','Istanbul',41.0082,28.9784,'Europe/Istanbul'],
  [15,'taipei','Taipei','Taiwan','TW','Taipei',25.0330,121.5654,'Asia/Taipei'],
  [16,'berlin','Berlin','Germany','DE','Berlin',52.5200,13.4050,'Europe/Berlin'],
  [17,'hong-kong','Hong Kong','China','HK','Hong Kong',22.3193,114.1694,'Asia/Hong_Kong'],
  [18,'london','London','United Kingdom','GB','England',51.5074,-0.1278,'Europe/London'],
  [19,'kyoto','Kyoto','Japan','JP','Kyoto',35.0116,135.7681,'Asia/Tokyo'],
  [20,'bangkok','Bangkok','Thailand','TH','Bangkok',13.7563,100.5018,'Asia/Bangkok'],
  [21,'orlando','Orlando','United States','US','Florida',28.5383,-81.3792,'America/New_York'],
  [22,'munich','Munich','Germany','DE','Bavaria',48.1351,11.5820,'Europe/Berlin'],
  [23,'florence','Florence','Italy','IT','Tuscany',43.7696,11.2558,'Europe/Rome'],
  [24,'kuala-lumpur','Kuala Lumpur','Malaysia','MY','Kuala Lumpur',3.1390,101.6869,'Asia/Kuala_Lumpur'],
  [25,'athens','Athens','Greece','GR','Attica',37.9838,23.7275,'Europe/Athens'],
  [26,'lisbon','Lisbon','Portugal','PT','Lisbon',38.7223,-9.1393,'Europe/Lisbon'],
  [27,'las-vegas','Las Vegas','United States','US','Nevada',36.1699,-115.1398,'America/Los_Angeles'],
  [28,'sydney','Sydney','Australia','AU','New South Wales',-33.8688,151.2093,'Australia/Sydney'],
  [29,'melbourne','Melbourne','Australia','AU','Victoria',-37.8136,144.9631,'Australia/Melbourne'],
  [30,'venice','Venice','Italy','IT','Veneto',45.4408,12.3155,'Europe/Rome'],
  [31,'vienna','Vienna','Austria','AT','Vienna',48.2082,16.3738,'Europe/Vienna'],
  [32,'prague','Prague','Czech Republic','CZ','Prague',50.0755,14.4378,'Europe/Prague'],
  [33,'dublin','Dublin','Ireland','IE','Leinster',53.3498,-6.2603,'Europe/Dublin'],
  [34,'shanghai','Shanghai','China','CN','Shanghai',31.2304,121.4737,'Asia/Shanghai'],
  [35,'san-francisco','San Francisco','United States','US','California',37.7749,-122.4194,'America/Los_Angeles'],
  [36,'miami','Miami','United States','US','Florida',25.7617,-80.1918,'America/New_York'],
  [37,'frankfurt','Frankfurt','Germany','DE','Hesse',50.1109,8.6821,'Europe/Berlin'],
  [38,'copenhagen','Copenhagen','Denmark','DK','Capital Region',55.6761,12.5683,'Europe/Copenhagen'],
  [39,'toronto','Toronto','Canada','CA','Ontario',43.6532,-79.3832,'America/Toronto'],
  [40,'washington-dc','Washington, D.C.','United States','US','District of Columbia',38.9072,-77.0369,'America/New_York'],
  [41,'guangzhou','Guangzhou','China','CN','Guangdong',23.1291,113.2644,'Asia/Shanghai'],
  [42,'beijing','Beijing','China','CN','Beijing',39.9042,116.4074,'Asia/Shanghai'],
  [43,'hamburg','Hamburg','Germany','DE','Hamburg',53.5511,9.9937,'Europe/Berlin'],
  [44,'sao-paulo','São Paulo','Brazil','BR','São Paulo',-23.5505,-46.6333,'America/Sao_Paulo'],
  [45,'pattaya-chonburi','Pattaya-Chonburi','Thailand','TH','Chonburi',12.9236,100.8825,'Asia/Bangkok'],
  [46,'shenzhen','Shenzhen','China','CN','Guangdong',22.5431,114.0579,'Asia/Shanghai'],
  [47,'phuket','Phuket','Thailand','TH','Phuket',7.8804,98.3923,'Asia/Bangkok'],
  [48,'antalya','Antalya','Türkiye','TR','Antalya',36.8969,30.7133,'Europe/Istanbul'],
  [49,'palma-de-mallorca','Palma de Mallorca','Spain','ES','Balearic Islands',39.5696,2.6502,'Europe/Madrid'],
  [50,'sapporo','Sapporo','Japan','JP','Hokkaido',43.0618,141.3545,'Asia/Tokyo'],
  [51,'seville','Seville','Spain','ES','Andalusia',37.3891,-5.9845,'Europe/Madrid'],
  [52,'ho-chi-minh-city','Ho Chi Minh City','Vietnam','VN','Ho Chi Minh City',10.8231,106.6297,'Asia/Ho_Chi_Minh'],
  [54,'mexico-city','Mexico City','Mexico','MX','Mexico City',19.4326,-99.1332,'America/Mexico_City'],
  [55,'zurich','Zurich','Switzerland','CH','Zürich',47.3769,8.5417,'Europe/Zurich'],
  [56,'busan','Busan','South Korea','KR','Busan',35.1796,129.0756,'Asia/Seoul'],
  [57,'oslo','Oslo','Norway','NO','Oslo',59.9139,10.7522,'Europe/Oslo'],
  [58,'vancouver','Vancouver','Canada','CA','British Columbia',49.2827,-123.1207,'America/Vancouver'],
  [59,'brussels','Brussels','Belgium','BE','Brussels-Capital Region',50.8503,4.3517,'Europe/Brussels'],
  [60,'budapest','Budapest','Hungary','HU','Budapest',47.4979,19.0402,'Europe/Budapest'],
  [61,'macau','Macau','China','MO','Macau',22.1987,113.5439,'Asia/Macau'],
  [62,'valencia','Valencia','Spain','ES','Valencian Community',39.4699,-0.3763,'Europe/Madrid'],
  [63,'helsinki','Helsinki','Finland','FI','Uusimaa',60.1699,24.9384,'Europe/Helsinki'],
  [64,'fukuoka','Fukuoka','Japan','JP','Fukuoka',33.5902,130.4017,'Asia/Tokyo'],
  [65,'honolulu','Honolulu','United States','US','Hawaii',21.3069,-157.8583,'Pacific/Honolulu'],
  [66,'abu-dhabi','Abu Dhabi','United Arab Emirates','AE','Abu Dhabi',24.4539,54.3773,'Asia/Dubai'],
  [67,'stockholm','Stockholm','Sweden','SE','Stockholm County',59.3293,18.0686,'Europe/Stockholm'],
  [68,'porto','Porto','Portugal','PT','Porto',41.1579,-8.6291,'Europe/Lisbon'],
  [69,'rhodes','Rhodes','Greece','GR','South Aegean',36.4349,28.2176,'Europe/Athens'],
  [70,'rio-de-janeiro','Rio de Janeiro','Brazil','BR','Rio de Janeiro',-22.9068,-43.1729,'America/Sao_Paulo'],
  [71,'verona','Verona','Italy','IT','Veneto',45.4384,10.9916,'Europe/Rome'],
  [72,'hanoi','Hanoi','Vietnam','VN','Hanoi',21.0278,105.8342,'Asia/Bangkok'],
  [73,'doha','Doha','Qatar','QA','Doha',25.2854,51.5310,'Asia/Qatar'],
  [74,'delhi','Delhi','India','IN','Delhi',28.6139,77.2090,'Asia/Kolkata'],
  [75,'bologna','Bologna','Italy','IT','Emilia-Romagna',44.4949,11.3426,'Europe/Rome'],
  [76,'riyadh','Riyadh','Saudi Arabia','SA','Riyadh',24.7136,46.6753,'Asia/Riyadh'],
  [77,'montreal','Montreal','Canada','CA','Quebec',45.5017,-73.5673,'America/Toronto'],
  [78,'warsaw','Warsaw','Poland','PL','Masovian Voivodeship',52.2297,21.0122,'Europe/Warsaw'],
  [79,'cancun','Cancún','Mexico','MX','Quintana Roo',21.1619,-86.8515,'America/Cancun'],
  [80,'buenos-aires','Buenos Aires','Argentina','AR','Buenos Aires',-34.6037,-58.3816,'America/Argentina/Buenos_Aires'],
  [81,'johor-bahru','Johor Bahru','Malaysia','MY','Johor',1.4927,103.7414,'Asia/Kuala_Lumpur'],
  [82,'heraklion','Heraklion','Greece','GR','Crete',35.3387,25.1442,'Europe/Athens'],
  [83,'bogota','Bogotá','Colombia','CO','Bogotá',4.7110,-74.0721,'America/Bogota'],
  [84,'lima','Lima','Peru','PE','Lima',-12.0464,-77.0428,'America/Lima'],
  [85,'edinburgh','Edinburgh','United Kingdom','GB','Scotland',55.9533,-3.1883,'Europe/London'],
  [86,'nha-trang','Nha Trang','Vietnam','VN','Khánh Hòa',12.2388,109.1967,'Asia/Ho_Chi_Minh'],
  [87,'medina','Medina','Saudi Arabia','SA','Al Madinah',24.5247,39.5692,'Asia/Riyadh'],
  [88,'santiago','Santiago','Chile','CL','Santiago Metropolitan Region',-33.4489,-70.6693,'America/Santiago'],
  [89,'thessaloniki','Thessaloniki','Greece','GR','Central Macedonia',40.6401,22.9444,'Europe/Athens'],
  [90,'jakarta','Jakarta','Indonesia','ID','Jakarta',-6.2088,106.8456,'Asia/Jakarta'],
  [91,'mecca','Mecca','Saudi Arabia','SA','Makkah',21.3891,39.8579,'Asia/Riyadh'],
  [92,'krakow','Kraków','Poland','PL','Lesser Poland',50.0647,19.9450,'Europe/Warsaw'],
  [93,'punta-cana','Punta Cana','Dominican Republic','DO','La Altagracia',18.5601,-68.3725,'America/Santo_Domingo'],
  [94,'tbilisi','Tbilisi','Georgia','GE','Tbilisi',41.7151,44.8271,'Asia/Tbilisi'],
  [95,'marrakech','Marrakech','Morocco','MA','Marrakesh-Safi',31.6295,-7.9811,'Africa/Casablanca'],
  [96,'denpasar','Denpasar','Indonesia','ID','Bali',-8.6705,115.2126,'Asia/Makassar'],
  [97,'cairo','Cairo','Egypt','EG','Cairo',30.0444,31.2357,'Africa/Cairo'],
  [98,'zhuhai','Zhuhai','China','CN','Guangdong',22.2707,113.5767,'Asia/Shanghai'],
  [99,'vilnius','Vilnius','Lithuania','LT','Vilnius County',54.6872,25.2797,'Europe/Vilnius'],
  [100,'mugla','Muğla','Türkiye','TR','Muğla',37.2153,28.3636,'Europe/Istanbul']
];

const globalRankBySlug=new Map([[1,'paris'],[53,'nice'],...globalRows.map(([rank,slug])=>[rank,slug])].map(([rank,slug])=>[slug,rank]));
const franceCities=franceRows.map(([slug,name,region,department,latitude,longitude])=>Object.freeze({
  id:`seo:${slug}`,slug,name,region,department,admin1:region,country:'France',countryCode:'FR',latitude,longitude,
  timezone:'Europe/Paris',marineEnabled:false,seoScope:'france',globalRank:globalRankBySlug.get(slug)||null
}));
const internationalCities=globalRows.map(([globalRank,slug,name,country,countryCode,region,latitude,longitude,timezone])=>Object.freeze({
  id:`seo:${slug}`,slug,name,region,department:'',admin1:region,country,countryCode,latitude,longitude,timezone,
  marineEnabled:false,seoScope:'global',globalRank
}));

export const SEO_CITIES = Object.freeze([...franceCities,...internationalCities]);
export const SEO_GLOBAL_CITIES = Object.freeze(SEO_CITIES.filter(city=>Number.isInteger(city.globalRank)).sort((a,b)=>a.globalRank-b.globalRank));

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
  const params=new URLSearchParams();
  if(!matched){
    if(city?.id!=null)params.set('id',String(city.id));
    if(city?.name)params.set('name',String(city.name));
    if(Number.isFinite(Number(city?.latitude)))params.set('lat',Number(city.latitude).toFixed(5));
    if(Number.isFinite(Number(city?.longitude)))params.set('lon',Number(city.longitude).toFixed(5));
    if(city?.timezone)params.set('tz',String(city.timezone));
    if(city?.country)params.set('country',String(city.country));
    if(city?.admin1||city?.region)params.set('admin1',String(city.admin1||city.region));
  }
  return `/meteo/${encodeURIComponent(slug)}${params.size?`?${params.toString()}`:''}`;
}
