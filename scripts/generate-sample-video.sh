#!/bin/sh
# Original procedural media, distributed under the repository's MIT license.
set -eu
task_repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ffmpeg -y -v error -f lavfi -i "nullsrc=s=640x360:r=25:d=12,geq=r='40+30*sin(X/80+T)':g='60+40*sin(Y/80+T)':b='110+60*sin((X+Y)/120-T)'" -c:v libx264 -threads 2 -preset fast -crf 25 -pix_fmt yuv420p -movflags +faststart -an "$task_repo_root/src/assets/samples/picture.mp4"
