"""The automated runtime runner must refuse shared identity or incomplete evidence."""
import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('runtime_qa', ROOT / 'scripts/test-native-runtime.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class RuntimeIsolation(unittest.TestCase):
    def test_profile_rejects_production_windows_server_and_documents(self):
        valid = qa.profile()
        mutations = [lambda c: c.update(identifier='com.crispstrobe.crispaudio'),
                     lambda c: c['app'].update(windows=[{'label': 'main'}]),
                     lambda c: c['build'].update(devUrl='http://localhost:5173'),
                     lambda c: c['build'].update(frontendDist='../dist'),
                     lambda c: c['bundle'].update(fileAssociations=[{'ext': ['crispaudio']}])]
        for mutate in mutations:
            config = copy.deepcopy(valid)
            mutate(config)
            with patch.object(Path, 'read_text', return_value=json.dumps(config)):
                with self.assertRaises(ValueError):
                    qa.profile()

    def test_embedded_identity_version_store_and_audio_gate(self):
        identity = {'identifier': qa.IDENTIFIER, 'version': '1.2.3', 'store': qa.STORE, 'audioCommands': False}
        qa.verify_identity(identity, '1.2.3')
        for key, value in [('identifier', 'com.crispstrobe.crispaudio'), ('version', 'old'),
                           ('store', list(b'CrispAudioQA0001')), ('audioCommands', True)]:
            bad = dict(identity, **{key: value})
            with self.assertRaises(ValueError):
                qa.verify_identity(bad, '1.2.3')

    def test_success_alone_is_not_lifecycle_cleanup_evidence(self):
        valid = {'success': True, 'identifier': qa.IDENTIFIER, 'store': qa.STORE,
                 'destroyedEvent': True, 'exitEvent': True, 'admissionClosed': True,
                 'afterExitEntries': 0, 'afterExitBytes': 0, 'audioCommands': False, 'error': None}
        qa.verify_report(valid)
        for key in valid:
            bad = dict(valid)
            del bad[key]
            with self.assertRaises(ValueError):
                qa.verify_report(bad)
        for key, value in [('afterExitBytes', 32768), ('destroyedEvent', False), ('audioCommands', True)]:
            with self.assertRaises(ValueError):
                qa.verify_report(dict(valid, **{key: value}))

    def test_running_qa_binary_cannot_be_replaced(self):
        binary = Path('/tmp/runtime-qa/debug/crispaudio-runtime-qa')
        with patch.object(qa, 'run', return_value=SimpleNamespace(stdout=str(binary) + '\n')):
            with self.assertRaises(ValueError):
                qa.require_stopped(binary)
        with patch.object(qa, 'run', return_value=SimpleNamespace(stdout='/tmp/another-app\n')):
            qa.require_stopped(binary)


if __name__ == '__main__':
    unittest.main()
