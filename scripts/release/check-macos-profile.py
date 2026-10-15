#!/usr/bin/env python3
"""Fail early on damaged, expired or mismatched Mac Store provisioning profiles.
CMS verification checks integrity; Apple still decides trust/revocation at upload.
Never print profile contents, certificates, private keys or secret values.
"""
import argparse
import datetime
import hashlib
import pathlib
import plistlib
import subprocess
import sys


def check(path, team, bundle, identity=None):
    result = subprocess.run(
        ['/usr/bin/openssl', 'cms', '-verify', '-inform', 'DER', '-in', str(path), '-noverify'],
        capture_output=True,
    )
    if result.returncode:
        raise ValueError('Provisioning profile CMS signature is invalid; download a fresh Apple-issued Mac App Store profile.')
    try:
        profile = plistlib.loads(result.stdout)
    except Exception as error:
        raise ValueError('Provisioning profile payload is not a plist.') from error
    entitlements = profile.get('Entitlements', {})
    identifier = entitlements.get('com.apple.application-identifier', entitlements.get('application-identifier'))
    if team not in profile.get('TeamIdentifier', []) or identifier != f'{team}.{bundle}':
        raise ValueError('Provisioning profile team or application identifier does not match this app.')
    if 'OSX' not in profile.get('Platform', []):
        raise ValueError('Provisioning profile is not for macOS.')
    expiration = profile.get('ExpirationDate')
    if not isinstance(expiration, datetime.datetime) or expiration.replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
        raise ValueError('Provisioning profile has expired.')
    if entitlements.get('get-task-allow') or entitlements.get('com.apple.security.get-task-allow') or profile.get('ProvisionsAllDevices') or profile.get('ProvisionedDevices'):
        raise ValueError('Use a Mac App Store distribution profile, not a development or direct-distribution profile.')
    if identity:
        certificate = subprocess.run(['security', 'find-certificate', '-c', identity, '-p'], capture_output=True, check=True).stdout
        der = subprocess.run(['/usr/bin/openssl', 'x509', '-outform', 'DER'], input=certificate, capture_output=True, check=True).stdout
        if hashlib.sha1(der).digest() not in [hashlib.sha1(cert).digest() for cert in profile.get('DeveloperCertificates', [])]:
            raise ValueError('The selected distribution certificate is not included in this profile.')
    print(f'Mac Store profile integrity, application, platform and expiry checks passed (expires {expiration.date()}).')
    return profile


def signing_entitlements(profile, template):
    rights = dict(template)
    allowed = profile['Entitlements']
    identifier = allowed.get('com.apple.application-identifier', allowed.get('application-identifier'))
    team = allowed.get('com.apple.developer.team-identifier')
    if not isinstance(identifier, str) or '*' in identifier or not isinstance(team, str) or team not in profile['TeamIdentifier']:
        raise ValueError('Profile must authorize an explicit app identifier and signing team.')
    rights['com.apple.application-identifier'] = identifier
    rights['com.apple.developer.team-identifier'] = team
    return rights


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile', type=pathlib.Path)
    parser.add_argument('--team', required=True)
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--identity')
    parser.add_argument('--entitlements-template', type=pathlib.Path)
    parser.add_argument('--entitlements-output', type=pathlib.Path)
    args = parser.parse_args()
    try:
        if bool(args.entitlements_template) != bool(args.entitlements_output):
            raise ValueError('Entitlements template and output must be supplied together.')
        profile = check(args.profile, args.team, args.bundle, args.identity)
        if args.entitlements_template:
            template = plistlib.loads(args.entitlements_template.read_bytes())
            args.entitlements_output.write_bytes(plistlib.dumps(signing_entitlements(profile, template)))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Mac Store preflight failed: {error}', file=sys.stderr)
        sys.exit(1)
