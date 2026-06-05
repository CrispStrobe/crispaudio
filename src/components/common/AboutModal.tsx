// ---------------------------------------------------------------------------
// CrispAudio — AboutModal
// App name, version, identifier, and repository link.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Modal } from './Modal';
import { useUIStore } from '../../stores/uiStore';
import { openExternal } from '../../lib/openExternal';

const REPO_URL = 'https://github.com/CrispStrobe/crispaudio';

async function getTauriVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    // Web-only mode — return package version
    return '0.2.0';
  }
}
const IDENTIFIER = 'com.crispstrobe.crispaudio';

export function AboutModal() {
  const { t } = useTranslation();
  const { activeModal, closeModal } = useUIStore();
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    if (activeModal !== 'about') return;
    getTauriVersion().then(setVersion);
  }, [activeModal]);

  return (
    <Modal
      isOpen={activeModal === 'about'}
      onClose={closeModal}
      title={t('about.title')}
    >
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none">
          <circle cx="12" cy="12" r="10" fill="#3b82f6" opacity="0.15" />
          <path
            d="M7 12 Q9 8 12 12 Q15 16 17 12"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        <div>
          <div className="text-lg font-semibold text-gray-100">CrispAudio</div>
          {version && (
            <div className="text-sm text-gray-400">
              {t('about.version')} {version}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-400 max-w-xs">
          {t('about.description')}
        </p>

        <button
          type="button"
          onClick={() => openExternal(REPO_URL)}
          className="flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {t('about.repository')}
        </button>

        <div className="text-xs text-gray-600 mt-1">{IDENTIFIER}</div>
      </div>
    </Modal>
  );
}
