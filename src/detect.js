/* Rectangle candidate detection, including achromatic colorbars. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ColorbarDetect=factory();})(globalThis,function(){
  'use strict';
  // Search long strips whose RGB changes along one axis but agrees across it.
  function detect(image) {
    const {width:w,height:h,data}=image, candidates=[];
    const pixel=(x,y)=>{const i=(y*w+x)*4;return [data[i],data[i+1],data[i+2]];};
    const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
    for(const vertical of [false,true]) {
      const length=vertical?h:w,cross=vertical?w:h;
      const at=(a,c)=>vertical?pixel(c,a):pixel(a,c);
      for(let c=1;c<cross-2;c++) {
        let start=-1, gap=0;
        function finish(end) {
          if(start<0||end-start<Math.max(16,length*.08)) {start=-1;return;}
          // Trim constant background around the coherent strip, preserving plateaus.
          let a=start,b=end-1;
          const first=at(a,c),last=at(b,c);
          while(a<b&&dist(at(a+1,c),first)<8)a++;
          while(b>a&&dist(at(b-1,c),last)<8)b--;
          // A bar cropped to the image edges must retain its endpoint plateaus.
          if(start<=1&&dist(first,pixel(0,0))>8)a=start;
          if(end>=length-1&&dist(last,pixel(0,0))>8)b=end-1;
          if(a>start)a++;if(b<end-1)b--;
          if(b-a<16){start=-1;return;}
          let lo=c,hi=c+2;
          const agrees=q=>[.1,.3,.5,.7,.9].filter(t=>dist(at(Math.round(a+(b-a)*t),q),at(Math.round(a+(b-a)*t),c))<15).length>=4;
          while(lo>0&&agrees(lo-1))lo--;
          while(hi<cross-1&&agrees(hi+1))hi++;
          // JPEG ringing can extend a candidate into the background. Trim with a
          // cross-strip median rather than one noisy scanline pixel.
          const background=pixel(0,0);
          const middle=i=>[0,1,2].map(k=>[.2,.35,.5,.65,.8].map(t=>at(i,Math.round(lo+(hi-lo)*t))[k]).sort((x,y)=>x-y)[2]);
          if(a>0)while(a<b-16&&dist(middle(a),background)<25)a++;
          if(b<length-1)while(b>a+16&&dist(middle(b),background)<25)b--;
          // Trim thin frame/antialias fringes only when the adjacent interior is stable.
          const edgeError=(i,d)=>dist(middle(i),middle(i+2*d).map((v,k)=>v+(v-middle(i+5*d)[k])*2/3));
          for(let k=0;k<4&&b-a>16;k++){
            if(edgeError(a,1)>10&&dist(middle(a+4),middle(a+5))<18)a++;else break;
          }
          for(let k=0;k<4&&b-a>16;k++){
            if(edgeError(b,-1)>10&&dist(middle(b-4),middle(b-5))<18)b--;else break;
          }
          let variation=0;for(let i=a+1;i<=b;i++)variation+=dist(at(i,c),at(i-1,c));
          const thickness=hi-lo+1,aspect=(b-a+1)/thickness;
          if(variation>25&&aspect>=2&&thickness>=3) {
            const box=vertical?{x:lo,y:a,width:thickness,height:b-a+1}:{x:a,y:lo,width:b-a+1,height:thickness};
            let foreground=0;for(let i=a;i<=b;i++)if(dist(middle(i),background)>25)foreground++;
            const coverage=foreground/(b-a+1);
            const score=(b-a+1)*Math.sqrt(thickness)*Math.min(aspect,20)*coverage**2/(1+Math.max(0,variation/(b-a+1)-15));
            const duplicate=candidates.findIndex(v=>Math.abs(v.box.x-box.x)<4&&Math.abs(v.box.y-box.y)<4);
            if(duplicate<0)candidates.push({box,vertical,score});
            else if(score>candidates[duplicate].score)candidates[duplicate]={box,vertical,score};
          }
          start=-1;
        }
        for(let a=0;a<length;a++) {
          const good=dist(at(a,c),at(a,c+2))<12;
          if(good){if(start<0)start=a;gap=0;}
          else if(++gap>3){finish(a-gap+1);gap=0;}
        }
        finish(length);
      }
    }
    return candidates.sort((a,b)=>b.score-a.score).slice(0,8);
  }
  return {detect};
});
