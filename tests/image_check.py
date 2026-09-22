"""Render real Matplotlib colorbars, then verify detector and reconstruction."""
import io
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.colorbar import ColorbarBase

root=Path(__file__).resolve().parents[1]
output=root.parent/'Output'/'Colorbar-Translator'
output.mkdir(parents=True,exist_ok=True)
script=r'''
const fs=require('fs'),C=require('./src/core.js'),D=require('./src/detect.js');
const im=JSON.parse(fs.readFileSync(0,'utf8'));
const candidates=D.detect(im);if(!candidates.length)throw Error('No candidate');
const best=candidates[0],samples=C.profile(im,best.box,best.vertical),m=C.extract(samples,{mode:'continuous'});
console.log(JSON.stringify({box:best.box,vertical:best.vertical,error:m.error,stops:m.stops.length,endpoints:[samples[0],samples.at(-1)],candidates}));
'''
reports=[]
for name in ['viridis','coolwarm','gray','turbo']:
    for vertical in [False,True]:
        fig=plt.figure(figsize=(1.6,4.2) if vertical else (4.2,1.6),dpi=100)
        rect=[.22,.12,.22,.78] if vertical else [.12,.48,.78,.22]
        ax=fig.add_axes(rect)
        ColorbarBase(ax,cmap=matplotlib.colormaps[name],norm=Normalize(-20,40),orientation='vertical' if vertical else 'horizontal')
        buf=io.BytesIO();fig.savefig(buf,format='png');plt.close(fig);buf.seek(0)
        original=Image.open(buf).convert('RGBA')
        for compressed in [False,True]:
            image=original
            extension='jpg' if compressed else 'png'
            filename=f'{name}_{"vertical" if vertical else "horizontal"}.{extension}'
            if compressed:
                original.convert('RGB').save(output/filename,quality=75)
                image=Image.open(output/filename).convert('RGBA')
            else:
                image.save(output/filename)
            raw={'width':image.width,'height':image.height,'data':np.asarray(image).ravel().tolist()}
            result=json.loads(subprocess.check_output(['node','-e',script],cwd=root,input=json.dumps(raw),text=True))
            b=result['box'];axis=b['height' if vertical else 'width'];expected=(image.height if vertical else image.width)*.78
            assert result['vertical']==vertical, (filename,result)
            assert abs(axis-expected)<12,(filename,result,expected)
            assert result['error']['rgbMax']<3,(filename,result)
            truth=np.asarray(matplotlib.colormaps[name]([1.,0.] if vertical else [0.,1.]))[:,:3]*255
            endpoint_error=float(np.max(np.linalg.norm(np.asarray(result['endpoints'])-truth,axis=1)))
            assert endpoint_error<25,(filename,'endpoint color mismatch',endpoint_error,result)
            result['endpointRgbError']=endpoint_error
            reports.append({'image':filename,**result})
(output/'image-check.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
print(f'{len(reports)} labeled Matplotlib image checks passed: viridis, coolwarm, gray, turbo; both orientations.')
