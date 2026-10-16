#!/usr/bin/env python3
"""Check file-only publication under Seatbelt; no picker, GUI or audio required.

This tests the kernel file-access boundary, not App Store signing or PowerBox.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

if sys.platform != "darwin":
    raise SystemExit("This probe requires macOS sandbox-exec")

with tempfile.TemporaryDirectory(prefix="crispaudio-export-publication-") as root:
    root = pathlib.Path(root).resolve()
    private = root / "private"
    destination = root / "destination"
    private.mkdir()
    destination.mkdir()
    staged = private / "render.wav"
    output = destination / "export.wav"
    staged.write_bytes(b"complete validated render")
    profile = (
        "(version 1)(deny default)(allow process*)(allow sysctl-read)"
        "(allow mach-lookup)(allow file-read*)"
        f"(allow file-write* (subpath {json.dumps(str(private))}))"
        f"(allow file-write* (literal {json.dumps(str(output))}))"
    )
    code = r'''
import os, pathlib, sys
staged, output = map(pathlib.Path, sys.argv[1:])
try:
    (output.parent / 'sibling-scratch').write_bytes(b'forbidden')
except PermissionError:
    pass
else:
    raise AssertionError('Probe unexpectedly has directory write access')
assert not output.exists()
os.link(staged, output)
assert output.read_bytes() == b'complete validated render'
try:
    os.link(staged, output)
except FileExistsError:
    pass
else:
    raise AssertionError('Existing output was replaced')
staged.unlink()
assert output.read_bytes() == b'complete validated render'
'''
    subprocess.run(
        ["/usr/bin/sandbox-exec", "-p", profile, "/usr/bin/python3", "-c", code,
         str(staged), str(output)], check=True,
    )
    assert not (destination / "sibling-scratch").exists()
    print("PASS: file-only atomic publication; sibling write denied; overwrite refused")
