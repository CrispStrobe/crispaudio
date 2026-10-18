import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('native_preview', ROOT / 'scripts/prepare-native-recording-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewIsolation(unittest.TestCase):
    def test_profile_keeps_production_identity_and_webkit_storage_separate(self):
        base, isolated = preview.preview_config()
        self.assertNotEqual(base['identifier'], isolated['identifier'])
        self.assertNotEqual(base['productName'], isolated['productName'])
        self.assertEqual(len(preview.WEBKIT_STORE), 16)
        self.assertEqual(isolated['bundle']['fileAssociations'], [])
        # Qualification should exercise the same window constraints, not a
        # simplified layout that could hide real desktop problems.
        for name, value in base['app']['windows'][0].items():
            if name != 'title':
                self.assertEqual(isolated['app']['windows'][0][name], value)

    def test_packaged_plist_is_insufficient_when_embedded_config_or_store_differs(self):
        base, isolated = preview.preview_config()
        good = {'identifier': isolated['identifier'], 'productName': isolated['productName'],
                'version': base['version'], 'dataStoreIdentifier': preview.WEBKIT_STORE,
                'fileAssociations': []}
        preview.verify_embedded_identity(good, base, isolated)
        preview.verify_embedded_identity({**good, 'fileAssociations': None}, base, isolated)
        for name, wrong in [('identifier', base['identifier']), ('productName', base['productName']),
                            ('version', 'old'), ('dataStoreIdentifier', None), ('fileAssociations', [{'ext': ['crispaudio']}])]:
            bad = copy.deepcopy(good)
            bad[name] = wrong
            with self.subTest(field=name), self.assertRaises(ValueError):
                preview.verify_embedded_identity(bad, base, isolated)

    def test_live_preview_guard_preserves_the_running_bundle_before_any_rebuild(self):
        app=Path('/safe/Native Preview.app')
        for command in ['/safe/Native Preview.app/Contents/MacOS/crispaudio', '/safe/Native Preview.app/Contents/MacOS/crispaudio-apple-media']:
            with patch.object(preview.subprocess, 'run', return_value=SimpleNamespace(stdout=command)), self.assertRaises(ValueError):
                preview.require_stopped_preview(app)
        with patch.object(preview.subprocess, 'run', return_value=SimpleNamespace(stdout='/safe/CrispAudio.app/Contents/MacOS/crispaudio\n/safe/Native Preview.app.old/Contents/MacOS/crispaudio')):
            preview.require_stopped_preview(app)
