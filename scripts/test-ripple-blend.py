#!/usr/bin/env python3
"""Optional macOS Apple-render check; FFmpeg creates/inspects synthetic fixtures.
Usage: python3 scripts/test-ripple-blend.py /path/to/crispaudio
No private media, OS screen capture or installed-app state is touched.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

CLI = str(pathlib.Path(sys.argv[1]).resolve())

def run(*args):
    return subprocess.check_output([str(a) for a in args], stderr=subprocess.PIPE)

with tempfile.TemporaryDirectory(prefix='crispaudio-ripple-blend-') as folder:
    root = pathlib.Path(folder)
    for color in ['red', 'blue', 'lime']:
        run('ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
            f'color=c={color}:s=160x90:r=25:d=4', '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p', root / f'{color}.mp4')
    clip = {'id': 'left', 'startTime': 0, 'sourceOffset': 0, 'duration': 2,
            'fadeIn': 0, 'fadeOut': 0, 'transition': 'cut', 'transitionDuration': 0}
    middle = {**clip, 'id': 'middle', 'sourceId': 'blue', 'startTime': 1.6,
              'sourceOffset': .4, 'duration': 2.4, 'transition': 'fade', 'transitionDuration': .4}
    right = {**clip, 'id': 'right', 'sourceId': 'lime', 'startTime': 3.6,
             'sourceOffset': .4, 'duration': 2, 'transition': 'fade', 'transitionDuration': .4}
    doc = {'format': 'crispaudio-project', 'version': 3, 'sources': [],
           'project': {'id': 'p', 'name': 'Synthetic ripple', 'duration': 5.6,
                       'sampleRate': 48000, 'frameRate': 25, 'masterEffects': [],
                       'tracks': [], 'video': {'path': str(root / 'red.mp4'),
                       'duration': 4, 'sources': [{'id': 'blue', 'path': str(root / 'blue.mp4'),
                       'name': 'Blue', 'duration': 4}, {'id':'lime','path':str(root/'lime.mp4'),
                       'name':'Green','duration':4}], 'clips': [clip, middle, right]}}}
    original = root / 'original.crispaudio'
    original.write_text(json.dumps(doc))

    run(CLI,'--backend','apple','render-project','--input',original,'--output',root/'original.mp4','--video')
    def rgb(name,time):
        data=run('ffmpeg','-v','error','-ss',time,'-i',root/f'{name}.mp4',
                 '-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1')
        assert len(data)==3,data
        return list(data)
    results=[]
    for side in ['left','right']:
        for delta in [-.2,.2]:
            name=f'{side}-{delta}'
            recipe=root/f'{name}.json'
            recipe.write_text(json.dumps([{'op':'ripple-trim','ids':['middle'],'side':side,'seconds':delta}]))
            edited=root/f'{name}.crispaudio'
            run(CLI,'edit-project','--input',original,'--recipe',recipe,'--output',edited)
            run(CLI,'--backend','apple','render-project','--input',edited,'--output',root/f'{name}.mp4','--video')
            shift=-delta if side=='left' else delta
            head=rgb(name,1.8);tail=rgb(name,3.8+shift)
            assert 60<head[0]<200 and 60<head[2]<200,head
            assert 60<tail[1]<200 and 60<tail[2]<200,tail
            assert rgb(name,0)[0]>230
            assert rgb(name,5.52+shift)[1]>230
            info=json.loads(run('ffprobe','-v','error','-show_streams','-of','json',root/f'{name}.mp4'))
            picture=next(s for s in info['streams'] if s['codec_type']=='video')
            assert abs(float(picture['duration'])-(5.6+shift))<1/25
            result=json.loads(edited.read_text())['project']['video']['clips'][1]
            assert result['id']=='middle' and result['transitionDuration']==.4
            assert abs(result['sourceOffset']-(.4+delta if side=='left' else .4))<1e-9
            results.append({'side':side,'delta':delta,'duration':float(picture['duration']),'incomingRGB':head,'outgoingRGB':tail})
    print(json.dumps({'nativeAppleTransitionRipple':'passed','cases':results}))
