// ---------------------------------------------------------------------------
// projectIO tests — only the parts testable without Tauri runtime
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock Tauri modules before importing projectIO
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Import after mocks are set up
import { saveProjectFile, openProjectFile } from '../../../src/lib/projectIO';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// In jsdom, __TAURI_INTERNALS__ is not present, so isTauri() returns false
// and the browser fallback paths are exercised.

beforeEach(() => {
  vi.restoreAllMocks();
  // Ensure no __TAURI_INTERNALS__ on window so browser paths execute
  if ('__TAURI_INTERNALS__' in window) {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  }
});

// ---------------------------------------------------------------------------
// saveProjectFile — browser fallback
// ---------------------------------------------------------------------------

describe('saveProjectFile — browser fallback', () => {
  it('returns true (browser download always succeeds)', async () => {
    // Mock createElement to avoid actual DOM side effects
    const clickSpy = vi.fn();
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
      // Satisfy minimal element interface
      setAttribute: vi.fn(),
    } as unknown as HTMLAnchorElement);

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');

    const result = await saveProjectFile('{"test": true}', 'MyProject');
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalledOnce();

    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('uses the defaultName in the download filename', async () => {
    let capturedDownload = '';
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      set download(val: string) { capturedDownload = val; },
      get download() { return capturedDownload; },
      click: vi.fn(),
      setAttribute: vi.fn(),
    } as unknown as HTMLAnchorElement);

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await saveProjectFile('{}', 'TestName');
    expect(capturedDownload).toBe('TestName.crispaudio.json');

    createSpy.mockRestore();
  });

  it('creates a blob with correct MIME type', async () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob');
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
      setAttribute: vi.fn(),
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await saveProjectFile('{"data": 1}', 'proj');

    expect(blobSpy).toHaveBeenCalledWith(['{"data": 1}'], { type: 'application/json' });

    createSpy.mockRestore();
    blobSpy.mockRestore();
  });

  it('revokes the blob URL after download', async () => {
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
      setAttribute: vi.fn(),
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await saveProjectFile('{}', 'proj');
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url');

    createSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// openProjectFile — browser fallback
// ---------------------------------------------------------------------------

describe('openProjectFile — browser fallback', () => {
  it('creates a file input element', async () => {
    const inputEl = {
      type: '',
      accept: '',
      onchange: null as ((ev: Event) => void) | null,
      click: vi.fn(),
      files: null,
    };

    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(
      inputEl as unknown as HTMLElement,
    );

    const promise = openProjectFile();

    // Simulate user cancelling (no file selected)
    inputEl.onchange!({} as Event);

    const result = await promise;
    expect(result).toBeNull();
    expect(inputEl.type).toBe('file');
    expect(inputEl.accept).toBe('.json,application/json');
    expect(inputEl.click).toHaveBeenCalled();

    createSpy.mockRestore();
  });

  it('returns file content when a file is selected', async () => {
    const fakeFile = {
      text: () => Promise.resolve('{"project": "data"}'),
    };

    const inputEl = {
      type: '',
      accept: '',
      onchange: null as ((ev: Event) => void) | null,
      click: vi.fn(),
      files: [fakeFile],
    };

    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(
      inputEl as unknown as HTMLElement,
    );

    const promise = openProjectFile();
    inputEl.onchange!({} as Event);

    const result = await promise;
    expect(result).toBe('{"project": "data"}');

    createSpy.mockRestore();
  });

  it('returns null when file.text() rejects', async () => {
    const fakeFile = {
      text: () => Promise.reject(new Error('read failed')),
    };

    const inputEl = {
      type: '',
      accept: '',
      onchange: null as ((ev: Event) => void) | null,
      click: vi.fn(),
      files: [fakeFile],
    };

    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(
      inputEl as unknown as HTMLElement,
    );

    const promise = openProjectFile();
    inputEl.onchange!({} as Event);

    const result = await promise;
    expect(result).toBeNull();

    createSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// isTauri detection
// ---------------------------------------------------------------------------

describe('isTauri detection', () => {
  it('browser fallback is used when __TAURI_INTERNALS__ is absent', async () => {
    // saveProjectFile should not call invoke (Tauri path)
    const { invoke } = await import('@tauri-apps/api/core');
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
      setAttribute: vi.fn(),
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await saveProjectFile('{}', 'test');
    expect(invoke).not.toHaveBeenCalled();

    createSpy.mockRestore();
  });
});
