// ---------------------------------------------------------------------------
// fsSelfTest — exercises the @tauri-apps/plugin-fs write/read path that the
// sandbox-safe file I/O relies on, so CI can confirm it actually works on iOS
// (where the old raw std::fs writes failed). Gated behind the VITE_FS_SELFTEST
// build flag; never runs in normal builds. It writes to the app's own cache
// directory via an absolute path, which also validates the capability's fs
// scope — the same scope the real Save/Export uses for user-picked paths.
// ---------------------------------------------------------------------------

export interface FsSelfTestResult {
  ok: boolean;
  detail: string;
}

export async function runFsSelfTest(): Promise<FsSelfTestResult> {
  try {
    const { writeFile, readFile, writeTextFile, readTextFile } = await import(
      '@tauri-apps/plugin-fs'
    );
    const { appCacheDir, join } = await import('@tauri-apps/api/path');

    const dir = await appCacheDir();

    // Binary round-trip (mirrors WAV export: writeFile with a Uint8Array).
    const binPath = await join(dir, 'crispaudio_selftest.bin');
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]);
    await writeFile(binPath, bytes);
    const readBytes = await readFile(binPath);
    const binOk =
      readBytes.length === bytes.length &&
      bytes.every((b, i) => b === readBytes[i]);

    // Text round-trip (mirrors project save: writeTextFile / readTextFile).
    const txtPath = await join(dir, 'crispaudio_selftest.txt');
    const text = `crispaudio-fs-ok-${bytes.length}`;
    await writeTextFile(txtPath, text);
    const readText = await readTextFile(txtPath);
    const txtOk = readText === text;

    const ok = binOk && txtOk;
    return { ok, detail: ok ? 'bin+txt round-trip OK' : `bin=${binOk} txt=${txtOk}` };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}
