"""Release gates: reject profile/signature mismatches before packaging or upload."""
import contextlib
import datetime
import importlib.util
import io
import pathlib
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/release' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PROFILE = load('check-macos-profile')
APP = load('check-macos-app')
TEAM, BUNDLE = 'EXAMPLETEAM', 'com.example.audio'


def profile():
    return {'TeamIdentifier': [TEAM], 'Platform': ['OSX'],
            'ExpirationDate': datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=30),
            'DeveloperCertificates': [b'authorized certificate'],
            'Entitlements': {'com.apple.application-identifier': TEAM + '.' + BUNDLE,
                             'com.apple.developer.team-identifier': TEAM}}


class ProfileGate(unittest.TestCase):
    def check(self, value, returncode=0):
        with patch.object(PROFILE.subprocess, 'run', return_value=subprocess.CompletedProcess([], returncode, plistlib.dumps(value), b'')):
            with contextlib.redirect_stdout(io.StringIO()):
                return PROFILE.check(pathlib.Path('profile'), TEAM, BUNDLE)

    def test_valid_explicit_store_profile_generates_identity_without_losing_permissions(self):
        valid = self.check(profile())
        rights = PROFILE.signing_entitlements(valid, {'com.apple.security.app-sandbox': True})
        self.assertEqual(rights['com.apple.application-identifier'], TEAM + '.' + BUNDLE)
        self.assertEqual(rights['com.apple.developer.team-identifier'], TEAM)
        self.assertIs(rights['com.apple.security.app-sandbox'], True)

    def test_reject_invalid_cms_even_if_payload_looks_valid(self):
        with self.assertRaisesRegex(ValueError, 'CMS signature'):
            self.check(profile(), 1)

    def test_reject_expired_wrong_app_platform_and_development_profiles(self):
        mutations = [({'ExpirationDate': datetime.datetime(2000, 1, 1)}, 'expired'),
                     ({'TeamIdentifier': ['OTHERTEAM']}, 'identifier'),
                     ({'Platform': ['iOS']}, 'macOS'),
                     ({'ProvisionedDevices': ['device']}, 'distribution profile'),
                     ({'ProvisionsAllDevices': True}, 'distribution profile')]
        for change, message in mutations:
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, message):
                self.check(dict(profile(), **change))
        value = profile()
        value['Entitlements']['get-task-allow'] = True
        with self.assertRaisesRegex(ValueError, 'distribution profile'):
            self.check(value)
        value = profile()
        value['Entitlements']['com.apple.application-identifier'] = TEAM + '.wrong'
        with self.assertRaisesRegex(ValueError, 'identifier'):
            self.check(value)

    def test_reject_wildcard_or_wrong_entitlement_team(self):
        for change in [{'com.apple.application-identifier': TEAM + '.*'},
                       {'com.apple.developer.team-identifier': 'OTHERTEAM'}]:
            value = profile()
            value['Entitlements'].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'explicit app identifier'):
                PROFILE.signing_entitlements(value, {})


class SignatureGate(unittest.TestCase):
    def test_runtime_is_required_even_with_a_valid_team(self):
        for flags, passes in [('flags=0x10000(runtime)', True), ('flags=0x10002(adhoc,runtime)', True), ('flags=0x0(none)', False)]:
            result = subprocess.CompletedProcess([], 0, b'', ('TeamIdentifier=' + TEAM + '\n' + flags).encode())
            with patch.object(APP.subprocess, 'run', return_value=result):
                if passes:
                    self.assertEqual(APP.signing(pathlib.Path('app')), TEAM)
                else:
                    with self.assertRaisesRegex(ValueError, 'Hardened runtime'):
                        APP.signing(pathlib.Path('app'))

    def test_profile_must_match_both_final_entitlements_and_actual_certificate(self):
        value = profile()
        module = type('Profile', (), {'check': staticmethod(lambda *args: value),
                                    'signing_entitlements': staticmethod(PROFILE.signing_entitlements)})
        rights = dict(value['Entitlements'])
        with patch.object(APP, 'profile_module', return_value=module):
            for key in rights:
                wrong = dict(rights, **{key: 'wrong'})
                with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'does not match embedded profile'):
                    APP.check_profile(pathlib.Path('app'), TEAM, BUNDLE, wrong)
            def extract(*args):
                if any(arg.startswith('--extract-certificates=') for arg in args):
                    prefix = next(arg.split('=', 1)[1] for arg in args if arg.startswith('--extract-certificates='))
                    pathlib.Path(prefix + '0').write_bytes(b'unauthorized certificate')
                return b''
            with patch.object(APP, 'run', side_effect=extract), self.assertRaisesRegex(ValueError, 'not authorized'):
                APP.check_profile(pathlib.Path('app'), TEAM, BUNDLE, rights)
            def authorized(*args):
                prefix = next(arg.split('=', 1)[1] for arg in args if arg.startswith('--extract-certificates='))
                pathlib.Path(prefix + '0').write_bytes(b'authorized certificate')
                return b''
            with patch.object(APP, 'run', side_effect=authorized):
                APP.check_profile(pathlib.Path('app'), TEAM, BUNDLE, rights)

    def test_missing_profile_and_wrong_bundle_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            app = pathlib.Path(folder) / 'Probe.app'
            (app / 'Contents').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': BUNDLE, 'CFBundleExecutable': 'probe'}))
            with patch.object(APP, 'run'), patch.object(APP, 'entitlements', return_value={'com.apple.security.app-sandbox': True, 'com.apple.security.device.audio-input': True}):
                with self.assertRaisesRegex(ValueError, 'bundle identifier'):
                    APP.check(app, TEAM, expected_bundle='wrong')
                with self.assertRaisesRegex(ValueError, 'matching provisioning profile'):
                    APP.check(app, TEAM)


    def test_store_gate_requires_a_privacy_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            app = pathlib.Path(folder) / 'Probe.app'
            (app / 'Contents').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': BUNDLE, 'CFBundleExecutable': 'probe'}))
            (app / 'Contents/embedded.provisionprofile').write_bytes(b'verified separately')
            rights = {'com.apple.security.app-sandbox': True, 'com.apple.security.device.audio-input': True}
            with patch.object(APP, 'run'), patch.object(APP, 'entitlements', return_value=rights), patch.object(APP, 'signing', return_value=TEAM), patch.object(APP, 'check_profile'):
                with self.assertRaisesRegex(ValueError, 'missing its privacy manifest'):
                    APP.check(app, TEAM)
                (app / 'Contents/Resources').mkdir()
                (app / 'Contents/Resources/PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps({'NSPrivacyTracking': False}))
                with self.assertRaisesRegex(ValueError, 'required-reason API'):
                    APP.check(app, TEAM)


class ActualCmsGate(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='crispaudio-cms-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.key, self.cert = self.root / 'key.pem', self.root / 'cert.pem'
        subprocess.run(['/usr/bin/openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(self.key), '-out', str(self.cert), '-days', '1',
                        '-subj', '/CN=CrispAudio disposable test only'], check=True, capture_output=True)
        payload = self.root / 'payload.plist'
        payload.write_bytes(plistlib.dumps(profile()))
        self.signed = self.root / 'test.provisionprofile'
        subprocess.run(['/usr/bin/openssl', 'cms', '-sign', '-binary', '-nodetach',
                        '-in', str(payload), '-signer', str(self.cert), '-inkey', str(self.key),
                        '-outform', 'DER', '-out', str(self.signed)], check=True, capture_output=True)

    def test_cli_writes_identity_entitlements_from_verified_cms(self):
        template, output = self.root / 'template.plist', self.root / 'output.plist'
        original = plistlib.dumps({'com.apple.security.app-sandbox': True})
        template.write_bytes(original)
        subprocess.run([sys.executable, str(ROOT / 'scripts/release/check-macos-profile.py'),
                        str(self.signed), '--team', TEAM, '--bundle', BUNDLE,
                        '--entitlements-template', str(template), '--entitlements-output', str(output)],
                       check=True, capture_output=True)
        rights = plistlib.loads(output.read_bytes())
        self.assertEqual(rights['com.apple.application-identifier'], TEAM + '.' + BUNDLE)
        self.assertEqual(rights['com.apple.developer.team-identifier'], TEAM)
        self.assertIs(rights['com.apple.security.app-sandbox'], True)
        self.assertEqual(template.read_bytes(), original)

    def test_real_cms_tampering_is_rejected(self):
        data = bytearray(self.signed.read_bytes())
        data[-1] ^= 1
        self.signed.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'CMS signature'):
            PROFILE.check(self.signed, TEAM, BUNDLE)


if __name__ == '__main__':
    unittest.main()
