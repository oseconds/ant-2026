from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageDraw, ImageFont, ImageChops
import hashlib, json, re, sys, PIL

base=Path('docs/ant/evidence/2026-10-23-natural-field-transfer/collective')
svg_dir=base/'anchor-representatives-v4'
out=base/'representatives-v4-0.012-600s-contact-sheet.png'
receipt_path=base/'representatives-v4-0.012-600s-render-receipt.json'
script_path=base/'render_v4_contact_sheet.py'
seeds=('20261005','20261006','20261007')
conditions=(('production','P / production'),('dtfeedback','dtFeedback'))
files=[[svg_dir/f'{cond}-seed-{seed}--0-600s--d0-012.svg' for seed in seeds] for cond,_ in conditions]
assert all(p.is_file() for row in files for p in row)

SUPPORT={'svg','rect','text','g','defs','clipPath','line','polyline','circle'}
font_bold=ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 20)
font_column=ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 17)
font_row=ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 20)

def parse_color(value, opacity=1.0):
    if not value or value == 'none':
        return None
    value={'white':'#ffffff','black':'#000000'}.get(value, value)
    if value.startswith('#') and len(value)==7:
        return tuple(int(value[i:i+2],16) for i in (1,3,5))+(max(0,min(255,round(255*opacity))),)
    raise ValueError(f'Unsupported SVG color {value!r}')

def length(value, reference):
    return reference*float(value[:-1])/100 if value.endswith('%') else float(value)

def render_svg(path, scale=2):
    root=ET.parse(path).getroot()
    width=int(float(root.attrib['width']))
    height=int(float(root.attrib['height']))
    size=(width*scale,height*scale)
    clip_rects={}
    for item in root.iter():
        if item.tag.split('}')[-1]=='clipPath':
            rect=next((c for c in item if c.tag.split('}')[-1]=='rect'),None)
            if rect is not None:
                clip_rects[item.attrib['id']]=tuple(float(rect.attrib[k]) for k in ('x','y','width','height'))
    unsupported=sorted({e.tag.split('}')[-1] for e in root.iter()}-SUPPORT)
    if unsupported:
        raise ValueError(f'{path.name}: unsupported SVG elements {unsupported}')
    allowed_attrs={'clip-path','cx','cy','fill','font-family','font-size','font-weight','height','id','opacity','points','r','stroke','stroke-linecap','stroke-linejoin','stroke-width','text-anchor','viewBox','width','x','x1','x2','y','y1','y2'}
    all_attrs=set()
    for e in root.iter():
        all_attrs.update(e.attrib.keys())
    if all_attrs-allowed_attrs:
        raise ValueError(f'{path.name}: unsupported SVG attributes {sorted(all_attrs-allowed_attrs)}')
    canvas=Image.new('RGBA', size, (255,255,255,255))

    def draw_node(el, target):
        tag=el.tag.split('}')[-1]
        if tag in ('defs','clipPath'):
            return
        if tag=='g':
            clip=el.attrib.get('clip-path')
            if clip:
                layer=Image.new('RGBA', size, (0,0,0,0))
                for child in el:
                    draw_node(child,layer)
                key=re.search(r'#([^)]+)',clip).group(1)
                x,y,w,h=clip_rects[key]
                mask=Image.new('L',size,0)
                ImageDraw.Draw(mask).rectangle((round(x*scale),round(y*scale),round((x+w)*scale),round((y+h)*scale)),fill=255)
                layer.putalpha(ImageChops.multiply(layer.getchannel('A'),mask))
                target.alpha_composite(layer)
            else:
                for child in el:
                    draw_node(child,target)
            return
        draw=ImageDraw.Draw(target,'RGBA')
        if tag=='rect':
            x=length(el.attrib.get('x','0'),width)*scale
            y=length(el.attrib.get('y','0'),height)*scale
            w=length(el.attrib['width'],width)*scale
            h=length(el.attrib['height'],height)*scale
            fill=parse_color(el.attrib.get('fill'))
            stroke=parse_color(el.attrib.get('stroke'))
            sw=max(1,round(float(el.attrib.get('stroke-width','1'))*scale)) if stroke else 0
            draw.rectangle((round(x),round(y),round(x+w),round(y+h)),fill=fill,outline=stroke,width=sw)
        elif tag=='line':
            coords=[float(el.attrib[k])*scale for k in ('x1','y1','x2','y2')]
            color=parse_color(el.attrib.get('stroke'),float(el.attrib.get('opacity','1')))
            if color:
                draw.line(coords,fill=color,width=max(1,round(float(el.attrib.get('stroke-width','1'))*scale)))
        elif tag=='polyline':
            vals=[float(v) for v in re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?',el.attrib['points'])]
            pts=list(zip(vals[::2],vals[1::2]))
            pts=[(x*scale,y*scale) for x,y in pts]
            color=parse_color(el.attrib.get('stroke'),float(el.attrib.get('opacity','1')))
            if color and len(pts)>1:
                draw.line(pts,fill=color,width=max(1,round(float(el.attrib.get('stroke-width','1'))*scale)),joint='curve')
        elif tag=='circle':
            x=float(el.attrib['cx'])*scale
            y=float(el.attrib['cy'])*scale
            r=float(el.attrib['r'])*scale
            fill=parse_color(el.attrib.get('fill'))
            stroke=parse_color(el.attrib.get('stroke'))
            sw=max(1,round(float(el.attrib.get('stroke-width','1'))*scale)) if stroke else 0
            draw.ellipse((round(x-r),round(y-r),round(x+r),round(y+r)),fill=fill,outline=stroke,width=sw)
        elif tag=='text':
            x=float(el.attrib['x'])*scale
            y=float(el.attrib['y'])*scale
            fs=float(el.attrib.get('font-size','16'))
            bold=el.attrib.get('font-weight','normal') in ('bold','700','800','900')
            font=ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf' if bold else r'C:\Windows\Fonts\arial.ttf',max(1,round(fs*scale)))
            anchor={'middle':'ms','end':'rs'}.get(el.attrib.get('text-anchor'),'ls')
            fill=parse_color(el.attrib.get('fill','#000000'),float(el.attrib.get('opacity','1')))
            draw.text((x,y),''.join(el.itertext()),font=font,fill=fill,anchor=anchor)
        elif tag!='svg':
            raise ValueError(f'Unhandled SVG element: {tag}')
    for child in root:
        draw_node(child,canvas)
    return canvas.convert('RGB').resize((width,height),Image.Resampling.LANCZOS),width,height

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()

rendered={}
dims={}
for row in files:
    for path in row:
        panel,w,h=render_svg(path)
        rendered[path]=panel
        dims[path]=(w,h)

margin=20
gutter=18
title_h=36
row_head=26
col_head=24
panel_w=1240
row_heights=[max(dims[p][1] for p in row) for row in files]
sheet_w=margin*2+panel_w*3+gutter*2
sheet_h=margin+title_h+sum(row_head+col_head+h for h in row_heights)+20
sheet=Image.new('RGB',(sheet_w,sheet_h),(245,247,249))
draw=ImageDraw.Draw(sheet)
draw.text((margin,margin),'Collective route evidence — fixed-anchor representatives — scale 0.012 — 600 s',font=font_bold,fill='#17212b')
y=margin+title_h
for ridx,((cond,label),row) in enumerate(zip(conditions,files)):
    draw.rounded_rectangle((margin,y,sheet_w-margin,y+row_head-2),radius=5,fill='#e8edf1')
    draw.text((margin+8,y+3),label+(' · top row' if ridx==0 else ' · bottom row'),font=font_row,fill='#17212b')
    y+=row_head
    for cidx,path in enumerate(row):
        x=margin+cidx*(panel_w+gutter)
        draw.text((x+4,y+2),f'Seed {seeds[cidx]}',font=font_column,fill='#33424c')
    y+=col_head
    for cidx,path in enumerate(row):
        x=margin+cidx*(panel_w+gutter)
        panel=rendered[path]
        sheet.paste(panel,(x,y))
        ImageDraw.Draw(sheet).rectangle((x,y,x+panel.width-1,y+panel.height-1),outline='#9aa8b2',width=1)
    y+=row_heights[ridx]+20
sheet.save(out,format='PNG',optimize=True)

sources=[]
for row in files:
    for path in row:
        sources.append({'path':path.as_posix(),'byteLength':path.stat().st_size,'sha256':sha(path)})
receipt={
  'artifact':out.name,
  'artifactByteLength':out.stat().st_size,
  'artifactSha256':sha(out),
  'dimensionsPx':list(sheet.size),
  'layout':'3 columns by 2 rows; production/P top, dtFeedback bottom; seed columns 20261005, 20261006, 20261007',
  'selection':'Exactly the six existing deterministic maximum-support representative SVGs at scale 0.012 from 600-second cases; no reselection.',
  'sourceSvgViewportPx':'Native SVG viewBox rendered at its declared viewport dimensions; panel images are unwarped and unscaled.',
  'renderer':'Custom local SVG primitive renderer using Python xml.etree.ElementTree and Pillow; source elements rect, text, g, defs, clipPath, line, polyline, circle; rectangle clip paths applied as masks; Arial fonts; 2x supersampling then Lanczos downsample to each declared SVG viewport.',
  'pythonVersion':sys.version.split()[0],
  'pillowVersion':PIL.__version__,
  'rendererSource':{'path':script_path.as_posix(),'sha256':sha(script_path)},
  'sourceSvgs':sources
}
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'png':out.as_posix(),'bytes':out.stat().st_size,'sha256':sha(out),'dimensions':sheet.size,'receipt':receipt_path.as_posix(),'sourceCount':len(sources),'rendererSourceSha256':sha(script_path)},indent=2))