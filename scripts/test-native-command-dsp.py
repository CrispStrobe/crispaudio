#!/usr/bin/env python3
"""Run isolated command/worker/DSP tests with queue and inventory abort guards.
No Wry window, audio device, input capture or app bundle is opened.
--system-au additionally allows the trusted Apple AUPeakLimiter fixture.
"""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys

REPO = Path(__file__).resolve().parent.parent
FILTER = 'commands::native_playback::ipc_tests::dsp::'
GUARDS = ['_AudioQueueNewOutput', '_AudioQueueNewInput',
          '_AudioObjectGetPropertyDataSize', '_AudioObjectGetPropertyData']


def test_artifact(output):
    found = []
    for line in output.splitlines():
        message = json.loads(line)
        if (message.get('reason') == 'compiler-artifact'
                and message.get('target', {}).get('name') == 'crispaudio_lib'
                and message.get('profile', {}).get('test') is True
                and message.get('executable')):
            found.append(Path(message['executable']))
    if len(found) != 1:
        raise ValueError('Expected one actual Cargo library-test executable')
    return found[0]


def verify_guards(symbols):
    definitions = {line.split()[-1] for line in symbols.splitlines()
                   if len(line.split()) >= 2 and line.split()[-2] == 'T'}
    if not set(GUARDS).issubset(definitions):
        raise ValueError('Command/DSP executable lacks hardware/inventory abort guards')


def verify_result(output, system_au):
    results = re.findall(r'test result: ok\. (\d+) passed; 0 failed; (\d+) ignored;', output)
    expected = ('7', '0') if system_au else ('6', '1')
    if results != [expected]:
        raise ValueError('Unexpected command/DSP test coverage or failures')
    return {'passed': int(expected[0]), 'ignored': int(expected[1])}


def run_tests(command, env):
    # A separate owned group includes native helper children. Never kill a shared
    # shell/app group when a test hangs, aborts on a guard or is interrupted.
    process = subprocess.Popen(command, cwd=REPO, env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, start_new_session=True)
    def terminate_group():
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        stdout, stderr = process.communicate(timeout=120)
    except BaseException:
        terminate_group()
        process.communicate()
        raise
    if process.returncode:
        terminate_group()
        raise subprocess.CalledProcessError(process.returncode, command, output=stdout, stderr=stderr)
    return stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target-dir', type=Path, default=REPO / 'src-tauri/target')
    parser.add_argument('--system-au', action='store_true', help='Allow the trusted Apple limiter fixture; never a hardware output')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise ValueError('Native command/DSP qualification requires macOS')
    target = args.target_dir.expanduser().resolve()
    env = dict(os.environ, CARGO_TARGET_DIR=str(target), CARGO_CACHE_AUTO_CLEAN_FREQUENCY='never')
    env.pop('TAURI_CONFIG', None)
    env.pop('CRISPAUDIO_COMMAND_DSP_SYSTEM_AU', None)
    if args.system_au:
        env['CRISPAUDIO_COMMAND_DSP_SYSTEM_AU'] = '1'
    build = subprocess.run(['cargo', 'test', '--manifest-path', str(REPO / 'src-tauri/Cargo.toml'), '--locked',
                            '--features', 'native-runtime-qa,native-validation', '--lib', '--no-run',
                            '--message-format=json'], cwd=REPO, env=env, check=True, capture_output=True, text=True)
    binary = test_artifact(build.stdout)
    # Do not accept a Cargo message redirecting execution outside this target.
    if not binary.resolve().is_relative_to(target):
        raise ValueError('Cargo test artifact is outside the requested target')
    symbols = subprocess.run(['nm', '-gU', str(binary)], check=True, capture_output=True, text=True).stdout
    verify_guards(symbols)
    command = [str(binary), FILTER, '--test-threads=1', '--nocapture']
    if args.system_au:
        command.append('--include-ignored')
    output = run_tests(command, env)
    counts = verify_result(output, args.system_au)
    print(json.dumps({'version': json.loads((REPO / 'package.json').read_text())['version'],
                      'dispatch': 'actual Tauri handlers with MockRuntime windows',
                      'worker': 'production native worker/ring/graph/control path',
                      'clock': 'synthetic null consumer', 'systemAU': args.system_au,
                      'guardsVerified': True, 'hardwareOpened': False, **counts}, indent=2))
    print(output, file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f'Command/DSP qualification failed: {error}', file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stdout or '', file=sys.stderr)
            print(error.stderr or '', file=sys.stderr)
        sys.exit(1)
