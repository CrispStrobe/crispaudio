#!/usr/bin/env python3
"""Build a separate sandboxed Mac preview for manual native recording checks.
No installed app/session is replaced. Build/sign by default; --launch opens the
isolated preview, but never starts recording, playback or microphone permission.
"""
import argparse
import json
import os
from pathlib import Path
import plistlib
import platform
import subprocess
import sys

REPO = Path(__file__).resolve().parent.parent
CONFIG = REPO / 'src-tauri/tauri.native-preview.conf.json'
HELPERS = ['crispaudio-apple-media', 'crispaudio-vst3-host']
WEBKIT_STORE = list(b'CrispAudioQA0001')


def preview_config():
    base = json.loads((REPO / 'src-tauri/tauri.conf.json').read_text())
    preview = json.loads(CONFIG.read_text())
    if preview['identifier'] != base['identifier'] + '.native-preview':
        raise ValueError('Preview must use a separate fixed bundle/app-data identity')
    if preview['productName'] == base['productName']:
        raise ValueError('Preview must have its own bundle name')
    windows = preview['app']['windows']
    if len(windows) != 1:
        raise ValueError('Preview needs one isolated window')
    # Runtime app_context supplies the store before window construction; the
    # current SDK's config-to-token generator cannot compile this array field.
    if 'dataStoreIdentifier' in windows[0]:
        raise ValueError('Preview store must be supplied by the verified runtime context')
    if WEBKIT_STORE == base['app']['windows'][0].get('dataStoreIdentifier'):
        raise ValueError('Preview WebKit store must differ from production')
    if preview['bundle']['fileAssociations']:
        raise ValueError('Preview must not register project file associations')
    return base, preview


def verify_embedded_identity(identity, base, preview):
    identity=dict(identity)
    # The SDK emits None for an empty optional association list.
    if identity.get('fileAssociations') is None:
        identity['fileAssociations']=[]
    expected = {'identifier': preview['identifier'], 'productName': preview['productName'],
                'version': base['version'], 'dataStoreIdentifier': WEBKIT_STORE,
                'fileAssociations': []}
    if identity != expected:
        raise ValueError('Embedded app identity/store differs from the isolated preview config')


def require_stopped_preview(app):
    prefix=str((app / 'Contents/MacOS').resolve()) + '/'
    processes=subprocess.run(['ps','-axo','comm='],check=True,capture_output=True,text=True).stdout
    if any(line.strip().startswith(prefix) for line in processes.splitlines()):
        raise ValueError('Preview is running; save its test session and close it before rebuilding or signing')


def run(*args, **kwargs):
    subprocess.run([str(arg) for arg in args], cwd=REPO, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--launch', action='store_true', help='Open the isolated preview after verification')
    parser.add_argument('--check', action='store_true', help='Check isolation config only; no build/sign/launch')
    parser.add_argument('--verify-only', action='store_true', help='Verify/sign an existing matching preview without rebuilding')
    parser.add_argument('--target-dir', type=Path, default=REPO / 'src-tauri/target', help='Explicit build directory; ignores unrelated global CARGO_TARGET_DIR')
    args = parser.parse_args()
    base, preview = preview_config()
    if args.check:
        print('Preview profile checked. Embedded WebKit isolation is verified after building.')
        return
    if sys.platform != 'darwin':
        raise ValueError('Native recording qualification preview requires macOS')
    if int(platform.mac_ver()[0].split('.')[0]) < 14:
        raise ValueError('Isolated WebKit qualification requires macOS 14 or newer')
    target = args.target_dir.expanduser().resolve()
    app = target / 'debug/bundle/macos' / (preview['productName'] + '.app')
    require_stopped_preview(app)
    if not args.verify_only:
        run('npm', 'run', 'tauri', '--', 'build', '--debug', '--bundles', 'app', '--config', CONFIG, env=dict(os.environ, CARGO_TARGET_DIR=str(target)))
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    if info['CFBundleIdentifier'] != preview['identifier'] or info['CFBundleShortVersionString'] != base['version']:
        raise ValueError('Built preview identity/version does not match its configuration')
    if info.get('CFBundleDocumentTypes'):
        raise ValueError('Preview unexpectedly registered document types')
    mac = app / 'Contents/MacOS'
    for helper in HELPERS:
        run('codesign', '--force', '--options', 'runtime', '--entitlements', REPO / 'src-tauri/helper-entitlements.plist', '--sign', '-', mac / helper)
    run('codesign', '--force', '--options', 'runtime', '--entitlements', REPO / 'src-tauri/entitlements.plist', '--sign', '-', app)
    run(sys.executable, REPO / 'scripts/release/check-macos-app.py', app, '--allow-ad-hoc', '--bundle', preview['identifier'])
    # Inspect the actual embedded Rust/Tauri context, not just the bundle plist.
    # This debug-only command returns before constructing any app/window owners.
    identity = subprocess.run([str(mac / info['CFBundleExecutable']), '--print-native-preview-identity'], check=True, capture_output=True, text=True, timeout=15)
    verify_embedded_identity(json.loads(identity.stdout), base, preview)
    print(f'Preview ready: {app}', flush=True)
    if args.launch:
        run('open', '-n', app)
        print('Opened isolated preview. Record and playback still require your actions.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        print(f'Preview preparation failed: {error}', file=sys.stderr)
        sys.exit(1)
