import { spawn } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_CITIES } from '../js/seo-cities.mjs';
import { readProjectVersion } from './project-version.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=join(root,'dist');
const slash=value=>value.replaceAll('\\','/');

async function walk(directory,{exclude=new Set()}={}){
  const rows=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(exclude.has(entry.name))continue;
    const target=join(directory,entry.name);
    if(entry.isDirectory())rows.push(...await walk(target,{exclude}));
    else rows.push(target);
  }
  return rows;
}

async function exists(target){
  try{await access(target,fsConstants.F_OK);return true;}catch{return false;}
}

function run(command,args,label,{quiet=false}={}){
  return new Promise((resolveRun,reject)=>{
    const child=spawn(command,args,{cwd:root,stdio:quiet?['ignore','pipe','pipe']:'inherit'});
    let output='';
    if(quiet){child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});}
    child.on('error',reject);
    child.on('exit',code=>code===0?resolveRun():reject(new Error(`${label} failed${output?`\n${output.trim()}`:''}`)));
  });
}

function assert(condition,message){if(!condition)throw new Error(message);}

async function auditSource(){
  const files=await walk(root,{exclude:new Set(['.git','dist','release'])});
  const scripts=files.filter(file=>['.js','.mjs'].includes(extname(file)));
  for(const file of scripts)await run(process.execPath,['--check',file],`Syntax check ${slash(relative(root,file))}`,{quiet:true});

  const forbidden=files.filter(file=>{
    const rel=slash(relative(root,file)),name=rel.split('/').at(-1);
    if(name==='.DS_Store'||name==='Thumbs.db'||name.endsWith('~')||name.endsWith('.log')||name.endsWith('.map'))return true;
    if(/^\.env(?:\.|$)/.test(name)&&!name.endsWith('.example'))return true;
    return name==='.dev.vars';
  });
  assert(!forbidden.length,`Forbidden release artifacts: ${forbidden.map(file=>slash(relative(root,file))).join(', ')}`);

  const markdown=files.filter(file=>extname(file)==='.md');
  for(const file of markdown){
    const source=await readFile(file,'utf8');
    for(const match of source.matchAll(/\[[^\]]*\]\(([^)]+\.md)(?:#[^)]+)?\)/g)){
      const target=match[1];
      if(/^[a-z]+:/i.test(target))continue;
      assert(await exists(resolve(dirname(file),target)),`${slash(relative(root,file))}: broken documentation link ${target}`);
    }
  }
  return {files,scripts,tests:files.filter(file=>file.endsWith('.test.mjs'))};
}

async function auditBuild(version){
  const required=['index.html','404.html','styles.css','sw.js','app-version.js','cache-version.js','manifest.webmanifest','sitemap.xml','robots.txt','_redirects','VERSION'];
  for(const rel of required)assert(await exists(join(dist,rel)),`Production build is missing dist/${rel}`);

  const cityPages=(await readdir(join(dist,'meteo'))).filter(name=>name.endsWith('.html'));
  assert(cityPages.length===SEO_CITIES.length,`Production build has ${cityPages.length} city pages; expected ${SEO_CITIES.length}`);
  assert(!(await exists(join(dist,'js','server'))),'Server-only modules leaked into the public build');
  const builtFiles=await walk(dist);
  assert(!builtFiles.some(file=>file.endsWith('.map')),'Source maps must not ship in the production build');
  assert((await readFile(join(dist,'VERSION'),'utf8')).trim()===version,'dist/VERSION does not match app-version.js');

  const browserSources=(await walk(join(root,'js'))).filter(file=>file.endsWith('.js')&&!slash(relative(root,file)).startsWith('js/server/'));
  const browserBuild=(await walk(join(dist,'js'))).filter(file=>file.endsWith('.js'));
  assert(browserBuild.length===browserSources.length,`Public JS module count mismatch: ${browserBuild.length} built, ${browserSources.length} expected`);
  return {builtFiles,cityPages};
}

try{
  const version=await readProjectVersion(root);
  const source=await auditSource();
  await run(process.execPath,['tools/run-tests.mjs'],'Full test suite');
  await run(process.execPath,['tools/build-site.mjs'],'Production build');
  const build=await auditBuild(version);
  console.log(`Release audit passed for MeteoCompare ${version}: ${source.scripts.length} JavaScript sources, ${source.tests.length} test files, ${build.cityPages.length} city pages, ${build.builtFiles.length} production files.`);
}catch(error){
  console.error(`Release audit failed: ${error?.message||error}`);
  process.exitCode=1;
}
