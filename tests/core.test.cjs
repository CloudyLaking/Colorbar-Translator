const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const D=require('../src/detect.js');
const gradient=Array.from({length:501},(_,i)=>i<=100?[i*2,0,100]:[200,(i-100)*.6,100]);

test('continuous extraction preserves nonuniform control point positions',()=>{
  const m=C.extract(gradient,{mode:'continuous',tolerance:1});
  assert.ok(m.stops.some(s=>Math.abs(s.position-.2)<.01));
  assert.ok(m.error.rgbMax<2);assert.ok(m.stops.length<8);
  assert.match(C.exportCode(m,'matplotlib'),/Normalize/);
});
test('reversal preserves positions and all samples',()=>{
  const m=C.extract(gradient,{mode:'continuous',reverse:true});
  assert.deepEqual(C.evaluate(m,0),[200,240,100]);
  assert.ok(m.stops.some(s=>Math.abs(s.position-.8)<.01));
});
test('unequal plateaus retain widths, and never interpolate across steps',()=>{
  const m=C.extract([...Array(20).fill([0,0,255]),...Array(50).fill([255,255,255]),...Array(30).fill([255,0,0])]);
  assert.equal(m.mode,'discrete');assert.equal(m.bands.length,3);
  assert.equal(m.bands[0].end,.2);assert.equal(m.bands[1].end,.7);
  const p=C.exportCode(m,'plotly');assert.match(p,/\[0.2,"#0000ff"\],\[0.2,"#ffffff"\]/);
  const rows=C.exportCode(m,'cpt').split('\n').filter(v=>/^\d/.test(v));
  for(const row of rows){const a=row.split(' ');assert.deepEqual(a.slice(1,4),a.slice(5,8));}
});
test('smooth gray ramp is not mistaken for discrete bins',()=>{
  const m=C.extract(Array.from({length:256},(_,i)=>[i,i,i]));
  assert.equal(m.mode,'continuous');assert.equal(m.stops.length,2);
});
test('numeric boundaries are strict and consistent across exporters',()=>{
  const m=C.extract([...Array(30).fill([0,0,0]),...Array(30).fill([255,255,255])]);
  m.rangeConfirmed=true;m.bounds=[-5,2,30];
  assert.match(C.exportCode(m,'matplotlib'),/\[-5,2,30\]/);
  for(const bounds of [[0,0,2],[0,2],[0,NaN,2]]){m.bounds=bounds;assert.throws(()=>C.exportCode(m,'json'));}
});
test('log normalization is explicit and physically positioned in Plotly/CPT',()=>{
  const m=C.extract(gradient,{mode:'continuous'});m.range=[1,100];m.scale='log';m.rangeConfirmed=true;
  assert.match(C.exportCode(m,'matplotlib'),/LogNorm/);
  const code=C.exportCode(m,'plotly');assert.match(code,/zmin=1, zmax=100/);
  m.range=[0,100];assert.throws(()=>C.exportCode(m,'cpt'));
});
test('all six formats produce nonempty output; JSON roundtrips',()=>{
  const m=C.extract(gradient,{mode:'continuous'});
  for(const f of ['matplotlib','plotly','cpt','css','json','javascript'])assert.ok(C.exportCode(m,f).length>50);
  assert.equal(JSON.parse(C.exportCode(m,'json')).version,'1.0.1');
});
function fixture(vertical=false,gray=false){
  const width=vertical?80:220,height=vertical?220:80,data=new Uint8ClampedArray(width*height*4).fill(255);
  for(let a=10;a<210;a++)for(let c=20;c<50;c++){
    const x=vertical?c:a,y=vertical?a:c,at=(y*width+x)*4,t=(a-10)/199;
    const rgb=gray?[20+t*210,20+t*210,20+t*210]:[20+t*200,80,220-t*160];data.set([...rgb,255],at);
  }
  return {width,height,data};
}
for(const vertical of [false,true])for(const gray of [false,true])test(`detect and extract ${vertical?'vertical':'horizontal'} ${gray?'gray':'color'} rectangle`,()=>{
  const image=fixture(vertical,gray),found=D.detect(image);
  assert.ok(found.length);assert.equal(found[0].vertical,vertical);
  const b=found[0].box;assert.ok(Math.abs((vertical?b.height:b.width)-200)<5);
  const samples=C.profile(image,b,vertical);assert.ok(samples.length>=196);
  assert.ok(C.extract(samples,{mode:'continuous'}).error.rgbMax<3);
});
test('cross-axis median rejects sparse text/noise and transparency is not black',()=>{
  const image=fixture();const before=C.profile(image,{x:10,y:20,width:200,height:30});
  for(let x=10;x<210;x++)image.data.set([0,0,0,255],(30*image.width+x)*4);
  assert.deepEqual(C.profile(image,{x:10,y:20,width:200,height:30}),before);
  image.data.fill(0);assert.throws(()=>C.profile(image,{x:10,y:20,width:200,height:30}));
});
test('blank images are not colorbars',()=>{
  const image={width:100,height:60,data:new Uint8ClampedArray(100*60*4).fill(255)};assert.deepEqual(D.detect(image),[]);
});
test('invalid thresholds fail instead of silently collapsing the palette',()=>{
  for(const threshold of [0,NaN,Infinity,-1])assert.throws(()=>C.extract(gradient,{threshold}));
  for(const tolerance of [NaN,Infinity,-1])assert.throws(()=>C.extract(gradient,{tolerance}));
});
