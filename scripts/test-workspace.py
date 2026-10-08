#!/usr/bin/env python3
"""Real FFmpeg checks for multiple sources, repeated cuts and CLI project recipes."""
import array,json,pathlib,subprocess,sys,tempfile
CLI=str(pathlib.Path(sys.argv[1]).resolve())
def run(*args):
    try:return subprocess.check_output([str(a) for a in args],stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:print(e.stderr.decode(),file=sys.stderr);raise
with tempfile.TemporaryDirectory(prefix='crispaudio-workspace-') as directory:
    root=pathlib.Path(directory);red=root/'red.mp4';blue=root/'blue.mp4'
    for path,color,size,fps in [(red,'red','320x180',25),(blue,'blue','640x360',30)]:run('ffmpeg','-v','error','-f','lavfi','-i',f'color={color}:s={size}:r={fps}:d=3','-c:v','libx264','-threads','2',path)
    thumbnail=root/'first.jpg';run(CLI,'prepare','--input',red,'--output',thumbnail,'--thumbnail')
    thumbnail_info=json.loads(run('ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',thumbnail))
    assert thumbnail_info['streams'][0]==dict(width=160,height=90),thumbnail_info
    first_rgb=run('ffmpeg','-v','error','-i',thumbnail,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-')
    assert first_rgb[0]>220 and first_rgb[1]<30,tuple(first_rgb)
    overwrite_thumb=subprocess.run([CLI,'prepare','--input',str(red),'--output',str(thumbnail),'--thumbnail'],capture_output=True);assert overwrite_thumb.returncode!=0
    def clip(id,start,duration,source=None):
        return dict(id=id,startTime=start,sourceOffset=0,duration=duration,fadeIn=0,fadeOut=0,transition='cut',transitionDuration=0,**(dict(sourceId=source) if source else {}))
    def export(clips,name,duration=None):
        edit=root/(name+'.json');edit.write_text(json.dumps(dict(path=str(red),sources=[dict(id='b',path=str(blue))],frameRate=25,clips=clips,**(dict(duration=duration) if duration else {}))));output=root/(name+'.mp4');run(CLI,'edit-video','--edit',edit,'--output',output);return output
    def info(path):return json.loads(run('ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,width,height,avg_frame_rate:format=duration','-of','json',path))
    def rgb(path,time):return tuple(run('ffmpeg','-v','error','-ss',time,'-i',path,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-')[:3])
    picture=export([clip('a',0,1.04),clip('b',1.04,1.04,'b')],'two-sources');meta=info(picture)
    assert meta['streams'][0]['nb_read_frames']=='52',meta
    assert meta['streams'][0]['width']==320 and meta['streams'][0]['height']==180,meta
    assert rgb(picture,.2)[0]>220 and rgb(picture,1.5)[2]>220
    tail=export([clip('a',0,2)],'black-tail',3);assert info(tail)['streams'][0]['nb_read_frames']=='75';assert max(rgb(tail,2.8))<8
    many=export([clip(str(i),i*.073,.073,'b' if i%2 else None) for i in range(40)],'many-cuts');meta=info(many)
    assert meta['streams'][0]['nb_read_frames']=='73',meta
    assert abs(float(meta['format']['duration'])-2.92)<.001,meta
    audio=root/'source.wav';run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=3:sample_rate=48000','-c:a','pcm_f32le',audio)
    segment=dict(id='a',linkGroup='g',trackId='t',sourceId='s',startTime=0,sourceOffset=0,duration=2,gain=1,fadeInDuration=0,fadeOutDuration=0,fadeInCurve='linear',fadeOutCurve='linear',effects=[],name='a',color='red')
    video_clip=clip('v',0,2);video_clip['linkGroup']='g'
    project=dict(format='crispaudio-project',version=2,project=dict(id='p',name='test',sampleRate=48000,duration=2,tracks=[dict(id='t',name='t',volume=.5,pan=0,muted=False,solo=False,segments=[segment],automation=[dict(time=0,value=0),dict(time=2,value=1)])],masterEffects=[],video=dict(path=str(red),duration=3,session={},clips=[video_clip])),sources=[dict(id='s',name='s',path=str(audio),sampleRate=48000,channels=1,duration=3)])
    original=root/'project.crispaudio';original.write_text(json.dumps(project));rendered=root/'mix.wav';run(CLI,'render-project','--input',original,'--output',rendered)
    samples=array.array('f',run('ffmpeg','-v','error','-i',rendered,'-ac','1','-f','f32le','-'))
    rms=lambda second:(sum(x*x for x in samples[int((second-.05)*48000):int((second+.05)*48000)])/4800)**.5
    assert abs(rms(.5)/rms(1.5)-1/3)<.002,(rms(.5),rms(1.5))
    rendered_picture=root/'project.mp4';run(CLI,'render-project','--input',original,'--output',rendered_picture,'--video');assert rgb(rendered_picture,.1)[0]>220
    recipe=root/'recipe.json';recipe.write_text(json.dumps([dict(op='split',ids=['v'],at=1),dict(op='marker',at=.5,name='Question')]))
    edited=root/'edited.crispaudio';run(CLI,'edit-project','--input',original,'--recipe',recipe,'--output',edited);doc=json.loads(edited.read_text());a=doc['project']['tracks'][0]['segments'];v=doc['project']['video']['clips'];assert len(a)==len(v)==2 and a[1]['linkGroup']==v[1]['linkGroup']!=a[0]['linkGroup'];assert doc['project']['markers'][0]['name']=='Question'
    assert json.loads(run(CLI,'loudness',audio))['gain_db']>0
    overwrite=subprocess.run([CLI,'prepare','--input',str(red),'--output',str(rendered_picture),'--proxy'],capture_output=True);assert overwrite.returncode!=0
    assert original.read_text()==json.dumps(project)
    print('PASS: mixed dimensions/fps, 40 cuts without drift, first-frame picture, linked CLI edits, rendered gain automation, project MP4, loudness and overwrite protection.')
