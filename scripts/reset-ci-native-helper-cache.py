#!/usr/bin/env python3
"""Discard only restored helper-cache generations, before CI starts any Cargo job.

rust-cache recursively strips non-Cargo marker/manifest files. Its partial restore
must not be adopted by the helper cache or weaken normal ownership validation.
"""
import os
from pathlib import Path
import shutil


CACHE = 'crispaudio-native-helpers-v1'
TRIPLES = ('aarch64-apple-darwin', 'x86_64-apple-darwin')


def reset(target: Path) -> int:
    if not target.exists():
        return 0
    if target.is_symlink() or not target.is_dir():
        raise ValueError('CI target must be a real directory')
    removed = 0
    for parent in (target, *(target / triple for triple in TRIPLES)):
        if parent.is_symlink():
            raise ValueError('CI target triple must not be a symlink')
        cache = parent / CACHE
        if cache.is_symlink():
            raise ValueError('CI helper cache must not be a symlink')
        if cache.exists():
            if not cache.is_dir():
                raise ValueError('CI helper cache must be a directory')
            shutil.rmtree(cache)
            removed += 1
    return removed


def main() -> None:
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_OS') != 'macOS':
        raise SystemExit('This reset is restricted to macOS GitHub Actions before Cargo starts')
    target = Path(__file__).resolve().parents[1] / 'src-tauri' / 'target'
    print(f'Reset {reset(target)} restored native helper cache generations')


if __name__ == '__main__':
    main()
