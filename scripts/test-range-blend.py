#!/usr/bin/env python3
"""Optional Apple-render range-policy regression. FFmpeg creates/inspects colours.
Usage: python3 scripts/test-range-blend.py /path/to/crispaudio
No private inputs, screen capture or installed-app state is touched.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

CLI = str(pathlib.Path(sys.argv[1]).resolve())

def run(*args):
    return subprocess.check_output([str(a) for a in args], stderr=subprocess.PIPE)

with tempfile.TemporaryDirectory(prefix='crispaudio-range-blend-') as folder:
    root = pathlib.Path(folder)
    for color in ['red', 'blue', 'lime']:
        run('ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
            f'color=c={color}:s=160x90:r=25:d=4', '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p', root / f'{color}.mp4')
    left = {'id': 'left', 'startTime': 0, 'sourceOffset': 0, 'duration': 2,
            'fadeIn': 0, 'fadeOut': 0, 'transition': 'cut', 'transitionDuration': 0}
    middle = {**left, 'id': 'middle', 'sourceId': 'blue', 'startTime': 1.6,
              'sourceOffset': .4, 'duration': 2.4, 'transition': 'fade', 'transitionDuration': .4}
    right = {**left, 'id': 'right', 'sourceId': 'lime', 'startTime': 3.6,
             'sourceOffset': .4, 'duration': 2, 'transition': 'fade', 'transitionDuration': .4}
    doc = {'format': 'crispaudio-project', 'version': 3, 'sources': [],
           'project': {'id': 'p', 'name': 'Synthetic range', 'duration': 5.6,
                       'sampleRate': 48000, 'frameRate': 25, 'masterEffects': [],
                       'tracks': [], 'video': {'path': str(root / 'red.mp4'),
                       'duration': 4, 'sources': [{'id': 'blue', 'path': str(root / 'blue.mp4'),
                       'name': 'Blue', 'duration': 4}, {'id': 'lime', 'path': str(root / 'lime.mp4'),
                       'name': 'Green', 'duration': 4}], 'clips': [left, middle, right]}}}
    original = root / 'original.crispaudio'
    original.write_text(json.dumps(doc))

    def rgb(name, time):
        data = run('ffmpeg', '-v', 'error', '-ss', time, '-i', root / f'{name}.mp4',
                   '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1')
        assert len(data) == 3, data
        return list(data)

    results = []
    for operation in ['lift', 'extract', 'insert']:
        recipe = root / f'{operation}.json'
        recipe.write_text(json.dumps([{'op': 'range-edit', 'operation': operation,
                                       'start': 1.72, 'end': 1.88, 'transitionPolicy': 'cut'}]))
        edited = root / f'{operation}.crispaudio'
        run(CLI, 'edit-project', '--input', original, '--recipe', recipe, '--output', edited)
        run(CLI, '--backend', 'apple', 'render-project', '--input', edited,
            '--output', root / f'{operation}.mp4', '--video')
        shift = 0 if operation == 'lift' else -.16 if operation == 'extract' else .16
        cut = 2 + shift
        before = rgb(operation, cut - .08)
        after = rgb(operation, cut + .04)
        assert before[0] > 230 and before[2] < 15, before
        assert after[2] > 230 and after[0] < 15, after
        if operation != 'extract':
            assert max(rgb(operation, 1.76)) < 15, 'Inserted/lifted interval must stay black'
        blend = rgb(operation, 3.8 + shift)
        assert 60 < blend[1] < 200 and 60 < blend[2] < 200, blend
        info = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-of', 'json', root / f'{operation}.mp4'))
        picture = next(s for s in info['streams'] if s['codec_type'] == 'video')
        assert abs(float(picture['duration']) - (5.6 + shift)) < 1 / 25
        results.append({'operation': operation, 'hardCut': cut, 'beforeRGB': before,
                        'afterRGB': after, 'unaffectedBlendRGB': blend, 'duration': float(picture['duration'])})
    print(json.dumps({'nativeAppleRangeBlend': 'passed', 'cases': results}))
