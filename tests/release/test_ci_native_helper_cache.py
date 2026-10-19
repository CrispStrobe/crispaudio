import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ci_helper_cache', ROOT / 'scripts/reset-ci-native-helper-cache.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeHelperCacheReset(unittest.TestCase):
    def test_missing_target_is_noop(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(module.reset(Path(folder) / 'missing'), 0)

    def test_partial_restore_is_discarded_without_adopting_a_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            cache = target / module.CACHE
            (cache / 'current').mkdir(parents=True)
            # Mirrors rust-cache's recursive stripping of non-Cargo files.
            self.assertEqual(module.reset(target), 1)
            self.assertFalse(cache.exists())
            self.assertTrue(target.exists())

    def test_only_known_generations_are_removed(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            for parent in (target, *(target / t for t in module.TRIPLES)):
                (parent / module.CACHE).mkdir(parents=True)
                (parent / 'keep').write_text('dependency')
            (target / 'debug' / module.CACHE).mkdir(parents=True)
            self.assertEqual(module.reset(target), 3)
            self.assertTrue((target / 'debug' / module.CACHE).is_dir())
            for parent in (target, *(target / t for t in module.TRIPLES)):
                self.assertEqual((parent / 'keep').read_text(), 'dependency')

    def test_symlinks_are_refused_without_touching_their_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            outside = root / 'outside'
            outside.mkdir()
            (outside / 'keep').write_text('private')
            for name in ('target', module.CACHE, module.TRIPLES[0]):
                with self.subTest(name=name):
                    target = root / 'real-target'
                    target.mkdir(exist_ok=True)
                    link = root / 'target' if name == 'target' else target / name
                    link.symlink_to(outside, target_is_directory=True)
                    with self.assertRaises(ValueError):
                        module.reset(link if name == 'target' else target)
                    self.assertEqual((outside / 'keep').read_text(), 'private')
                    link.unlink()

    def test_cli_refuses_local_or_nonmac_execution_before_reset(self):
        for env in ({}, {'GITHUB_ACTIONS': 'true', 'RUNNER_OS': 'Linux'}):
            with patch.dict(os.environ, env, clear=True), patch.object(module, 'reset') as reset:
                with self.assertRaisesRegex(SystemExit, 'restricted'):
                    module.main()
                reset.assert_not_called()

    def test_every_cached_tauri_workflow_resets_before_build_steps(self):
        for name in ('ci.yml', 'release.yml', 'macos-release.yml'):
            text = (ROOT / '.github/workflows' / name).read_text()
            blocks = text.split("workspaces: './src-tauri -> target'")[1:]
            self.assertTrue(blocks)
            for block in blocks:
                # Optional cache key precedes the next step.
                next_step = block[block.index('      - '):].split('\n      - ', 1)[0]
                self.assertIn('name: Reset restored native helper cache', next_step)
                self.assertIn("if: runner.os == 'macOS'", next_step)
                self.assertIn('python3 scripts/reset-ci-native-helper-cache.py', next_step)


if __name__ == '__main__':
    unittest.main()
