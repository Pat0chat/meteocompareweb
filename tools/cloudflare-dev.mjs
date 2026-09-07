import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const devVarsPath=resolve(root,'.dev.vars');
const port='8787';

function parseAssignedKeys(text){
  const keys=new Set();
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const match=line.match(/^([A-Z0-9_]+)\s*=/i);
    if(match)keys.add(match[1]);
  }
  return keys;
}
function quoted(value){return JSON.stringify(String(value));}
function ensureLocalSecrets(){
  let text=existsSync(devVarsPath)?readFileSync(devVarsPath,'utf8'):'';
  const keys=parseAssignedKeys(text),added=[];
  if(!text.trim())text='# Local Cloudflare development only. Never commit this file.\n';
  if(!keys.has('ADMIN_PASSWORD')){const value=`mcx-local-${randomBytes(4).toString('hex')}`;text+=`\nADMIN_PASSWORD=${quoted(value)}\n`;added.push(['ADMIN_PASSWORD',value]);}
  if(!keys.has('ADMIN_SESSION_SECRET')){const value=randomBytes(32).toString('base64url');text+=`ADMIN_SESSION_SECRET=${quoted(value)}\n`;added.push(['ADMIN_SESSION_SECRET',value]);}
  if(!keys.has('ANALYTICS_HASH_SECRET')){const value=randomBytes(32).toString('base64url');text+=`ANALYTICS_HASH_SECRET=${quoted(value)}\n`;added.push(['ANALYTICS_HASH_SECRET',value]);}
  if(!keys.has('METEOFRANCE_API_KEY')&&!text.includes('METEOFRANCE_API_KEY='))text+='\n# Optional: METEOFRANCE_API_KEY="..."\n';
  if(added.length){writeFileSync(devVarsPath,text,{mode:0o600});console.log(`\n[cloudflare] Secrets locaux créés/complétés dans .dev.vars`);for(const [key,value] of added)if(key==='ADMIN_PASSWORD')console.log(`[cloudflare] Mot de passe admin local : ${value}`);}
}

ensureLocalSecrets();
console.log('[cloudflare] Build de production…');
const build=spawnSync(process.execPath,[resolve(root,'tools/build-site.mjs')],{cwd:root,stdio:'inherit'});
if(build.status!==0)process.exit(build.status??1);

console.log(`\n[cloudflare] Environnement Cloudflare local : http://localhost:${port}`);
console.log(`[cloudflare] Administration : http://localhost:${port}/admin`);
console.log('[cloudflare] Les données analytics locales sont persistées dans .wrangler/state.');
console.log('[cloudflare] Démarrage de Wrangler…\n');
