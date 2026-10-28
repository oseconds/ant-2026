const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

export function atlasHtml(data) {
  const embedded = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANT body atlas</title><style>
:root{font:14px/1.45 system-ui,sans-serif;color:#202124;background:#f5f6f7}*{box-sizing:border-box}body{margin:0;padding:20px;max-width:1500px;margin-inline:auto}h1,h2,h3,p{margin:0 0 10px}h1{font-size:22px}h2{font-size:17px;margin-top:20px}.note{color:#4b5563}.controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap;background:white;padding:14px;border:1px solid #d8dce0;border-radius:8px;margin:14px 0}.control{display:grid;gap:4px}select,button{font:inherit;padding:6px 8px}label.check{display:flex;gap:6px;align-items:center;padding:6px 0}.legend{display:flex;align-items:center;gap:8px;margin:8px 0 14px}.ramp{width:190px;height:12px;border:1px solid #777;background:linear-gradient(90deg,#fff,#000)}.rows{display:grid;gap:18px}.row{background:#fff;border:1px solid #d8dce0;border-radius:8px;padding:12px;overflow:hidden}.rowhead{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.panels{display:grid;grid-template-columns:repeat(3,minmax(260px,640px));gap:10px;overflow:auto}.panel h3{font-size:13px;font-weight:600;margin:5px 0}.panel canvas{display:block;width:min(100%,640px);height:auto;aspect-ratio:1;border:1px solid #c8ccd0;background:#fff}.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:10px}.detail{white-space:pre-wrap;color:#3d444c}.metrics{font-variant-numeric:tabular-nums}.pending{font-weight:600;color:#743b00;background:#fff1d6;border:1px solid #efd09a;padding:8px 10px;border-radius:6px;margin-top:14px}@media(max-width:900px){body{padding:12px}.panels{grid-template-columns:1fr}.panel canvas{width:min(100%,640px)}}
</style></head><body>
<h1>ANT body atlas</h1><p class="note">Diagnostic view of candidate masks, input fields, and resulting bodies. The canvases show the same normalized world frame; fields use fixed values from 0 to 1.</p><p class="note">Scope: current G / H0 · Audio Off · seed ${escapeHtml(data.scope?.seed??'unspecified')} · research only · fixed P1/P2 comparison; not the production renderer.</p>
<div class="controls"><div class="control"><label for="candidate">Panel 1 candidate</label><select id="candidate"></select></div><div class="control"><label for="candidate2">Panel 2 candidate</label><select id="candidate2"></select></div><div class="control"><label for="event">Event</label><select id="event"></select></div><div class="control"><label for="field">Background field</label><select id="field"><option value="auto">candidate input</option><option value="chemical">chemical</option><option value="surface">surface</option><option value="newChemical">new chemical</option><option value="newSurface">new surface</option>${data.events?.some(e=>e.fields?.support) ? '<option value="support">support</option>' : ''}</select></div><label class="check"><input id="production" type="checkbox"> Production outline</label><label class="check"><input id="c0" type="checkbox"> C0 overlay</label></div>
<div class="legend"><span>Field scale</span><span>0</span><div class="ramp" aria-label="grayscale from 0 white to 1 black"></div><span>1</span><span class="note">grayscale is a diagnostic value map</span></div><div id="rows" class="rows"></div><p class="pending">Human review pending. This atlas is descriptive and is not an aesthetics verdict or the ANT renderer.</p>
<script type="application/json" id="atlas-data">${embedded}</script><script>
const data=JSON.parse(document.getElementById('atlas-data').textContent);
const $=id=>document.getElementById(id), size=data.grid||96, count=size*size;
const defs=data.definitions||[], events=data.events||[];
const options=defs.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.id+' · '+d.title)+'</option>').join('');
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fillSelect(el,html){el.innerHTML=html}
fillSelect($('candidate'),options);fillSelect($('candidate2'),options);
fillSelect($('event'),events.map((e,i)=>'<option value="'+i+'">'+esc(e.id+' · '+e.timeSeconds+' s')+'</option>').join(''));
const chosen=id=>defs.find(d=>d.id===id)||defs[0], currentEvent=()=>events[Number($('event').value)]||events[0];
function caseFor(e,id){return e?.cases?.find(c=>c.id===id)}
function indices(list){return new Set(list||[])}
function draw(canvas,{field,mask,scaffold,production,c0,showProduction,showC0,mode}){
 const ctx=canvas.getContext('2d'), scale=canvas.width/size;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 const sc=indices(scaffold), raster=document.createElement('canvas');raster.width=raster.height=size;let image=raster.getContext('2d').createImageData(size,size),px=image.data;
 for(let i=0;i<count;i++){let v=mode==='field'?1-Math.max(0,Math.min(1,Number(field?.[i])||0)):((mask?.[i])?0:1),k=i*4;px[k]=px[k+1]=px[k+2]=Math.round(v*255);px[k+3]=255}
 raster.getContext('2d').putImageData(image,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(raster,0,0,canvas.width,canvas.height);ctx.save();ctx.scale(scale,scale);ctx.lineWidth=Math.max(.45,1/scale);ctx.strokeStyle='#1672c4';
 for(const i of sc){const x=i%size,y=Math.floor(i/size);ctx.strokeRect(x+.12,y+.12,.76,.76)}
 if(showProduction)outline(ctx,production,'#c43d42');if(showC0)outline(ctx,c0,'#9a47ad');ctx.restore();
}
function outline(ctx,mask,color){if(!mask)return;ctx.strokeStyle=color;ctx.lineWidth=.7;for(let i=0;i<count;i++)if(mask[i]){let x=i%size,y=Math.floor(i/size);if(!mask[y*size+x-1]||x===0){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+1);ctx.stroke()}if(!mask[y*size+x+1]||x===size-1){ctx.beginPath();ctx.moveTo(x+1,y);ctx.lineTo(x+1,y+1);ctx.stroke()}if(!mask[(y-1)*size+x]||y===0){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+1,y);ctx.stroke()}if(!mask[(y+1)*size+x]||y===size-1){ctx.beginPath();ctx.moveTo(x,y+1);ctx.lineTo(x+1,y+1);ctx.stroke()}}}
function panel(title,id){return '<div class="panel"><h3>'+title+'</h3><canvas id="'+id+'" width="640" height="640" aria-label="'+title+'"></canvas></div>'}
function caseDetails(d,c){return '<div class="details"><div class="detail"><b>Definition</b><br>Family: '+esc(d?.family)+'<br>Scaffold: '+esc(d?.scaffold)+'<br>Input: '+esc(d?.input)+'<br>Formula: '+esc(d?.formula)+'<br>Finite organization: '+esc(d?.finiteOrganization||'Not specified in definition')+'<br>History role: '+esc(d?.historyRole||'Not specified in definition')+'<br>Limitations: '+esc(d?.limitations)+'</div><details class="detail metrics"><summary>Measurements and material coefficients</summary><b>Case metrics</b><br>'+esc(JSON.stringify(c?.metrics||{},null,2))+'<br><b>Material</b><br>'+esc(JSON.stringify(c?.material||{},null,2))+(c?.technical?'<br><b>Technical</b><br>'+esc(JSON.stringify(c.technical,null,2)):'')+'</details></div>'}
function update(){const e=currentEvent(), fieldName=$('field').value, rows=$('rows');rows.innerHTML='';
 for(const [label,id] of [['Panel 1',$('candidate').value],['Panel 2',$('candidate2').value]]){const d=chosen(id),c=caseFor(e,id),base=label.toLowerCase().replace(' ','');if(!d)continue;
 const inputName=fieldName==='auto'?(c?.inputField||d.input||'chemical'):fieldName;
 const row=document.createElement('section');row.className='row';row.innerHTML='<div class="rowhead"><h2>'+label+' · '+esc(d.id)+' — '+esc(d.title)+'</h2><span class="note">Event '+esc(e?.id)+' · '+esc(c?.id||'No matching case')+'</span></div><div class="panels">'+panel('Scaffold · full world',base+'-scaffold')+panel(id==='U'&&inputName==='chemical'?'Chemical context · U uses scaffold mean':inputName==='none'?'No geometry field · control':'Input field · '+inputName+' with scaffold',base+'-input')+panel('Resulting body',base+'-body')+'</div>'+caseDetails(d,c);rows.append(row);
 const source=e?.scaffolds?.[d.scaffold]||c?.scaffold||[], body=c?.mask;
 draw($(base+'-scaffold'),{scaffold:source,production:e?.production,c0:e?.c0,showProduction:$('production').checked,showC0:$('c0').checked,mode:'blank'});
 draw($(base+'-input'),{field:e?.fields?.[inputName]||data.fields?.[inputName],scaffold:source,production:e?.production,c0:e?.c0,showProduction:$('production').checked,showC0:$('c0').checked,mode:'field'});
 draw($(base+'-body'),{mask:body,scaffold:source,production:e?.production,c0:e?.c0,showProduction:$('production').checked,showC0:$('c0').checked,mode:'body'});
 }
 window.__atlasSelection=$('candidate').value||'';
}
[$('candidate'),$('candidate2'),$('event'),$('field'),$('production'),$('c0')].forEach(el=>el.addEventListener('change',update));
if(defs.length){$('candidate').selectedIndex=0;$('candidate2').selectedIndex=Math.min(1,defs.length-1)}if(events.length)$('event').selectedIndex=0;update();window.__atlasReady=true;
</script></body></html>`;
}
