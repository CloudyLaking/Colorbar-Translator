/* Colorbar Translator: DOM-independent extraction and export engine. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Colorbar = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function() {
  'use strict';
  const VERSION = '1.0.1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const median = a => a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
  const hex = c => '#'+c.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
  const rgb = c => [1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
  const n = v => Number(v.toPrecision(10));

  // Sample every axis pixel; cross-axis medians reject text and border outliers.
  function profile(image, box, vertical=false, inset=.25) {
    const {width,height,data} = image;
    const {x,y,width:w,height:h} = box;
    if (![x,y,w,h].every(Number.isInteger) || x<0 || y<0 || w<2 || h<2 || x+w>width || y+h>height)
      throw Error('框选范围必须位于图片内，且至少为 2 × 2 像素。');
    const length=vertical?h:w, cross=vertical?w:h, out=[];
    for(let i=0;i<length;i++) {
      const channels=[[],[],[]];
      for(let j=0;j<17;j++) {
        const c=Math.round((inset+j/16*(1-2*inset))*(cross-1));
        const at=((y+(vertical?i:c))*width+x+(vertical?c:i))*4;
        if(data[at+3]<240) continue;
        for(let k=0;k<3;k++) channels[k].push(data[at+k]);
      }
      if(!channels[0].length) throw Error('色条包含透明区域；请先在确定的背景上合成，或重新框选。');
      out.push(channels.map(median));
    }
    return out;
  }

  // Keep positional knots until every RGB reconstruction error is within tolerance.
  function simplify(samples, tolerance=2) {
    if(samples.length<2 || !Number.isFinite(tolerance) || tolerance<0) throw Error('无效采样或误差阈值。');
    const keep=new Set([0,samples.length-1]), stack=[[0,samples.length-1]];
    while(stack.length) {
      const [a,b]=stack.pop(); let worst=tolerance, index=-1;
      for(let i=a+1;i<b;i++) {
        const error=distance(samples[i],mix(samples[a],samples[b],(i-a)/(b-a)));
        if(error>worst) {worst=error;index=i;}
      }
      if(index>=0) {keep.add(index);stack.push([a,index],[index,b]);}
    }
    return [...keep].sort((a,b)=>a-b).map(i=>({position:i/(samples.length-1),color:hex(samples[i])}));
  }

  // Segment plateaus, not equally spaced bins: unequal band widths remain intact.
  function segments(samples, threshold=8) {
    const cuts=[0]; let anchor=samples[0];
    for(let i=1;i<samples.length;i++) {
      if(distance(samples[i],anchor)>threshold) {cuts.push(i);anchor=samples[i];}
    }
    cuts.push(samples.length);
    return cuts.slice(0,-1).map((a,i)=>{
      const b=cuts[i+1];
      return {start:a/samples.length,end:b/samples.length,
        color:hex([0,1,2].map(k=>median(samples.slice(a,b).map(c=>c[k]))))};
    });
  }

  // Auto mode is conservative: smooth changes must not become hundreds of bands.
  function extract(samples, {mode='auto', tolerance=2, threshold=8, reverse=false}={}) {
    if(samples.length<2) throw Error('色条过短。');
    if(!Number.isFinite(threshold)||threshold<=0||threshold>80||!Number.isFinite(tolerance)||tolerance<0||tolerance>30) throw Error('误差须为 0–30，分段阈值须大于 0 且不超过 80。');
    if(reverse) samples=[...samples].reverse();
    const bands=segments(samples,threshold);
    const plateauPixels=bands.filter(b=>(b.end-b.start)*samples.length>=3).reduce((s,b)=>s+b.end-b.start,0);
    const changes=samples.slice(1).map((v,i)=>distance(v,samples[i]));
    const totalChange=changes.reduce((a,b)=>a+b,0);
    const jumpShare=changes.filter(v=>v>threshold).reduce((a,b)=>a+b,0)/Math.max(1,totalChange);
    if(mode==='auto') mode=bands.length<=64 && plateauPixels>.95 && (jumpShare>.6||totalChange<1) ? 'discrete':'continuous';
    if(!['continuous','discrete'].includes(mode)) throw Error('未知模式。');
    const model={version:VERSION,mode,range:[0,1],scale:'linear',rangeConfirmed:false,
      stops:mode==='continuous'?simplify(samples,tolerance):[],bands:mode==='discrete'?bands:[]};
    if(mode==='discrete' && bands.length>256) throw Error('识别出超过 256 个分段，可能是渐变色条；请改用连续模式。');
    let sum=0,max=0;
    for(let i=0;i<samples.length;i++) {
      const error=distance(samples[i],evaluate(model,i/(samples.length-1)));
      sum+=error*error;max=Math.max(max,error);
    }
    model.error={rgbRms:Math.sqrt(sum/samples.length),rgbMax:max};
    return model;
  }

  // Evaluate the same canonical representation used by previews and every exporter.
  function evaluate(model, t) {
    t=clamp(t,0,1);
    if(model.mode==='discrete') return rgb((model.bands.find(b=>t<b.end)||model.bands.at(-1)).color);
    const stops=model.stops; let j=1;while(j<stops.length-1&&t>stops[j].position)j++;
    return mix(rgb(stops[j-1].color),rgb(stops[j].color),(t-stops[j-1].position)/(stops[j].position-stops[j-1].position));
  }

  // Map geometric positions to a linear or logarithmic physical scale explicitly.
  function value(model,t) {
    const [a,b]=model.range;
    return model.scale==='log'?Math.exp(Math.log(a)+t*(Math.log(b)-Math.log(a))):a+t*(b-a);
  }
  function validate(model) {
    const [a,b]=model.range;
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a) throw Error('数值上限必须大于下限。');
    if(!['linear','log'].includes(model.scale)) throw Error('未知数值尺度。');
    if(model.scale==='log'&&a<=0) throw Error('对数刻度的数值必须大于零。');
    if(model.bounds && (model.bounds.length!==model.bands.length+1 || !model.bounds.every((v,i)=>Number.isFinite(v)&&(!i||v>model.bounds[i-1])))) throw Error('边界数量须等于色块数加一，且严格递增。');
  }
  function entries(model) {
    validate(model);
    if(model.mode==='continuous') return model.stops.map(s=>[s.position,s.color]);
    const bounds=model.bounds;
    const p=(b,i)=>bounds?(bounds[i]-bounds[0])/(bounds.at(-1)-bounds[0]):b;
    return model.bands.flatMap((b,i)=>[[p(b.start,i),b.color],[p(b.end,i+1),b.color]]);
  }

  // Exporters preserve hard edges and numeric normalization rather than just RGB lists.
  function exportCode(model,format) {
    validate(model);
    const discrete=model.mode==='discrete', [lo,hi]=model.bounds?[model.bounds[0],model.bounds.at(-1)]:model.range;
    const bounds=discrete?(model.bounds||[...model.bands.map(b=>value(model,b.start)),hi]).map(n):null;
    const colors=discrete?model.bands.map(b=>b.color):null;
    const stops=entries(model), json=v=>JSON.stringify(v), warning=model.rangeConfirmed?'':'# Range 0..1 is normalized image position; physical values are unconfirmed.\n';
    if(format==='json') return JSON.stringify({...model,range:[lo,hi],bounds},null,2);
    if(format==='matplotlib') {
      if(discrete) return warning+`from matplotlib.colors import ListedColormap, BoundaryNorm\n\ncolors = ${json(colors)}\nbounds = ${json(bounds)}\ncmap = ListedColormap(colors, name="translated_colorbar")\nnorm = BoundaryNorm(bounds, cmap.N)\n# ax.pcolormesh(x, y, data, cmap=cmap, norm=norm)\n`;
      const norm=model.scale==='log'?'LogNorm':'Normalize';
      return warning+`from matplotlib.colors import LinearSegmentedColormap, ${norm}\n\nstops = ${json(stops.map(([p,c])=>[n(p),c]))}\ncmap = LinearSegmentedColormap.from_list("translated_colorbar", stops, N=4096)\nnorm = ${norm}(vmin=${lo}, vmax=${hi})\n# ax.pcolormesh(x, y, data, cmap=cmap, norm=norm)\n`;
    }
    // Plotly normalizes z linearly; add samples for a logarithmic color function.
    let plotStops=stops;
    if(model.scale==='log'&&!model.bounds) {
      if(discrete) plotStops=model.bands.flatMap(b=>[[n((value(model,b.start)-lo)/(hi-lo)),b.color],[n((value(model,b.end)-lo)/(hi-lo)),b.color]]);
      else plotStops=Array.from({length:1025},(_,i)=>{const t=i/1024;return [n((value(model,t)-lo)/(hi-lo)),hex(evaluate(model,t))];});
    }
    if(format==='plotly') return warning+`import plotly.graph_objects as go\n\ncolorscale = ${json(plotStops)}\n# fig = go.Figure(go.Heatmap(z=data, colorscale=colorscale, zmin=${lo}, zmax=${hi}))\n`;
    if(format==='css') return `/* Colorbar Translator ${VERSION}; image-position gradient */\nbackground: linear-gradient(to right, ${stops.map(([p,c])=>`${c} ${n(p*100)}%`).join(', ')});\n`;
    if(format==='cpt') {
      const rows=discrete?model.bands.map((b,i)=>`${bounds[i]} ${rgb(b.color).join(' ')} ${bounds[i+1]} ${rgb(b.color).join(' ')}`):plotStops.slice(0,-1).map(([p,c],i)=>`${n(lo+p*(hi-lo))} ${rgb(c).join(' ')} ${n(lo+plotStops[i+1][0]*(hi-lo))} ${rgb(plotStops[i+1][1]).join(' ')}`);
      return warning+'# COLOR_MODEL = RGB\n'+rows.join('\n')+`\nB ${rgb(stops[0][1]).join(' ')}\nF ${rgb(stops.at(-1)[1]).join(' ')}\nN 128 128 128\n`;
    }
    if(format==='javascript') return `// Colorbar Translator ${VERSION}\nconst colorbar = ${JSON.stringify({...model,bounds},null,2)};\n`;
    throw Error('未知导出格式。');
  }
  return {VERSION,profile,simplify,segments,extract,evaluate,exportCode,entries,hex,validate};
});
