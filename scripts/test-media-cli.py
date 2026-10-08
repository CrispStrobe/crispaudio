#!/usr/bin/env python3
"""Real FFmpeg/CLI integration checks. Generates its own disposable fixtures.

Usage: python3 scripts/test-media-cli.py media/target/release/crispaudio
No third-party Python packages or personal recordings required.
"""
import array
import json
from pathlib import Path
import random
import struct
import subprocess
import sys
import tempfile
import wave

CLI = str(Path(sys.argv[1]).resolve())


def command(*args, succeeds=True):
    result = subprocess.run([str(arg) for arg in args], capture_output=True)
    if succeeds and result.returncode:
        raise AssertionError(result.stderr.decode(errors="replace"))
    if not succeeds:
        assert result.returncode != 0, "Unexpected success"
    return result.stdout


def cli(*args, **kwargs):
    return command(CLI, *args, **kwargs)


def ffmpeg(*args):
    return command("ffmpeg", "-v", "error", "-nostdin", "-n", *args)


def stream_hash(path, stream):
    return ffmpeg("-i", path, "-map", stream, "-c", "copy", "-f", "hash", "-hash", "sha256", "pipe:1")


with tempfile.TemporaryDirectory(prefix="CrispAudio media test ") as temporary:
    root = Path(temporary)
    source = root / "stereo room recording.wav"
    rng = random.Random(123456)
    # Stereo recordings with deliberately different channel levels.
    with wave.open(str(source), "wb") as wav:
        wav.setparams((2, 2, 8000, 0, "NONE", "not compressed"))
        for _ in range(8000 * 12):
            sample = rng.randint(-8000, 8000)
            wav.writeframesraw(struct.pack("<hh", sample, sample // 3))
    video = root / "camera.mp4"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=s=160x90:r=25:d=8", "-ss", "2.25", "-i", source,
           "-t", "8", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", video)
    analysis = root / "analysis.json"
    session = json.loads(cli("analyze", "--video", video, "--audio", source, "--output", analysis))
    alignment = session["tracks"][0]["alignment"]
    assert alignment["reliable"], alignment
    assert abs(alignment["offset"] - 2.25) < 0.01, alignment
    output_dir = root / "aligned"
    aligned = json.loads(cli("align", "--session", analysis, "--output-dir", output_dir))
    track = Path(aligned["tracks"][0]["aligned_path"])
    info = json.loads(cli("probe", track))
    assert info["sample_rate"] == 48000 and info["channels"] == 2, info
    assert abs(info["duration"] - session["video"]["duration"]) < 0.001, info
    stream = json.loads(command("ffprobe", "-v", "error", "-show_streams", "-of", "json", track))["streams"][0]
    assert stream["bits_per_sample"] == 24, "Aligned audio must retain 24-bit precision"
    assert aligned["tracks"][0]["levels"]["peak_db"] < 0
    exported = root / "synced.mp4"
    cli("export", "--session", output_dir / "session.json", "--output", exported, "--match-levels")
    assert stream_hash(video, "0:v:0") == stream_hash(exported, "0:v:0"), "Picture was re-encoded"
    assert stream_hash(video, "0:a:0") == stream_hash(exported, "0:a:1"), "Camera audio changed"
    cli("export", "--session", output_dir / "session.json", "--output", exported, succeeds=False)
    cli("align", "--session", analysis, "--output-dir", output_dir, succeeds=False)

    # A non-keyframe section must start at the selected picture/audio position.
    section = root / "section.mp4"
    cli("export", "--session", output_dir / "session.json", "--output", section, "--start", "1.2", "--end", "3.6")
    assert abs(json.loads(cli("probe", section))["duration"] - 2.4) < .05
    def frame_at(path, time):
        return ffmpeg("-ss", str(time), "-i", path, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1")
    original_frame, section_frame = frame_at(video, 1.2), frame_at(section, 0)
    assert len(original_frame) == len(section_frame)
    assert sum(abs(a-b) for a,b in zip(original_frame, section_frame)) / len(original_frame) < 5, "Section starts on the wrong picture"
    streams = json.loads(command("ffprobe", "-v", "error", "-show_streams", "-of", "json", section))["streams"]
    assert len([s for s in streams if s["codec_type"] == "audio"]) == 2
    # Decode each alternative and compare with the expected source-clock slice.
    def audio_samples(path, stream=0):
        return array.array("f", ffmpeg("-i", path, "-map", f"0:a:{stream}", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"))
    def correlation(a, b):
        return sum(x*y for x,y in zip(a,b)) / (sum(x*x for x in a) * sum(y*y for y in b)) ** .5
    for reference, stream in [(track, 0), (video, 1)]:
        actual = audio_samples(section, stream)[2000:8000]
        expected = audio_samples(reference)[9600+2000:9600+8000]
        assert correlation(actual, expected) > .85, "Section audio is shifted from the picture"
    short_mix = root / "short.wav"
    ffmpeg("-i", track, "-t", "1", short_mix)
    cli("export", "--session", output_dir / "session.json", "--output", root / "short.mp4", "--mix", short_mix, "--start", "1.2", "--end", "3.6", succeeds=False)
    assert not (root / "short.mp4").exists()
    for start, end in [(4, 3), (0, 99)]:
        cli("export", "--session", output_dir / "session.json", "--output", root / "bad.mp4", "--start", str(start), "--end", str(end), succeeds=False)
    assert not (root / "bad.mp4").exists()

    # Standalone video import uses its own camera audio, no external recorder required.
    camera_session_path = root / "camera-only.json"
    camera_session = json.loads(cli("analyze", "--video", video, "--output", camera_session_path))
    assert camera_session["tracks"] == []
    camera_aligned = json.loads(cli("align", "--session", camera_session_path, "--output-dir", root / "camera-only"))
    assert camera_aligned["camera_path"] and Path(camera_aligned["camera_path"]).exists()

    # Camera starts before the external recorder: the aligned recording must
    # contain silence until its actual start, not move the whole interview.
    full_video = root / "early camera.mp4"
    ffmpeg("-f", "lavfi", "-i", "color=c=black:s=160x90:r=25:d=8", "-i", source,
           "-t", "8", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", full_video)
    late_source = root / "late recorder.wav"
    ffmpeg("-ss", "2.25", "-i", source, "-c:a", "pcm_s16le", late_source)
    late_analysis = root / "late-analysis.json"
    late = json.loads(cli("analyze", "--video", full_video, "--audio", late_source, "--output", late_analysis))
    assert late["tracks"][0]["alignment"]["reliable"], late
    assert abs(late["tracks"][0]["alignment"]["offset"] + 2.25) < 0.01, late
    late_aligned = json.loads(cli("align", "--session", late_analysis, "--output-dir", root / "late-aligned"))
    raw = ffmpeg("-i", late_aligned["tracks"][0]["aligned_path"], "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1")
    samples = array.array("f", raw)
    assert max(map(abs, samples[:8000 * 2])) < 1e-6, "Missing leading silence"
    assert max(map(abs, samples[8000 * 3:8000 * 4])) > 0.01, "Missing aligned recording"

    # An explicit review gate prevents a silent/unmatched reference being used.
    uncertain = session.copy()
    uncertain["tracks"][0]["alignment"]["reliable"] = False
    uncertain_file = root / "uncertain.json"
    uncertain_file.write_text(json.dumps(uncertain))
    cli("align", "--session", uncertain_file, "--output-dir", root / "must-not-exist", succeeds=False)
    assert not (root / "must-not-exist").exists()
    print("PASS: offsets in both directions, 48 kHz/24-bit stereo, level measurement, review/overwrite guards, unchanged full-length video/camera audio, accurate section picture and duration, range guards")
