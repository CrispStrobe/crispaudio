import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {AutomationRecorder} from '../../../src/components/timeline/AutomationRecorder';
import {ScopedAutomationRecorder} from '../../../src/components/timeline/ScopedAutomationRecorder';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/i18n',()=>({default:{language:'en',changeLanguage:vi.fn()}}));
const noop=()=>{};
beforeEach(()=>{useProjectStore.setState({...useProjectStore.getInitialState(),project:{...useProjectStore.getInitialState().project,duration:4,masterEffects:[{type:'delay',enabled:true,params:{time:.2,mix:.3,feedback:.4}}],nativeEffects:[{instanceId:'fx',pluginId:'au:test',name:'Effect',format:'AU',enabled:true,bypass:false,state:'',parameters:{}}],tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[]}]}});});
it('prevents arming a track automation pass when its native audition is unavailable',()=>{
 render(<AutomationRecorder target={{trackId:'track',parameter:'gain'}} onBusy={noop}/>);
 expect(screen.getByRole('combobox',{name:'automation.recordMode'})).toBeDisabled();expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();
});
it('prevents arming a scoped effect pass without changing its envelope or project',()=>{
 const snapshot=useProjectStore.getState().project;
 render(<ScopedAutomationRecorder snapshot={snapshot} scope="master" index={0} parameter="mix" points={[]} fallback={.3} onDraft={noop} onBusy={noop}/>);
 expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();expect(screen.getByRole('slider',{name:'automation.recordValue'})).toBeDisabled();expect(useProjectStore.getState().project).toBe(snapshot);
});
