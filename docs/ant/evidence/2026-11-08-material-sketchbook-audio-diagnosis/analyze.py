import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/ant-audio-mpl')
import json, base64, html, hashlib, csv
from pathlib import Path
import numpy as np
from scipy import signal, linalg
from scipy.io import wavfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).parent
OUT=ROOT/'output'
campaign=json.loads((OUT/'renders.json').read_text())
FS=24000
GAIN=10**(36/20)
def db(v):return float(20*np.log10(v)) if v>0 else None
def fmt(v,digits=2):return '−∞' if v is None else f'{v:.{digits}f}'
rows=campaign['rows']
signals={}
for row in rows:
    x=np.fromfile(OUT/(row['id']+'.f32'),dtype='<f4').reshape(-1,2).astype(float)
    assert np.all(np.isfinite(x))
    signals[row['id']]=x
    raw=x.astype('<f4')
    wavfile.write(OUT/(row['id']+'-raw.wav'),FS,raw)
    wavfile.write(OUT/(row['id']+'-monitor36.wav'),FS,(x*GAIN).astype('<f4'))
    # Hann-windowed one-sided bin power, both channels pooled; no detrending.
    w=np.hanning(len(x)); spec=np.fft.rfft(x*w[:,None],axis=0)
    power=np.sum(abs(spec)**2,axis=1);power[1:-1]*=2
    f=np.fft.rfftfreq(len(x),1/FS);total=power.sum()
    graph=json.loads((OUT/(row['id']+'-graph.json')).read_text())
    k=np.diag(graph['ground']); masses=np.array(graph['masses'])
    for i,j,s in graph['springs']:
        k[i,i]+=s;k[j,j]+=s;k[i,j]-=s;k[j,i]-=s
    eig=linalg.eigvalsh(k,np.diag(masses));freq=100*np.sqrt(np.maximum(eig,0))/(2*np.pi)
    peak=np.max(abs(x));rms=np.sqrt(np.mean(x*x))
    def band(a,b):return float(power[(f>=a)&(f<b)].sum()/total) if total else None
    row['analysis']={
        'peakDbfs':db(peak),'rmsDbfs':db(rms),'monitor36PeakDbfs':db(peak*GAIN),
        'meanL':float(x[:,0].mean()),'meanR':float(x[:,1].mean()),
        'maxAbsLastSample':float(abs(x[-1]).max()),
        'lastSampleMonitor36Dbfs':db(float(abs(x[-1]).max()*GAIN)),
        'tail100msRmsDbfs':db(float(np.sqrt(np.mean(x[-2400:]**2)))),
        'energyBelow20Hz':band(0,20),'energy20to200Hz':band(20,200),'energy200to2000Hz':band(200,2000),'energyAbove2000Hz':band(2000,12001),
        'peakFrequencyHz':float(f[np.argmax(power)]) if total else None,
        'modeMinHz':float(freq.min()),'modeMaxHz':float(freq.max()),
        'clippedSamplesMonitor36':int(np.count_nonzero(abs(x*GAIN)>1)),
        'clippedSamplesMonitor54':int(np.count_nonzero(abs(x*10**(54/20))>1)),
        'crestDb':db(peak/rms) if rms else None,
    }

# Pairwise differences from each sample's time=0; and AB vs BA at every time.
diffs=[]
for row in rows:
    stem=row['id'].rsplit('-',1)[0]
    base=signals[stem+'-000s'];x=signals[row['id']];delta=x-base
    diffs.append({'id':row['id'],'vs':'same sample at 0s','differenceRms':float(np.sqrt(np.mean(delta**2))), 'signalRelativeL2':float(np.linalg.norm(delta)/np.linalg.norm(x)) if np.linalg.norm(x) else None})
for t in campaign['times']:
    a=signals[f'B-AB-{t:03d}s'];b=signals[f'B-BA-{t:03d}s']
    diffs.append({'id':f'B-AB-{t:03d}s','vs':'BA at same world time','differenceRms':float(np.sqrt(np.mean((a-b)**2))),'signalRelativeL2':float(np.linalg.norm(a-b)/np.linalg.norm(a))})

plt.rcParams.update({'font.size':9,'axes.grid':True,'grid.alpha':.17})
for stem,title in [('A','A · activity / bonding'),('B-AB','B · A then B'),('B-BA','B · B then A'),('C','C · capacity redistribution')]:
    fig,axes=plt.subplots(len(campaign['times']),2,figsize=(13,17),layout='constrained')
    for i,t in enumerate(campaign['times']):
        row=next(r for r in rows if r['id']==f'{stem}-{t:03d}s');x=signals[row['id']]
        ax=axes[i,0];time=(np.arange(len(x))+1)/FS
        ax.plot(time,x[:,0],lw=.6,label='L',color='#176385');ax.plot(time,x[:,1],lw=.6,label='R',color='#d07c21',alpha=.8)
        ax.set(xlim=(0,1.2),ylim=(-.002,.002),ylabel=f'world {t}s\nraw amplitude',title=f"peak {fmt(row['analysis']['peakDbfs'])} dBFS · RMS {fmt(row['analysis']['rmsDbfs'])} dBFS")
        if i==0:ax.legend(loc='upper right',fontsize=7)
        ax=axes[i,1]
        f,tt,z=signal.stft(x.T,FS,window='hann',nperseg=2048,noverlap=1792,boundary=None,padded=False,axis=-1)
        mag=np.sqrt(np.mean(abs(z)**2,axis=0));sd=20*np.log10(np.maximum(mag,1e-12))
        ax.pcolormesh(tt,f,sd,cmap='magma',vmin=-120,vmax=-40,shading='auto')
        ax.set(ylim=(0,500),xlim=(0,1.2),ylabel='Hz',title='STFT 0–500 Hz · common −120…−40 dBFS amplitude scale')
    axes[-1,0].set_xlabel('probe playback time (s)');axes[-1,1].set_xlabel('probe playback time (s)')
    fig.suptitle(f'{title} | seed 20261005 | identical frozen-state impulse | no normalization\nEach row is a separate 1.2 s probe at a world checkpoint, NOT continuous world audio.',fontsize=13)
    fig.savefig(OUT/(stem+'-comparison.png'),dpi=140);plt.close(fig)

fig,axes=plt.subplots(4,1,figsize=(12,12),layout='constrained')
for ax,stem in zip(axes,['A','B-AB','B-BA','C']):
    for t in campaign['times']:
        x=signals[f'{stem}-{t:03d}s'];f,p=signal.periodogram(x,FS,window='hann',detrend=False,axis=0,scaling='spectrum')
        p=np.mean(p,axis=1);ax.plot(f,10*np.log10(np.maximum(p,1e-24)),label=f'{t}s',lw=1)
    ax.set(xlim=(0,500),ylim=(-140,-40),title=stem,ylabel='dBFS² / bin');ax.legend(ncol=7,fontsize=8);ax.axvline(20,color='black',ls=':',lw=1)
axes[-1].set_xlabel('Hz (20 Hz marked)');fig.suptitle('Frozen-state response spectra | shared absolute scale | Hann, no detrend / normalization')
fig.savefig(OUT/'spectra-comparison.png',dpi=140);plt.close(fig)

(OUT/'analysis.json').write_text(json.dumps({'campaign':campaign,'differences':diffs,'spectrumConvention':'Hann one-sided bin energy, no detrending; pooled L/R; DC included','limitations':['single seed','frozen-state probes, not continuous formation sound','no subjective listening verdict','browser playback parity recorded separately']},indent=2))
with (OUT/'metrics.csv').open('w',newline='') as file:
    fields=['id','time']+list(rows[0]['analysis'])
    writer=csv.DictWriter(file,fieldnames=fields);writer.writeheader()
    for row in rows:writer.writerow({'id':row['id'],'time':row['time'],**row['analysis']})
print(json.dumps([{k:r[k] for k in ['id','analysis','refinement']} for r in rows if r['time'] in [0,30,40,120,300]],indent=2))
