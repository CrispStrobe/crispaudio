import React, { useState, useRef, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileAudio, X } from 'lucide-react';

interface FileDropZoneProps {
  onFileLoad: (file: File) => void;
  acceptedTypes?: string[];
  label?: string;
  loadedFileName?: string | null;
  className?: string;
}

const DEFAULT_TYPES = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
const EXTENSION_MAP: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/x-m4a',
};

function isAudioFile(file: File, acceptedTypes: string[]): boolean {
  if (acceptedTypes.includes(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext in EXTENSION_MAP && acceptedTypes.includes(EXTENSION_MAP[ext]);
}

interface TauriGlobals {
  dialog: {
    open: (opts: {
      multiple: boolean;
      filters: { name: string; extensions: string[] }[];
    }) => Promise<string | null>;
  };
  fs: {
    readBinaryFile: (path: string) => Promise<Uint8Array>;
  };
}

function getTauriGlobals(): TauriGlobals | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __TAURI__?: TauriGlobals }).__TAURI__;
}

function tryTauriDialog(
  acceptedTypes: string[],
  onFileLoad: (file: File) => void
): boolean {
  const tauri = getTauriGlobals();
  if (!tauri) return false;
  try {
    const extensions = Object.keys(EXTENSION_MAP).filter(
      ext => acceptedTypes.includes(EXTENSION_MAP[ext])
    );
    tauri.dialog
      .open({ multiple: false, filters: [{ name: 'Audio', extensions }] })
      .then((selected) => {
        if (!selected) return;
        tauri.fs.readBinaryFile(selected).then((data) => {
          const ext = selected.split('.').pop()?.toLowerCase() ?? 'wav';
          const mime = EXTENSION_MAP[ext] ?? 'audio/wav';
          const blob = new Blob([data as unknown as BlobPart], { type: mime });
          const name = selected.split(/[\\/]/).pop() ?? 'audio';
          onFileLoad(new File([blob], name, { type: mime }));
        });
      });
    return true;
  } catch {
    return false;
  }
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  onFileLoad,
  acceptedTypes = DEFAULT_TYPES,
  label,
  loadedFileName,
  className = '',
}) => {
  const { t } = useTranslation();
  const displayLabel = label ?? t('common.dropAudio');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!isAudioFile(file, acceptedTypes)) {
        setError(`Unsupported format. Accepted: ${Object.keys(EXTENSION_MAP).join(', ')}`);
        return;
      }
      onFileLoad(file);
    },
    [acceptedTypes, onFileLoad]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear if leaving the zone entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleClick = useCallback(() => {
    if (!tryTauriDialog(acceptedTypes, onFileLoad)) {
      inputRef.current?.click();
    }
  }, [acceptedTypes, onFileLoad]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so same file can be re-loaded
      e.target.value = '';
    },
    [handleFile]
  );

  const acceptAttr = acceptedTypes.join(',');

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleClick()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        aria-label={displayLabel}
        className={`
          relative flex flex-col items-center justify-center gap-2
          w-full min-h-[80px] p-4 rounded-lg border-2 border-dashed
          cursor-pointer transition-all duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
          ${isDragging
            ? 'border-indigo-400 bg-indigo-950/40 shadow-lg shadow-indigo-900/20'
            : loadedFileName
            ? 'border-green-700 bg-green-950/20 hover:border-green-500'
            : 'border-gray-700 bg-gray-900 hover:border-gray-500 hover:bg-gray-800/60'}
        `}
      >
        {isDragging ? (
          <>
            <Upload className="w-6 h-6 text-indigo-400 animate-bounce" />
            <span className="text-sm text-indigo-300 font-medium">{t('common.releaseToLoad')}</span>
          </>
        ) : loadedFileName ? (
          <>
            <FileAudio className="w-5 h-5 text-green-400 flex-shrink-0" />
            <span className="text-sm text-green-300 font-medium text-center break-all max-w-full px-2 leading-tight">
              {loadedFileName}
            </span>
            <span className="text-[11px] text-gray-500">{t('common.clickToReplace')}</span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-400 text-center leading-tight">{displayLabel}</span>
            <span className="text-[11px] text-gray-600 uppercase tracking-wide">
              {Object.keys(EXTENSION_MAP).join(' · ')}
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-red-950/50 border border-red-800">
          <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-[11px] text-red-400 leading-tight">{error}</span>
        </div>
      )}

      {/* Hidden native file input fallback */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={acceptAttr}
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
};

export default FileDropZone;
