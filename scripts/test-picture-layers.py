#!/usr/bin/env python3
"""Synthetic pixel checks for native ordered layers, gaps, opacity and animation."""
import json,pathlib,subprocess,sys,tempfile
cli=str(pathlib.Path(sys.argv[1]).resolve())
def run(*args):
    return subprocess.check_output(list(map(str,args)),stderr=subprocess.PIPE)
with tempfile.TemporaryDirectory(prefix='crispaudio-layers-') as folder:
    root=pathlib.Path(folder)
    for name,color in [('red','red'),('blue','blue')]:
        run('ffmpeg','-v','error','-f','lavfi','-i',f'color={color}:s=320x180:r=30:d=4','-c:v','libx264','-threads','2',root/f'{name}.mp4')
    def clip(id,start,duration,source=None,composition=None,lane=None):
        c=dict(id=id,startTime=start,duration=duration,sourceOffset=0,fadeIn=0,fadeOut=0,transition='cut',transitionDuration=0)
        if source:c['sourceId']=source
        if composition:c['composition']=composition
        if lane:c['videoTrackId']=lane
        return c
    def pose(**patch):return dict(x=0,y=0,scale=1,rotation=0,opacity=1,crop=dict(left=0,top=0,right=0,bottom=0),**patch)
    base=dict(path=str(root/'red.mp4'),sources=[dict(id='blue',path=str(root/'blue.mp4'))],tracks=[dict(id=id,name=id,visible=True,locked=False,rippleEnabled=True) for id in ['top','picture']],width=320,height=180,frameRate=30)
    count=0
    def export(name,clips,**patch):
        global count
        edit=root/f'{name}.json';edit.write_text(json.dumps(dict(base,clips=clips,**patch)));out=root/f'{name}.mp4'
        try:run(cli,'edit-video','--backend','apple','--edit',edit,'--output',out)
        except subprocess.CalledProcessError as e:print(e.stderr.decode());raise
        count+=1;return out
    def rgb(out,time,x=160,y=90):
        return tuple(run('ffmpeg','-v','error','-ss',time,'-i',out,'-frames:v','1','-vf',f'crop=2:2:{x}:{y},scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-')[:3])
    background=clip('base',0,4)
    p=pose();p['scale']=.5
    pip=export('pip',[background,clip('overlay',1,2,'blue',p,'top')])
    assert rgb(pip,.5)[0]>220
    assert rgb(pip,1.5)[2]>220
    assert rgb(pip,1.5,20,20)[0]>220
    assert rgb(pip,3.5)[0]>220
    p=pose();p['opacity']=.5
    alpha=export('alpha',[background,clip('overlay',0,4,'blue',p,'top')]);pixel=rgb(alpha,2);assert 105<pixel[0]<150 and 105<pixel[2]<150,pixel
    hidden=[dict(t,visible=t['id']!='top') for t in base['tracks']]
    out=export('hidden',[background,clip('overlay',0,4,'blue',None,'top')],tracks=hidden);assert rgb(out,2)[0]>220
    p=pose();p['scale']=.25;p['keyframes']=[dict(time=t,x=x,y=0,scale=.25,rotation=0,opacity=1) for t,x in [(0,-.3),(3,.3)]]
    out=export('animated',[background,clip('overlay',0,4,'blue',p,'top')]);assert rgb(out,0,65,90)[2]>220;assert rgb(out,3,255,90)[2]>220;assert rgb(out,3,65,90)[0]>220
    # Sorting by lane must never truncate the longer background.
    info=json.loads(run('ffprobe','-v','error','-show_entries','format=duration','-of','json',pip));assert abs(float(info['format']['duration'])-4)<.04
    print(json.dumps(dict(passed=count,checks='order/gaps/PiP/alpha/visibility/keyframes/duration')))
