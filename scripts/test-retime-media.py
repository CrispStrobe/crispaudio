#!/usr/bin/env python3
"""Actual Apple derived media + CLI recipe/export acceptance, synthetic only."""
import json,os,subprocess,tempfile,math,struct
from pathlib import Path
cli=os.environ['CRISPAUDIO_TEST_CLI']
def run(*args):return subprocess.check_output(args)
def audio(path):
 raw=run('ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','1','-ar','48000','-');return struct.unpack('<%df'%(len(raw)//4),raw)
def freq(samples):
 a=4800;b=len(samples)-4800
 return sum(samples[i]<=0<samples[i+1] for i in range(a,b-1))*48000/(b-a)
def pixels(path,t):return list(run('ffmpeg','-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-'))
with tempfile.TemporaryDirectory(prefix='crispaudio-retime-') as root:
 p=Path(root);tone=p/'tone.wav';picture=p/'picture.mp4'
 run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:a','pcm_f32le',str(tone))
 run('ffmpeg','-v','error','-f','lavfi','-i','color=red:s=160x90:r=25:d=1','-f','lavfi','-i','color=blue:s=160x90:r=25:d=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0','-c:v','libx264','-threads','2','-pix_fmt','yuv420p',str(picture))
 settings=dict(offset=0,duration=2,rate=2,reverse=False,preservePitch=True,semitones=0,video=False,frameRate=25)
 for name,change,expected in [('stretch',{},440),('speed',dict(preservePitch=False),880),('pitch',dict(rate=1,semitones=12),880)]:
  opts={**settings,**change};f=p/(name+'.json');f.write_text(json.dumps(opts));out=p/(name+'.wav');run(cli,'--backend','apple','retime-media','--input',str(tone),'--output',str(out),'--settings',str(f));samples=audio(out);assert len(samples)==round(96000/opts['rate']);assert abs(freq(samples)-expected)<5,(name,freq(samples));assert sum(x*x for x in samples)/len(samples)>.001
  # A failed repeated publication preserves the completed output.
  before=out.read_bytes();result=subprocess.run([cli,'--backend','apple','retime-media','--input',str(tone),'--output',str(out),'--settings',str(f)],capture_output=True);assert result.returncode and out.read_bytes()==before
 for reverse in [False,True]:
  f=p/f'video-{reverse}.json';f.write_text(json.dumps({**settings,'video':True,'reverse':reverse}));out=p/f'video-{reverse}.mp4';run(cli,'--backend','apple','retime-media','--input',str(picture),'--output',str(out),'--settings',str(f));first=pixels(out,.12);last=pixels(out,.8);assert (first[2]>200 and last[0]>200) if reverse else (first[0]>200 and last[2]>200),(reverse,first,last)
  info=json.loads(run(cli,'--backend','apple','probe',str(out)));assert abs(info['duration']-1)<.041,info
 clip=dict(id='a',trackId='t',sourceId='s',startTime=0,sourceOffset=0,duration=2,gain=1,effects=[],fadeInDuration=0,fadeOutDuration=0)
 doc=dict(format='crispaudio-project',version=3,project=dict(id='p',name='p',duration=2,sampleRate=48000,masterEffects=[],tracks=[dict(id='t',name='t',volume=1,pan=0,muted=False,solo=False,segments=[clip])]),sources=[dict(id='s',name='tone',path=str(tone),duration=2,channels=1,sampleRate=48000)])
 inp=p/'input.crispaudio';inp.write_text(json.dumps(doc));recipe=p/'recipe.json';recipe.write_text(json.dumps([dict(op='retime',ids=['a'],directory=str(p/'derived'),rate=2,preservePitch=True)]));out=p/'retimed.crispaudio';run(cli,'--backend','apple','edit-project','--input',str(inp),'--output',str(out),'--recipe',str(recipe));new=json.loads(out.read_text());assert new['project']['tracks'][0]['segments'][0]['duration']==1;assert len(new['sources'])==2
 mix=p/'mix.wav';run(cli,'--backend','apple','render-project','--input',str(out),'--output',str(mix));assert abs(freq(audio(mix))-440)<5
 recipe.write_text(json.dumps([dict(op='retime',ids=['a'],restore=True)]));restored=p/'restored.crispaudio';run(cli,'--backend','apple','edit-project','--input',str(out),'--output',str(restored),'--recipe',str(recipe));c=json.loads(restored.read_text())['project']['tracks'][0]['segments'][0];assert c['sourceId']=='s' and c['duration']==2 and 'retime' not in c
 # GUI resampling can round a derived extent down by one sample. Restoration
 # must recover the complete original interval, including after a trim.
 rounded=new['project']['tracks'][0]['segments'][0];rounded['duration']=47999/48000;rounded['retime']['renderDuration']=rounded['duration']
 rounded_path=p/'rounded.crispaudio';rounded_path.write_text(json.dumps(new));rounded_out=p/'rounded-restored.crispaudio'
 run(cli,'--backend','apple','edit-project','--input',str(rounded_path),'--output',str(rounded_out),'--recipe',str(recipe))
 c=json.loads(rounded_out.read_text())['project']['tracks'][0]['segments'][0];assert abs(c['duration']-2)<1e-12
 rounded['sourceOffset']=rounded['duration']/4;rounded['duration']*=.5;rounded_path.write_text(json.dumps(new));trimmed_out=p/'rounded-trimmed-restored.crispaudio'
 run(cli,'--backend','apple','edit-project','--input',str(rounded_path),'--output',str(trimmed_out),'--recipe',str(recipe))
 c=json.loads(trimmed_out.read_text())['project']['tracks'][0]['segments'][0];assert abs(c['sourceOffset']-.5)<1e-12 and abs(c['duration']-1)<1e-12
 print(json.dumps(dict(nativeStretch='passed',speedPitch='passed',transpose='passed',videoForwardReverse='passed',noClobber='passed',recipeExportRestore='passed',roundedOriginalRestore='passed')))
