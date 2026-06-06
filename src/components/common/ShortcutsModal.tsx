// ---------------------------------------------------------------------------
// CrispAudio — ShortcutsModal
// Keyboard shortcuts help overlay, organised by panel.
// ---------------------------------------------------------------------------

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useUIStore } from '../../stores/uiStore';

interface Shortcut {
  keys: string;
  description: string;
}

interface Section {
  title: string;
  shortcuts: Shortcut[];
}

const sections: Section[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: 'Ctrl+1 / 2 / 3', description: 'Switch to SFX / Voice / Timeline' },
      { keys: 'Ctrl+,', description: 'Open Settings' },
      { keys: '?', description: 'Show shortcuts' },
    ],
  },
  {
    title: 'SFX Panel',
    shortcuts: [
      { keys: '1-8, Q,W,E,R,T,Y,U', description: 'Load preset' },
      { keys: 'Space', description: 'Play / Stop' },
      { keys: 'L', description: 'Toggle loop' },
      { keys: 'M', description: 'Mutate' },
      { keys: 'A / B', description: 'Switch slot' },
      { keys: 'Ctrl+Z / Ctrl+Shift+Z', description: 'Undo / Redo' },
    ],
  },
  {
    title: 'Voice Panel',
    shortcuts: [
      { keys: '1-9', description: 'Load voice preset' },
      { keys: 'Space', description: 'Play / Stop' },
      { keys: 'P', description: 'Process' },
      { keys: 'A / B', description: 'Switch slot' },
    ],
  },
  {
    title: 'Timeline',
    shortcuts: [
      { keys: 'Space', description: 'Play / Stop' },
      { keys: 'Delete', description: 'Delete selected' },
      { keys: 'Ctrl+C / X / V', description: 'Copy / Cut / Paste' },
      { keys: 'Ctrl+Z / Ctrl+Shift+Z', description: 'Undo / Redo' },
    ],
  },
];

const KeyBadge: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-block bg-gray-700 px-2 py-0.5 rounded text-xs font-mono">
    {label}
  </span>
);

export const ShortcutsModal: React.FC = () => {
  const { t } = useTranslation();
  const closeModal = useUIStore((s) => s.closeModal);

  return (
    <Modal
      isOpen
      onClose={closeModal}
      title={t('shortcuts.title')}
      widthClass="max-w-lg"
    >
      <div className="space-y-5 text-sm text-gray-300">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              {section.title}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((sc) => (
                <div
                  key={sc.keys}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-gray-400 text-xs">{sc.description}</span>
                  <KeyBadge label={sc.keys} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default ShortcutsModal;
