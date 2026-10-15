#!/usr/bin/env python3
"""Verify the assembled native-helper signing layout before Store packaging.
This checks local signatures/entitlements, not Apple acceptance or plugin compatibility.
"""
import argparse
import importlib.util
import pathlib
import plistlib
import re
import subprocess
import sys
import tempfile


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def entitlements(path):
    return plistlib.loads(run('codesign', '--display', '--entitlements', ':-', str(path)))


def signing(path):
    result = subprocess.run(['codesign', '--display', '--verbose=4', str(path)], check=True, capture_output=True)
    fields = result.stderr.decode().splitlines()
    team = next((line.split('=', 1)[1] for line in fields if line.startswith('TeamIdentifier=')), '')
    flags = re.search(r'\bflags=0x([0-9a-fA-F]+)', result.stderr.decode())
    if not flags or not int(flags[1], 16) & 0x10000:
        raise ValueError(f'Hardened runtime is missing: {path.name}')
    return team


def profile_module():
    spec = importlib.util.spec_from_file_location('mac_profile', pathlib.Path(__file__).with_name('check-macos-profile.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_profile(app, expected_team, bundle, rights):
    module = profile_module()
    profile = module.check(app / 'Contents/embedded.provisionprofile', expected_team, bundle)
    allowed = module.signing_entitlements(profile, {})
    for key in ['com.apple.application-identifier', 'com.apple.developer.team-identifier']:
        if rights.get(key) != allowed[key]:
            raise ValueError(f'Signed app entitlement does not match embedded profile: {key}')
    # Check the certificate actually used to sign the app, not just a named keychain entry.
    with tempfile.TemporaryDirectory(prefix='crispaudio-signature-') as directory:
        prefix = pathlib.Path(directory) / 'certificate'
        run('codesign', '--display', '--extract-certificates', str(prefix), str(app))
        if pathlib.Path(str(prefix) + '0').read_bytes() not in profile.get('DeveloperCertificates', []):
            raise ValueError('App signing certificate is not authorized by the embedded profile.')


def check(app, expected_team, allow_ad_hoc=False, expected_bundle=None):
    contents = app / 'Contents'
    info = plistlib.loads((contents / 'Info.plist').read_bytes())
    if expected_bundle and info['CFBundleIdentifier'] != expected_bundle:
        raise ValueError('App bundle identifier does not match the distribution identifier.')
    main = contents / 'MacOS' / info['CFBundleExecutable']
    run('codesign', '--verify', '--deep', '--strict', str(app))
    rights = entitlements(app)
    if not rights.get('com.apple.security.app-sandbox') or not rights.get('com.apple.security.device.audio-input'):
        raise ValueError('Main app must carry sandbox and microphone entitlements.')
    if rights.get('com.apple.security.inherit') or rights.get('get-task-allow') or rights.get('com.apple.security.get-task-allow'):
        raise ValueError('Main app must not inherit a sandbox or permit debugging.')
    if not allow_ad_hoc and not (contents / 'embedded.provisionprofile').is_file():
        raise ValueError('Store bundle requires its matching provisioning profile.')
    main_team = signing(app)
    if not allow_ad_hoc and (not expected_team or main_team != expected_team):
        raise ValueError('Main app signing team does not match the distribution team.')
    if not allow_ad_hoc:
        check_profile(app, expected_team, info['CFBundleIdentifier'], rights)
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
        sandbox_keys = {key for key in rights if key.startswith('com.apple.security.') and not key.startswith('com.apple.security.cs.')}
        if sandbox_keys != {'com.apple.security.app-sandbox', 'com.apple.security.inherit'}:
            raise ValueError(f'Native helper must use only inherited sandbox rights: {name}')
        if rights.get('get-task-allow') or rights.get('com.apple.security.get-task-allow'):
            raise ValueError(f'Native helper must not permit debugging: {name}')
        if signing(helper) != main_team:
            raise ValueError(f'Native helper signing team differs from the app: {name}')
        if set(run('lipo', '-archs', str(helper)).decode().split()) != architecture:
            raise ValueError(f'Native helper architectures differ from the app: {name}')
    print('Native helper signatures, teams, architectures and sandbox inheritance verified.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=pathlib.Path)
    parser.add_argument('--team')
    parser.add_argument('--bundle')
    parser.add_argument('--allow-ad-hoc', action='store_true', help='Local isolated sandbox probe only; does not establish Store signing.')
    args = parser.parse_args()
    try:
        check(args.app, args.team, args.allow_ad_hoc, args.bundle)
    except (ValueError, OSError, KeyError, plistlib.InvalidFileException, subprocess.CalledProcessError) as error:
        print(f'Mac app preflight failed: {error}', file=sys.stderr)
        sys.exit(1)
