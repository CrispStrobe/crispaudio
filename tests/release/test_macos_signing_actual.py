"""macOS-only checks against real signatures on an isolated disposable app."""
import contextlib
import importlib.util
import io
import pathlib
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('app_gate', ROOT / 'scripts/release/check-macos-app.py')
APP = importlib.util.module_from_spec(spec)
spec.loader.exec_module(APP)


@unittest.skipUnless(sys.platform == 'darwin', 'Requires actual macOS codesign')
class ActualSignatureGate(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='crispaudio-signing-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.app = self.root / 'Probe.app'
        self.mac = self.app / 'Contents/MacOS'
        self.mac.mkdir(parents=True)
        (self.app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.example.signing-probe', 'CFBundleExecutable': 'probe', 'CFBundlePackageType': 'APPL'}))
        self.helpers = ['crispaudio-apple-media', 'crispaudio-vst3-host']
        self.helper_rights = plistlib.loads((ROOT / 'src-tauri/helper-entitlements.plist').read_bytes())
        self.main_rights = plistlib.loads((ROOT / 'src-tauri/entitlements.plist').read_bytes())
        for name in ['probe'] + self.helpers:
            shutil.copy('/usr/bin/true', self.mac / name)
        for name in self.helpers:
            self.sign(self.mac / name, self.helper_rights)
        self.sign(self.app, self.main_rights)

    def sign(self, path, rights, runtime=True):
        file = self.root / 'rights.plist'
        file.write_bytes(plistlib.dumps(rights))
        args = ['codesign', '--force', '--sign', '-', '--entitlements', str(file)]
        if runtime:
            args += ['--options', 'runtime']
        subprocess.run(args + [str(path)], check=True, capture_output=True)

    def check(self, allow_ad_hoc=True):
        with contextlib.redirect_stdout(io.StringIO()):
            APP.check(self.app, None, allow_ad_hoc, 'com.example.signing-probe')

    def test_accept_hardened_inherited_sandbox(self):
        self.check()

    def test_store_mode_rejects_missing_profile(self):
        with self.assertRaisesRegex(ValueError, 'matching provisioning profile'):
            self.check(False)

    def test_reject_main_without_runtime(self):
        self.sign(self.app, self.main_rights, runtime=False)
        with self.assertRaisesRegex(ValueError, 'Hardened runtime'):
            self.check()

    def test_reject_helper_without_runtime(self):
        self.sign(self.mac / self.helpers[0], self.helper_rights, runtime=False)
        self.sign(self.app, self.main_rights)
        with self.assertRaisesRegex(ValueError, 'Hardened runtime'):
            self.check()

    def test_reject_additional_helper_sandbox_rights(self):
        self.sign(self.mac / self.helpers[0], dict(self.helper_rights, **{'com.apple.security.device.audio-input': True}))
        self.sign(self.app, self.main_rights)
        with self.assertRaisesRegex(ValueError, 'only inherited sandbox rights'):
            self.check()

    def test_reject_missing_helper_and_debuggable_main(self):
        (self.mac / self.helpers[0]).unlink()
        self.sign(self.app, self.main_rights)
        with self.assertRaisesRegex(ValueError, 'Missing bundled native helper'):
            self.check()
        self.sign(self.app, dict(self.main_rights, **{'get-task-allow': True}))
        with self.assertRaisesRegex(ValueError, 'permit debugging'):
            self.check()

    def test_reject_profile_readable_only_by_owner(self):
        profile = self.app / 'Contents/embedded.provisionprofile'
        profile.write_bytes(b'public profile payload')
        profile.chmod(0o600)
        self.sign(self.app, self.main_rights)
        with self.assertRaisesRegex(ValueError, 'not readable/searchable by all users'):
            self.check()

    def test_reject_bundle_directory_searchable_only_by_owner(self):
        folder = self.app / 'Contents/Restricted'
        folder.mkdir(mode=0o700)
        (folder / 'resource').write_bytes(b'resource')
        self.sign(self.app, self.main_rights)
        with self.assertRaisesRegex(ValueError, 'not readable/searchable by all users'):
            self.check()

    def test_reject_tampered_helper(self):
        with (self.mac / self.helpers[0]).open('ab') as file:
            file.write(b'tampered')
        with self.assertRaises(subprocess.CalledProcessError):
            self.check()


if __name__ == '__main__':
    unittest.main()
