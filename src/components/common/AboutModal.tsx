// ---------------------------------------------------------------------------
// CrispAudio — AboutModal
// App info, provider details, contact, disclaimer, and open source licenses.
// Matches the pattern from CrispDeck/CrispSorter.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Shield, Search, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { useUIStore } from '../../stores/uiStore';
import { openExternal } from '../../lib/openExternal';
import licensesData from '../../generated/licenses.json';

const REPO_URL = 'https://github.com/CrispStrobe/crispaudio';
const WEB_URL = 'https://crispaudio-psi.vercel.app';
const RELEASES_API = 'https://api.github.com/repos/CrispStrobe/crispaudio/releases/latest';
const CURRENT_VERSION = '0.3.0';

interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  repository?: string;
  homepage?: string;
}

async function getTauriVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return CURRENT_VERSION;
  }
}

async function checkForUpdates(): Promise<{ available: boolean; latest: string; url: string } | null> {
  try {
    const res = await fetch(RELEASES_API);
    if (!res.ok) return null;
    const data = await res.json();
    const latest = (data.tag_name as string).replace(/^v/, '');
    return {
      available: latest !== CURRENT_VERSION && latest > CURRENT_VERSION,
      latest,
      url: data.html_url as string,
    };
  } catch {
    return null;
  }
}

const IDENTIFIER = 'com.crispstrobe.crispaudio';

export function AboutModal() {
  const { t } = useTranslation();
  const { activeModal, closeModal } = useUIStore();
  const [version, setVersion] = useState<string>('');
  const [licenseSearch, setLicenseSearch] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [releaseUrl, setReleaseUrl] = useState<string>('');

  useEffect(() => {
    if (activeModal !== 'about') return;
    getTauriVersion().then(setVersion);
  }, [activeModal]);

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    const result = await checkForUpdates();
    if (!result) {
      setUpdateStatus('error');
      return;
    }
    if (result.available) {
      setUpdateStatus('available');
      setLatestVersion(result.latest);
      setReleaseUrl(result.url);
    } else {
      setUpdateStatus('up-to-date');
    }
  };

  const entries = licensesData as LicenseEntry[];
  const filtered = entries.filter(
    (l) =>
      l.name.toLowerCase().includes(licenseSearch.toLowerCase()) ||
      l.license.toLowerCase().includes(licenseSearch.toLowerCase()),
  );

  return (
    <Modal
      isOpen={activeModal === 'about'}
      onClose={closeModal}
      title={t('about.title')}
      widthClass="max-w-lg"
    >
      <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">

        {/* App info */}
        <section className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" role="img" aria-label="CrispAudio logo">
                <circle cx="12" cy="12" r="10" fill="#3b82f6" opacity="0.15" />
                <path d="M7 12 Q9 8 12 12 Q15 16 17 12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>CrispAudio</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                v{version} &middot; Audio Workstation
              </p>
            </div>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('about.description')}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Built with Tauri 2 + React + TypeScript + Rust
          </p>
          <div className="flex flex-wrap gap-3 mt-3">
            <button
              type="button"
              onClick={() => openExternal(REPO_URL)}
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink size={12} /> GitHub
            </button>
            <button
              type="button"
              onClick={() => openExternal(WEB_URL)}
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink size={12} /> Web App
            </button>
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={updateStatus === 'checking'}
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              <RefreshCw size={12} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
              {updateStatus === 'checking' ? 'Checking…' : 'Check for Updates'}
            </button>
          </div>
          {updateStatus === 'available' && (
            <div className="mt-2 p-2 rounded text-xs" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              <span style={{ color: '#22c55e' }}>v{latestVersion} available!</span>{' '}
              <button type="button" onClick={() => openExternal(releaseUrl)} className="underline" style={{ color: 'var(--accent)' }}>
                Download
              </button>
            </div>
          )}
          {updateStatus === 'up-to-date' && (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>You're on the latest version.</div>
          )}
          {updateStatus === 'error' && (
            <div className="mt-2 text-xs" style={{ color: '#ef4444' }}>Could not check for updates.</div>
          )}
          <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>{IDENTIFIER}</div>
        </section>

        {/* Service Provider */}
        <section className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('about.serviceProvider')}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Christian Ströbele<br />
            Nikolausstr. 5<br />
            70190 Stuttgart<br />
            Germany
          </p>
        </section>

        {/* Contact */}
        <section className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('about.contact')}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Email: postmaster@crispstro.be<br />
            Phone: +49 176 6421 8601
          </p>
        </section>

        {/* Disclaimer */}
        <section className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            <Shield size={14} /> Disclaimer
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            This software is provided &quot;as is&quot;, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement.
          </p>
        </section>

        {/* Open Source Licenses */}
        <section className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Open Source Licenses ({filtered.length} of {entries.length})
            </h3>
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
            >
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                aria-label="Search licenses"
                value={licenseSearch}
                onChange={(e) => setLicenseSearch(e.target.value)}
                placeholder="Search..."
                className="bg-transparent text-xs focus:outline-none w-28"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div
            className="max-h-64 overflow-y-auto space-y-1.5 rounded-md p-3"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
          >
            {filtered.map((lib) => (
              <div key={`${lib.name}-${lib.version}`} className="pb-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {lib.name}{' '}
                    <span style={{ color: 'var(--text-muted)' }}>v{lib.version}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <span>{lib.license}</span>
                  {(lib.repository || lib.homepage) && (
                    <button
                      type="button"
                      onClick={() => openExternal((lib.repository || lib.homepage)!)}
                      className="hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      Source
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Copyright */}
        <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
          &copy; {new Date().getFullYear()} Christian Ströbele &middot; MIT License
        </p>
      </div>
    </Modal>
  );
}
