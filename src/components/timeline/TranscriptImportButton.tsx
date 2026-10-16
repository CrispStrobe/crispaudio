import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Upload} from 'lucide-react';
import {useProjectStore} from '../../stores/projectStore';
import type {TimelineProject} from '../../types/audio';
import {isIOSApp} from '../../lib/native';
import {ToolButton} from '../common/ToolButton';
import {InfoButton} from '../common/InfoButton';

type Importer = (text: string, snapshot: TimelineProject) => void;
/** Desktop picker and browser/iOS files share the same guarded import boundary. */
export function TranscriptImportButton({label, help, onImport, disabled = false}: {
  label: string; help: string; onImport: Importer; disabled?: boolean;
}) {
  const {t} = useTranslation(), input = useRef<HTMLInputElement>(null);
  const active = useRef(true), sequence = useRef(0);
  const pending = useRef<{snapshot: TimelineProject; importer: Importer; id: number} | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { active.current = true; sequence.current++; return () => { active.current = false; }; }, []);
  const read = async (request: NonNullable<typeof pending.current>, load: () => Promise<string | null>) => {
    setBusy(true); setError('');
    try {
      const text = await load();
      if (!active.current || request.id !== sequence.current || text === null) return;
      if (useProjectStore.getState().project !== request.snapshot) throw new Error('sync.changed');
      request.importer(text, request.snapshot);
    } catch (e) {
      if (active.current && request.id === sequence.current) setError(t(e instanceof Error ? e.message : String(e)));
    } finally { if (active.current && request.id === sequence.current) setBusy(false); }
  };
  const choose = () => {
    const request = {snapshot: useProjectStore.getState().project, importer: onImport, id: ++sequence.current};
    pending.current = request; setError('');
    if ('__TAURI_INTERNALS__' in window && !isIOSApp()) {
      void read(request, async () => {
        const {open} = await import('../../lib/nativeDialog');
        const path = await open({multiple: false, filters: [{name: 'JSON / SRT / VTT', extensions: ['json', 'srt', 'vtt']}]});
        if (typeof path !== 'string') return null;
        const {readTextFile} = await import('@tauri-apps/plugin-fs'); return readTextFile(path);
      });
    } else input.current?.click();
  };
  return <div className="space-y-1" data-transcript-import>
    <div className="flex items-center gap-1">
      <ToolButton icon={Upload} label={label} disabled={disabled || busy} onClick={choose}/>
      <InfoButton label={`${t('common.help')} · ${label}`}><p>{help}</p></InfoButton>
      <input ref={input} type="file" accept=".json,.srt,.vtt" aria-label={label} className="hidden" onChange={e => {
        const file = e.currentTarget.files?.[0], request = pending.current;
        e.currentTarget.value = '';
        if (file && request) void read(request, () => file.text());
      }}/>
    </div>
    {error && <p role="alert" className="text-xs text-amber-300 break-words">{error}</p>}
  </div>;
}
