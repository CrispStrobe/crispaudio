#!/usr/bin/env python3
"""Check real PowerBox selection and bookmark restoration outside Downloads.
Uses an isolated sandboxed app, generated audio and the ADelay fixture. Temporarily
opens its folder picker; --automate-picker requires macOS Accessibility access.
No microphone, audio output, installed app/session, or Apple upload is used.
"""
import argparse
import json
import math
import os
from pathlib import Path
import plistlib
import shutil
import struct
import subprocess
import tempfile
import time
import uuid
import wave

REPO = Path(__file__).resolve().parent.parent
NAMES = ['crispaudio-apple-media', 'crispaudio-vst3-host']


def command(*args):
    return subprocess.run([str(v) for v in args], check=True, capture_output=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--automate-picker', action='store_true')
    parser.add_argument('--keep', action='store_true')
    parser.add_argument('--fixture', type=Path, default=Path('/tmp/crispaudio-vst3-fixture/VST3/Release/ADelay.vst3'))
    args = parser.parse_args()
    token = uuid.uuid4().hex
    root = Path(tempfile.mkdtemp(prefix='crispaudio-folder-probe-'))
    fixture = Path.home() / f'.crispaudio-folder-fixture-{token}'
    fixture.mkdir(mode=0o700)
    app = root / 'CrispAudioFolderProbe.app'
    mac = app / 'Contents/MacOS'
    mac.mkdir(parents=True)
    exe = mac / 'crispaudio-native-validation'
    command('ditto', REPO / 'src-tauri/target/debug/crispaudio-native-validation', exe)
    for name in NAMES:
        command('ditto', REPO / 'src-tauri/generated/native-helpers' / name, mac / name)
    command('ditto', args.fixture, fixture / 'ADelay.vst3')
    command('codesign', '--force', '--deep', '--sign', '-', fixture / 'ADelay.vst3')
    with wave.open(str(fixture / 'input.wav'), 'wb') as audio:
        audio.setparams((2, 2, 48000, 0, 'NONE', 'not compressed'))
        audio.writeframes(b''.join(struct.pack('<hh', *([round(5000 * math.sin(i * 2 * math.pi * 440 / 48000))] * 2)) for i in range(4800)))
    identifier = f'com.crispstrobe.crispaudio.folder-probe-{token}'
    info = {'CFBundleIdentifier': identifier, 'CFBundleName': 'CrispAudio Folder Probe', 'CFBundleExecutable': exe.name, 'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1', 'CFBundleShortVersionString': '0.13.0'}
    (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    for name in NAMES:
        command('codesign', '--force', '--options', 'runtime', '--entitlements', REPO / 'src-tauri/helper-entitlements.plist', '--sign', '-', mac / name)
    command('codesign', '--force', '--options', 'runtime', '--entitlements', REPO / 'src-tauri/entitlements.plist', '--sign', '-', app)
    command('python3', REPO / 'scripts/release/check-macos-app.py', app, '--allow-ad-hoc')
    print(f"Fixture folder: {fixture}", flush=True)
    print(f"Evidence: {root}", flush=True)
    reports = []
    for mode in ['select', 'restore']:
        log = root / f'{mode}.log'
        env = dict(os.environ, CRISPAUDIO_NATIVE_VALIDATION_OPTIONS=json.dumps({'folderProbe': mode, 'folder': str(fixture)}))
        with log.open('w') as output:
            process = subprocess.Popen([str(exe)], env=env, stdout=output, stderr=subprocess.STDOUT)
            try:
                if mode == 'select' and args.automate_picker:
                    # Focus ONLY our process and send a Go to Folder path to its panel.
                    # The user still gets a real PowerBox panel and OS authorization.
                    script = '''on run argv
 tell application "System Events"
  repeat 100 times
   set matches to application processes whose unix id is (item 1 of argv as integer)
   if (count matches) > 0 then
    tell item 1 of matches
     if exists button "Open" of splitter group 1 of window 1 then exit repeat
    end tell
   end if
   delay 0.1
  end repeat
  tell item 1 of matches
   set frontmost to true
   keystroke "g" using {command down, shift down}
   delay 0.5
   keystroke item 2 of argv
   key code 36
   delay 0.5
   repeat 50 times
    if not (exists sheet 1 of window 1) then exit repeat
    delay 0.1
   end repeat
   click button "Open" of splitter group 1 of window 1
  end tell
 end tell
end run'''
                    subprocess.run(['osascript', '-', str(process.pid), str(fixture)], input=script, text=True, check=True, capture_output=True, timeout=20)
                process.wait(timeout=90)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
        lines = log.read_text().splitlines()
        line = next((v for v in lines if v.startswith('CRISPAUDIO_FOLDER_VALIDATION ')), None)
        if not line:
            raise RuntimeError(f'Missing {mode} report; see {log}\n{log.read_text()[-2000:]}')
        report = json.loads(line.split(' ', 1)[1])
        if process.returncode or not report.get('success'):
            raise RuntimeError(f'{mode} failed: {report}; evidence {root}')
        reports.append(report)
    result = {'sandbox': True, 'hardenedRuntime': True, 'signing': 'ad-hoc local test', 'outsideDownloads': True, 'runs': reports, 'appleStoreAcceptance': 'not established'}
    (root / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    # Clean only owned generated fixtures. Keep container identity/data out of the
    # user's installed app; sandbox containers are managed by macOS, not rm here.
    shutil.rmtree(fixture)
    if args.keep:
        print(f'Folder sandbox evidence: {root}')
    else:
        shutil.rmtree(root)


if __name__ == '__main__':
    main()
