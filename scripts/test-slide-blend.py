#!/usr/bin/env python3
"""Optional macOS Apple-render check; FFmpeg creates/inspects synthetic fixtures.
Usage: python3 scripts/test-slide-blend.py /path/to/crispaudio
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

with tempfile.TemporaryDirectory(prefix='crispaudio-slide-blend-') as folder:
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
           'project': {'id': 'p', 'name': 'Synthetic slide', 'duration': 5.6,
                       'sampleRate': 48000, 'frameRate': 25, 'masterEffects': [],
                       'tracks': [], 'video': {'path': str(root / 'red.mp4'),
                       'duration': 4, 'sources': [{'id': 'blue', 'path': str(root / 'blue.mp4'),
                       'name': 'Blue', 'duration': 4}, {'id':'lime','path':str(root/'lime.mp4'),
                       'name':'Green','duration':4}], 'clips': [clip, middle, right]}}}
    original = root / 'original.crispaudio'
    original.write_text(json.dumps(doc))
    recipe = root / 'recipe.json'
    recipe.write_text(json.dumps([{'op': 'slide', 'ids': ['middle'], 'seconds': .2}]))
    edited = root / 'edited.crispaudio'
    run(CLI, 'edit-project', '--input', original, '--recipe', recipe, '--output', edited)
    for name, project in [('original', original), ('edited', edited)]:
        run(CLI, '--backend', 'apple', 'render-project', '--input', project,
            '--output', root / f'{name}.mp4', '--video')

    def rgb(name, time):
        data = run('ffmpeg', '-v', 'error', '-ss', time, '-i', root / f'{name}.mp4',
                   '-frames:v', 1, '-vf', 'scale=1:1', '-pix_fmt', 'rgb24',
                   '-f', 'rawvideo', 'pipe:1')
        assert len(data) == 3, data
        return list(data)

    old_mid = rgb('original', 1.8)
    new_start = rgb('edited', 1.8)
    new_mid = rgb('edited', 2.0)
    assert 60 < old_mid[0] < 200 and 60 < old_mid[2] < 200, old_mid
    assert new_start[0] > 230 and new_start[2] < 20, new_start
    assert 60 < new_mid[0] < 200 and 60 < new_mid[2] < 200, new_mid
    old_tail=rgb('original',3.8);new_tail_start=rgb('edited',3.8);new_tail_mid=rgb('edited',4.0)
    assert 60<old_tail[1]<200 and 60<old_tail[2]<200,old_tail
    assert new_tail_start[2]>230 and new_tail_start[1]<20,new_tail_start
    assert 60<new_tail_mid[1]<200 and 60<new_tail_mid[2]<200,new_tail_mid
    assert rgb('edited', 0)[0] > 230
    assert rgb('edited', 5.52)[1] > 230
    for name in ['original', 'edited']:
        info = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-of', 'json', root / f'{name}.mp4'))
        picture = next(s for s in info['streams'] if s['codec_type'] == 'video')
        assert abs(float(picture['duration']) - 5.6) < 1 / 25
    print(json.dumps({'pictureDuration': 5.6, 'oldMidpointRGB': old_mid,
                      'movedStartRGB': new_start, 'movedMidpointRGB': new_mid,'movedTailMidpointRGB':new_tail_mid,
                      'nativeAppleTransitionSlide': 'passed'}))
