import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),dist=join(root,'dist');
const runtimeEntries=[
  'index.html','styles.css','sw.js','_routes.json','.nojekyll',
  'manifest.webmanifest','manifest.fr.webmanifest','manifest.en.webmanifest','manifest.es.webmanifest','manifest.de.webmanifest','manifest.it.webmanifest',
  'assets','js'
];
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const name of runtimeEntries)await cp(join(root,name),join(dist,name),{recursive:true});
console.log(`Cloudflare Pages static output: ${dist}`);
