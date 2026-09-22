"""Execute generated Matplotlib code, not merely inspect its text."""
import json
from pathlib import Path
import subprocess
import numpy as np

root = Path(__file__).resolve().parents[1]
source = r'''
const C=require('./src/core.js');
const g=Array.from({length:256},(_,i)=>[i,255-i,70]);
const a=C.extract(g,{mode:'continuous'});a.range=[-20,40];a.rangeConfirmed=true;
const b=C.extract([...Array(20).fill([0,0,255]),...Array(50).fill([255,255,255]),...Array(30).fill([255,0,0])]);
b.bounds=[-5,2,10,100];b.rangeConfirmed=true;
const log=C.extract(g,{mode:'continuous'});log.range=[1,100];log.scale='log';log.rangeConfirmed=true;
console.log(JSON.stringify([a,b,log].map(m=>C.exportCode(m,'matplotlib'))));
'''
codes=json.loads(subprocess.check_output(['node','-e',source],cwd=root,text=True))
for index, code in enumerate(codes):
    scope={}
    exec(compile(code, '<generated-colorbar>', 'exec'),scope)
    cmap,norm=scope['cmap'],scope['norm']
    if index==0:
        assert np.allclose(cmap(norm(-20))[:3],[0,1,70/255],atol=.005)
        assert np.allclose(cmap(norm(40))[:3],[1,0,70/255],atol=.005)
    elif index==1:
        assert np.allclose(cmap(norm(1))[:3],[0,0,1])
        assert np.allclose(cmap(norm(5))[:3],[1,1,1])
        assert np.allclose(cmap(norm(99))[:3],[1,0,0])
    else:
        assert abs(norm(10)-.5)<1e-10
        assert abs(cmap(norm(10))[0]-.5)<.005
print('3 generated Matplotlib programs executed; endpoints, hard bins and log normalization passed.')
