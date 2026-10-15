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


def pathlib_same(value, expected):
    try:
        return Path(value).resolve() == expected.resolve()
    except OSError:
        return False


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
    info = {'CFBundleIdentifier': identifier, 'CFBundleName': 'CrispAudio Folder Probe', 'CFBundleExecutable': exe.name, 'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1', 'CFBundleShortVersionString': json.loads((REPO / 'package.json').read_text())['version']}
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
            process = subprocess.Popen(['open', '-n', '-W', '--env', 'CRISPAUDIO_NATIVE_VALIDATION_OPTIONS=' + env['CRISPAUDIO_NATIVE_VALIDATION_OPTIONS'], '--stdout', str(log), '--stderr', str(root / f'{mode}-stderr.log'), str(app)], stdout=output, stderr=subprocess.STDOUT)
            app_pid = None
            try:
                for _ in range(150):
                    for row in command('ps', '-axo', 'pid=,comm=').decode().splitlines():
                        fields = row.strip().split(None, 1)
                        if len(fields) == 2 and pathlib_same(fields[1], exe):
                            app_pid = int(fields[0])
                            break
                    if app_pid is not None:
                        break
                    if process.poll() is not None:
                        raise RuntimeError(f'Probe app did not launch; see {root}')
                    time.sleep(.1)
                if app_pid is None:
                    raise RuntimeError(f'Probe app launch timed out; see {root}')
                if mode == 'select' and args.automate_picker:
                    # Select only an owned fixture through AX; never send keys to
                    # whichever application happens to have keyboard focus.
                    script = '''on run argv
 tell application "System Events"
  tell first application process whose unix id is (item 1 of argv as integer)
   repeat 150 times
    if exists button "Open" of splitter group 1 of window 1 then exit repeat
    delay 0.1
   end repeat
   if (item 2 of argv) is not "" then
    set candidates to entire contents of window 1
    repeat with entry in candidates
     set matches to false
     try
      set matches to (name of entry is (item 2 of argv))
     end try
     if not matches then
      try
       set matches to (value of entry is (item 2 of argv))
      end try
     end if
     if matches then
      set currentNode to contents of entry
      repeat 8 times
       try
        set value of attribute "AXSelected" of currentNode to true
        exit repeat
       end try
       try
        set currentNode to value of attribute "AXParent" of currentNode
       on error
        exit repeat
       end try
      end repeat
      try
       perform action "AXPress" of entry
      end try
      exit repeat
     end if
    end repeat
   end if
   repeat 100 times
    if exists button "Open" of splitter group 1 of window 1 then
     if enabled of button "Open" of splitter group 1 of window 1 then
      perform action "AXPress" of button "Open" of splitter group 1 of window 1
      return
     end if
    end if
    delay 0.1
   end repeat
   error "Owned fixture is not selected; use the manual picker mode"
  end tell
 end tell
end run'''
                    automation = subprocess.run(['osascript', '-', str(app_pid), ''], input=script, text=True, capture_output=True, timeout=40)
                    (root / f"{mode}-picker.log").write_text(automation.stderr)
                    if automation.returncode:
                        raise RuntimeError(f"Picker selection failed: {automation.stderr}; evidence: {root}")
                process.wait(timeout=90)
            finally:
                if process.poll() is None:
                    if app_pid is not None:
                        try:
                            os.kill(app_pid, 15)
                        except ProcessLookupError:
                            pass
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
