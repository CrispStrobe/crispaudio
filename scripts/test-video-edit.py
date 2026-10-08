#!/usr/bin/env python3
"""Exercise the real CLI/FFmpeg picture edit path, not a mocked filter graph."""
import json, pathlib, subprocess, sys, tempfile
CLI = str(pathlib.Path(sys.argv[1]).resolve())
def run(*args):
    try: return subprocess.check_output([str(a) for a in args], stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as error:
        print(error.stderr.decode(), file=sys.stderr);raise
with tempfile.TemporaryDirectory(prefix='crispaudio-video-edit-') as folder:
    root=pathlib.Path(folder); source=root/'source.mp4'
    run('ffmpeg','-v','error','-f','lavfi','-i','color=red:s=320x180:r=30:d=3','-f','lavfi','-i','color=blue:s=320x180:r=30:d=3','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0','-c:v','libx264','-threads','2',source)
    def clip(start,offset,duration,transition='cut',overlap=0,fade=0):
        return dict(id=str(start),startTime=start,sourceOffset=offset,duration=duration,fadeIn=fade,fadeOut=0,transition=transition,transitionDuration=overlap)
    def export(clips,name,extras=()):
        edl=root/(name+'.json');edl.write_text(json.dumps(dict(path=str(source),clips=clips)));output=root/(name+'.mp4')
        run(CLI,'edit-video','--edit',edl,'--output',output,*extras);return output
    def rgb(path,time):
        raw=run('ffmpeg','-v','error','-ss',time,'-i',path,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-');return tuple(raw[:3])
    def duration(path):return float(json.loads(run('ffprobe','-v','error','-show_entries','format=duration','-of','json',path))['format']['duration'])
    edited=export([clip(0,0,3,fade=.5),clip(2,3,3,'fade',1)],'dissolve')
    assert abs(duration(edited)-5)<.04
    assert max(rgb(edited,0))<8
    assert rgb(edited,1)[0]>220
    mid=rgb(edited,2.5);assert mid[0]>90 and mid[2]>90,mid
    assert rgb(edited,4)[2]>220
    gap=export([clip(0,0,1),clip(2,3,1)],'gap');assert max(rgb(gap,1.5))<8
    cut=export([clip(0,0,1),clip(1,3,1)],'cut');assert abs(duration(cut)-2)<.04;assert rgb(cut,1.5)[2]>220
    for transition in ['fadeblack','fadewhite','wipeleft','wiperight','wipeup','wipedown','slideleft','slideright','slideup','slidedown','hblur','zoomin','pixelize','whip','glitch','pagepeel']:
        out=export([clip(0,0,2),clip(1,3,2,transition,1)],transition)
        assert abs(duration(out)-3)<.04,(transition,duration(out))
        assert rgb(out,.5)[0]>220,transition
        assert rgb(out,2.5)[2]>220,transition
        if transition=='fadeblack':assert max(rgb(out,1.5))<20
        if transition=='fadewhite':assert min(rgb(out,1.5))>220
    mix=root/'mix.wav';run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:a','pcm_s24le',mix)
    section=export([clip(0,0,3),clip(2,3,3,'fade',1)],'section',['--start','2.25','--end','4.25','--mix',str(mix),'--mix-is-trimmed'])
    assert abs(duration(section)-2)<.04;assert rgb(section,1.5)[2]>220
    bad=root/'invalid.json';bad.write_text(json.dumps(dict(path=str(source),clips=[clip(0,0,3),clip(2,3,3)])))
    rejected=subprocess.run([CLI,'edit-video','--edit',str(bad),'--output',str(root/'invalid.mp4')],capture_output=True)
    assert rejected.returncode!=0 and not (root/'invalid.mp4').exists()
    print('Video edits: split/cut, gaps, fades, 17 transitions, exact section + trimmed mix, and invalid overlap passed.')
