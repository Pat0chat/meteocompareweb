import assert from 'node:assert/strict';
import fs from 'node:fs';

const styles=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../../../admin.css',import.meta.url),'utf8');

function assertBalancedCss(source,label){
  let depth=0;
  let quote='';
  let comment=false;
  let escaped=false;
  for(let index=0;index<source.length;index++){
    const char=source[index],next=source[index+1];
    if(comment){
      if(char==='*'&&next==='/'){comment=false;index++;}
      continue;
    }
    if(quote){
      if(escaped){escaped=false;continue;}
      if(char==='\\'){escaped=true;continue;}
      if(char===quote)quote='';
      continue;
    }
    if(char==='/'&&next==='*'){comment=true;index++;continue;}
    if(char==='"'||char==="'"){quote=char;continue;}
    if(char==='{')depth++;
    if(char==='}'){
      depth--;
      assert.ok(depth>=0,`${label} contains an unmatched closing brace`);
    }
  }
  assert.equal(comment,false,`${label} contains an unterminated comment`);
  assert.equal(quote,'',`${label} contains an unterminated string`);
  assert.equal(depth,0,`${label} contains unbalanced declaration blocks`);
}

for(const [label,source] of [['styles.css',styles],['admin.css',admin]]){
  assertBalancedCss(source,label);
  assert.doesNotMatch(source,/[ \t]+$/m,`${label} must not contain trailing whitespace`);
  assert.doesNotMatch(source,/\n{4,}/,`${label} must not accumulate large empty vertical gaps`);
}

assert.equal((styles.match(/^\.graphic-legend \{/gm)||[]).length,1,'graphic legend base styles must have one canonical rule');
assert.equal((styles.match(/^\.graphic-rain-scale \{/gm)||[]).length,1,'graphic rain-scale base styles must have one canonical rule');
