'use strict';
// Isolate tool bindings from the website's shared scripts and browser extensions.
(()=>{
const $=id=>document.getElementById(id);
const engine=Colorbar, source=$('source'), ctx=source.getContext('2d');
const bitmap=document.createElement('canvas'), bctx=bitmap.getContext('2d',{willReadFrequently:true});
const state={box:null,candidates:[],model:null,samples:null,drag:null,generation:0};
$('version').textContent='v'+engine.VERSION;

// Clear stale output on every failed conversion, so old code cannot masquerade as new.
function run(fn){try{$('error').textContent='';return fn();}catch(e){$('error').textContent=e.message;$('code').value='';$('copy').disabled=$('download').disabled=true;state.model=null;}}
function paintSelection(){ctx.drawImage(bitmap,0,0);if(state.box){const b=state.box;ctx.strokeStyle='#ffb300';ctx.lineWidth=Math.max(1,source.width/600);ctx.strokeRect(b.x,b.y,b.width,b.height);}}
function convert(){run(()=>{
  if(!state.box)return;
  const b=state.box,vertical=$('orientation').value==='vertical'||($('orientation').value==='auto'&&b.height>b.width);
  const samples=engine.profile(bctx.getImageData(0,0,bitmap.width,bitmap.height),b,vertical);
  const model=engine.extract(samples,{mode:$('mode').value,tolerance:Number($('tolerance').value),threshold:Number($('threshold').value),reverse:$('reverse').checked,detail:$('detail').value,cleanLines:$('cleanLines').checked});
  model.range=[Number($('minimum').value),Number($('maximum').value)];model.scale=$('scale').value;model.rangeConfirmed=$('confirmed').checked;
  if(!model.rangeConfirmed){model.range=[0,1];model.scale='linear';}
  if($('bounds').value.trim()){
    if(model.mode!=='discrete')throw Error('自定义分级边界只能用于分段色阶。');
    if(!model.rangeConfirmed)throw Error('请先确认数值范围，再应用分段边界。');
    model.bounds=$('bounds').value.trim().split(/[,，;\s]+/).map(Number);
  }
  engine.validate(model);state.model=model;state.samples=$('reverse').checked?[...samples].reverse():samples;
  $('code').value=engine.exportCode(model,$('format').value);$('result').hidden=false;$('empty-result').hidden=true;
  $('copy').disabled=$('download').disabled=false;
  for(const id of ['original','reconstruction']){
    const c=$(id),context=c.getContext('2d');
    for(let x=0;x<c.width;x++){const t=x/(c.width-1),color=id==='original'?state.samples[Math.round(t*(samples.length-1))]:engine.evaluate(model,t);context.fillStyle=engine.hex(color);context.fillRect(x,0,1,c.height);}
  }
  $('metrics').textContent=`${model.mode==='continuous'?'连续渐变 · '+model.stops.length+' 个位置控制点':'分段色阶 · '+model.bands.length+' 个色块'} · RGB 重建均方根误差 ${model.error.rgbRms.toFixed(2)} / 最大误差 ${model.error.rgbMax.toFixed(2)} · ${model.rangeConfirmed?'数值范围已由用户确认':'数值范围未确认，仅归一化配色'}`;
  $('metrics').textContent+=` · 排除分隔线像素 ${model.processing.removedSeparatorPixels} · 相对未处理截图 RMS ${model.error.originalRgbRms.toFixed(2)}`;
  $('summary').textContent=model.processing.compactRamp?`密集分档已近似归纳为 ${model.stops.length} 个颜色节点。需要每一档时，可切换“逐级还原”。`:`已生成${model.mode==='continuous'?model.stops.length+' 个渐变节点':model.bands.length+' 个分段'}，请对照上方两条配色。`;
  $('range-note').textContent=model.rangeConfirmed?`已确认范围：${model.range[0]} 至 ${model.range[1]}`:'当前仅导出配色，数值位置归一化为 0–1。';
});}

// Detection works on a bounded thumbnail; extraction always uses original image pixels.
function detect(){run(()=>{
  const small=document.createElement('canvas'),scale=Math.min(1,420/Math.max(bitmap.width,bitmap.height));
  small.width=Math.max(2,Math.round(bitmap.width*scale));small.height=Math.max(2,Math.round(bitmap.height*scale));
  const c=small.getContext('2d');c.drawImage(bitmap,0,0,small.width,small.height);
  state.candidates=ColorbarDetect.detect(c.getImageData(0,0,small.width,small.height)).map(v=>{
    const x=Math.max(0,Math.ceil(v.box.x/scale)),y=Math.max(0,Math.ceil(v.box.y/scale));
    return {...v,box:{x,y,width:Math.min(bitmap.width,Math.floor((v.box.x+v.box.width)/scale))-x,height:Math.min(bitmap.height,Math.floor((v.box.y+v.box.height)/scale))-y}};
  });
  $('candidate').replaceChildren();state.candidates.forEach((v,i)=>$('candidate').add(new Option(`候选 ${i+1} · ${v.vertical?'纵向':'横向'} · ${v.box.width} × ${v.box.height}`,i)));
  if(state.candidates.length){state.box=state.candidates[0].box;$('status').textContent='已自动选择候选色条，请对照原图核对选区及读取方向。';}
  else {state.box={x:0,y:0,width:bitmap.width,height:bitmap.height};$('status').textContent='没有找到可靠候选，请手动框选色条本体。';}
  paintSelection();convert();
});}

// Decode locally, reject oversized inputs, and discard stale asynchronous loads.
async function load(file){
  const generation=++state.generation;
  try{
    if(!file||!/^image\/(png|jpeg|webp|bmp)$/.test(file.type))throw Error('请选择 PNG、JPEG、WebP 或 BMP 图片。');
    if(file.size>30*1024*1024)throw Error('图片文件不能超过 30 MiB。');
    const image=await createImageBitmap(file);
    try{
      if(generation!==state.generation)return;
      if(image.width*image.height>25e6||Math.min(image.width,image.height)<2)throw Error('图片须至少 2 × 2 像素，且不超过 2500 万像素。');
      bitmap.width=source.width=image.width;bitmap.height=source.height=image.height;bctx.drawImage(image,0,0);
    }finally{image.close();}
    state.box=null;$('confirmed').checked=false;$('bounds').value='';$('reverse').checked=false;source.hidden=false;
    for(const id of ['detect','whole','convert','readTicks'])$(id).disabled=false;
    $('tickSuggestion').textContent='数字识别只提供候选，不会覆盖当前数值。请核对负号、小数点、指数与读取方向。';
    detect();
  }catch(e){if(generation===state.generation)run(()=>{throw e;});}
}
function point(e){const r=source.getBoundingClientRect();return [Math.max(0,Math.min(source.width-1,Math.round((e.clientX-r.left)*source.width/r.width))),Math.max(0,Math.min(source.height-1,Math.round((e.clientY-r.top)*source.height/r.height)))];}
source.addEventListener('pointerdown',e=>{state.drag=point(e);source.setPointerCapture(e.pointerId);});
source.addEventListener('pointermove',e=>{if(!state.drag)return;const [a,b]=state.drag,[x,y]=point(e);state.box={x:Math.min(a,x),y:Math.min(b,y),width:Math.abs(x-a)+1,height:Math.abs(y-b)+1};paintSelection();});
source.addEventListener('pointerup',()=>{if(state.drag){state.drag=null;$('bounds').value='';convert();}});
source.addEventListener('pointercancel',()=>state.drag=null);
$('file').addEventListener('change',e=>load(e.target.files[0]));
$('drop').addEventListener('dragover',e=>e.preventDefault());$('drop').addEventListener('drop',e=>{e.preventDefault();load(e.dataTransfer.files[0]);});
document.addEventListener('paste',e=>{const file=ColorbarClipboard.imageFile(e.clipboardData);if(file){e.preventDefault();load(file);}else if(!e.target.closest('input,textarea,[contenteditable]'))$('status').textContent='剪贴板中没有图片。请复制图片本身或截图，也可选择图片文件。';});
// Explicit user gesture only; denial never blocks keyboard paste or file selection.
$('paste').onclick=async()=>{
  try{
    if(!navigator.clipboard?.read)throw Error('此浏览器不支持直接读取剪贴板，请点击图片区域后按 Ctrl+V / ⌘V，或选择图片。');
    const items=await navigator.clipboard.read();
    for(const item of items){const type=item.types.find(v=>/^image\/(png|jpeg|webp|bmp)$/.test(v));if(type){await load(await item.getType(type));return;}}
    $('status').textContent='剪贴板中没有图片。请复制图片本身，而不是图片链接。';
  }catch(e){$('status').textContent=e.name==='NotAllowedError'?'浏览器未允许直接读取。请点击图片区域后按 Ctrl+V / ⌘V，或选择图片。':e.message;}
};
$('detect').onclick=detect;$('whole').onclick=()=>{state.box={x:0,y:0,width:bitmap.width,height:bitmap.height};paintSelection();convert();};
$('candidate').onchange=()=>{state.box=state.candidates[Number($('candidate').value)].box;paintSelection();convert();};
for(const id of ['mode','orientation','tolerance','threshold','minimum','maximum','scale','format','reverse','confirmed','bounds','detail','cleanLines'])$(id).addEventListener('change',convert);
for(const id of ['tolerance','threshold','minimum','maximum','bounds'])$(id).addEventListener('input',convert);
$('convert').onclick=convert;
// OCR is advisory: monotonicity and glyph matching do not establish physical truth.
$('readTicks').onclick=()=>run(()=>{
  const found=ColorbarOCR(bitmap,state.box);
  const ticks=found.ticks.filter(v=>v.confidence>=.62);
  $('tickSuggestion').textContent=ticks.length>=2?'候选（沿图片方向）：'+ticks.map(v=>`${v.value} @ ${(v.position*100).toFixed(1)}%`).join('，')+'。请核对后手动填入范围；内部刻度不一定是端点。':'没有足够可靠的数字候选，请手动填写；不自动猜测数值。';
});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value);$('status').textContent='代码已复制。';}catch{$('code').select();$('status').textContent='请按 Ctrl+C 复制所选代码。';}};
$('download').onclick=()=>{
  if(!state.model)return;
  const ext={matplotlib:'py',plotly:'py',cpt:'cpt',css:'css',json:'json',javascript:'js'}[$('format').value];
  const url=URL.createObjectURL(new Blob([$('code').value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`colorbar-${engine.VERSION}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('demo').onclick=()=>{
  const c=document.createElement('canvas');c.width=820;c.height=180;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,820,180);
  const g=x.createLinearGradient(30,0,790,0);[[0,'#19275d'],[.18,'#187da0'],[.43,'#d4f4ef'],[.5,'#fffaf0'],[.72,'#edba52'],[1,'#aa1d3c']].forEach(v=>g.addColorStop(...v));x.fillStyle=g;x.fillRect(30,45,760,52);x.fillStyle='#334';x.font='18px sans-serif';x.fillText('Continuous gradient · non-uniform stops',30,135);
  c.toBlob(b=>load(new File([b],'example.png',{type:'image/png'})));
};
})();
