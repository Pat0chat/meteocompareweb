import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePreviewHtml } from './preview-html.mjs';
import { fetchNetworkResponse } from '../js/network.js';
import { NETWORK_ENDPOINTS, NETWORK_TIMEOUTS_MS } from '../js/network-config.js';

const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT)||4173;

const modelMetadataPath=NETWORK_ENDPOINTS.firstParty.modelMetadata;
const modelMetadataUpstream=NETWORK_ENDPOINTS.openMeteo.modelMetadataUpstream;
const modelMetadataKey=/^[a-z0-9_]{1,80}$/i;

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json; charset=utf-8'};

function safePath(pathname){
  const decoded=decodeURIComponent(pathname.split('?')[0]||'/');
  const cleaned=normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/,'');
  return resolve(root,cleaned||'index.html');
}
async function existingFile(path){
  try{const info=await stat(path);return info.isFile()?path:null;}catch{return null;}
}
async function resolveRequest(pathname){
  const base=safePath(pathname);
  if(!base.startsWith(root))return null;
  let file=await existingFile(base);if(file)return file;
  file=await existingFile(`${base}.html`);if(file)return file;
  file=await existingFile(join(base,'index.html'));if(file)return file;
  return existingFile(join(root,'index.html'));
}


let metadataUpstreamUnavailableUntil=0;
function previewMetadataFallback(res,error='UPSTREAM_UNAVAILABLE'){
  const body=JSON.stringify({unavailable:true,error,previewFallback:true});
  res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-meteocompare-preview-fallback':'forecast-run'});res.end(body);
}
async function proxyModelMetadata(url,res){
  const key=(url.searchParams.get('key')||'').trim();
  if(!modelMetadataKey.test(key)){res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});res.end('Invalid model key');return;}
  if(Date.now()<metadataUpstreamUnavailableUntil){previewMetadataFallback(res);return;}
  try{
    const upstream=await fetchNetworkResponse(`${modelMetadataUpstream}/${encodeURIComponent(key)}/latest.json`,{timeoutMs:Math.min(NETWORK_TIMEOUTS_MS.workerUpstream,4000),headers:{Accept:'application/json'}});
    const body=Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')||'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);
  }catch(error){
    metadataUpstreamUnavailableUntil=Date.now()+30_000;
    console.warn(`Preview model metadata unavailable for ${key}; using forecast-run fallback:`,error?.message||error);
    previewMetadataFallback(res,error?.code==='NETWORK_TIMEOUT'?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE');
  }
}

createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(url.pathname===modelMetadataPath){await proxyModelMetadata(url,res);return;}
    const file=await resolveRequest(url.pathname);
    if(!file){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');return;}
    let body=await readFile(file),type=types[extname(file).toLowerCase()]||'application/octet-stream';
    if(type.startsWith('text/html'))body=Buffer.from(preparePreviewHtml(body.toString('utf8'),{pathname:url.pathname}),'utf8');
    res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});res.end(String(error?.message||error));}
}).listen(port,'127.0.0.1',()=>console.log(`MeteoCompare preview: http://127.0.0.1:${port}`));
