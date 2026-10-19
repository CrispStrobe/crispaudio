"""Refuse unguarded executables and deceptively empty/partial DSP results."""
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('command_dsp', ROOT / 'scripts/test-native-command-dsp.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class GuardedCommandDsp(unittest.TestCase):
    def test_actual_library_test_artifact_required(self):
        artifact = {'reason': 'compiler-artifact', 'target': {'name': 'crispaudio_lib'},
                    'profile': {'test': True}, 'executable': '/tmp/cargo-target/debug/deps/qa'}
        self.assertEqual(qa.test_artifact(json.dumps(artifact)), Path(artifact['executable']))
        for output in ['', json.dumps(dict(artifact, executable=None)),
                       json.dumps(dict(artifact, profile={'test': False})),
                       json.dumps(artifact) + '\n' + json.dumps(artifact)]:
            with self.assertRaises(ValueError):
                qa.test_artifact(output)

    def test_imported_or_missing_symbols_are_not_abort_guards(self):
        definitions = '\n'.join('0000 T ' + name for name in qa.GUARDS)
        qa.verify_guards(definitions)
        with self.assertRaises(ValueError):
            qa.verify_guards(definitions.replace(' T ', ' U '))
        for missing in qa.GUARDS:
            with self.assertRaises(ValueError):
                qa.verify_guards('\n'.join('0000 T ' + name for name in qa.GUARDS if name != missing))

    def test_default_suite_cannot_skip_work_or_run_unrequested_helpers(self):
        self.assertEqual(qa.verify_result('test result: ok. 6 passed; 0 failed; 1 ignored;', False),
                         {'passed': 6, 'ignored': 1})
        for output in ['test result: ok. 0 passed; 0 failed; 7 ignored;',
                       'test result: ok. 7 passed; 0 failed; 0 ignored;',
                       'test result: FAILED. 5 passed; 1 failed; 1 ignored;']:
            with self.assertRaises(ValueError):
                qa.verify_result(output, False)

    def test_requested_au_case_cannot_silently_stay_ignored(self):
        self.assertEqual(qa.verify_result('test result: ok. 7 passed; 0 failed; 0 ignored;', True),
                         {'passed': 7, 'ignored': 0})
        with self.assertRaises(ValueError):
            qa.verify_result('test result: ok. 6 passed; 0 failed; 1 ignored;', True)

    @unittest.skipUnless(hasattr(os, 'killpg'), 'Unix process groups')
    def test_timeout_kills_only_the_new_owned_process_group_and_reaps(self):
        process = Mock(pid=12345)
        process.communicate.side_effect = [subprocess.TimeoutExpired(['fixture'], 120), ('', '')]
        with patch.object(qa.subprocess, 'Popen', return_value=process) as popen, patch.object(qa.os, 'killpg') as kill:
            with self.assertRaises(subprocess.TimeoutExpired):
                qa.run_tests(['fixture'], {})
            self.assertTrue(popen.call_args.kwargs['start_new_session'])
            kill.assert_called_once_with(process.pid, qa.signal.SIGKILL)
            self.assertEqual(process.communicate.call_count, 2)


if __name__ == '__main__':
    unittest.main()
