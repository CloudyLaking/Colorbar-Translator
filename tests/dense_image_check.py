"""Exercise the full image/detector path on a dense, ruled meteorological ramp."""
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / 'Output/Colorbar-Translator'


def main():
    """Generate a labelled 120-band fixture, including repeated hues and black."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    anchors = np.array([[210,112,88],[140,132,91],[28,24,47],[197,210,228],
                        [206,231,196],[47,122,33],[242,242,0],[255,58,27],
                        [0,0,0],[160,160,160],[236,234,240],[230,23,198],[237,228,234]])
    image = Image.new('RGB', (105, 1000), 'white')
    draw = ImageDraw.Draw(image)
    for i in range(120):
        at = i / 119 * (len(anchors)-1)
        a = int(at); b = min(a+1, len(anchors)-1)
        color = tuple(np.rint(anchors[a]+(anchors[b]-anchors[a])*(at-a)).astype(int))
        draw.rectangle((12,20+8*i,30,27+8*i), fill=color)
        draw.line((12,27+8*i,30,27+8*i), fill=(25,25,25))
    for i in range(0,121,5):
        draw.text((37,16+8*i), str(20-i), fill='black')
    image.save(OUTPUT/'dense-meteorological.png')
    script = r'''
const fs=require('fs'),C=require('./src/core.js'),D=require('./src/detect.js');
const data=JSON.parse(fs.readFileSync(0,'utf8'));
const candidates=D.detect(data.small);if(!candidates.length)throw Error('No colorbar');
const box=candidates[0].box,s=data.scale;
const selected={x:Math.ceil(box.x/s),y:Math.ceil(box.y/s),width:Math.floor((box.x+box.width)/s)-Math.ceil(box.x/s),height:Math.floor((box.y+box.height)/s)-Math.ceil(box.y/s)};
const samples=C.profile(data.image,selected,true);
const compact=C.extract(samples,{detail:'compact',cleanLines:true,tolerance:3});
const faithful=C.extract(samples,{detail:'faithful',cleanLines:true,tolerance:3});
console.log(JSON.stringify({selected,compact:compact.stops.length,faithful:faithful.stops.length,processing:compact.processing,error:compact.error}));
'''
    reports=[]
    for kind in ('png', 'jpg'):
        path=OUTPUT/f'dense-meteorological.{kind}'
        image.save(path, quality=85)
        original=Image.open(path).convert('RGBA')
        small=original.resize((44,420),Image.Resampling.BILINEAR)
        def raw(im):
            return {'width':im.width,'height':im.height,'data':np.asarray(im).ravel().tolist()}
        result=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True,input=json.dumps({'image':raw(original),'small':raw(small),'scale':.42})))
        reports.append({'format':kind,**result})
    (OUTPUT/'dense-image-check.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
    print(json.dumps(reports,indent=2))
    assert all(r['processing']['compactRamp'] and r['compact'] < 60 for r in reports)


if __name__ == '__main__':
    main()
