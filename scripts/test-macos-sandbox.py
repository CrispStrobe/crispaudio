#!/usr/bin/env python3
"""Run the muted native recording probe in an isolated, ad-hoc signed sandbox app.
Requires a built native-validation binary/helpers and the ADelay VST3 test fixture.
Does not use physical input, change the output device, or upload to Apple.
"""
import argparse
import json
import os
import pathlib
import plistlib
import shutil
import subprocess
import tempfile
import time

REPO = pathlib.Path(__file__).resolve().parent.parent
NAMES = ['crispaudio-apple-media', 'crispaudio-vst3-host']


def command(*args):
    return subprocess.run([str(arg) for arg in args], check=True, capture_output=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable', type=pathlib.Path, default=REPO / 'src-tauri/target/debug/crispaudio-native-validation')
    parser.add_argument('--helpers', type=pathlib.Path, default=REPO / 'src-tauri/generated/native-helpers')
    parser.add_argument('--vst3-fixture', type=pathlib.Path, default=pathlib.Path(os.environ.get('CRISPAUDIO_TEST_PLUGIN_FOLDER', '/tmp/crispaudio-vst3-fixture/VST3/Release')) / 'ADelay.vst3')
    parser.add_argument('--plugin-location', choices=['bundled', 'downloads'], default='bundled', help='Test bundled code or an owned external fixture in Downloads (a static sandbox right).')
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    root = pathlib.Path(tempfile.mkdtemp(prefix='crispaudio-sandbox-'))
    external_root = None
    app = root / 'CrispAudioSandboxProbe.app'
    mac = app / 'Contents/MacOS'
    mac.mkdir(parents=True)
    plugins = app / 'Contents/PlugIns'
    plugins.mkdir()
    exe = mac / 'crispaudio-native-validation'
    command('ditto', args.executable, exe)
    for name in NAMES:
        command('ditto', args.helpers / name, mac / name)
    if args.plugin_location == 'downloads':
        downloads = pathlib.Path.home() / 'Downloads'
        if not downloads.is_dir():
            raise ValueError('Downloads folder is required for the external fixture check.')
        external_root = pathlib.Path(tempfile.mkdtemp(prefix='.crispaudio-sandbox-', dir=downloads))
    fixture = (external_root or plugins) / 'ADelay.vst3'
    command('ditto', args.vst3_fixture, fixture)
    vst = next(plugin['id'] for plugin in json.loads(command(mac / NAMES[1], 'plugin-scan', json.dumps({'path': str(fixture)}))) if plugin['name'] == 'ADelay')
    au = next(plugin['id'] for plugin in json.loads(command(mac / NAMES[0], 'plugin-scan', '{}')) if plugin['name'] == 'AUBandpass')
    info = {'CFBundleIdentifier': 'com.crispstrobe.crispaudio.native-validation', 'CFBundleName': 'CrispAudio Sandbox Probe', 'CFBundleExecutable': exe.name, 'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1', 'CFBundleShortVersionString': '0.13.0', 'NSMicrophoneUsageDescription': 'Generated-input validation only; no physical input is requested.'}
    (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    command('codesign', '--force', '--deep', '--sign', '-', fixture)
    for name in NAMES:
        command('codesign', '--force', '--options', 'runtime', '--entitlements', REPO / 'src-tauri/helper-entitlements.plist', '--sign', '-', mac / name)
    command('codesign', '--force', '--options', 'runtime', '--entitlements', REPO / 'src-tauri/entitlements.plist', '--sign', '-', app)
    command('python3', REPO / 'scripts/release/check-macos-app.py', app, '--allow-ad-hoc')
    env = dict(os.environ, CRISPAUDIO_NATIVE_VALIDATION_OPTIONS=json.dumps({'nativeRecording': True, 'vst': vst, 'au': au}))
    log = root / 'probe.log'
    seen = set()
    with log.open('w') as output:
        process = subprocess.Popen([str(exe)], cwd=REPO, env=env, stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 100
            while process.poll() is None:
                if time.monotonic() > deadline:
                    raise TimeoutError(f'Sandbox probe timed out; evidence: {root}')
                for line in command('ps', '-axo', 'pid=,ppid=,comm=').decode().splitlines():
                    fields = line.strip().split(None, 2)
                    if len(fields) != 3 or fields[1] != str(process.pid):
                        continue
                    path = pathlib.Path(fields[2])
                    if path.name in NAMES + ['native-helper', 'plugin-stream']:
                        if path.parent.resolve() != mac.resolve():
                            raise AssertionError(f'Native helper escaped the signed bundle: {path}')
                        seen.add(int(fields[0]))
                time.sleep(.02)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
    text = log.read_text()
    line = next((line for line in text.splitlines() if line.startswith('CRISPAUDIO_NATIVE_VALIDATION ')), None)
    if process.returncode or not line:
        raise AssertionError(f'Sandbox probe failed ({process.returncode}); evidence: {root}\n{text[-3000:]}')
    report = json.loads(line.split(' ', 1)[1])
    if not report.get('success') or not report.get('auHelper') or not report.get('helpersReleased') or not seen:
        raise AssertionError(f'Incomplete sandbox acceptance; evidence: {root}\n{report}')
    report.update({'sandbox': True, 'hardenedRuntime': True, 'signing': 'ad-hoc local test', 'bundledHelperProcessesObserved': len(seen), 'externalPluginAccess': 'passed in Downloads via static entitlement' if external_root else 'not tested', 'powerBoxAccess': 'not tested', 'appleStoreAcceptance': 'not established'})
    print(json.dumps(report))
    if args.keep:
        print(f'Sandbox evidence: {root}')
    else:
        shutil.rmtree(root)
    if external_root:
        shutil.rmtree(external_root)


if __name__ == '__main__':
    main()
