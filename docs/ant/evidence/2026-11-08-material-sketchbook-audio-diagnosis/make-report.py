import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/ant-audio-mpl')
import base64, html, json, hashlib
from pathlib import Path
import numpy as np
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).parent;OUT=ROOT/'output'
data=json.loads((OUT/'analysis.json').read_text());rows=data['campaign']['rows'];times=data['campaign']['times']
stems=['A','B-AB','B-BA','C']
signals={r['id']:np.fromfile(OUT/(r['id']+'.f32'),dtype='<f4').reshape(-1,2) for r in rows}
def dbs(x):return '침묵' if x is None else f'{x:.1f}'
def image(p):return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
fig,axes=plt.subplots(4,7,figsize=(19,8.7),layout='constrained',sharex=True,sharey=True)
for i,stem in enumerate(stems):
 for j,t in enumerate(times):
  x=signals[f'{stem}-{t:03d}s'];ax=axes[i,j]
  ax.plot(np.arange(len(x))/24000,x[:,0],color='#14638d',lw=.55);ax.plot(np.arange(len(x))/24000,x[:,1],color='#d38b37',lw=.5,alpha=.7)
  ax.set(xlim=(0,1.2),ylim=(-.002,.002));ax.grid(alpha=.2)
  if i==0:ax.set_title(f'world {t} s')
  if j==0:ax.set_ylabel(stem+'\nraw amplitude')
  if i==3:ax.set_xlabel('probe time (s)')
fig.suptitle('Material Sketchbook · frozen-state waveform comparison\nseed 20261005 | same impulse, raw gain 1, shared ±0.002 scale | L blue / R orange',fontsize=15)
fig.savefig(OUT/'waveform-overview.png',dpi=160);plt.close(fig)
fig,axes=plt.subplots(4,7,figsize=(19,8.7),layout='constrained',sharex=True,sharey=True)
for i,stem in enumerate(stems):
 for j,t in enumerate(times):
  x=signals[f'{stem}-{t:03d}s'];ax=axes[i,j]
  f,tt,z=signal.stft(x.T,24000,nperseg=2048,noverlap=1792,boundary=None,padded=False)
  sd=20*np.log10(np.maximum(np.sqrt(np.mean(abs(z)**2,axis=0)),1e-12))
  ax.pcolormesh(tt,f,sd,cmap='magma',vmin=-120,vmax=-40,shading='auto');ax.axhline(20,color='#67eff5',ls=':',lw=.8)
  ax.set(xlim=(0,1.2),ylim=(0,500))
  if i==0:ax.set_title(f'world {t} s')
  if j==0:ax.set_ylabel(stem+'\nHz')
  if i==3:ax.set_xlabel('probe time (s)')
fig.suptitle('Material Sketchbook · spectrogram comparison\nshared 0–500 Hz / −120…−40 dBFS amplitude | cyan dotted line = 20 Hz | no normalization',fontsize=15)
fig.savefig(OUT/'spectrogram-overview.png',dpi=160);plt.close(fig)

def wave_svg(x,lim):
 # Downsample min/max envelopes; retain peaks rather than skipping samples.
 pieces=[];width=640;height=120
 for ch,col in [(0,'#16668d'),(1,'#c47e22')]:
  paths=[]
  for j,seg in enumerate(np.array_split(x[:,ch],width)):
   lo,hi=seg.min(),seg.max();paths.append(f'M{j},{60-55*lo/lim:.3f}V{60-55*hi/lim:.3f}')
  pieces.append(f'<path d="{"".join(paths)}" stroke="{col}" stroke-width="1" opacity=".8"/>')
 return '<svg viewBox="0 0 640 120" role="img" aria-label="원본 좌우 파형"><path d="M0 60H640" stroke="#bbb"/>'+''.join(pieces)+'</svg>'

cards=[];payload={}
for r in rows:
 id=r['id'];x=signals[id];a=r['analysis'];payload[id]=base64.b64encode((OUT/(id+'.f32')).read_bytes()).decode()
 wave=wave_svg(x,.002);zoom=wave_svg(x,max(float(np.max(abs(x))),1e-10))
 bands='침묵' if a['energyBelow20Hz'] is None else f"{100*a['energyBelow20Hz']:.3f}%"
 cards.append(f'''<article class="card" data-model="{r['model']}"><div class="cardtop"><b>{id}</b><span>세계 {r['time']}초</span></div>
 <p class="numbers">Peak {dbs(a['peakDbfs'])} dBFS · RMS {dbs(a['rmsDbfs'])} dBFS<br>20 Hz 미만 {bands} · +36 dB clipping {a['clippedSamplesMonitor36']} samples</p>
 <div class="fixed">{wave}<small>공통 원본 축 ±0.002 · 파형 길이 1.2초 · L 파랑 / R 주황</small></div>
 <details><summary>형태만 확대해서 보기 — 개별 진폭 축</summary>{zoom}<small>각 응답의 peak로 확대한 진단 보기. 크기 비교에 사용하지 않음.</small></details>
 <div class="buttons"><button data-id="{id}" data-gain="0">원본 0 dB</button><button data-id="{id}" data-gain="36">공통 +36 dB</button><button data-id="{id}" data-gain="36" data-fade="1">+36 dB · 양끝 10 ms fade</button></div>
 <small>fade는 클릭 원인 확인용 가공. 원본 물질/PCM을 수정하지 않음.</small></article>''')

table=[]
for stem in stems:
 subset=[r for r in rows if r['id'].startswith(stem+'-') and r['time']>0]
 lo=min(r['analysis']['energyBelow20Hz'] for r in subset)*100;hi=max(r['analysis']['energyBelow20Hz'] for r in subset)*100
 maxmode=max(r['analysis']['modeMaxHz'] for r in subset)
 table.append(f'<tr><td>{stem}</td><td>{lo:.3f}–{hi:.3f}%</td><td>{maxmode:.2f} Hz</td><td>0</td></tr>')
browser=json.loads((OUT/'browser-validation.json').read_text()) if (OUT/'browser-validation.json').exists() else None
browserline=f'Chromium {len(browser["cases"])}개 원본/재생 비교, +36 dB 최대 오차 {max(x["maxPlaybackError"] for x in browser["cases"]):.2e}, page error 0.' if browser else '브라우저 검증 별도 기록 확인.'
doc='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANT · 시간별 소리 검증 시트</title>
<style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#18282f;background:#f3f5f3;line-height:1.65}body{max-width:1250px;margin:0 auto;padding:36px 24px 80px}h1{font-size:34px;letter-spacing:-1.5px;margin:6px 0}h2{font-size:22px;margin-top:36px}p{max-width:1000px}.eyebrow{font-size:12px;letter-spacing:2px;color:#526a65}.lead{font-size:19px}.note{background:#fff3d6;border-left:4px solid #c68a2d;padding:18px 22px}.success{background:#e3eee8;padding:16px 22px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{background:white;border:1px solid #dbe2dd;border-radius:10px;padding:20px}.cardtop{display:flex;justify-content:space-between}.cardtop span,small{color:#64776f}small{font-size:12px;display:block}.numbers{font-size:13px;font-variant-numeric:tabular-nums}svg{display:block;width:100%;background:#fbfcfb}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin:18px 0 7px}button,select{font:inherit;font-size:13px;padding:8px 12px;border:1px solid #b9c9c0;background:white;border-radius:5px;cursor:pointer}button:hover{background:#e8f0ec}button.active{background:#184d47;color:white}table{width:100%;border-collapse:collapse;background:white;font-size:14px}th,td{text-align:left;padding:12px;border-bottom:1px solid #e4e9e6}.chart{width:100%;background:white;border:1px solid #dbe2dd;border-radius:8px}details{margin:14px 0}summary{cursor:pointer;font-size:13px}nav{display:flex;gap:8px;position:sticky;top:0;background:#f3f5f3ed;padding:14px 0;z-index:3;flex-wrap:wrap}#now{font-size:13px;color:#356659;min-height:24px}.tag{font-size:12px;background:#e1e9e5;padding:3px 8px;border-radius:4px}code{font-size:12px;overflow-wrap:anywhere}footer{margin-top:45px;font-size:12px;color:#65766e}@media(max-width:750px){.grid{grid-template-columns:1fr}body{padding:20px 12px}h1{font-size:27px}}@media print{nav,.buttons{display:none}.grid{grid-template-columns:1fr 1fr}.card{break-inside:avoid}body{padding:0}}
</style>
<header><div class="eyebrow">ANT / MATERIAL SKETCHBOOK / AUDIO DIAGNOSIS</div><h1>세계의 시간에 따라, 소리는 달라지는가?</h1><p class="lead">기본 seed 20261005 · A / B-AB / B-BA / C · 7개 시점 · 28개 원본 응답</p><p><span class="tag">2026-11-08 독립 재생성</span> <span class="tag">고정 seed / 원본 식 유지</span> <span class="tag">자동 음량 정규화 없음</span></p></header>
<div class="note"><b>핵심 발견: 가청 대역 배치에 문제가 있습니다.</b><br>A의 측정된 구조는 고유 주파수 전체가 약 13 Hz 이하입니다. B와 C도 출력 스펙트럼 에너지의 약 87%가 20 Hz 미만입니다. 단순히 게인을 올려도 가청 대역으로 이동하지 않습니다. B는 재생 종료 시 0이 아닌 파형을 잘라 클릭이 날 수 있습니다. 사용자가 들은 ‘노이즈’의 동일성은 아직 청취로 확인하지 않았습니다.</div>
<p><b>두 시간을 구분하세요.</b> ‘세계 120초’는 구조를 고정한 시점이고, 각 파형의 0–1.2초는 그 구조를 새 충격으로 검사하는 재생 시간입니다. 이것은 300초 연속 세계 소리가 아닙니다. Probe 내부 가상 시간은 재생 시간의 100배입니다.</p>
<h2>먼저 확인한 것</h2><table><thead><tr><th>모델</th><th>20 Hz 미만 에너지 비율</th><th>관측 시점 중 최대 고유 주파수</th><th>+36 dB clipping</th></tr></thead><tbody>'''+''.join(table)+'''</tbody></table>
<p><small>에너지 비율은 Hann 창을 적용한 한쪽 스펙트럼의 양 채널 합산이며 DC 포함, 평균 제거 없음. 무음인 A 0초는 비율에서 제외합니다. 고유 주파수는 현재 질량·강성 행렬의 감쇠 없는 모드와 원본 100× clock에서 계산했습니다. 주파수 존재와 실제 출력 기여는 구별합니다.</small></p>
<div class="success"><b>생성·재생 경로:</b> 원본 PCM은 모두 유한하고 동일 실행 반복 시 일치합니다. 24 kHz 결과와 96 kHz 미세 적분 결과의 상대 L2 차이는 약 0.07–0.34%입니다. '''+browserline+''' 이는 수치 폭주나 gain clipping이 이번 기본 조건의 주원인이라는 근거가 없음을 뜻하며, 청취 품질·사용자 기기 출력 검증은 아닙니다.</div>
<h2>시간별 비교 시트</h2><p>열은 세계 시간, 행은 A / B-AB / B-BA / C입니다. 모든 파형은 공통 원본 진폭 축을 사용합니다.</p>
<img class="chart" alt="시간별 공통축 파형 비교" src="'''+image(OUT/'waveform-overview.png')+'''">
<details><summary>스펙트로그램 비교 — 청록 점선은 20 Hz</summary><img class="chart" alt="시간별 스펙트로그램" src="'''+image(OUT/'spectrogram-overview.png')+'''"></details>
<details><summary>주파수 스펙트럼 겹쳐 보기</summary><img class="chart" alt="절대 척도 주파수 비교" src="'''+image(OUT/'spectra-comparison.png')+'''"></details>
<h2>직접 비교해서 듣기</h2><p>공통 +36 dB로 시점끼리 비교하세요. ‘양끝 fade’는 각 끝의 10 ms를 코사인으로 줄여 재생 경계 클릭을 비교하는 진단용입니다. 주파수 대역 문제는 바꾸지 않습니다. 원본과 가공을 별도로 표시합니다.</p>
<nav><button class="filter active" data-show="all">전체</button><button class="filter" data-show="A">A</button><button class="filter" data-show="B">B · AB / BA</button><button class="filter" data-show="C">C</button><button id="stop">재생 중지</button></nav><div id="now" role="status">자동 재생 없음 · 재생 버튼을 누르면 오디오가 시작됩니다.</div><div class="grid">'''+''.join(cards)+'''</div>
<h2>이번 검증의 판정</h2><p><b>A:</b> 시간이 지나 응답 크기와 모양은 바뀌지만, 현 probe 계수와 100× clock에서는 진동 대역 자체가 통상 가청 범위 아래입니다. 이 상태로 물질 음색을 평가하면 잘못 판단할 수 있습니다.</p>
<p><b>B:</b> AB/BA 차이는 수치적으로 존재합니다. 40초 응답 차이의 RMS는 1.145×10⁻⁵이며, 300초에는 3.603×10⁻⁸로 줄어듭니다. 주 출력은 약 6 Hz이며, +36 dB 재생의 끝 샘플은 약 −43…−45 dBFS입니다. 끝에서 갑자기 0으로 바뀌므로 경계 클릭 가능성이 있습니다. 실제 지각 차이는 아직 미판정입니다.</p>
<p><b>C:</b> 가청 저음에 해당하는 모드도 있으나 출력은 약 12 Hz의 저차 응답에 강하게 몰립니다. 입력과 pickup의 공간 평균이 어떤 모드를 강조·억제하는지 후속 분해가 필요합니다. 120→300초 응답은 float 수준에서 거의 같습니다.</p>
<p><b>다음 수정 후보:</b> 먼저 같은 질량·강성·입력·pickup을 유지하고 공통 clock만 바꾸는 비교로 가청 대역 이동을 확인하세요. 배속은 주파수뿐 아니라 감쇠 시간도 함께 바꿉니다. 이후 입력·pickup에 의한 모드 소실을 별도로 검사하고, 재생 경계 fade 또는 충분한 tail 보존은 별도 변경으로 검증해야 합니다. 이번 자료는 소스의 물질 법칙·음향 파라미터를 변경하지 않았습니다.</p>
<footer>Source commit: <code>58da743d94c18e10f3241f98da28a0d23af26211</code>. 기본 seed 한 개의 진단이며 모든 seed/기기/브라우저를 보장하지 않습니다. 브라우저는 원본 모듈을 사용하고 Vite의 CSS 처리만 대체한 harness입니다. 원본 full 앱 build나 스피커 loopback 검증은 아닙니다. 자세한 값은 metrics.csv / analysis.json / browser-validation.json, 재생성은 render.mjs → analyze.py → make-report.py에 있습니다.</footer>
<script>
const PCM='''+json.dumps(payload)+''';
let context,current;
function stop(){if(current){try{current.stop()}catch{}current.disconnect();current=null}}
document.querySelectorAll('button[data-id]').forEach(button=>button.onclick=async()=>{
 try{
  context??=new AudioContext();await context.resume();stop();
  const bytes=Uint8Array.from(atob(PCM[button.dataset.id]),c=>c.charCodeAt(0));const source=new Float32Array(bytes.buffer);const frames=source.length/2;
  const buffer=context.createBuffer(2,frames,24000);const fade=Boolean(button.dataset.fade);const fadeFrames=240;
  for(let ch=0;ch<2;ch++){const samples=buffer.getChannelData(ch);for(let n=0;n<frames;n++){let w=1;if(fade){const edge=Math.min(n,frames-1-n);if(edge<fadeFrames)w=.5-.5*Math.cos(Math.PI*edge/(fadeFrames-1));}samples[n]=source[2*n+ch]*w;}}
  const node=context.createBufferSource();node.buffer=buffer;const gain=context.createGain();gain.gain.value=10**(Number(button.dataset.gain)/20);node.connect(gain);gain.connect(context.destination);current=node;node.onended=()=>{if(current===node){current=null;node.disconnect();gain.disconnect();}};node.start();
  document.getElementById('now').textContent=button.dataset.id+' · '+button.textContent+' · 固定 1.2 s';
 }catch(e){document.getElementById('now').textContent=e.message}
});
document.getElementById('stop').onclick=()=>{stop();document.getElementById('now').textContent='재생 중지'};
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.card').forEach(c=>c.hidden=b.dataset.show!=='all'&&c.dataset.model!==b.dataset.show)});
</script></html>'''
doc=doc.replace('固定 1.2 s','고정 1.2 s')
(OUT/'comparison.html').write_text(doc)
# Transparent source provenance, including all downloaded source bytes.
manifest={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'source').rglob('*') if p.is_file()}
(OUT/'source-sha256.json').write_text(json.dumps({'upstreamCommit':data['campaign']['sourceCommit'],'snapshotFilesSha256':manifest,'localScaffolding':['source/package.json'],'note':'Model, response, UI and test sources are pinned upstream copies. source/package.json is local ES-module scaffolding, not an upstream source file.'},indent=2))
print('Generated self-contained report',len(doc),'characters')
