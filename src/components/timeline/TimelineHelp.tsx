import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
export function TimelineHelp({open,onClose}:{open:boolean;onClose:()=>void}) {
  const {t}=useTranslation();
  return <Modal isOpen={open} onClose={onClose} title={t('usability.help')} widthClass="max-w-2xl">
    <div className="space-y-4">{['move','navigation','reorder','overlap','time','import','height','remove','fullscreen'].map(topic=><section key={topic}>
      <h3 className="text-sm font-semibold text-gray-100">{t(`usability.help_${topic}_title`)}</h3><p className="text-sm text-gray-300 mt-1">{t(`usability.help_${topic}`)}</p>
    </section>)}</div>
  </Modal>;
}
