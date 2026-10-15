#!/usr/bin/env python3
"""Uses built helpers only. No audio device, microphone or speaker is opened."""
import pathlib,subprocess,json,struct,time
import argparse,os
parser=argparse.ArgumentParser(description="Verify AU/VST3 clock and DSP history after a silent 65-second idle pause.")
parser.add_argument('--build-directory',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]/'src-tauri/target/debug/build')
parser.add_argument('--vst-bundle',default=str(pathlib.Path(os.environ.get('CRISPAUDIO_TEST_PLUGIN_FOLDER','/tmp/crispaudio-vst3-fixture/VST3/Release'))/'ADelay.vst3'))
args=parser.parse_args()
root=args.build_directory
children=[]
def reply(child):
 header=child.stdout.read(4)
 if len(header)!=4:raise RuntimeError('Helper exited during idle pause: '+child.stderr.read().decode())
 info=json.loads(child.stdout.read(struct.unpack('<I',header)[0]));pcm=child.stdout.read(info['frames']*info['channels']*4)
 return info,struct.unpack('<'+'f'*(len(pcm)//4),pcm)
def command(child,kind,sequence,pulse=False):
 frames=128 if kind==1 else 0;payload=json.dumps({'parameters':{},'bypass':False}).encode();left=[0.]*frames;right=[0.]*frames
 if pulse:left[64]=.75;right[64]=-.625
 pcm=struct.pack('<'+'f'*(frames*2),*(left+right))
 child.stdin.write(struct.pack('<IIII',kind,frames,sequence,len(payload))+payload+pcm);child.stdin.flush();return reply(child)
try:
 for name,kind in [('crispaudio-vst3-host','VST3'),('crispaudio-apple-media','AU')]:
  files=sorted(root.glob('crispaudio-media-*/out/'+name),key=lambda p:p.stat().st_mtime);path=str(files[-1]);request={'path':args.vst_bundle}if kind=='VST3'else{}
  plugins=json.loads(subprocess.check_output([path,'plugin-scan',json.dumps(request)]));plugin=next(v for v in plugins if v['name']==('ADelay'if kind=='VST3'else'AUBandpass'))
  parameters={'100':.002,'101':0}if kind=='VST3'else{'0':440}
  child=subprocess.Popen([path,'plugin-stream',json.dumps({'id':plugin['id'],'sampleRate':48000,'channels':2,'parameters':parameters})],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE);children.append((kind,child));reply(child);command(child,1,1,True);before,_=command(child,2,2);assert before['transport']['samplePosition']==128
 print('AU and VST3 paused at DSP frame 128; holding for 65 seconds.',flush=True);time.sleep(65)
 for kind,child in children:
  after,_=command(child,2,3);assert after['transport']['samplePosition']==128
  resumed,pcm=command(child,1,4);assert resumed['transport']['samplePosition']==128
  if kind=='VST3':assert abs(pcm[32]-.75)<2e-6 and abs(pcm[128+32]+.625)<2e-6
  child.stdin.close();assert child.wait(timeout=10)==0;print(kind+': 65-second pause retained clock and DSP history: PASS',flush=True)
finally:
 for _,child in children:
  if child.poll()is None:child.kill();child.wait()
