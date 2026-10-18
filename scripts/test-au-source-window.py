#!/usr/bin/env python3
"""Actual AU render/stream regression; generated PCM only, no hardware or app UI.

Set CRISPAUDIO_TEST_MEDIA_HELPER to an explicitly built Mac media helper. This
checks short file reads and final-quantum/latency drain against the binary stream
DSP path, without relying on a browser, ffmpeg, or third-party Python packages.
"""
import array
import itertools
import json
import math
import os
import struct
import subprocess
import tempfile
import time
from pathlib import Path

HELPER = os.environ.get('CRISPAUDIO_TEST_MEDIA_HELPER')
if not HELPER:
    raise SystemExit('Set CRISPAUDIO_TEST_MEDIA_HELPER to an explicit repo-built helper')


def run(operation, request, data=None):
    return subprocess.run([HELPER, operation, json.dumps(request)], input=data,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=20, check=True).stdout


def stream(effect, rate, pcm, parameters, state=''):
    channels, frames = len(pcm), len(pcm[0]) if pcm else 0
    # One extra block covers the fixture limiter's latency, including at 192 kHz.
    payload = bytearray()
    for sequence, offset in enumerate(range(0, frames + 4096, 4096), 1):
        count = min(4096, frames + 4096 - offset)
        payload.extend(struct.pack('<4I', 1, count, sequence, 2))
        payload.extend(b'{}')
        for channel in pcm:
            values = array.array('f', itertools.islice(itertools.chain(channel, itertools.repeat(0)), offset, offset + count))
            payload.extend(values.tobytes())
    result = run('plugin-stream', {'id': effect['id'], 'sampleRate': rate,
                 'channels': channels, 'processMode': 'offline',
                 'parameters': parameters, 'state': state}, payload)
    position, replies, output = 0, [], [[] for _ in pcm]
    while position < len(result):
        size, = struct.unpack_from('<I', result, position)
        position += 4
        assert 0 < size <= 1048576
        metadata = json.loads(result[position:position + size])
        position += size
        assert metadata['channels'] == channels and metadata['sampleRate'] == rate
        assert metadata['sequence'] == len(replies) and metadata['processMode'] == 'offline'
        replies.append(metadata)
        count = metadata['frames']
        assert 0 <= count <= 4096
        values = array.array('f')
        values.frombytes(result[position:position + count * channels * 4])
        position += count * channels * 4
        for channel in range(channels):
            output[channel].extend(values[channel * count:(channel + 1) * count])
    assert position == len(result) and len(replies) > 1
    latency = replies[0]['latencySamples']
    assert 0 <= latency < 4096 and all(reply['latencySamples'] == latency for reply in replies)
    return replies[0], [channel[latency:latency + frames] for channel in output]


def write_wav(path, rate, pcm):
    channels, frames = len(pcm), len(pcm[0])
    values = array.array('f', (pcm[ch][i] for i in range(frames) for ch in range(channels)))
    data = values.tobytes()
    fmt = struct.pack('<HHIIHH', 3, channels, rate, rate * channels * 4, channels * 4, 32)
    path.write_bytes(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' +
                     struct.pack('<I', 16) + fmt + b'data' + struct.pack('<I', len(data)) + data)


def read_wav(path, rate, channels, frames):
    data = path.read_bytes()
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE'
    position, fmt, samples = 12, None, None
    while position + 8 <= len(data):
        kind, size = struct.unpack_from('<4sI', data, position)
        chunk = data[position + 8:position + 8 + size]
        assert len(chunk) == size
        if kind == b'fmt ':
            fmt = chunk
        if kind == b'data':
            samples = chunk
        position += 8 + size + size % 2
    assert fmt is not None and samples is not None
    encoding, count, frequency, _, _, bits = struct.unpack_from('<HHIIHH', fmt)
    assert encoding == 3 or encoding == 65534 and fmt[24:40] == bytes.fromhex('0300000000001000800000aa00389b71')
    assert count == channels and frequency == rate and bits == 32
    assert len(samples) == frames * channels * 4, 'Rendered window changed length'
    values = array.array('f')
    values.frombytes(samples)
    assert all(math.isfinite(value) for value in values)
    return [values[ch::channels] for ch in range(channels)]


plugins = json.loads(run('plugin-scan', {}))
fixtures = [('AUBandpass', {'0': 800, '1': 1200}),
            ('AUPeakLimiter', {'0': .004, '1': .01, '2': -3})]
# Baseline, render-quantum edges, tiny clips, resampling-rate inputs and state-only.
cases = [(48000, n, 0, False) for n in (1, 127, 128, 129, 4095, 4096, 4097, 16384)]
cases += [(rate, 4097, 11, False) for rate in (8000, 44100, 96000, 192000)]
cases += [(48000, 4097, 31, True)]
results = []
deadline = time.monotonic() + 300
with tempfile.TemporaryDirectory(prefix='crispaudio-au-source-window-') as root:
    root = Path(root)
    for name, parameters in fixtures:
        effect = next(plugin for plugin in plugins if plugin['name'] == name)
        for channels in (1, 2):
            # Capture configured state once; state-only cases restore it without
            # static parameter overrides, exercising actual document-state recall.
            saved, _ = stream(effect, 48000, [[0.] * 128 for _ in range(channels)], parameters)
            assert saved['state']
            for rate, frames, offset, state_only in cases:
                assert time.monotonic() < deadline, 'AU qualification exceeded five minutes'
                pcm = []
                for ch in range(channels):
                    channel = array.array('f', (.07 * math.sin(2 * math.pi * (317 if ch else 997) * i / rate) for i in range(frames)))
                    channel[0] = -.3 if ch else .5
                    channel[-1] = -.1 if ch else .2
                    pcm.append(channel)
                # Loud nonzero guards prove the requested offset/window is used;
                # the effect must drain against silence, never following media.
                following = 37 if offset else 0
                source = [[.73] * offset + list(channel) + [-.62] * following for channel in pcm]
                path, output = root / 'source.wav', root / 'render.wav'
                write_wav(path, rate, source)
                output.unlink(missing_ok=True)
                values = {} if state_only else parameters
                metadata, expected = stream(effect, rate, pcm, values, saved['state'])
                rendered = json.loads(run('plugin-render', {'id': effect['id'], 'path': str(path),
                     'output': str(output), 'offset': offset / rate, 'duration': frames / rate,
                     'parameters': values, 'state': saved['state']}))
                actual = read_wav(output, rate, channels, frames)
                assert all(len(channel) == frames for channel in expected)
                error = max(abs(a - b) for ch in range(channels) for a, b in zip(actual[ch], expected[ch]))
                case = {'name': name, 'channels': channels, 'sampleRate': rate, 'frames': frames,
                        'sourceOffsetFrames': offset, 'followingGuardFrames': following, 'stateOnly': state_only,
                        'latencySamples': metadata['latencySamples'], 'error': error,
                        'maxErrorFrame': max(range(frames), key=lambda i: abs(actual[0][i] - expected[0][i]))}
                results.append(case)
                assert rendered['frames'] == frames and abs(rendered['latency'] * rate - metadata['latencySamples']) < .51
                if error >= 2e-6:
                    case['head'] = list(zip(actual[0][:8], expected[0][:8]))
                    case['end'] = list(zip(actual[0][-8:], expected[0][-8:]))
                # Every subprocess.run has exited/reaped; no resident stream owner.
    rejected = 0
    for offset, duration in [(1e100, .01), (100, .01), (0, 121), (0, 0)]:
        output.unlink(missing_ok=True)
        request = {'id': effect['id'], 'path': str(path), 'output': str(output),
                   'offset': offset, 'duration': duration}
        failed = subprocess.run([HELPER, 'plugin-render', json.dumps(request)],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        assert failed.returncode == 1 and not output.exists(), 'Invalid range must reject without a crash or output'
        rejected += 1
print(json.dumps({'physicalAudio': False, 'scope': 'Actual AU helper render vs binary stream; no output queue or browser',
                  'cases': len(results), 'maxError': max(case['error'] for case in results),
                  'childrenRemaining': 0, 'invalidRangesRejected': rejected, 'results': results}))

assert all(case['error'] < 2e-6 for case in results), 'AU source window parity failed; see measurements above'
