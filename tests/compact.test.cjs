const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js'),P=require('../src/clipboard.js');

test('short grey gradient between broad flat bands remains continuous and compact',()=>{
 const grey=v=>[v,v,v];
 const samples=[...Array(100).fill(grey(0)),...Array.from({length:40},(_,i)=>grey(40+i*4)),...Array(160).fill(grey(255)),...Array(100).fill(grey(80))];
 const model=C.extract(samples,{tolerance:2,detail:'compact'});
 assert.equal(model.mode,'continuous');
 assert.equal(model.processing.mixedGradient,true);
 assert.ok(model.stops.length<=10,model.stops.length);
 assert.ok(model.error.rgbMax<=3,model.error.rgbMax);
});

// A dense stepped meteorological ramp with repeated dark drawing edges.
function dense(lines=true){
  const anchors=[[210,112,88],[140,132,91],[28,24,47],[197,210,228],[206,231,196],[47,122,33],[242,242,0],[255,58,27],[0,0,0],[160,160,160],[236,234,240],[230,23,198],[237,228,234]];
  const colors=[];
  for(let i=0;i<120;i++){
    const at=i/119*(anchors.length-1),a=Math.floor(at),b=Math.min(a+1,anchors.length-1),t=at-a;
    const color=anchors[a].map((v,k)=>Math.round(v+(anchors[b][k]-v)*t));
    for(let j=0;j<8;j++)colors.push(lines&&j===7?[25,25,25]:color);
  }
  return colors;
}
test('dense staircase becomes a compact ramp, repeated line pixels are excluded',()=>{
 const samples=dense();const model=C.extract(samples,{detail:'compact',cleanLines:true,tolerance:4});
 assert.ok(model.processing.removedSeparatorPixels>50);
 assert.equal(model.mode,'continuous');assert.equal(model.processing.compactRamp,true);
 assert.ok(model.stops.length<60,model.stops.length);
 assert.ok(model.error.rgbRms<12,model.error.rgbRms);
});
test('faithful mode and explicit discrete mode remain available',()=>{
 const compact=C.extract(dense(false),{detail:'compact',tolerance:4});
 const faithful=C.extract(dense(false),{detail:'faithful',tolerance:4});
 assert.ok(compact.stops.length<faithful.stops.length/2);
 const discrete=C.extract(dense(false),{detail:'compact',mode:'discrete'});
 assert.equal(discrete.mode,'discrete');assert.ok(discrete.bands.length>50);
});
test('broad black intervals and lone narrow dark bands are never removed',()=>{
 const samples=[...Array(20).fill([200,0,0]),[0,0,0],...Array(20).fill([0,0,200]),...Array(30).fill([0,0,0])];
 assert.deepEqual(C.removeSeparators(samples).samples,samples);
 const model=C.extract(samples,{detail:'compact',cleanLines:true});
 assert.deepEqual(C.evaluate(model,1),[0,0,0]);
});
test('clipboard supports image items and file-list fallback, never URL text',()=>{
 const file={type:'image/png'};
 assert.equal(P.imageFile({items:[{kind:'file',type:'image/png',getAsFile:()=>file}]}),file);
 assert.equal(P.imageFile({files:[file]}),file);
 assert.equal(P.imageFile({items:[{kind:'string',type:'text/html'}]}),null);
 assert.equal(P.imageFile(null),null);
});
test('compact mode retains a sharp colour discontinuity at its original position',()=>{
 const samples=[];
 for(let i=0;i<120;i++)for(let j=0;j<8;j++)samples.push(i<60?[i*3,20,20]:[20,20,180+(i-60)]);
 const model=C.extract(samples,{detail:'compact',tolerance:3});
 assert.equal(model.processing.compactRamp,true);
 assert.ok(C.evaluate(model,.499)[0]>160);
 assert.ok(C.evaluate(model,.501)[2]>160);
});
test('a smooth quantized gradient is not labelled a dense stepped ramp',()=>{
 const samples=Array.from({length:760},(_,i)=>[Math.round(i/759*255),Math.round(i/759*200),Math.round(i/759*100)]);
 const model=C.extract(samples,{detail:'compact',tolerance:3});
 assert.equal(model.processing.compactRamp,false);
});
