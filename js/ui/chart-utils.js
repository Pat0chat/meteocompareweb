/** Shared SVG/chart primitives used by the application shell and lazy comparison views. */
function niceStep(raw){
  if(!Number.isFinite(raw)||raw<=0)return 1;
  const power=Math.pow(10,Math.floor(Math.log10(raw))),fraction=raw/power;
  const nice=fraction<=1?1:fraction<=2?2:fraction<=5?5:10;
  return nice*power;
}

export function chartScale(values,{includeZero=false,agreement=false,ticks=5,minSpan=.5,padding=.08}={}){
  const nums=(values||[]).filter(Number.isFinite);
  if(!nums.length)return {min:0,max:1,ticks:[0,1]};
  if(agreement)return {min:0,max:100,ticks:[0,25,50,75,100]};
  let rawMin=Math.min(...nums),rawMax=Math.max(...nums);
  if(includeZero){rawMin=Math.min(0,rawMin);rawMax=Math.max(0,rawMax);}
  if(rawMax-rawMin<minSpan){const mid=(rawMin+rawMax)/2;rawMin=mid-minSpan/2;rawMax=mid+minSpan/2;}
  const padded=(rawMax-rawMin)*padding;rawMin-=padded;rawMax+=padded;
  const step=niceStep((rawMax-rawMin)/Math.max(2,ticks-1));
  let min=Math.floor(rawMin/step)*step,max=Math.ceil(rawMax/step)*step;
  if(includeZero){min=Math.min(0,min);max=Math.max(0,max);}
  const out=[];
  for(let value=min,guard=0;value<=max+step*.25&&guard<12;value+=step,guard++)out.push(Math.abs(value)<step/1000?0:value);
  return {min,max,ticks:out};
}

export function chartTickIndices(length,maxTicks=7){
  if(length<=1)return [0];
  const step=Math.max(1,Math.ceil((length-1)/(maxTicks-1))),out=[];
  for(let index=0;index<length;index+=step)out.push(index);
  if(out[out.length-1]!==length-1)out.push(length-1);
  return out;
}

export function chartMetricUnit(metric){return metric==='TEMPERATURE'?'°C':metric==='PRECIPITATION'?'mm':metric==='AGREEMENT'?'%':'km/h';}
export function chartMetricDigits(metric){return metric==='PRECIPITATION'?1:0;}

export function svgLinePath(points){
  let drawing=false;
  return (points||[]).map(point=>{
    if(!point){drawing=false;return '';}
    const command=drawing?'L':'M';drawing=true;
    return `${command} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
  }).filter(Boolean).join(' ');
}
