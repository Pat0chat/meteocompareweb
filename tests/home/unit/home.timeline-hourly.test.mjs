import assert from 'node:assert/strict';
import { selectRegularTimelinePoints } from '../../../js/domain.js';

const start=Date.UTC(2026,8,3,6);
const points=Array.from({length:18},(_,index)=>({
  mode:'HOURLY',
  epochMs:start+index*3600000,
  timestamp:`2026-09-03T${String(6+index).padStart(2,'0')}:00`,
}));

const timeline=selectRegularTimelinePoints(points,12,1);
assert.equal(timeline.length,12,'the home rail must contain 12 hourly slots');
assert.deepEqual(timeline.map(point=>point.epochMs),points.slice(0,12).map(point=>point.epochMs),'the home rail must not skip intermediate hours');
assert.equal(timeline.at(-1).epochMs-timeline[0].epochMs,11*3600000,'12 hourly slots must cover consecutive forecast hours');

console.log('Home 12-hour timeline sampling: OK');
