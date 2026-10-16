// ---------------------------------------------------------------------------
// native bridge tests — platform detection and the
// invoke sequences behind the share sheet and "Open in CrispAudio".
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();
const listen = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listen(...args) }));

import {
  haptic,
  isIOSApp,
  setAudioSessionType,
  shareFile,
  subscribeOpenedFiles,
} from '../../../src/lib/native';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';

function setPlatform({ tauri, ua, touchPoints = 0 }: { tauri: boolean; ua: string; touchPoints?: number }) {
  if (tauri) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  // jsdom has no maxTouchPoints, so define it rather than spy on it.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}

beforeEach(() => {
  invoke.mockReset();
  listen.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  delete (navigator as unknown as Record<string, unknown>).audioSession;
});

describe('isIOSApp', () => {
  it('is true for the Tauri app on iPhone', () => {
    setPlatform({ tauri: true, ua: IPHONE_UA });
    expect(isIOSApp()).toBe(true);
  });

  it('is true for iPadOS, which reports a Macintosh UA with touch', () => {
    setPlatform({ tauri: true, ua: MAC_UA, touchPoints: 5 });
    expect(isIOSApp()).toBe(true);
  });

  it('is false for the desktop Mac app', () => {
    setPlatform({ tauri: true, ua: MAC_UA });
    expect(isIOSApp()).toBe(false);
  });

  it('is false for Safari on iPhone (no Tauri)', () => {
    setPlatform({ tauri: false, ua: IPHONE_UA });
    expect(isIOSApp()).toBe(false);
  });
});

describe('shareFile', () => {
  it('stages the bytes with a sanitized name, then opens the share sheet', async () => {
    invoke
      .mockResolvedValueOnce('/tmp/crispaudio-share/Mix_ take 2.wav')
      .mockResolvedValueOnce({ completed: true, activity: 'com.apple.UIKit.activity.AirDrop' });

    const done = await shareFile(new Blob([new Uint8Array([1, 2, 3])]), 'Mix: take 2.wav');

    expect(done).toBe(true);
    const [cmd, body, options] = invoke.mock.calls[0];
    expect(cmd).toBe('stage_share_file');
    expect([...(body as Uint8Array)]).toEqual([1, 2, 3]);
    expect(options).toEqual({ headers: { 'x-file-name': 'Mix_ take 2.wav' } });
    expect(invoke.mock.calls[1]).toEqual([
      'plugin:crispaudio-native|shareFile',
      { path: '/tmp/crispaudio-share/Mix_ take 2.wav' },
    ]);
  });
});

describe('haptic and audio session', () => {
  it('does nothing outside the iOS app', () => {
    setPlatform({ tauri: true, ua: MAC_UA });
    haptic('success');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends the style to the plugin on iOS', async () => {
    setPlatform({ tauri: true, ua: IPHONE_UA });
    invoke.mockResolvedValue(undefined);
    haptic('selection');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('plugin:crispaudio-native|haptic', { style: 'selection' }),
    );
  });

  it('sets the WebKit audio session type on iOS only', () => {
    const session = { type: 'auto' };
    (navigator as unknown as Record<string, unknown>).audioSession = session;

    setPlatform({ tauri: false, ua: IPHONE_UA });
    setAudioSessionType('playback');
    expect(session.type).toBe('auto');

    setPlatform({ tauri: true, ua: IPHONE_UA });
    setAudioSessionType('playback');
    expect(session.type).toBe('playback');
  });
});

describe('subscribeOpenedFiles', () => {
  it('is inert outside Tauri', async () => {
    setPlatform({ tauri: false, ua: MAC_UA });
    const onFiles = vi.fn();
    const unsubscribe = await subscribeOpenedFiles(onFiles);
    unsubscribe();
    expect(invoke).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('drains files queued before startup and again on each event', async () => {
    setPlatform({ tauri: true, ua: IPHONE_UA });
    let onEvent: () => void = () => {};
    const unlisten = vi.fn();
    listen.mockImplementation(async (_name: string, cb: () => void) => {
      onEvent = cb;
      return unlisten;
    });
    const queued = [['/var/Inbox/loop.wav'], ['/var/Inbox/song.crispaudio']];
    invoke.mockImplementation(async (cmd: string, args?: { path: string }) => {
      if (cmd === 'take_opened_files') return queued.shift() ?? [];
      if (cmd === 'read_opened_file') return new TextEncoder().encode(args!.path).buffer;
      throw new Error(`unexpected ${cmd}`);
    });
    const onFiles = vi.fn();

    const unsubscribe = await subscribeOpenedFiles(onFiles);
    expect(listen).toHaveBeenCalledWith('opened-files', expect.any(Function));
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('loop.wav');

    onEvent();
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledTimes(2));
    expect(onFiles.mock.calls[1][0][0].name).toBe('song.crispaudio');

    unsubscribe();
    expect(unlisten).toHaveBeenCalled();
  });
});

it('retains desktop source paths and avoids sending an opened MP4 through byte IPC',async()=>{
 setPlatform({tauri:true,ua:MAC_UA});const onFiles=vi.fn();listen.mockResolvedValue(vi.fn());
 invoke.mockImplementation(async(cmd:string)=>{
  if(cmd==='take_opened_files')return ['/outside/movie.mp4','/outside/project.crispaudio.json'];
  if(cmd==='read_opened_file')return new ArrayBuffer(0);
 });
 const stop=await subscribeOpenedFiles(onFiles);
 expect(invoke).toHaveBeenCalledWith('read_opened_file',{path:'/outside/movie.mp4',pathOnly:true});
 expect(invoke).toHaveBeenCalledWith('read_opened_file',{path:'/outside/project.crispaudio.json'});
 expect(onFiles.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({filePath:'/outside/movie.mp4'}),expect.objectContaining({filePath:'/outside/project.crispaudio.json'})]));stop();
});
