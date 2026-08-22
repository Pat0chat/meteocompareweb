import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir=dirname(fileURLToPath(import.meta.url));
const projectRoot=resolve(toolsDir,'..');

export function parseProjectVersion(source=''){
  const match=String(source).match(/METEOCOMPARE_APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if(!match)throw new Error('app-version.js: METEOCOMPARE_APP_VERSION is missing or is not semantic x.y.z');
  return match[1];
}

export async function readProjectVersion(root=projectRoot){
  return parseProjectVersion(await readFile(resolve(root,'app-version.js'),'utf8'));
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.stdout.write(`${await readProjectVersion()}\n`);
}
