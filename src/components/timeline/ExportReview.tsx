import {useProjectStore} from '../../stores/projectStore';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Play,Square,ExternalLink} from 'lucide-react';
import {open} from '../../lib/nativeDialog';
import {openPath} from '@tauri-apps/plugin-opener';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {useMixAudition} from '../../hooks/useMixAudition';
import {useUIStore} from '../../stores/uiStore';
import {reviewExport,type ExportReviewResult} from '../../lib/exportReview';
import {isTauri,isIOSApp} from '../../lib/native';
import {Modal} from '../common/Modal';
import {InfoButton} from '../common/InfoButton';
import {ToolButton} from '../common/ToolButton';
export function ExportReview(){
 const {t}=useTranslation(),recording=useUIStore(s=>s.timelineRecording),desktop=isTauri()&&!isIOSApp(),audition=useMixAudition(),[path,setPath]=useState(''),[opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<ExportReviewResult>(),[error,setError]=useState(''),controller=useRef<AbortController|null>(null),mounted=useRef(false);
 const show=async(path:string)=>{controller.current?.abort();audition.stop();const active=new AbortController();controller.current=active;setPath(path);setResult(undefined);setError('');setBusy(true);setOpened(true);try{const reviewed=await reviewExport(path,active.signal);active.signal.throwIfAborted();if(mounted.current)setResult(reviewed);}catch(e){if(!active.signal.aborted&&mounted.current)setError(t(e instanceof Error?e.message:String(e)));}finally{if(controller.current===active){controller.current=null;if(mounted.current)setBusy(false);}}};
 useTimelineTool('review-export',async()=>{const path=await open({multiple:false,title:t('exportReview.choose'),filters:[{name:t('exportReview.media'),extensions:['wav','flac','aac','mp3','mp4','mov','opus']}]});if(typeof path==='string')void show(path);},desktop&&!recording);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 useEffect(()=>{const handler=(e:Event)=>{const path=(e as CustomEvent<string>).detail;if(desktop&&!useUIStore.getState().timelineRecording&&typeof path==='string')void show(path);};window.addEventListener('crispaudio-review-export',handler);return()=>window.removeEventListener('crispaudio-review-export',handler);
 // show owns a fresh controller; captures use current app state rather than stale UI flags.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[desktop]);
 const stopAudition=audition.stop;
 useEffect(()=>useUIStore.subscribe(state=>{if(state.timelineRecording)stopAudition();}),[stopAudition]);
 const close=()=>{controller.current?.abort();audition.stop();setResult(undefined);setOpened(false);};
 const number=(value:number|null)=>value===null?'—':value.toFixed(1),db=(value:number)=>value>0?(20*Math.log10(value)).toFixed(1):'−∞';
 return <Modal isOpen={opened} onClose={close} title={t('exportReview.title')}><div className="space-y-3 text-sm"><p className="truncate" title={path}>{path.split(/[\\/]/).pop()}</p><div className="flex gap-1"><ToolButton icon={audition.playing?Square:Play} label={t(audition.playing?'timeline.stop':'timeline.play')} disabled={busy||!result||recording} onClick={()=>{if(audition.playing)audition.stop();else if(result)void audition.play([result.buffer,result.buffer],'A',[1,0],false).catch(e=>setError(String(e)));}}/><ToolButton icon={ExternalLink} label={t('exportReview.openFile')} disabled={!path} onClick={()=>{audition.stop();useProjectStore.getState().setIsPlaying(false);void openPath(path).catch(e=>setError(String(e)));}}/><InfoButton label={t('exportReview.info')}><p>{t('exportReview.help')}</p><p>{t('mixReview.meterHelp')}</p></InfoButton></div>{result&&<><p className="text-xs text-gray-400">{result.measurement.duration.toFixed(3)} s · {result.fileRate} Hz · {result.fileChannels} ch{result.bitDepth?` · ${result.bitDepth} bit`:''}</p><dl className="grid grid-cols-2 gap-2 text-xs tabular-nums" data-export-measurements><dt>LUFS</dt><dd>{number(result.measurement.loudness.integrated)}</dd><dt>TP (dBTP)</dt><dd>{number(result.measurement.loudness.truePeak)}</dd><dt>{t('mixReview.peak')} (dBFS)</dt><dd>{db(result.measurement.peak)}</dd><dt>RMS (dBFS)</dt><dd>{db(result.measurement.rms)}</dd></dl></>}{busy&&<p role="status" className="text-xs text-gray-400">{t('exportReview.loading')}</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}</div></Modal>;
}
