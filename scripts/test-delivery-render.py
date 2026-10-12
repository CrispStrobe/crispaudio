#!/usr/bin/env python3
"""Synthetic actual Apple landscape/portrait/quality/range/stem delivery."""
import os,json,tempfile,subprocess
from pathlib import Path
cli=os.environ['CRISPAUDIO_TEST_CLI']
def run(*args):return subprocess.check_output(args)
with tempfile.TemporaryDirectory(prefix='crispaudio-delivery-') as temp:
 p=Path(temp);video=p/'camera.mp4';tone=p/'tone.wav'
 run('ffmpeg','-v','error','-f','lavfi','-i','color=red:s=320x180:r=25:d=2','-c:v','libx264','-threads','2',str(video))
 run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:a','pcm_f32le',str(tone))
 for name,width,height,quality,extension in [('landscape',640,360,'highest','mp4'),('portrait',360,640,'highest','mp4'),('review',640,360,'highest','mp4'),('prores',640,360,'prores','mov')]:
  edit=dict(path=str(video),width=width,height=height,frameRate=25,duration=2,exportPreset=quality,outputFormat=extension,clips=[dict(id='v',startTime=0,sourceOffset=0,duration=2,transition='cut',fadeIn=0,fadeOut=0,transitionDuration=0)])
  edl=p/f'{name}.json';edl.write_text(json.dumps(edit));out=p/f'{name}.{extension}';run(cli,'edit-video','--backend','apple','--edit',str(edl),'--output',str(out),'--start','.5','--end','1.5')
  info=json.loads(run('ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)));stream=next(s for s in info['streams'] if s['codec_type']=='video')
  assert (stream['width'],stream['height'])==(width,height),(name,stream['width'],stream['height']);assert abs(float(info['format']['duration'])-1)<.05
  assert stream['codec_name']==('prores' if quality=='prores' else 'h264'),(name,stream['codec_name'])
 clip=dict(id='a',trackId='t',sourceId='s',startTime=0,sourceOffset=0,duration=2,gain=1,effects=[],fadeInDuration=0,fadeOutDuration=0)
 doc=dict(format='crispaudio-project',version=3,renderRange=dict(start=.5,end=1.5),project=dict(id='p',name='Stem',duration=2,sampleRate=48000,masterEffects=[],tracks=[dict(id='t',name='Dialogue',solo=True,muted=False,pan=0,volume=1,output='bus',segments=[clip]),dict(id='bus',name='Bus',kind='bus',solo=False,muted=False,pan=0,volume=.5,segments=[])]),sources=[dict(id='s',name='tone',path=str(tone),duration=2,channels=1,sampleRate=48000)])
 f=p/'project.json';f.write_text(json.dumps(doc));out=p/'stem.wav';run(cli,'render-project','--backend','apple','--input',str(f),'--output',str(out));info=json.loads(run(cli,'probe','--backend','apple',str(out)));assert abs(info['duration']-1)<1e-6;assert info['channels']==2,info
 print(json.dumps(dict(landscape='passed',portrait='passed',reviewQuality='passed',proresMOV='passed',trimmedVideo='passed',routedStemRange='passed')))
