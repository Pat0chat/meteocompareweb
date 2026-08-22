import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePreviewHtml } from './preview-html.mjs';

const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT)||4173;
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

createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`),file=await resolveRequest(url.pathname);
    if(!file){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');return;}
    let body=await readFile(file),type=types[extname(file).toLowerCase()]||'application/octet-stream';
    if(type.startsWith('text/html'))body=Buffer.from(preparePreviewHtml(body.toString('utf8')),'utf8');
    res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});res.end(String(error?.message||error));}
}).listen(port,'127.0.0.1',()=>console.log(`MeteoCompare preview: http://127.0.0.1:${port}`));
