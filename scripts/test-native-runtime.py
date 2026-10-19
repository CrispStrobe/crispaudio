#!/usr/bin/env python3
"""Qualify real Mac Wry/WebKit snapshot IPC and lifecycle without audio commands.
Builds into the existing Cargo target, then signs/runs a separate temporary bundle.
Never rebuilds, signs or launches the installed or recording-preview app.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parent.parent
IDENTIFIER = 'com.crispstrobe.crispaudio.runtime-qa'
STORE = list(b'CrispRuntimeQA01')


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], cwd=REPO, check=True, **kwargs)


def require_stopped(binary):
    processes = run('ps', '-axo', 'comm=', capture_output=True, text=True).stdout
    if any(Path(line.strip()) == binary for line in processes.splitlines() if line.strip()):
        raise ValueError('Runtime QA binary is running; refusing to replace it')


def profile():
    config = json.loads((REPO / 'src-tauri/tauri.runtime-qa.conf.json').read_text())
    if config['identifier'] != IDENTIFIER or config['app']['windows'] or config['build']['devUrl'] is not None or config['build'].get('frontendDist') != 'src/native_runtime_qa' or config['bundle']['fileAssociations']:
        raise ValueError('Runtime QA must have an isolated identity, no app windows/dev server/document associations')
    return config


def verify_identity(identity, version):
    if identity != {'identifier': IDENTIFIER, 'version': version, 'store': STORE, 'audioCommands': False}:
        raise ValueError('Embedded runtime QA identity/version/store does not match source')


def verify_report(report):
    expected = {'success': True, 'identifier': IDENTIFIER, 'store': STORE,
                'destroyedEvent': True, 'exitEvent': True, 'admissionClosed': True,
                'afterExitEntries': 0, 'afterExitBytes': 0, 'audioCommands': False,
                'error': None}
    if any(key not in report or report[key] != value for key, value in expected.items()):
        raise ValueError('Runtime QA report lacks required lifecycle/isolation/cleanup evidence')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target-dir', type=Path, default=REPO / 'src-tauri/target')
    parser.add_argument('--no-build', action='store_true', help='Use an existing binary; embedded identity is still checked')
    parser.add_argument('--check', action='store_true', help='Check isolation profile only')
    args = parser.parse_args()
    config = profile()
    if args.check:
        print('Runtime QA isolation profile checked')
        return
    if sys.platform != 'darwin' or int(platform.mac_ver()[0].split('.')[0]) < 14:
        raise ValueError('Runtime QA requires macOS 14+ for isolated WebKit stores')
    target = args.target_dir.expanduser().resolve()
    binary = target / 'debug/crispaudio-runtime-qa'
    require_stopped(binary)
    if not args.no_build:
        run('cargo', 'build', '--manifest-path', REPO / 'src-tauri/Cargo.toml', '--locked',
            '--features', 'native-runtime-qa', '--bin', 'crispaudio-runtime-qa',
            env=dict(os.environ, CARGO_TARGET_DIR=str(target), TAURI_CONFIG=(REPO / 'src-tauri/tauri.runtime-qa.conf.json').read_text().rstrip('\n')))
    identity = json.loads(run(binary, '--identity', capture_output=True, text=True, timeout=30).stdout)
    version = json.loads((REPO / 'package.json').read_text())['version']
    verify_identity(identity, version)
    symbols = run('nm', '-gU', binary, capture_output=True, text=True).stdout
    for symbol in ['_AudioQueueNewOutput', '_AudioQueueNewInput']:
        if not any(line.split()[-2:] == ['T', symbol] for line in symbols.splitlines()):
            raise ValueError('Runtime QA lacks its local hardware queue tripwire: ' + symbol)
    # Every run owns a fresh temp bundle. No shared/live app is modified or removed.
    with tempfile.TemporaryDirectory(prefix='crispaudio-runtime-qa-') as directory:
        app = Path(directory) / 'CrispAudio Runtime QA.app'
        mac = app / 'Contents/MacOS'
        mac.mkdir(parents=True)
        executable = mac / 'crispaudio-runtime-qa'
        shutil.copy2(binary, executable)
        info = {'CFBundleIdentifier': IDENTIFIER, 'CFBundleExecutable': executable.name,
                'CFBundleName': 'CrispAudio Runtime QA', 'CFBundlePackageType': 'APPL',
                'CFBundleShortVersionString': version, 'CFBundleVersion': '1',
                'LSMinimumSystemVersion': '14.0', 'NSHighResolutionCapable': True}
        (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        run('codesign', '--force', '--sign', '-', app, capture_output=True, text=True)
        run('codesign', '--verify', '--strict', app, capture_output=True, text=True)
        result = run(executable, capture_output=True, text=True, timeout=90)
        reports = [json.loads(line.removeprefix('CRISPAUDIO_RUNTIME_QA ')) for line in result.stdout.splitlines() if line.startswith('CRISPAUDIO_RUNTIME_QA ')]
        if len(reports) != 1 or reports[0].get('success') is not True:
            raise ValueError('Runtime QA did not report one successful actual Exit result')
        verify_report(reports[0])
        print(json.dumps(reports[0], indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f'Runtime QA failed: {error}', file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stdout or '', file=sys.stderr)
            print(error.stderr or '', file=sys.stderr)
        sys.exit(1)
