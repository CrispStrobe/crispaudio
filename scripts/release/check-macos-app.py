#!/usr/bin/env python3
"""Verify the assembled native-helper signing layout before Store packaging.
This checks local signatures/entitlements, not Apple acceptance or plugin compatibility.
"""
import argparse
import pathlib
import plistlib
import subprocess
import sys


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def entitlements(path):
    return plistlib.loads(run('codesign', '--display', '--entitlements', ':-', str(path)))


def team(path):
    result = subprocess.run(['codesign', '--display', '--verbose=4', str(path)], check=True, capture_output=True)
    return next((line.split('=', 1)[1] for line in result.stderr.decode().splitlines() if line.startswith('TeamIdentifier=')), '')


def check(app, expected_team, allow_ad_hoc=False):
    contents = app / 'Contents'
    info = plistlib.loads((contents / 'Info.plist').read_bytes())
    main = contents / 'MacOS' / info['CFBundleExecutable']
    run('codesign', '--verify', '--deep', '--strict', str(app))
    rights = entitlements(app)
    if not rights.get('com.apple.security.app-sandbox') or not rights.get('com.apple.security.device.audio-input'):
        raise ValueError('Main app must carry sandbox and microphone entitlements.')
    if not allow_ad_hoc and not (contents / 'embedded.provisionprofile').is_file():
        raise ValueError('Store bundle requires its matching provisioning profile.')
    main_team = team(app)
    if not allow_ad_hoc and (not expected_team or main_team != expected_team):
        raise ValueError('Main app signing team does not match the distribution team.')
    architecture = set(run('lipo', '-archs', str(main)).decode().split())
    for name in ['crispaudio-apple-media', 'crispaudio-vst3-host']:
        helper = contents / 'MacOS' / name
        if not helper.is_file():
            raise ValueError(f'Missing bundled native helper: {name}')
        run('codesign', '--verify', '--strict', str(helper))
        rights = entitlements(helper)
        if rights.get('com.apple.security.app-sandbox') is not True or rights.get('com.apple.security.inherit') is not True:
            raise ValueError(f'Native helper must inherit the parent sandbox: {name}')
        if rights.get('com.apple.security.cs.disable-library-validation') is not True:
            raise ValueError(f'Plugin helper must allow independently signed plugins: {name}')
        if team(helper) != main_team:
            raise ValueError(f'Native helper signing team differs from the app: {name}')
        if set(run('lipo', '-archs', str(helper)).decode().split()) != architecture:
            raise ValueError(f'Native helper architectures differ from the app: {name}')
    print('Native helper signatures, teams, architectures and sandbox inheritance verified.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=pathlib.Path)
    parser.add_argument('--team')
    parser.add_argument('--allow-ad-hoc', action='store_true', help='Local isolated sandbox probe only; does not establish Store signing.')
    args = parser.parse_args()
    try:
        check(args.app, args.team, args.allow_ad_hoc)
    except (ValueError, OSError, KeyError, plistlib.InvalidFileException, subprocess.CalledProcessError) as error:
        print(f'Mac app preflight failed: {error}', file=sys.stderr)
        sys.exit(1)
