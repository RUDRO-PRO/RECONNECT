"""Render Reconnect's existing geometric mark with supersampling (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
OUT = Path(__file__).resolve().parents[1] / 'frontend/public/icons'
OUT.mkdir(parents=True, exist_ok=True)
# The same paired-hand geometry used by the website's SVG brand mark.
paths = [[(2,25),(12,15),(23,15),(27,19),(23,23),(15,23)],[(2,31),(10,23),(17,30),(24,23)],[(46,15),(36,25),(25,25),(21,21),(25,17),(33,17)],[(46,9),(38,17),(31,10),(24,17)]]
for filename, size, fraction in [('icon-192.png',192,.76),('icon-512.png',512,.76),('icon-maskable-512.png',512,.64),('apple-touch-icon.png',180,.76)]:
    scale=4
    image=Image.new('RGB',(size*scale,size*scale),'#0b0f17')
    draw=ImageDraw.Draw(image)
    unit=size*scale*fraction/48
    width=round(2.8*unit)
    for path in paths:
        points=[(round(size*scale/2+(x-24)*unit),round(size*scale/2+(y-20)*unit)) for x,y in path]
        draw.line(points,fill='white',width=width,joint='curve')
        for x,y in points:
            r=width/2; draw.ellipse((x-r,y-r,x+r,y+r),fill='white')
    image.resize((size,size),Image.Resampling.LANCZOS).save(OUT/filename,optimize=True)
print('Generated four antialiased app icons.')
