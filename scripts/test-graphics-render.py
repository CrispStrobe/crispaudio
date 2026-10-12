#!/usr/bin/env python3
"""Native still/title/caption pixels; generated media only."""
import json,pathlib,subprocess,sys,tempfile
cli=str(pathlib.Path(sys.argv[1]).resolve())
def run(*args):
 try:return subprocess.check_output(list(map(str,args)),stderr=subprocess.PIPE)
 except subprocess.CalledProcessError as e:print(e.stderr.decode());raise
with tempfile.TemporaryDirectory(prefix='crispaudio-graphics-') as folder:
 root=pathlib.Path(folder);source=root/'red.mp4';image=root/'blue.png'
 run('ffmpeg','-v','error','-f','lavfi','-i','color=red:s=320x180:r=25:d=4','-c:v','libx264','-threads','2',source)
 run('ffmpeg','-v','error','-f','lavfi','-i','color=blue:s=320x180','-frames:v','1','-threads','1',image)
 track=dict(id='graphics',name='Graphics',visible=True,locked=False,rippleEnabled=True)
 pose=dict(x=0,y=0,scale=1,rotation=0,opacity=1,crop=dict(left=0,right=0,top=0,bottom=0))
 style=dict(font='Arial',size=.09,align='center',color='#ffffff',background='#000000',backgroundOpacity=.65,boxWidth=.8,lineHeight=1.2)
 base=dict(path=str(source),width=320,height=180,frameRate=25,duration=4,clips=[dict(id='base',startTime=0,duration=4,sourceOffset=0,fadeIn=0,fadeOut=0,transition='cut',transitionDuration=0)])
 def export(name,**patch):
  edl=root/f'{name}.json';edl.write_text(json.dumps(dict(base,**patch)));out=root/f'{name}.mp4';run(cli,'edit-video','--backend','apple','--edit',edl,'--output',out);return out
 def frame(out,time):return run('ffmpeg','-v','error','-ss',time,'-i',out,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-')
 def white(raw,y0=0,y1=180):return sum(min(raw[(y*320+x)*3:(y*320+x)*3+3])>170 for y in range(y0,y1) for x in range(320))
 title=dict(id='title',type='title',name='Title',text='Grüße aus München',startTime=1,duration=2,style=style,composition=pose)
 out=export('title',graphics=[dict(track,clips=[title])]);assert white(frame(out,.5))==0;assert white(frame(out,2),50,130)>100
 frames=dict(pose,keyframes=[dict(time=0,x=0,y=0,scale=1,rotation=0,opacity=0,easing='step'),dict(time=1,x=0,y=0,scale=1,rotation=0,opacity=1)])
 out=export('animated',graphics=[dict(track,clips=[dict(title,composition=frames)])]);assert white(frame(out,1.5))==0;assert white(frame(out,2.5))>100
 pip=dict(pose,scale=.5)
 out=export('image',graphics=[dict(track,clips=[dict(id='image',type='image',name='Blue',startTime=0,duration=4,path=str(image),composition=pip)])]);raw=frame(out,2);center=raw[(90*320+160)*3:(90*320+160)*3+3];edge=raw[(20*320+20)*3:(20*320+20)*3+3];assert center[2]>220 and edge[0]>220
 caption=dict(track,id='caption',burnIn=False,style=style,cues=[dict(id='cue',start=1,end=3,text='Überprüfung: Grüße')])
 out=export('sidecar',captions=caption);assert white(frame(out,2))==0
 out=export('burn',captions=dict(caption,burnIn=True));assert white(frame(out,2),130,180)>100
 print(json.dumps(dict(passed=5,checks='German titles / timed visibility / Step opacity / still PiP / sidecar versus burn-in')))
