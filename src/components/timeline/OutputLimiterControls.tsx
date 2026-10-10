import {useTranslation} from 'react-i18next';
import {ShieldCheck} from 'lucide-react';
import {limiterParameters} from '../../audio/dsp/samplePeakLimiter';
import {useProjectStore} from '../../stores/projectStore';
import {GainReduction} from './GainReduction';
import {NumberField} from './NumberField';
export function OutputLimiterControls() {
  const {t}=useTranslation(),config=useProjectStore(s=>s.project.outputLimiter),p=limiterParameters(config);
  const update=(patch:Partial<typeof p>&{enabled?:boolean})=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,outputLimiter:{enabled:config?.enabled??false,...p,...patch}}});};
  return <section className="rounded border border-gray-700 p-2 space-y-2" aria-label={t('dynamics.limiter')}>
    <label className="flex items-center gap-2 min-h-11 text-xs"><input type="checkbox" checked={config?.enabled??false} onChange={e=>update({enabled:e.target.checked})}/><ShieldCheck size={16}/><span title={t('dynamics.limiterHelp')}>Limiter</span></label>
    {config?.enabled&&<>
      <label className="block text-xs [&_input]:w-full [&_input]:min-h-11">{t('dynamics.ceiling')}<NumberField label={t('dynamics.ceiling')} min={-24} step={.1} value={p.ceiling} onCommit={value=>{if(value>0)return false;update({ceiling:value});return true;}}/></label>
      <label className="block text-xs [&_input]:w-full [&_input]:min-h-11">{t('dynamics.release')}<NumberField label={t('dynamics.release')} min={10} step={10} value={Math.round(p.release*1000)} onCommit={value=>{if(value>2000)return false;update({release:value/1000});return true;}}/></label>
      <GainReduction scope="limiter"/>
      <p className="text-xs text-gray-400" title={t('dynamics.limiterHelp')}>{t('dynamics.zeroLatency')}</p>
    </>}
  </section>;
}
