import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openProjectFile, saveProjectFile } from '../../../src/lib/projectIO';
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
beforeEach(() => { Object.assign(window, { __TAURI_INTERNALS__: {} }); vi.clearAllMocks(); });
afterEach(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
describe('native project file failures', () => {
  it('propagates denied save access so the editor can display it', async () => {
    vi.mocked(save).mockResolvedValue('/denied.json');
    vi.mocked(writeTextFile).mockRejectedValue(new Error('Permission denied'));
    await expect(saveProjectFile('{}', 'project')).rejects.toThrow('Cannot save project: Error: Permission denied');
  });
  it('propagates missing opened media/project instead of treating it as cancellation', async () => {
    vi.mocked(open).mockResolvedValue('/missing.json');
    vi.mocked(readTextFile).mockRejectedValue(new Error('Not found'));
    await expect(openProjectFile()).rejects.toThrow('Cannot open project: Error: Not found');
  });
  it('keeps dialog cancellation harmless', async () => {
    vi.mocked(open).mockResolvedValue(null); vi.mocked(save).mockResolvedValue(null);
    await expect(openProjectFile()).resolves.toBeNull();
    await expect(saveProjectFile('{}', 'project')).resolves.toBe(false);
  });
});
